import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    'lokijs',
    'pino-pretty',
    'encoding',
    'idb-keyval',
    '@walletconnect/keyvaluestorage',
    '@coinbase/wallet-sdk',
  ],
  turbopack: {},
  webpack: (config) => {
    // Fallback for explicit --webpack builds
    // RainbowKit / WalletConnect / MetaMask SDK deps
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    return config
  },
}

export default nextConfig
