"use client"

// Page chrome shared by every registry dashboard: a header (registry title,
// signed-in user, links back to the staff portal and the registry, sign out)
// and a filter bar (region > zone > woreda > kebele cascade + record status).
// The registry view renders inside, fed the current filters; clicking the map
// moves the same filters, so the bar, the map and the panels stay in step.
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { ExternalLink, LayoutGrid, LogOut, RotateCcw, UserRound } from "lucide-react"
import type { RegistryFilters } from "@/components/registry/registry-data"
import { REGISTRY } from "@/lib/registry"

type Option = { id: string; name: string }
type MapFilters = Partial<Pick<RegistryFilters, "region" | "zone" | "woreda" | "kebele">>

const EMPTY: RegistryFilters = { region: "all", zone: "all", woreda: "all", kebele: "all", recordState: "all" }

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

function useChildOptions(param: "regionId" | "zoneId" | "woredaId", parent: string, key: "zones" | "woredas" | "kebeles") {
  const [loaded, setLoaded] = useState<{ parent: string; options: Option[] } | null>(null)
  useEffect(() => {
    if (parent === "all") return
    let cancelled = false
    void getJson<Record<string, Option[]>>(`/api/locations?${param}=${encodeURIComponent(parent)}`).then(body => {
      if (!cancelled) setLoaded({ parent, options: body?.[key] ?? [] })
    })
    return () => {
      cancelled = true
    }
  }, [param, parent, key])
  // Options belong to the parent they were loaded for; anything else is stale.
  return parent !== "all" && loaded?.parent === parent ? loaded.options : []
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  disabled?: boolean
}) {
  // A value set by the map may not be in the list yet; keep it selectable.
  const known = value === "all" || options.some(o => o.id === value)
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <select
        className="h-8 min-w-[9rem] max-w-[14rem] truncate rounded-md border border-slate-200 bg-white px-2 text-[13px] text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/30 disabled:bg-slate-50 disabled:text-slate-400"
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
      >
        <option value="all">All</option>
        {!known && <option value={value}>{value}</option>}
        {options.map(o => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  )
}

export function DashboardShell({
  children,
}: {
  children: (filters: RegistryFilters, onMapFilterChange: (filters: MapFilters) => void) => ReactNode
}) {
  const [filters, setFilters] = useState<RegistryFilters>(EMPTY)
  const [regions, setRegions] = useState<Option[]>([])
  const [statuses, setStatuses] = useState<Option[]>([])
  const [me, setMe] = useState<{ name: string; links: { staffPortal: string | null; registryPortal: string | null } } | null>(null)

  useEffect(() => {
    void getJson<{ regions: Option[]; recordStatuses: { status: string; count: number }[] }>("/api/filter-options").then(body => {
      setRegions(body?.regions ?? [])
      setStatuses((body?.recordStatuses ?? []).map(s => ({ id: s.status, name: `${s.status} (${s.count.toLocaleString()})` })))
    })
    void getJson<typeof me>("/api/me").then(setMe)
  }, [])

  const zones = useChildOptions("regionId", filters.region, "zones")
  const woredas = useChildOptions("zoneId", filters.zone, "woredas")
  const kebeles = useChildOptions("woredaId", filters.woreda, "kebeles")

  // Choosing a unit clears everything below it.
  const setGeo = (level: "region" | "zone" | "woreda" | "kebele", value: string) =>
    setFilters(prev => {
      const next = { ...prev, [level]: value }
      if (level === "region") Object.assign(next, { zone: "all", woreda: "all", kebele: "all" })
      if (level === "zone") Object.assign(next, { woreda: "all", kebele: "all" })
      if (level === "woreda") Object.assign(next, { kebele: "all" })
      return next
    })

  const onMapFilterChange = useCallback((map: MapFilters) => {
    setFilters(prev => {
      const next = {
        ...prev,
        region: map.region ?? "all",
        zone: map.zone ?? "all",
        woreda: map.woreda ?? "all",
        kebele: map.kebele ?? "all",
      }
      return (Object.keys(next) as (keyof RegistryFilters)[]).some(k => next[k] !== prev[k]) ? next : prev
    })
  }, [])

  const filtered = (Object.keys(EMPTY) as (keyof RegistryFilters)[]).some(k => filters[k] !== "all")

  return (
    <div className="flex h-dvh flex-col bg-[#F5F8F6]">
      <header className="flex flex-none items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <LayoutGrid className="h-5 w-5 text-emerald-700" aria-hidden />
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold text-slate-900">{REGISTRY.title} Dashboard</h1>
          <p className="truncate text-[11px] text-slate-500">Aggregate figures from the registry&apos;s reporting views</p>
        </div>
        <nav className="ml-auto flex items-center gap-1 text-[13px]">
          {me?.links.registryPortal && (
            <a className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100" href={me.links.registryPortal}>
              Registry <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
          {me?.links.staffPortal && (
            <a className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100" href={me.links.staffPortal}>
              Staff portal <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
          {me && (
            <span className="ml-2 flex items-center gap-1 text-slate-700">
              <UserRound className="h-4 w-4" aria-hidden /> {me.name}
            </span>
          )}
          {/* A route handler, not a page: it needs a full navigation, not <Link>. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="ml-1 flex items-center gap-1 rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100" href="/api/auth/logout">
            <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
          </a>
        </nav>
      </header>

      <div className="flex flex-none flex-wrap items-end gap-3 border-b border-slate-200 bg-white/70 px-4 py-2">
        <FilterSelect label="Region" value={filters.region} options={regions} onChange={v => setGeo("region", v)} />
        <FilterSelect label="Zone" value={filters.zone} options={zones} onChange={v => setGeo("zone", v)} disabled={filters.region === "all"} />
        <FilterSelect label="Woreda" value={filters.woreda} options={woredas} onChange={v => setGeo("woreda", v)} disabled={filters.zone === "all"} />
        <FilterSelect label="Kebele" value={filters.kebele} options={kebeles} onChange={v => setGeo("kebele", v)} disabled={filters.woreda === "all"} />
        <FilterSelect
          label="Record status"
          value={filters.recordState}
          options={statuses}
          onChange={v => setFilters(prev => ({ ...prev, recordState: v }))}
        />
        {filtered && (
          <button
            type="button"
            className="flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-slate-600 hover:bg-slate-100"
            onClick={() => setFilters(EMPTY)}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset
          </button>
        )}
      </div>

      <main className="@container min-h-0 flex-1 overflow-y-auto p-3 md:p-4 xl:overflow-hidden">
        <div id="dashboard-capture" className="h-full min-h-0">
          {children(filters, onMapFilterChange)}
        </div>
      </main>
    </div>
  )
}
