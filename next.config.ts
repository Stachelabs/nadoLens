import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // wagmi optional peer deps not needed for injected/metaMask connectors
    config.resolve.alias = {
      ...config.resolve.alias,
      '@safe-global/safe-apps-provider': false,
      '@safe-global/safe-apps-sdk': false,
      '@walletconnect/ethereum-provider': false,
      '@walletconnect/modal': false,
    }
    return config
  },
}

export default nextConfig
