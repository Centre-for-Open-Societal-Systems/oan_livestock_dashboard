import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { REGISTRY } from "@/lib/registry"
import "./globals.css"

export const metadata: Metadata = {
  title: `${REGISTRY.title} Dashboard`,
  description: `Aggregate figures from the ${REGISTRY.title}`,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
