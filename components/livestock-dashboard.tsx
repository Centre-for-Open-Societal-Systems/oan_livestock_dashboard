"use client"

// The Livestock Registry dashboard: KPIs, keepers by region (map with
// drill-down), species mix, herd health and registrations over time. Laid out
// as a single screen of band grids.

import { useMemo } from "react"
import { Beef, Home, Layers, MapPinned, UserRound, Users } from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { useChartGroupData } from "@/hooks/use-chart-group"
import { MapWhenVisible } from "@/components/lazy/map-when-visible"
import {
  BarList,
  BRIGHT,
  BRIGHT_SOFT,
  DeltaChip,
  EmptyPanel,
  RankList,
  REGISTRY_COLORS,
  RegistryCard,
  RegistryDonut,
  RegistryStat,
  formatCompact,
  formatFull,
} from "@/components/registry/registry-ui"
import {
  RegistryFilters,
  buildTrend,
  herdHealthLabel,
  monthLabel,
  toNumber,
  useRegistryTrend,
} from "@/components/registry/registry-data"
import { ExportDataButton } from "@/components/registry/export-button"

const CHART_NAMES = [
  "livestockKpis",
  "livestockBySpecies",
  "livestockKeepersByRegion",
  "livestockTopWoredas",
  "herdHealthSplit",
  "livestockTrendByMonth",
]

// Module scope keeps the reference stable so the map's drill-down effect doesn't loop.
const LIVESTOCK_CHILD_CHARTS = {
  zones: "livestockKeepersByZone",
  woredas: "livestockKeepersByWoreda",
  kebeles: "livestockKeepersByKebele",
}

const HEALTH_COLORS: Record<string, string> = {
  Healthy: BRIGHT.green,
  Sick: BRIGHT.amber,
  Quarantined: BRIGHT.violet,
  Deceased: REGISTRY_COLORS.red,
  Unknown: "#94A3B8",
}

export function LivestockDashboard({
  filters,
  geoJsonData,
  onMapFilterChange,
}: {
  filters: RegistryFilters
  geoJsonData?: any
  onMapFilterChange?: (filters: Record<string, string>) => void
}) {
  const { data, loading, error } = useChartGroupData(CHART_NAMES, { ...filters })
  const charts = data?.data || {}

  const kpis = charts.livestockKpis?.[0] || null
  const keepers = toNumber(kpis?.keepers)
  const holdings = toNumber(kpis?.holdings)
  const femaleKeepers = toNumber(kpis?.female_keepers)
  const animals = toNumber(kpis?.animals)
  const speciesTracked = toNumber(kpis?.species_tracked)
  const breedsTracked = toNumber(kpis?.breeds_tracked)
  const woredasReporting = toNumber(kpis?.woredas_reporting)
  const femaleShare = keepers > 0 ? (femaleKeepers / keepers) * 100 : 0

  const trend = useRegistryTrend(charts.livestockTrendByMonth)

  // Panels are height-capped in the band grid, so the longest tails are trimmed
  // rather than allowed to overflow their card.
  const speciesItems = useMemo(
    () =>
      (charts.livestockBySpecies || []).slice(0, 7).map((row: any) => ({
        name: row.species,
        value: toNumber(row.animals),
      })),
    [charts.livestockBySpecies]
  )

  const keepersByRegion = useMemo(
    () =>
      (charts.livestockKeepersByRegion || []).map((row: any) => ({
        region: row.region,
        region_code: row.region_code,
        farmers: toNumber(row.farmers),
      })),
    [charts.livestockKeepersByRegion]
  )

  const topWoredas = useMemo(
    () =>
      (charts.livestockTopWoredas || []).slice(0, 8).map((row: any) => ({
        name: row.woreda,
        value: toNumber(row.farmers),
      })),
    [charts.livestockTopWoredas]
  )

  const healthSegments = useMemo(() => {
    const total = (charts.herdHealthSplit || []).reduce((acc: number, row: any) => acc + toNumber(row.animals), 0)
    return (charts.herdHealthSplit || [])
      .map((row: any) => {
        const name = herdHealthLabel(row.health_status)
        const value = toNumber(row.animals)
        return {
          name,
          value,
          color: HEALTH_COLORS[name] || BRIGHT.tealSoft,
          sub: total > 0 ? `${((value / total) * 100).toFixed(1)}%` : undefined,
        }
      })
      .filter((segment: { value: number }) => segment.value > 0)
  }, [charts.herdHealthSplit])

  const healthAnimals = healthSegments.reduce((acc: number, segment: { value: number }) => acc + segment.value, 0)

  // Cumulative registrations reproduce the reference dashboard's climbing area curve.
  const registrationSeries = useMemo(() => {
    let running = 0
    return trend.series.map((point) => {
      running += point.farmers
      return { period: monthLabel(point.period), registered: running }
    })
  }, [trend.series])

  const recentRegistrations = useMemo(() => registrationSeries.slice(-12), [registrationSeries])

  const keeperTrend = buildTrend(trend.series, "farmers", { cumulative: true })

  if (error) {
    return (
      <RegistryCard title="Livestock Registry">
        <div className="px-4 pb-5 pt-3 text-[12px]" style={{ color: REGISTRY_COLORS.red }}>
          Failed to load registry data: {error}
        </div>
      </RegistryCard>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 @[860px]:grid @[860px]:grid-rows-[auto_auto_minmax(0,1.32fr)_minmax(0,1fr)_auto]">
      {/* Title line */}
      <header className="flex flex-none flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-[16px] font-bold leading-tight tracking-[-0.3px]" style={{ color: REGISTRY_COLORS.ink }}>
          Livestock Registry
        </h2>
        <p className="text-[11px]" style={{ color: REGISTRY_COLORS.muted }}>
          National Livestock Registry Module
        </p>
      </header>

      {/* Band 1 — KPI ribbon */}
      <section className="grid flex-none grid-cols-2 gap-3 @[640px]:grid-cols-3 @[860px]:grid-cols-[1.11fr_0.85fr_0.92fr_1.15fr_1.05fr_1.02fr]">
        <RegistryStat
          icon={<Users className="h-7 w-7" strokeWidth={2.5} />}
          iconBg={BRIGHT_SOFT.blue}
          iconColor={BRIGHT.blue}
          tint="blue"
          value={formatFull(keepers)}
          label="Livestock Keepers"
          delta={keeperTrend.delta}
          loading={loading}
        />
        <RegistryStat
          icon={<Home className="h-7 w-7" strokeWidth={2.5} />}
          iconBg={BRIGHT_SOFT.green}
          iconColor={BRIGHT.green}
          tint="green"
          value={formatFull(holdings)}
          label="Holdings"
          note={keepers > 0 ? `${(holdings / keepers).toFixed(1)} per keeper` : undefined}
          loading={loading}
        />
        <RegistryStat
          icon={<Layers className="h-7 w-7" strokeWidth={2.5} />}
          iconBg={BRIGHT_SOFT.orange}
          iconColor={BRIGHT.orange}
          tint="peach"
          value={formatFull(speciesTracked)}
          label="Species Tracked"
          note={`${formatFull(breedsTracked)} breeds`}
          loading={loading}
        />
        <RegistryStat
          icon={<Beef className="h-7 w-7" strokeWidth={2.5} />}
          iconBg={BRIGHT_SOFT.violet}
          iconColor={BRIGHT.violet}
          tint="violet"
          value={formatCompact(animals)}
          label="Animals"
          note="head count"
          loading={loading}
        />
        <RegistryStat
          icon={<UserRound className="h-7 w-7" strokeWidth={2.5} />}
          iconBg={BRIGHT_SOFT.pink}
          iconColor={BRIGHT.pink}
          tint="pink"
          value={`${femaleShare.toFixed(1)}%`}
          label="Women Keepers"
          note={`${formatFull(femaleKeepers)} keepers`}
          loading={loading}
        />
        <RegistryStat
          icon={<MapPinned className="h-7 w-7" strokeWidth={2.5} />}
          iconBg={BRIGHT_SOFT.amber}
          iconColor={BRIGHT.amber}
          tint="amber"
          value={formatFull(woredasReporting)}
          label="Woredas Reporting"
          note="with keepers"
          loading={loading}
        />
      </section>

      {/* Band 2 — map, species mix, herd health */}
      <section className="grid min-h-0 flex-none grid-cols-1 gap-3 @[720px]:grid-cols-2 @[860px]:grid-cols-[2.6fr_1.75fr_1.55fr]">
        <RegistryCard
          dense
          title="Livestock Keepers by Region"
          subtitle={
            loading
              ? "Loading coverage…"
              : `${formatFull(woredasReporting)} woreda${woredasReporting === 1 ? "" : "s"} reporting · click to drill down`
          }
          className="flex min-h-[260px] flex-col overflow-hidden @[860px]:min-h-0"
          bodyClassName="relative min-h-0 flex-1"
        >
          <MapWhenVisible
            fill
            legendPosition="overlay"
            className="absolute inset-0 flex flex-col"
            minHeight="100%"
            variant="registry"
            popOutTitle="Livestock Keepers by Region"
            valueLabel="keepers"
            valueFormatter={(value: number) => formatCompact(value)}
            childChartKeys={LIVESTOCK_CHILD_CHARTS}
            currentFilters={{
              region: filters.region !== "all" ? filters.region : undefined,
              zone: filters.zone !== "all" ? filters.zone : undefined,
              woreda: filters.woreda !== "all" ? filters.woreda : undefined,
              recordState: filters.recordState !== "all" ? filters.recordState : undefined,
            }}
            onFilterChange={(mapFilters: any) => onMapFilterChange?.(mapFilters)}
            farmerData={keepersByRegion}
            geoJsonData={geoJsonData}
          />
        </RegistryCard>

        <RegistryCard
          dense
          title="Livestock by Species"
          subtitle="Registered head count"
          className="flex min-h-[220px] flex-col overflow-hidden @[860px]:min-h-0"
          bodyClassName="flex min-h-0 flex-1 flex-col"
        >
          <BarList
            dense
            items={speciesItems}
            unitLabel="Number of animals"
            formatter={(value) => formatCompact(value)}
            emptyMessage="No animals registered"
          />
        </RegistryCard>

        <RegistryCard
          dense
          title="Herd Health"
          subtitle="Animals by health status"
          className="flex min-h-[220px] flex-col overflow-hidden @[860px]:min-h-0"
          bodyClassName="flex min-h-0 flex-1 items-center"
        >
          <RegistryDonut
            ringSize={96}
            className="w-full"
            segments={healthSegments}
            centerValue={formatCompact(healthAnimals)}
            centerLabel="Animals"
            totalLabel="Total"
            totalValue={`${formatFull(healthAnimals)} animals`}
          />
        </RegistryCard>
      </section>

      {/* Band 3 — top woredas, registrations over time */}
      <section className="grid min-h-0 flex-none grid-cols-1 gap-3 @[860px]:grid-cols-[2fr_3.9fr]">
        <RegistryCard
          dense
          title="Top Woredas"
          className="flex min-h-[200px] flex-col overflow-hidden @[860px]:min-h-0"
          bodyClassName="flex min-h-0 flex-1 flex-col"
        >
          <RankList dense items={topWoredas} nameHeader="Woreda" valueHeader="Keepers" />
        </RegistryCard>

        <RegistryCard
          dense
          title="Registrations Over Time"
          subtitle="Cumulative registered livestock keepers"
          actions={keeperTrend.delta ? <DeltaChip delta={keeperTrend.delta} /> : undefined}
          className="flex min-h-[220px] flex-col overflow-hidden @[860px]:min-h-0"
          bodyClassName="min-h-0 flex-1 px-1 pb-1 pt-1"
        >
          {recentRegistrations.length === 0 ? (
            <EmptyPanel message="No registrations in range" className="px-3 pb-3" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={recentRegistrations} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="livestockRegistrations" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRIGHT.blueSoft} stopOpacity={0.38} />
                    <stop offset="100%" stopColor={BRIGHT.blueSoft} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={REGISTRY_COLORS.line2} />
                <XAxis
                  dataKey="period"
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={20}
                  tick={{ fontSize: 9.5, fill: REGISTRY_COLORS.muted }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={34}
                  tick={{ fontSize: 9.5, fill: REGISTRY_COLORS.muted }}
                  tickFormatter={(value: number) => formatCompact(value)}
                />
                <Tooltip
                  cursor={{ stroke: REGISTRY_COLORS.line, strokeWidth: 1 }}
                  contentStyle={{
                    borderRadius: 10,
                    border: `1px solid ${REGISTRY_COLORS.line}`,
                    fontSize: 11,
                  }}
                  formatter={(value: any) => [formatFull(toNumber(value)), "Registered keepers"]}
                />
                <Area
                  type="monotone"
                  dataKey="registered"
                  stroke={BRIGHT.blue}
                  strokeWidth={2}
                  fill="url(#livestockRegistrations)"
                  dot={{ r: 1.8, fill: "#fff", stroke: BRIGHT.blue, strokeWidth: 1.4 }}
                  activeDot={{ r: 3.5, fill: BRIGHT.blue, stroke: "#fff", strokeWidth: 1.6 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </RegistryCard>
      </section>

      {/* Source ribbon */}
      <div
        className="flex flex-none items-center gap-2 rounded-xl border bg-white px-4 py-1 text-[10.5px]"
        style={{ borderColor: REGISTRY_COLORS.line, color: REGISTRY_COLORS.muted }}
      >
        <Layers className="h-3.5 w-3.5 flex-none" style={{ color: BRIGHT.teal }} />
        <span className="min-w-0 flex-1 truncate">
          Boundaries: geoBoundaries gbOpen ETH ADM1/ADM3 (CC BY 4.0). Figures come from the Livestock Registry&apos;s active
          holdings for the selected filters; flocks and hives count every head.
        </span>
        <ExportDataButton
          filePrefix="livestock-registry"
          captureTargetId="dashboard-capture"
          csvSections={() => [
            { name: "Headline figures", rows: charts.livestockKpis || [] },
            { name: "Livestock keepers by region", rows: charts.livestockKeepersByRegion || [] },
            { name: "Livestock by species", rows: charts.livestockBySpecies || [] },
            { name: "Herd health", rows: charts.herdHealthSplit || [] },
            { name: "Top woredas", rows: charts.livestockTopWoredas || [] },
            { name: "Registrations by month", rows: charts.livestockTrendByMonth || [] },
          ]}
        />
      </div>
    </div>
  )
}
