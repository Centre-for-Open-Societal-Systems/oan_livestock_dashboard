import { NextResponse } from 'next/server'
import { getBoundaries } from '@/server/boundaries'

// Every woreda in the map boundaries with its parent zone and region P-codes.
// The denominator for geographic coverage, so coverage always agrees with what
// the map can draw.
export async function GET() {
  try {
    const { woredas } = await getBoundaries()
    return NextResponse.json(
      woredas.map(w => ({ woreda: w.code, zone: w.zone, region: w.region })),
      { headers: { 'Cache-Control': 'public, max-age=86400' } }
    )
  } catch (err) {
    console.error('[Maps API] failed to load woreda units', err)
    return NextResponse.json({ error: 'Failed to load map units' }, { status: 500 })
  }
}
