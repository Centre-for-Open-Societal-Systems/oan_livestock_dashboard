// The charts this dashboard can show and the filters each one accepts.
//
// This catalog is the contract between the dashboard and whatever produces the
// rows (today the registry's dashboard-api; see server/data/index.ts). A chart
// ID and the column names of its rows must stay identical whichever source
// serves them, so a source can be swapped without touching the UI.
//
// This is one of the three files that differ between the per-registry
// dashboard repos (with lib/registry.ts and the view component).

export const FILTER_NAMES = ["region", "zone", "woreda", "kebele", "recordState"] as const
export type FilterName = (typeof FILTER_NAMES)[number]
export type ChartFilters = Partial<Record<FilterName, string>>
export type Rows = Record<string, unknown>[]

export const CHARTS = [
  "livestockKpis",
  "livestockBySpecies",
  "livestockByBreed",
  "livestockKeepersByRegion",
  "livestockKeepersByZone",
  "livestockKeepersByWoreda",
  "livestockKeepersByKebele",
  "livestockTopWoredas",
  "herdHealthSplit",
  "livestockVaccinationStatus",
  "livestockBySex",
  "livestockTrendByMonth",
  "livestockByState",
  "livestockByRecordState",
] as const
export type ChartId = (typeof CHARTS)[number]

const CHART_SET: ReadonlySet<string> = new Set(CHARTS)
export const isChartId = (value: string): value is ChartId => CHART_SET.has(value)

/** Feeds the record-status filter: one row per status. */
export const RECORD_STATE_CHART = {
  id: "livestockByRecordState",
  statusColumn: "record_state",
  countColumn: "holdings",
} as const satisfies { id: ChartId; statusColumn: string; countColumn: string }

/** Feeds the kebele filter (kebeles are not in the map boundaries). */
export const KEBELE_CHART = {
  id: "livestockKeepersByKebele",
  nameColumn: "kebele",
  codeColumn: "kebele_code",
} as const satisfies { id: ChartId; nameColumn: string; codeColumn: string }
