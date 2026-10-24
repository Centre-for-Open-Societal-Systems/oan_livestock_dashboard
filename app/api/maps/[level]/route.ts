import { createHash } from 'crypto'
import { brotliCompressSync, constants, gzipSync } from 'zlib'
import { getMapLayer, type MapLayer, type MapLevel } from '@/server/boundaries'

// Map boundaries as GeoJSON from Master Data (server/boundaries.ts), with the
// admin1/2/3 properties the map reads. The woredas are ~1.5 MB of GeoJSON, so
// each layer is compressed once per Master Data refresh and sent as stored:
// Brotli to browsers that accept it, otherwise gzip. Responses carry an ETag.

const LEVELS: readonly MapLevel[] = ['regions', 'zones', 'woredas']

type Encoded = { layer: MapLayer; br: Buffer; gzip: Buffer; etag: string }

// On globalThis so every route bundle shares one copy per process.
const store = globalThis as typeof globalThis & { __mapLayers?: Map<MapLevel, Encoded> }
const encoded = (store.__mapLayers ??= new Map())

function encode(level: MapLevel, layer: MapLayer): Encoded {
  const current = encoded.get(level)
  if (current?.layer === layer) return current
  const json = Buffer.from(JSON.stringify(layer))
  const next = {
    layer,
    br: brotliCompressSync(json, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }),
    gzip: gzipSync(json),
    etag: `"${createHash('sha1').update(json).digest('hex').slice(0, 16)}"`,
  }
  encoded.set(level, next)
  return next
}

const isLevel = (value: string): value is MapLevel => (LEVELS as readonly string[]).includes(value)

export async function GET(req: Request, context: { params: Promise<{ level: string }> }) {
  const { level } = await context.params
  if (!isLevel(level)) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const file = encode(level, await getMapLayer(level))
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      ETag: file.etag,
      Vary: 'Accept-Encoding',
    })
    if (req.headers.get('if-none-match') === file.etag) {
      return new Response(null, { status: 304, headers })
    }

    const accepts = (req.headers.get('accept-encoding') ?? '').toLowerCase()
    const br = /\bbr\b/.test(accepts)
    headers.set('Content-Encoding', br ? 'br' : 'gzip')
    return new Response(new Uint8Array(br ? file.br : file.gzip), { headers })
  } catch (err) {
    console.error('[Maps API] failed to load', level, err)
    return Response.json({ error: 'Failed to load map' }, { status: 502 })
  }
}
