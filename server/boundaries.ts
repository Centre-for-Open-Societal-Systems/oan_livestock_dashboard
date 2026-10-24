// server/boundaries.ts
//
// Map boundaries (regions, zones, woredas) from Master Data's public catalogue
// (server/master-data.ts). Only units Master Data has a polygon for are drawn,
// so coverage counts those woredas too and always agrees with the map.
//
// Features are given the admin1/2/3 Pcod / Name properties the map reads, with
// ancestors taken from the Master Data hierarchy, never from the polygon.
import { getBoundaries as getLevelBoundaries, getUnits, type BoundaryCollection, type Unit } from "./master-data"

export interface AdminUnit {
  code: string
  name: string
}

export interface Zone extends AdminUnit {
  region: string
}

export interface Woreda extends AdminUnit {
  zone: string
  region: string
}

export interface Boundaries {
  regions: AdminUnit[]
  zones: Zone[]
  woredas: Woreda[]
}

export type MapLevel = "regions" | "zones" | "woredas"

type AdminProps = {
  admin1Pcod: string
  admin1Name?: string
  admin2Pcod?: string
  admin2Name?: string
  admin3Pcod?: string
  admin3Name?: string
}

export interface MapLayer {
  type: "FeatureCollection"
  features: { type: "Feature"; properties: AdminProps; geometry: unknown }[]
}

const byName = <T extends AdminUnit>(a: T, b: T) => a.name.localeCompare(b.name)

/** Parent of every zone (its region) and woreda (its zone). */
function parentsOf(zones: Unit[], woredas: Unit[]): Map<string, string> {
  return new Map([...zones, ...woredas].map(u => [u.unit_id, u.parent_unit_id ?? ""]))
}

function adminProps(level: MapLevel, code: string, name: string, parentOf: Map<string, string>): AdminProps {
  if (level === "regions") return { admin1Pcod: code, admin1Name: name }
  if (level === "zones") return { admin1Pcod: parentOf.get(code) ?? "", admin2Pcod: code, admin2Name: name }
  const zone = parentOf.get(code) ?? ""
  return { admin1Pcod: parentOf.get(zone) ?? "", admin2Pcod: zone, admin3Pcod: code, admin3Name: name }
}

function toLayer(level: MapLevel, collection: BoundaryCollection, parentOf: Map<string, string>): MapLayer {
  return {
    type: "FeatureCollection",
    features: collection.features
      .filter(f => f.properties?.pcode && f.geometry)
      .map(f => ({
        type: "Feature",
        properties: adminProps(level, f.properties.pcode ?? "", f.properties.area_name ?? "", parentOf),
        geometry: f.geometry,
      })),
  }
}

// Built once per Master Data refresh: the same layer object is returned until
// a source is replaced, so callers can cache on its identity.
const layers = new Map<MapLevel, { sources: unknown[]; layer: MapLayer }>()

/** One map level as GeoJSON with admin properties. */
export async function getMapLayer(level: MapLevel): Promise<MapLayer> {
  const [collection, zones, woredas] = await Promise.all([
    getLevelBoundaries(level),
    getUnits("zones"),
    getUnits("woredas"),
  ])
  const sources = [collection, zones, woredas]
  const built = layers.get(level)
  if (built && built.sources.every((s, i) => s === sources[i])) return built.layer
  const layer = toLayer(level, collection, parentsOf(zones, woredas))
  layers.set(level, { sources, layer })
  return layer
}

/** The units the map can draw, with their ancestors. */
export async function getBoundaries(): Promise<Boundaries> {
  const [regions, zones, woredas] = await Promise.all([
    getMapLayer("regions"),
    getMapLayer("zones"),
    getMapLayer("woredas"),
  ])
  const props = (layer: MapLayer) => layer.features.map(f => f.properties)
  return {
    regions: props(regions)
      .map(p => ({ code: p.admin1Pcod, name: p.admin1Name ?? "" }))
      .sort(byName),
    zones: props(zones)
      .map(p => ({ code: p.admin2Pcod ?? "", name: p.admin2Name ?? "", region: p.admin1Pcod }))
      .sort(byName),
    woredas: props(woredas)
      .map(p => ({ code: p.admin3Pcod ?? "", name: p.admin3Name ?? "", zone: p.admin2Pcod ?? "", region: p.admin1Pcod }))
      .sort(byName),
  }
}
