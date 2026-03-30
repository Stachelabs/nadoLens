import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { SpotBalance } from '@/types/nado'

type Props = {
  balances: SpotBalance[]
}

const SPOT_ASSETS = [
  { product_id: 0,  symbol: 'USDT0', icon: '/icons/usdt0.svg' },
  { product_id: 1,  symbol: 'KBTC',  icon: '/icons/kbtc.svg'  },
  { product_id: 3,  symbol: 'WETH',  icon: '/icons/weth.svg'  },
  { product_id: 5,  symbol: 'USDC',  icon: '/icons/usdc.svg'  },
  { product_id: 11, symbol: 'NLP',   icon: '/icons/nlp.svg'   },
]

const fmtUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

function formatAmount(amount: number): string {
  const abs = Math.abs(amount)
  const decimals = abs === 0 ? 2 : abs >= 1000 ? 2 : abs >= 1 ? 4 : 6
  return amount.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function WalletSpotBalances({ balances }: Props) {
  const byId = new Map(balances.map((b) => [b.product_id, b]))

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-3">
          Spot Balances
        </div>
        <div className="flex flex-wrap gap-2">
          {SPOT_ASSETS.map((asset) => {
            const balance = byId.get(asset.product_id)
            const amount = balance?.amount ?? 0
            const valueUsd = balance?.value_usd ?? 0
            const negative = amount < 0

            return (
              <div
                key={asset.product_id}
                className="flex items-center gap-2.5 rounded-md border border-border bg-background px-3 py-2"
              >
                <Image
                  src={asset.icon}
                  alt={asset.symbol}
                  width={20}
                  height={20}
                  className="rounded-full shrink-0"
                />
                <span className="text-sm font-semibold text-foreground">{asset.symbol}</span>
                <span className={cn('text-sm tabular-nums', negative ? 'text-red-400' : 'text-foreground')}>
                  {formatAmount(amount)}
                </span>
                <span className={cn('text-xs tabular-nums', negative ? 'text-red-400' : 'text-muted-foreground')}>
                  {fmtUsd.format(valueUsd)}
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
