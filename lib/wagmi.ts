import { defineChain } from 'viem'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'

// Custom definition (not OP stack variant) — viem's `ink` uses OP stack types
// incompatible with createNadoClient's publicClient signature
export const inkL2 = defineChain({
  id: 57073,
  name: 'Ink',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-gel.inkonchain.com'] },
  },
  blockExplorers: {
    default: { name: 'Inkscout', url: 'https://explorer.inkonchain.com' },
  },
})

export const wagmiConfig = getDefaultConfig({
  appName: 'NadoLens',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '',
  chains: [inkL2],
  transports: {
    [inkL2.id]: http(),
  },
  ssr: true,
})
