import { REGISTRY } from "@/lib/registry"

// Shown (with HTTP 403) by proxy.ts when the signed-in user lacks the
// dashboard role. Access is granted in Keycloak, as a client role on the
// dashboard's client; there is nothing the user can do here themselves.
export default function Forbidden() {
  return (
    <main className="flex h-dvh items-center justify-center bg-[#F5F8F6] p-6">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">No access to the {REGISTRY.title} dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">
          You are signed in, but your account does not have the Dashboard Viewer role for this registry. Ask an
          administrator to grant it.
        </p>
        {/* A route handler, not a page: it needs a full navigation, not <Link>. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline" href="/api/auth/logout">
          Sign in as someone else
        </a>
      </div>
    </main>
  )
}
