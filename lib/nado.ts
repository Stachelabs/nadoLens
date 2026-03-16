import { createNadoClient } from '@nadohq/client'
import { createPublicClient, http } from 'viem'
import { inkL2 } from './wagmi'

// Read-only public client for server-side Nado API access
const publicClient = createPublicClient({
  chain: inkL2,
  transport: http('https://rpc-gel.inkonchain.com'),
})

// Singleton NadoClient — includes market, perp, spot, subaccount, and indexer APIs
// walletClient is optional — not passed here (signing happens client-side only)
export const nadoClient = createNadoClient('inkMainnet', {
  publicClient,
})
