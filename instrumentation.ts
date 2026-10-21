// Runs once when the server starts: fill the chart cache so the first visitor
// never waits on the chart source, then refresh it every TTL.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  // Dev hot-reload can call register() again; keep a single refresh loop.
  const state = globalThis as typeof globalThis & { __chartWarmTimer?: ReturnType<typeof setInterval> }
  if (state.__chartWarmTimer) return

  const { warmCharts } = await import("./server/data")
  const { config } = await import("./server/config")
  const warm = () => warmCharts().catch(error => console.warn("[charts] warm-up failed:", error))

  void warm()
  state.__chartWarmTimer = setInterval(warm, config.cacheTtlMs)
  state.__chartWarmTimer.unref?.()
}
