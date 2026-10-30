typedef unsigned int u32;

#define TAPS 63
#define CENTRE 31
#define NSIDE 16
#define RING 64
#define BLOCK_DEPTH 0.45
#define DC_COEF 0.9992
#define SMOOTH 0.015
#define CLIP 4.9
#define MAXN 1024

enum {
  K_KNEE1, K_SINK1, K_CUT1, K_KNEE2, K_SINK2, K_CUT2,
  K_CASCADE, K_MAKEUP, K_SWING, K_CORESAT,
  K_DRIVE, K_DEGEN = K_DRIVE + 3, K_BYPASS = K_DEGEN + 3, K_MISS = K_BYPASS + 3,
  K_GPOWER = K_MISS + 3, K_BIAS, K_BIASNORM, K_PRESENCE, K_RAILPRE, K_RAILPOW,
  K_BLOCKATK, K_BLOCKREL, K_COUPLING, K_PRESENCECOEF, K_CORECOEF,
  K_MICRO, K_WEAKGM, K_CRACKLE,
  K_STACK, K_LEAK = K_STACK + 7, K_CENTRETAP = K_LEAK + 5, K_SIDE,
  K_COUNT = K_SIDE + NSIDE
};

typedef struct { double b0, b1, b2, a1, a2; } Biquad;
typedef struct { double x1, x2, y1, y2; } BiquadState;
typedef struct { double block, bypass, miss; } Triode;

typedef struct {
  double up[RING];
  int upAt;
  double pair0, pair1;
  double hb[TAPS * 2];
  int hbAt;
  Triode one, cascaded, two;
  double s1, s2, s3;
  double coupling, presenceLp, core;
  BiquadState leak, ring;
  double dcX1, dcY1;
  double fed, drawn;
  u32 a;
  Biquad tuned;
} Channel;

double knobs[K_COUNT];
double inBuf[MAXN];
double outBuf[MAXN];
Channel chans[2];

static inline double flush(double x) { return x < 1e-15 && x > -1e-15 ? 0 : x; }

static inline double softclip(double x) {
  if (x < -CLIP) return -1;
  if (x > CLIP) return 1;
  double x2 = x * x;
  return (x * (135135 + x2 * (17325 + x2 * (378 + x2)))) /
         (135135 + x2 * (62370 + x2 * (3150 + x2 * 28)));
}

static inline double onepole(double *y, double x, double c) {
  *y = flush(*y + c * (x - *y));
  return *y;
}

static inline double biquad(BiquadState *s, double x, const Biquad *c) {
  double y = flush(c->b0 * x + c->b1 * s->x1 + c->b2 * s->x2 - c->a1 * s->y1 -
                   c->a2 * s->y2);
  s->x2 = s->x1;
  s->x1 = x;
  s->y2 = s->y1;
  s->y1 = y;
  return y;
}

static inline double hash(Channel *ch) {
  ch->a = ch->a + 0x6d2b79f5u;
  u32 a = ch->a;
  u32 t = (a ^ (a >> 15)) * (1u | a);
  t = (t + (t ^ (t >> 7)) * (61u | t)) ^ t;
  return (double)(t ^ (t >> 14)) / 4294967296.0;
}

static inline double triode(Triode *t, double x, int stage, double knee,
                            double sink0, double cut0) {
  const double *k = knobs;
  double hi = x - onepole(&t->bypass, x, k[K_BYPASS + stage]);
  double degen = k[K_DEGEN + stage];
  double u = k[K_DRIVE + stage] * (degen * x + (1 - degen) * hi);
  double over = u - knee;
  double grid = over > 0 ? knee + 0.3 * softclip(over / 0.3) : u;
  double charge = over > 0 ? (over < 3 ? over : 3) : 0;
  t->block = flush(t->block + (charge > t->block ? k[K_BLOCKATK] : k[K_BLOCKREL]) *
                                  (charge - t->block));
  double v = grid - BLOCK_DEPTH * t->block;
  double sink = sink0 * k[K_RAILPRE];
  double cut = cut0 * k[K_RAILPRE];
  double plate = v >= 0 ? sink * softclip(v / sink) : cut * softclip(v / cut);
  return onepole(&t->miss, -plate, k[K_MISS + stage]);
}

static inline double conduct(double v) {
  double r = 0.5 * (v + __builtin_sqrt(v * v + SMOOTH * SMOOTH));
  return r * __builtin_sqrt(r);
}

static inline double pushPull(double x) {
  const double *k = knobs;
  double bias = k[K_BIAS], weak = k[K_WEAKGM];
  return (conduct(bias + x) - weak * conduct(bias * (0.6 + 0.4 * weak) - x)) /
         k[K_BIASNORM];
}

static inline double stackRun(Channel *ch, double x) {
  const double *k = knobs + K_STACK;
  double y = k[0] * x + ch->s1;
  ch->s1 = flush(k[1] * x - k[4] * y + ch->s2);
  ch->s2 = flush(k[2] * x - k[5] * y + ch->s3);
  ch->s3 = flush(k[3] * x - k[6] * y);
  return y;
}

static inline double run(Channel *ch, double x) {
  const double *k = knobs;
  double s = triode(&ch->one, x + k[K_MICRO] * ch->fed, 0, k[K_KNEE1], k[K_SINK1], k[K_CUT1]);
  if (k[K_CASCADE] != 0) s = triode(&ch->cascaded, s, 1, k[K_KNEE1], k[K_SINK1], k[K_CUT1]);
  s = stackRun(ch, s) * k[K_MAKEUP];
  s = triode(&ch->two, s, 2, k[K_KNEE2], k[K_SINK2], k[K_CUT2]);
  s = s - onepole(&ch->coupling, s, k[K_COUPLING]);
  double lifted = s + k[K_PRESENCE] * (s - onepole(&ch->presenceLp, s, k[K_PRESENCECOEF]));
  double drive = lifted * k[K_GPOWER] + k[K_CRACKLE] * (2 * hash(ch) - 1);
  double swing = k[K_SWING] * k[K_RAILPOW];
  double pair = swing * softclip(pushPull(drive) / swing);
  ch->drawn = pair < 0 ? -pair : pair;
  ch->fed = k[K_MICRO] == 0 ? 0 : biquad(&ch->ring, pair, &ch->tuned);
  double low = onepole(&ch->core, pair, k[K_CORECOEF]);
  double saturated = softclip(low * k[K_CORESAT]) / k[K_CORESAT];
  return biquad(&ch->leak, pair - low + saturated, (const Biquad *)(knobs + K_LEAK));
}

static inline void upsample(Channel *ch, double x) {
  const double *side = knobs + K_SIDE;
  ch->upAt = (ch->upAt + 1) & (RING - 1);
  ch->up[ch->upAt] = x;
  int centre = ch->upAt - NSIDE;
  double odd = 0;
  for (int j = 0; j < NSIDE; j++)
    odd += side[j] * (ch->up[(centre - j) & (RING - 1)] + ch->up[(centre + 1 + j) & (RING - 1)]);
  ch->pair0 = 2 * knobs[K_CENTRETAP] * ch->up[centre & (RING - 1)];
  ch->pair1 = 2 * odd;
}

static inline double halfband(Channel *ch, double a, double b) {
  const double *side = knobs + K_SIDE;
  double *buf = ch->hb;
  buf[ch->hbAt] = buf[ch->hbAt + TAPS] = a;
  ch->hbAt = ch->hbAt + 1 == TAPS ? 0 : ch->hbAt + 1;
  buf[ch->hbAt] = buf[ch->hbAt + TAPS] = b;
  ch->hbAt = ch->hbAt + 1 == TAPS ? 0 : ch->hbAt + 1;
  int start = ch->hbAt;
  double y = knobs[K_CENTRETAP] * buf[start + CENTRE];
  for (int j = 0; j < NSIDE; j++) {
    int off = 2 * j + 1;
    y += side[j] * (buf[start + CENTRE - off] + buf[start + CENTRE + off]);
  }
  return y;
}

static inline double channel(Channel *ch, double x) {
  upsample(ch, x);
  double a = run(ch, ch->pair0);
  double b = run(ch, ch->pair1);
  double h = halfband(ch, a, b);
  double y = h - ch->dcX1 + DC_COEF * ch->dcY1;
  ch->dcX1 = h;
  ch->dcY1 = flush(y);
  return y;
}

double *knobsPtr(void) { return knobs; }
double *inPtr(void) { return inBuf; }
double *outPtr(void) { return outBuf; }

void init(int c, u32 seed, double b0, double b1, double b2, double a1, double a2) {
  Channel *ch = &chans[c];
  char *p = (char *)ch;
  for (unsigned i = 0; i < sizeof(Channel); i++) p[i] = 0;
  ch->a = seed;
  ch->tuned = (Biquad){b0, b1, b2, a1, a2};
}

void process(int c, int n) {
  Channel *ch = &chans[c];
  for (int i = 0; i < n; i++) outBuf[i] = channel(ch, inBuf[i]);
}

double step(int c, double x) { return channel(&chans[c], x); }
