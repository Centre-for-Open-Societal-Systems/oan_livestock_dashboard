import { createHash } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { brotliDecompressSync, gzipSync } from 'zlib'

// Map boundaries as TopoJSON, sent as stored. The files are Brotli-compressed
// TopoJSON (woredas: 747 KB); the map converts them to GeoJSON in the browser
// (topojson-client). Converting here instead sent ~32 MB of GeoJSON per request
// for the woredas and cost ~2 s of server time each time.
//
// Every browser in use accepts Brotli over HTTPS, so the stored bytes go out
// unchanged; a client that does not gets gzip. The files change only with a
// new image, so responses carry an ETag and are cached for a day.

const LEVEL_FILE: Record<string, string> = {
  regions: 'regions.topojson.br',
  zones: 'zones.topojson.br',
  woredas: 'woredas.topojson.br',
}

type Encoded = { br: Buffer; gzip?: Buffer; etag: string }

// On globalThis so every route bundle shares one copy per process.
const store = globalThis as typeof globalThis & { __mapBoundaryFiles?: Map<string, Promise<Encoded>> }
const cache = (store.__mapBoundaryFiles ??= new Map())

function load(fileName: string): Promise<Encoded> {
  let entry = cache.get(fileName)
  if (!entry) {
    entry = fs.readFile(path.join(process.cwd(), 'public', 'maps', fileName)).then((br) => ({
      br,
      etag: `"${createHash('sha1').update(br).digest('hex').slice(0, 16)}"`,
    }))
    entry.catch(() => cache.delete(fileName))
    cache.set(fileName, entry)
  }
  return entry
}

export async function GET(req: Request, context: { params: Promise<{ level: string }> }) {
  const { level } = await context.params
  const fileName = LEVEL_FILE[level]
  if (!fileName) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const file = await load(fileName)
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400',
      ETag: file.etag,
      Vary: 'Accept-Encoding',
    })
    if (req.headers.get('if-none-match') === file.etag) {
      return new Response(null, { status: 304, headers })
    }

    const accepts = (req.headers.get('accept-encoding') ?? '').toLowerCase()
    if (/\bbr\b/.test(accepts)) {
      headers.set('Content-Encoding', 'br')
      return new Response(new Uint8Array(file.br), { headers })
    }
    file.gzip ??= gzipSync(brotliDecompressSync(file.br))
    headers.set('Content-Encoding', 'gzip')
    return new Response(new Uint8Array(file.gzip), { headers })
  } catch (err) {
    console.error('[Maps API] failed to load', level, err)
    return Response.json({ error: 'Failed to load map' }, { status: 500 })
  }
}
