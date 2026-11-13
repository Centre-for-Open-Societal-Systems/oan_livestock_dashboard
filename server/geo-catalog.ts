// server/geo-catalog.ts
//
// The location catalog behind the filter bar (region -> zone -> woreda ->
// kebele): the OAN geography in Master Data, which every registry records
// (server/master-data.ts). Codes are Master Data unit ids, P-codes such as
// ET04 and ET0401, the same codes the dashboard-api filters on.
import { getUnits, type Unit } from "./master-data"

export interface GeoUnit {
  id: string
  name: string
}

export interface GeoCatalog {
  regions: GeoUnit[]
  children(level: "zones" | "woredas" | "kebeles", parent: string): GeoUnit[]
}

const byName = (a: GeoUnit, b: GeoUnit) => a.name.localeCompare(b.name)

function index(units: Unit[]): Map<string, GeoUnit[]> {
  const byParent = new Map<string, GeoUnit[]>()
  for (const u of units) {
    const parent = u.parent_unit_id ?? ""
    const list = byParent.get(parent) ?? []
    list.push({ id: u.unit_id, name: u.name })
    byParent.set(parent, list)
  }
  for (const list of byParent.values()) list.sort(byName)
  return byParent
}

let built: { sources: Unit[][]; catalog: GeoCatalog } | undefined

export async function getGeoCatalog(): Promise<GeoCatalog> {
  const [regions, zones, woredas, kebeles] = await Promise.all([
    getUnits("regions"),
    getUnits("zones"),
    getUnits("woredas"),
    getUnits("kebeles"),
  ])
  // Indexed once per Master Data refresh (the unit lists are replaced then).
  const sources = [regions, zones, woredas, kebeles]
  if (built && built.sources.every((s, i) => s === sources[i])) return built.catalog
  const levels = { zones: index(zones), woredas: index(woredas), kebeles: index(kebeles) }
  const catalog: GeoCatalog = {
    regions: regions.map(u => ({ id: u.unit_id, name: u.name })).sort(byName),
    children: (level, parent) => levels[level].get(parent) ?? [],
  }
  built = { sources, catalog }
  return catalog
}
