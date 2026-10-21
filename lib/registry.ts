// Identity of the registry this dashboard serves. Safe to import from client
// and server code alike; nothing here is secret or environment-specific.
//
// This is one of the three files that differ between the per-registry
// dashboard repos (with server/data/catalog.ts and the view component).

export const REGISTRY = {
  /** Stable id, used in log prefixes and export file names. */
  id: "livestock",
  /** Shown in the header and the browser tab. */
  title: "Livestock Registry",
  /** Noun for one registered unit, used in empty and error states. */
  unitNoun: "livestock keeper",
} as const
