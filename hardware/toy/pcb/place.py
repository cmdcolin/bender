import json
import sys

import pcbnew

FOOTPRINTS = "/usr/share/kicad/footprints"
POWER = ["VCC", "VRAW", "VBAT", "VSRC", "VJACK", "SPKOUT", "SPKC"]
SHEET_ORDER = ["power", "sequencer", "keys", "voice", "output"]
WIDTH = 270.0
MARGIN = 8.0
GAP_IC = 9.0
GAP = 4.0

mm = pcbnew.FromMM


def vec(x, y):
    return pcbnew.VECTOR2I(mm(x), mm(y))


def load(spec):
    lib, name = spec.split(":")
    return pcbnew.FootprintLoad(f"{FOOTPRINTS}/{lib}.pretty", name)


def box(fp):
    b = fp.GetBoundingBox(False)
    return b.GetLeft() / 1e6, b.GetTop() / 1e6, b.GetWidth() / 1e6, b.GetHeight() / 1e6


def pad_at(fp, num):
    for pad in fp.Pads():
        if pad.GetNumber() == num:
            p = pad.GetPosition()
            return p.x / 1e6, p.y / 1e6
    raise KeyError(num)


def move_pad_to(fp, num, x, y):
    px, py = pad_at(fp, num)
    p = fp.GetPosition()
    fp.SetPosition(vec(p.x / 1e6 + x - px, p.y / 1e6 + y - py))


def place_cap(fp, ic, vcc_pin, side):
    fp.SetOrientationDegrees(90)
    if pad_at(fp, "2")[1] < pad_at(fp, "1")[1]:
        fp.SetOrientationDegrees(270)
    vx, vy = pad_at(ic, vcc_pin)
    move_pad_to(fp, "1", vx + side * 6.5, vy)


def rules(board):
    ns = board.GetDesignSettings().m_NetSettings
    base = ns.GetDefaultNetclass()
    base.SetClearance(mm(0.21))
    base.SetTrackWidth(mm(0.25))
    base.SetViaDiameter(mm(0.9))
    base.SetViaDrill(mm(0.45))
    power = pcbnew.NETCLASS("Power")
    power.SetClearance(mm(0.21))
    power.SetTrackWidth(mm(0.4))
    power.SetViaDiameter(mm(1.0))
    power.SetViaDrill(mm(0.5))
    ns.SetNetclass("Power", power)
    for net in POWER:
        ns.SetNetclassPatternAssignment(net, "Power")


def main(src, out):
    spec = json.load(open(src))
    board = pcbnew.BOARD()
    board.SetCopperLayerCount(4)
    board.SetLayerType(pcbnew.In1_Cu, pcbnew.LT_POWER)
    board.SetLayerType(pcbnew.In2_Cu, pcbnew.LT_POWER)
    board.SetLayerName(pcbnew.In1_Cu, "GND")
    board.SetLayerName(pcbnew.In2_Cu, "VCC")
    nets = {}
    for name in sorted({n for p in spec["parts"] for n in p["pads"].values()}):
        ni = pcbnew.NETINFO_ITEM(board, name)
        board.Add(ni)
        nets[name] = ni

    fps = {}
    for part in spec["parts"]:
        fp = load(part["footprint"])
        fp.SetReference(part["ref"])
        fp.SetValue(part["value"])
        fp.Reference().SetVisible(True)
        fp.Value().SetVisible(False)
        for pad in fp.Pads():
            net = part["pads"].get(pad.GetNumber())
            if net:
                pad.SetNet(nets[net])
        board.Add(fp)
        fps[part["ref"]] = fp

    decouple = {}
    for part in spec["parts"]:
        if part["decouples"]:
            decouple[part["decouples"]] = part["ref"]

    items = []
    for part in spec["parts"]:
        ref = part["ref"]
        if ref in decouple.values():
            continue
        h = box(fps[ref])[3]
        group = 2 if part["footprint"].endswith("SW_PUSH_6mm") else (0 if part["ic"] else 1)
        items.append((group, -round(h / 8) if group == 0 else 0, SHEET_ORDER.index(part["sheet"]), ref))
    items.sort()

    x = MARGIN
    y = MARGIN + 6
    row_h = 0.0
    last_group = items[0][0]
    for group, _, _, ref in items:
        fp = fps[ref]
        cap = fps.get(decouple.get(ref, ""))
        left, top, w, h = box(fp)
        extra = 9.0 if cap is not None else 0.0
        gap = GAP_IC if group == 0 else GAP
        slot_w = w + extra + gap
        slot_h = h + gap
        if group != last_group:
            x = MARGIN
            y += row_h + 6
            row_h = 0.0
            last_group = group
        if x + slot_w > WIDTH - MARGIN and x > MARGIN:
            x = MARGIN
            y += row_h
            row_h = 0.0
        p = fp.GetPosition()
        fp.SetPosition(vec(p.x / 1e6 + x - left, p.y / 1e6 + y - top))
        if cap is not None:
            vcc = [pad.GetNumber() for pad in fp.Pads() if pad.GetNetname() == "VCC"]
            place_cap(cap, fp, vcc[0] if vcc else "1", 1)
        x += slot_w
        row_h = max(row_h, slot_h)

    height = y + row_h + MARGIN
    height = max(height, 120.0)
    rect = pcbnew.PCB_SHAPE(board)
    rect.SetShape(pcbnew.SHAPE_T_RECT)
    rect.SetStart(vec(0, 0))
    rect.SetEnd(vec(WIDTH, height))
    rect.SetLayer(pcbnew.Edge_Cuts)
    rect.SetWidth(mm(0.1))
    board.Add(rect)

    corners = [(4, 4), (WIDTH - 4, 4), (4, height - 4), (WIDTH - 4, height - 4)]
    for i, (hx, hy) in enumerate(corners):
        hole = load("MountingHole:MountingHole_3.2mm_M3")
        hole.SetReference(f"H{i + 1}")
        hole.SetPosition(vec(hx, hy))
        hole.Reference().SetVisible(False)
        board.Add(hole)

    rules(board)
    pcbnew.SaveBoard(out, board)
    print(f"{len(fps)} footprints, board {WIDTH} x {height:.1f} mm")


main(sys.argv[1], sys.argv[2])
