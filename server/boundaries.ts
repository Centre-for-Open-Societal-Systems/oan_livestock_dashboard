// server/boundaries.ts
//
// Administrative units from the map boundaries shipped in public/maps (regions,
// zones, woredas: P-codes and names). They are the geography the dashboards can
// draw, so filters, coverage and the map all use the same list of units.
// Only feature properties are read; geometry is never decoded here.
import fs from 'fs/promises'
import path from 'path'
import { brotliDecompressSync } from 'zlib'

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

type Props = Record<string, string | null | undefined>

async function readProperties(level: 'regions' | 'zones' | 'woredas'): Promise<Props[]> {
  const buf = await fs.readFile(path.join(process.cwd(), 'public', 'maps', `${level}.topojson.br`))
  const topo = JSON.parse(brotliDecompressSync(buf).toString('utf8'))
  const key = Object.keys(topo.objects ?? {})[0]
  if (!key) throw new Error(`Invalid ${level} topology`)
  return (topo.objects[key].geometries ?? []).map((g: { properties?: Props }) => g.properties ?? {})
}

const byName = <T extends AdminUnit>(a: T, b: T) => a.name.localeCompare(b.name)

async function load(): Promise<Boundaries> {
  const [regions, zones, woredas] = await Promise.all([
    readProperties('regions'),
    readProperties('zones'),
    readProperties('woredas'),
  ])
  return {
    regions: regions
      .map(p => ({ code: p.admin1Pcod ?? '', name: p.admin1Name ?? '' }))
      .filter(u => u.code)
      .sort(byName),
    zones: zones
      .map(p => ({ code: p.admin2Pcod ?? '', name: p.admin2Name ?? '', region: p.admin1Pcod ?? '' }))
      .filter(u => u.code)
      .sort(byName),
    woredas: woredas
      .map(p => ({ code: p.admin3Pcod ?? '', name: p.admin3Name ?? '', zone: p.admin2Pcod ?? '', region: p.admin1Pcod ?? '' }))
      .filter(u => u.code)
      .sort(byName),
  }
}

// Shared per process (see server/dashboard-services.ts for why globalThis).
const holder = globalThis as typeof globalThis & { __boundaries?: Promise<Boundaries> }

export function getBoundaries(): Promise<Boundaries> {
  holder.__boundaries ??= load().catch(error => {
    holder.__boundaries = undefined // retry on the next call
    throw error
  })
  return holder.__boundaries
}
