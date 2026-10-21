// server/geo-catalog.ts
//
// The location catalog behind the filter bar (region -> zone -> woreda ->
// kebele). It is the farmer registry's Master Data catalog, which every
// registry shares, snapshotted into data/geo-catalog.json.br by
// scripts/build-geo-catalog.mjs. Codes are the catalog ids without their level
// prefix (ET04, ET0401, ...), the same codes the dashboard-api filters on.
import fs from "fs/promises"
import path from "path"
import { brotliDecompressSync } from "zlib"

export interface GeoUnit {
  id: string
  name: string
}

type Entry = [code: string, name: string, parent?: string]

interface RawCatalog {
  regions: Entry[]
  zones: Entry[]
  woredas: Entry[]
  kebeles: Entry[]
}

export interface GeoCatalog {
  regions: GeoUnit[]
  children(level: "zones" | "woredas" | "kebeles", parent: string): GeoUnit[]
}

async function load(): Promise<GeoCatalog> {
  const buf = await fs.readFile(path.join(process.cwd(), "data", "geo-catalog.json.br"))
  const raw = JSON.parse(brotliDecompressSync(buf).toString("utf8")) as RawCatalog
  const index = (entries: Entry[]) => {
    const byParent = new Map<string, GeoUnit[]>()
    for (const [id, name, parent = ""] of entries) {
      const list = byParent.get(parent) ?? []
      list.push({ id, name })
      byParent.set(parent, list)
    }
    return byParent
  }
  const levels = { zones: index(raw.zones), woredas: index(raw.woredas), kebeles: index(raw.kebeles) }
  return {
    regions: raw.regions.map(([id, name]) => ({ id, name })),
    children: (level, parent) => levels[level].get(parent) ?? [],
  }
}

// Shared per process (see server/dashboard-services.ts for why globalThis).
const holder = globalThis as typeof globalThis & { __geoCatalog?: Promise<GeoCatalog> }

export function getGeoCatalog(): Promise<GeoCatalog> {
  holder.__geoCatalog ??= load().catch(error => {
    holder.__geoCatalog = undefined // retry on the next call
    throw error
  })
  return holder.__geoCatalog
}
