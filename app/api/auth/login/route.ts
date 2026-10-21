// Starts login at the registry's IAM, which sends the user to Keycloak and
// then back to `returnTo` on this dashboard with its session cookies set.
import { NextResponse, type NextRequest } from "next/server"
import { config } from "@/server/config"
import { safeReturnPath } from "@/server/auth/session"
import { loginProviderId, startSignIn } from "@/server/auth/login-provider"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const returnTo = `${config.publicUrl}${safeReturnPath(request.nextUrl.searchParams.get("returnTo"))}`
  try {
    return NextResponse.redirect(await startSignIn(await loginProviderId(), returnTo))
  } catch (error) {
    console.error("[auth] could not start login:", error instanceof Error ? error.message : error)
    return new NextResponse("Could not reach the sign-in service. Try again shortly.", { status: 503 })
  }
}
