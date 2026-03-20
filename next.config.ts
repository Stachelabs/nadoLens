import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Turbopack (default in Next.js 16) — wallet SDKs work without extra config
  turbopack: {},
  webpack: (config) => {
    // Fallback for explicit --webpack builds
    // RainbowKit / WalletConnect / MetaMask SDK deps
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    return config
  },
}

export default nextConfig
