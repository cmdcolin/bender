#!/bin/sh
# Builds channel.wasm with clang's wasm32 target. Wants a wasm-ld on PATH;
# rustup's rust-lld does it: `exec rust-lld -flavor wasm "$@"` in a script
# named wasm-ld (and wasm-ld-NN for the clang version).
cd "$(dirname "$0")" && clang --target=wasm32 -O3 -ffp-contract=off -nostdlib \
  -Wl,--no-entry -Wl,--export=knobsPtr,--export=inPtr,--export=outPtr \
  -Wl,--export=init,--export=process,--export=step -o channel.wasm channel.c
