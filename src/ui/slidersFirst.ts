import type { SliderDef } from './controls/index.ts'

const isTrack = (run: SliderDef[]) => !run[0]!.choices

// The sliders together over the rows of buttons and dropdowns, each side in the
// order the table gives it. A row that only shows while another is set stays
// with the row before it, so a pot never ends up above the switch that
// brings it in.
export function slidersFirst(rows: SliderDef[]): SliderDef[] {
  const runs: SliderDef[][] = []
  for (const def of rows) {
    if (def.needs && runs.length > 0) runs[runs.length - 1]!.push(def)
    else runs.push([def])
  }
  return [...runs.filter(isTrack), ...runs.filter(r => !isTrack(r))].flat()
}
