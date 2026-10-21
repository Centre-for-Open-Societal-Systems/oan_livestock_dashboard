// Which IAM login provider this dashboard signs users in with.
//
// LOGIN_PROVIDER_ID when set; otherwise discovered once per process: the first
// provider whose IAM callback host lies under COOKIE_DOMAIN, i.e. the one whose
// sign-in ends with session cookies this dashboard can read (see
// iam/discover.mjs, which the deploy hooks use the same way). An IAM serving
// several domains (a private and a public one) has one provider per domain.
import { config } from "../config"

export async function startSignIn(providerId: string, redirectUri: string): Promise<string> {
  const url = new URL(`${config.auth.iamUrl}/auth/start_authentication_transaction`)
  url.searchParams.set("id", providerId)
  url.searchParams.set("redirect_uri", redirectUri)
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })
  const data = (await res.json().catch(() => ({}))) as { redirectUrl?: string }
  if (!res.ok || !data.redirectUrl) throw new Error(`IAM returned HTTP ${res.status}`)
  return data.redirectUrl
}

function hostUnder(host: string, domain: string): boolean {
  const d = domain.replace(/^\./, "").toLowerCase()
  const h = host.toLowerCase()
  return h === d || h.endsWith(`.${d}`)
}

async function discover(): Promise<string> {
  const res = await fetch(`${config.auth.iamUrl}/auth/get_login_providers`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`IAM login providers: HTTP ${res.status}`)
  const { loginProviders = [] } = (await res.json()) as { loginProviders?: { id: number | string }[] }
  for (const provider of loginProviders) {
    const id = String(provider.id)
    if (!config.auth.cookieDomain) return id
    const authorization = new URL(await startSignIn(id, `${config.publicUrl}/`))
    const callback = authorization.searchParams.get("redirect_uri")
    if (callback && hostUnder(new URL(callback).hostname, config.auth.cookieDomain)) return id
  }
  throw new Error(`no IAM login provider signs in under ${config.auth.cookieDomain}`)
}

const holder = globalThis as typeof globalThis & { __loginProvider?: Promise<string> }

export function loginProviderId(): Promise<string> {
  if (config.auth.loginProviderId) return Promise.resolve(config.auth.loginProviderId)
  holder.__loginProvider ??= discover().catch(error => {
    holder.__loginProvider = undefined // retry on the next login
    throw error
  })
  return holder.__loginProvider
}
