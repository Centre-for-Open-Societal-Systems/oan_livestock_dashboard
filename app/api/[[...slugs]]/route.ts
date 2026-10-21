import { createApp } from "@/server/app"

const app = createApp("/api")

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = app.fetch
