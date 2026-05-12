import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // maplibre-gl uses browser-only APIs; tell webpack to ignore node polyfills
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent maplibre-gl from being bundled on the server
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'maplibre-gl',
      ]
    }
    return config
  },
}

export default nextConfig
