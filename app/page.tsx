import { Dashboard } from "@/components/dashboard"

// Rendered per request: the proxy has already checked the session.
export const dynamic = "force-dynamic"

export default function Page() {
  return <Dashboard />
}
