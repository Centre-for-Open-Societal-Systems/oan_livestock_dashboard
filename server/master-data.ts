// server/master-data.ts
//
// The OAN geography from Master Data's public catalogue (anonymous, read-only
// GET /public/...). Every registry records these units, so the map, the filter
// cascade and coverage all use the same ids: P-codes such as ET04, ET0401.
//
// Only what Master Data publishes and marks public is served. Responses are
// held per process and refreshed after MASTER_DATA_CACHE_SECONDS.
import { config } from "./config"

/** Dashboard level -> Master Data level mnemonic. */
export const LEVELS = {
  regions: "region",
  zones: "zone",
  woredas: "woreda",
  kebeles: "kebele",
} as const

export type Level = keyof typeof LEVELS

export interface Unit {
  unit_id: string
  name: string
  parent_unit_id: string | null
}

export interface BoundaryFeature {
  type: "Feature"
  properties: { pcode?: string; area_name?: string; parent_pcode?: string | null }
  geometry: unknown
}

export interface BoundaryCollection {
  type: "FeatureCollection"
  features: BoundaryFeature[]
}

interface UnitsPage {
  total: number
  units: Unit[]
}

const PAGE_SIZE = 5000

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${config.masterData.url}/public${path}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
  if (!res.ok) throw new Error(`Master Data ${path}: HTTP ${res.status}`)
  return (await res.json()) as T
}

async function fetchUnits(level: Level): Promise<Unit[]> {
  const units: Unit[] = []
  for (let page = 1; ; page++) {
    const body = await getJson<UnitsPage>(
      `/geography/units?level=${LEVELS[level]}&page=${page}&page_size=${PAGE_SIZE}`
    )
    units.push(...body.units)
    if (body.units.length < PAGE_SIZE || units.length >= body.total) return units
  }
}

function fetchBoundaries(level: Exclude<Level, "kebeles">): Promise<BoundaryCollection> {
  return getJson<BoundaryCollection>(`/geography/levels/${LEVELS[level]}/boundaries.geojson`)
}

// On globalThis so every route bundle shares one copy per process.
type Entry = { at: number; value: Promise<unknown> }
const holder = globalThis as typeof globalThis & { __masterData?: Map<string, Entry> }
const cache = (holder.__masterData ??= new Map())

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.at < config.masterData.cacheTtlMs) return entry.value as Promise<T>
  const fresh = load()
  // A failed refresh keeps the previous copy until the next refresh; a failed
  // first load is retried on the next call.
  const value = entry
    ? fresh.catch((error) => {
        console.warn("[Master Data] refresh failed, serving the previous copy:", key, error)
        return entry.value as Promise<T>
      })
    : fresh
  if (!entry) {
    fresh.catch(() => {
      if (cache.get(key)?.value === value) cache.delete(key)
    })
  }
  cache.set(key, { at: Date.now(), value })
  return value
}

export function getUnits(level: Level): Promise<Unit[]> {
  return cached(`units:${level}`, () => fetchUnits(level))
}

export function getBoundaries(level: Exclude<Level, "kebeles">): Promise<BoundaryCollection> {
  return cached(`boundaries:${level}`, () => fetchBoundaries(level))
}
