import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useWalletFundingStore } from '@/store/walletFundingStore'
import { useWalletMatchesCacheStore } from '@/store/walletMatchesCacheStore'
import {
  fetchSubaccounts,
  fetchOnePage,
  sortTradesNewestFirst,
  tradeIdentity,
  chunk,
  sleep,
  MAX_PAGES,
  type MatchesPageResult,
} from '@/lib/wallet/walletFetchers'
import type { TradeMatch } from '@/types/nado'

const PREFETCH_BURST_MS = 440

export function useConnectedWalletPrefetch(): void {
  const { address, isConnected } = useAccount()

  useEffect(() => {
    if (!isConnected || !address) return

    const existing = useWalletMatchesCacheStore.getState().getCache(address)
    if (existing && existing.trades.length > 0) return

    const controller = new AbortController()
    const { signal } = controller

    void (async () => {
      try {
        const subs = await fetchSubaccounts(address, signal)
        if (signal.aborted) return

        const subAddrs = subs.map(s => s.subaccount)
        useWalletFundingStore.getState().ensureSlot(address)
        useWalletFundingStore.getState().setSubaccounts(address, subAddrs)

        const subChunks = chunk(subAddrs, 5)
        const allTrades: TradeMatch[] = []
        const seenIds = new Set<string>()

        const firstPages: MatchesPageResult[] = []
        for (let c = 0; c < subChunks.length; c++) {
          if (signal.aborted) return
          const p = await fetchOnePage(subChunks[c]!, signal)
          if (p.rateLimited) return
          firstPages.push(p)
          if (c < subChunks.length - 1) await sleep(PREFETCH_BURST_MS)
        }

        for (const page of firstPages) {
          for (const t of page.trades) {
            const id = tradeIdentity(t)
            if (!seenIds.has(id)) {
              seenIds.add(id)
              allTrades.push(t)
            }
          }
        }

        if (signal.aborted) return
        let sorted = sortTradesNewestFirst(allTrades)
        let latestIdx = sorted[0]?.submission_idx ?? null
        let complete = firstPages.every(p => p.done)

        if (!complete) {
          const chunkStates = firstPages.map((p, i) => ({
            chunk: subChunks[i]!,
            done: p.done,
            nextIdx: p.nextIdx,
          }))

          for (let page = 1; page < MAX_PAGES; page++) {
            if (signal.aborted) break
            const active = chunkStates.filter(s => !s.done)
            if (active.length === 0) break

            for (let a = 0; a < active.length; a++) {
              if (signal.aborted) break
              const state = active[a]!
              const result = await fetchOnePage(
                state.chunk, signal, state.nextIdx ?? undefined,
              )
              if (result.rateLimited) { complete = false; break }

              for (const t of result.trades) {
                const id = tradeIdentity(t)
                if (!seenIds.has(id)) {
                  seenIds.add(id)
                  allTrades.push(t)
                }
              }

              state.done = result.done
              state.nextIdx = result.nextIdx
              if (a < active.length - 1) await sleep(PREFETCH_BURST_MS)
            }

            complete = chunkStates.every(s => s.done)
            if (complete) break
            await sleep(PREFETCH_BURST_MS)
          }

          sorted = sortTradesNewestFirst(allTrades)
          latestIdx = sorted[0]?.submission_idx ?? latestIdx
        }

        if (signal.aborted) return

        useWalletMatchesCacheStore.getState().setCache(address, {
          trades: sorted,
          latestKnownIdx: latestIdx,
          seenTradeIds: seenIds,
          globalMatchesComplete: complete,
        })
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          console.error('[prefetch] connected wallet prefetch failed:', e)
        }
      }
    })()

    return () => controller.abort()
  }, [address, isConnected])
}
