#!/usr/bin/env node
// Builds data/geo-catalog.json.br, the location catalog behind the dashboard's
// region -> zone -> woreda -> kebele filters.
//
// Every registry uses one location catalog: the one the farmer registry owns
// (its Master Data geo seed). This script snapshots it from the farmer
// registry repository's seed file, so the dashboard needs no Master Data
// credentials and its filters always match the codes the registries store.
//
//   node scripts/build-geo-catalog.mjs [path/to/geo_level_values.json]
//
// Default source: ../farmer-registry/docker/db-seed/seed-data/geo/geo_level_values.json
// (or FARMER_GEO_JSON). Re-run and commit the result when the catalog changes.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { brotliCompressSync, constants } from "node:zlib"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const source = path.resolve(
  process.argv[2] ?? process.env.FARMER_GEO_JSON ?? path.join(root, "..", "farmer-registry", "docker", "db-seed", "seed-data", "geo", "geo_level_values.json"),
)
const rows = JSON.parse(fs.readFileSync(source, "utf8"))

const LEVELS = { "level-region": "regions", "level-zone": "zones", "level-woreda": "woredas", "level-kebele": "kebeles" }
// Codes are the catalog id without its level prefix (region-ET04 -> ET04,
// kebele-ET010101101001 -> ET010101101001): what the registries' reporting
// views and dashboard-api filters use.
const code = id => (id ? String(id).replace(/^[a-z]+[-_]/i, "") : "")

const catalog = { source: "farmer-registry master-data geo seed", regions: [], zones: [], woredas: [], kebeles: [] }
for (const row of rows) {
  const level = LEVELS[row.level_id]
  if (!level) continue
  const name = String(row.display_name || row.level_value_mnemonic || "").trim()
  const entry = [code(row.level_value_id), name]
  if (level !== "regions") entry.push(code(row.parent_level_value_id))
  catalog[level].push(entry)
}
for (const level of Object.values(LEVELS)) catalog[level].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))

const out = path.join(root, "data", "geo-catalog.json.br")
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, brotliCompressSync(Buffer.from(JSON.stringify(catalog)), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }))
console.log(
  `${path.relative(root, out)}: ${Object.values(LEVELS).map(l => `${catalog[l].length} ${l}`).join(", ")} (from ${source})`,
)
