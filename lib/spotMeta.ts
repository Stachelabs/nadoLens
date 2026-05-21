type SpotProduct = {
  id: number
  symbol: string
  icon: string
  color: string
  visible: boolean
}

const ALL_SPOT_PRODUCTS: SpotProduct[] = [
  { id: 0,   symbol: 'USDT0', icon: '/icons/spot/usdt0.svg', color: '#26a17b', visible: true },
  { id: 1,   symbol: 'kBTC',  icon: '/icons/spot/kbtc.svg',  color: '#c9983a', visible: true },
  { id: 3,   symbol: 'wETH',  icon: '/icons/spot/weth.svg',  color: '#627eea', visible: true },
  { id: 5,   symbol: 'USDC',  icon: '/icons/spot/usdc.svg',  color: '#2775ca', visible: true },
  { id: 11,  symbol: 'NLP',   icon: '/icons/spot/nlp.svg',   color: '#6b5b95', visible: true },
  { id: 115, symbol: 'wQQQx', icon: '/icons/spot/wqqqx.svg', color: '#e63946', visible: false },
  { id: 117, symbol: 'wSPYx', icon: '/icons/spot/wspyx.svg', color: '#1d3557', visible: false },
]

export const VISIBLE_SPOT_IDS = new Set(
  ALL_SPOT_PRODUCTS.filter((p) => p.visible).map((p) => String(p.id)),
)

export const SPOT_ICON: Record<string, string> = Object.fromEntries(
  ALL_SPOT_PRODUCTS.map((p) => [String(p.id), p.icon]),
)

export const SPOT_COLOR: Record<string, string> = Object.fromEntries(
  ALL_SPOT_PRODUCTS.map((p) => [String(p.id), p.color]),
)

export const VISIBLE_SPOT_ASSETS = ALL_SPOT_PRODUCTS
  .filter((p) => p.visible)
  .map((p) => ({ product_id: p.id, symbol: p.symbol, icon: p.icon }))

export const TRACKED_SPOT_PRODUCT_IDS = ALL_SPOT_PRODUCTS
  .filter((p) => p.visible)
  .map((p) => p.id)
