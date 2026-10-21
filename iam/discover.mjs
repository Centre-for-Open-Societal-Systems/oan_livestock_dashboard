// Learns, from the registry's IAM alone, which login provider signs staff in
// for this deployment and which Keycloak realm stands behind it. Nothing
// about Keycloak (host, realm, client) is configured: it is read from the
// authorization URL IAM hands out when a sign-in starts.
//
// A provider is chosen by LOGIN_PROVIDER_ID when set; otherwise the first one
// whose IAM callback host lies under COOKIE_DOMAIN, i.e. the provider whose
// sign-in ends with session cookies this deployment can read.
//
// Starting a sign-in creates a short-lived transaction in IAM, exactly as a
// browser opening the login page does; nothing is persisted.

const trimSlash = value => value.replace(/\/+$/, "")

/** True when host is domain or a subdomain of it (domain may start with "."). */
export function hostUnder(host, domain) {
  const d = domain.replace(/^\./, "").toLowerCase()
  const h = host.toLowerCase()
  return h === d || h.endsWith(`.${d}`)
}

/** POST /auth/start_authentication_transaction; returns IAM's redirectUrl. */
export async function startSignIn(iamUrl, providerId, redirectUri) {
  const url = new URL(`${trimSlash(iamUrl)}/auth/start_authentication_transaction`)
  url.searchParams.set("id", String(providerId))
  url.searchParams.set("redirect_uri", redirectUri)
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.redirectUrl) throw new Error(`IAM sign-in start for provider ${providerId}: HTTP ${res.status}`)
  return data.redirectUrl
}

/** Parses Keycloak's authorization URL into realm coordinates. */
export function parseAuthorizationUrl(authorizationUrl) {
  const url = new URL(authorizationUrl)
  const match = url.pathname.match(/^(.*)\/realms\/([^/]+)\/protocol\/openid-connect\/auth$/)
  if (!match) throw new Error(`not a Keycloak authorization URL: ${url.origin}${url.pathname}`)
  const baseUrl = `${url.origin}${match[1]}`
  const realm = decodeURIComponent(match[2])
  return {
    baseUrl,
    realm,
    realmUrl: `${baseUrl}/realms/${encodeURIComponent(realm)}`,
    clientId: url.searchParams.get("client_id") ?? "",
    callbackUrl: url.searchParams.get("redirect_uri") ?? "",
  }
}

/**
 * The login provider this deployment uses and its Keycloak realm.
 * options: { iamUrl, providerId?, cookieDomain?, publicUrl }
 */
export async function discoverSignIn({ iamUrl, providerId, cookieDomain, publicUrl }) {
  const redirectUri = `${trimSlash(publicUrl)}/`
  if (providerId) {
    return { providerId: String(providerId), ...parseAuthorizationUrl(await startSignIn(iamUrl, providerId, redirectUri)) }
  }
  const res = await fetch(`${trimSlash(iamUrl)}/auth/get_login_providers`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`IAM login providers: HTTP ${res.status}`)
  const { loginProviders = [] } = await res.json()
  for (const provider of loginProviders) {
    const realm = parseAuthorizationUrl(await startSignIn(iamUrl, provider.id, redirectUri))
    const callbackHost = realm.callbackUrl ? new URL(realm.callbackUrl).hostname : ""
    if (!cookieDomain || (callbackHost && hostUnder(callbackHost, cookieDomain))) {
      return { providerId: String(provider.id), ...realm }
    }
  }
  throw new Error(`no IAM login provider signs in under ${cookieDomain}`)
}
