import sys

import pcbnew

PLANES = ("GND", "VCC")

board = pcbnew.LoadBoard(sys.argv[1])
for fp in board.GetFootprints():
    for pad in fp.Pads():
        if pad.GetNetname() in PLANES:
            pad.SetNetCode(0)
if not pcbnew.ExportSpecctraDSN(board, sys.argv[2]):
    sys.exit("DSN export failed")
