import sys

import pcbnew

mm = pcbnew.FromMM
PLANES = [(pcbnew.In1_Cu, "GND"), (pcbnew.In2_Cu, "VCC")]


def plane(board, layer, net, box):
    zone = pcbnew.ZONE(board)
    zone.SetLayer(layer)
    zone.SetNet(net)
    zone.SetMinThickness(mm(0.25))
    zone.SetLocalClearance(mm(0.3))
    zone.SetPadConnection(pcbnew.ZONE_CONNECTION_THERMAL)
    zone.SetThermalReliefGap(mm(0.3))
    zone.SetThermalReliefSpokeWidth(mm(0.5))
    inset = mm(0.6)
    left, top = box.GetLeft() + inset, box.GetTop() + inset
    right, bottom = box.GetRight() - inset, box.GetBottom() - inset
    outline = zone.Outline()
    outline.NewOutline()
    for x, y in [(left, top), (right, top), (right, bottom), (left, bottom)]:
        outline.Append(x, y)
    board.Add(zone)


def main(placed, ses, out, mode):
    board = pcbnew.LoadBoard(placed)
    if ses != "-" and not pcbnew.ImportSpecctraSES(board, ses):
        sys.exit("SES import failed")
    if mode == "route":
        pcbnew.SaveBoard(out, board)
        return
    box = board.GetBoardEdgesBoundingBox()
    for layer, name in PLANES:
        plane(board, layer, board.FindNet(name), box)
    for fp in board.GetFootprints():
        if fp.GetReference().startswith("TP_"):
            fp.Reference().SetVisible(False)
    title = pcbnew.PCB_TEXT(board)
    title.SetText("bender toy board v1")
    title.SetLayer(pcbnew.F_SilkS)
    title.SetPosition(pcbnew.VECTOR2I(mm(12), mm(6)))
    title.SetTextSize(pcbnew.VECTOR2I(mm(2), mm(2)))
    board.Add(title)
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    pcbnew.SaveBoard(out, board)
    print(f"{len(board.GetTracks())} track items")


main(*sys.argv[1:5])
