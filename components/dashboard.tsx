"use client"

// The page body: the shared shell around this registry's view.
// One of the files that differ between the per-registry dashboard repos.
import { DashboardShell } from "@/components/dashboard-shell"
import { LivestockDashboard } from "@/components/livestock-dashboard"

export function Dashboard() {
  return (
    <DashboardShell>
      {(filters, onMapFilterChange) => <LivestockDashboard filters={filters} onMapFilterChange={onMapFilterChange} />}
    </DashboardShell>
  )
}
