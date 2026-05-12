import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Prevent maplibre-gl from being bundled on the server (browser-only APIs)
  serverExternalPackages: ['maplibre-gl'],
  // Turbopack is default in Next.js 16; empty config silences the webpack warning
  turbopack: {},
}

export default nextConfig
