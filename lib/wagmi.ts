import { defineChain } from 'viem'
import { createConfig, http } from 'wagmi'
import { injected, metaMask } from 'wagmi/connectors'

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

export const wagmiConfig = createConfig({
  chains: [inkL2],
  connectors: [injected(), metaMask()],
  transports: {
    [inkL2.id]: http(),
  },
  ssr: true,
})
