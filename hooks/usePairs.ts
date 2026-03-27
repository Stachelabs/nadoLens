'use client'

import { useEffect } from 'react'
import { usePairsStore } from '@/store/pairsStore'

export function usePairs() {
  const init = usePairsStore((s) => s.init)
  useEffect(() => { void init() }, [init])
}
