// Sign out. IAM's /auth/logout ends the session: it drops the refresh token,
// clears the session cookies and sends the browser to Keycloak's end-session
// endpoint, which returns to the registry's staff portal. IAM answers a
// missing or expired session with a bare 401, so it is called server-side and,
// when it cannot end the session, the cookies are cleared here and Keycloak's
// session is ended directly (OIDC_LOGOUT_URL).
import { NextResponse, type NextRequest } from "next/server"
import { config } from "@/server/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SESSION_COOKIES = ["X-Access-Token", "X-ID-Token", "X-Session-Id", "X-CSRF-Token"]

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("X-Access-Token")?.value
  if (accessToken) {
    const cookie = SESSION_COOKIES.flatMap(name => {
      const value = request.cookies.get(name)?.value
      return value ? [`${name}=${value}`] : []
    }).join("; ")
    try {
      const res = await fetch(`${config.auth.iamUrl}/auth/logout`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}`, Cookie: cookie },
        redirect: "manual",
        cache: "no-store",
      })
      const location = res.headers.get("location")
      if (res.status >= 300 && res.status < 400 && location) {
        // IAM's own cookie clearing uses its cookie domain, which can differ
        // from the one this dashboard is served under (an IAM may serve
        // several domains), so the cookies are always cleared here as well.
        return clearSession(NextResponse.redirect(location))
      }
    } catch (error) {
      console.warn("[auth] IAM logout failed, clearing the session here:", error instanceof Error ? error.message : error)
    }
  }

  const landing = `${config.staffPortalUrl || config.publicUrl}/`
  let target = landing
  if (config.auth.oidcLogoutUrl) {
    const params = new URLSearchParams({ post_logout_redirect_uri: landing })
    if (config.auth.oidcClientId) params.set("client_id", config.auth.oidcClientId)
    const idToken = request.cookies.get("X-ID-Token")?.value
    if (idToken) params.set("id_token_hint", idToken)
    target = `${config.auth.oidcLogoutUrl}?${params}`
  }
  return clearSession(NextResponse.redirect(target))
}

function clearSession(response: NextResponse): NextResponse {
  for (const name of SESSION_COOKIES) {
    response.cookies.set(name, "", {
      maxAge: 0,
      path: "/",
      ...(config.auth.cookieDomain ? { domain: config.auth.cookieDomain } : {}),
    })
  }
  return response
}
