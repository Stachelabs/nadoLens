import { z } from 'zod'

// ─── Primitive ────────────────────────────────────────────────────────────────

/** Raw x18 string — use fromX18BigInt() to convert to number */
const x18 = z.string()

// ─── Pairs ────────────────────────────────────────────────────────────────────

/** Raw shape from GET /v2/pairs */
export const NadoPairRawSchema = z.object({
  product_id: z.number(),
  ticker_id: z.string(),   // e.g. "BTC-PERP_USDT0"
  base: z.string(),        // e.g. "BTC-PERP"
  quote: z.string(),       // e.g. "USDT0"
})
export type NadoPairRaw = z.infer<typeof NadoPairRawSchema>

/** Normalized internal type — use this everywhere in the app */
export const NadoPairSchema = z.object({
  product_id: z.number(),
  ticker_id: z.string(),   // "BTC-PERP_USDT0" — used as API parameter
  symbol: z.string(),      // "BTC" — derived from base.split('-')[0]
})
export type NadoPair = z.infer<typeof NadoPairSchema>

export const PairsResponseSchema = z.array(NadoPairRawSchema)

// ─── Subaccount Info (Gateway) ────────────────────────────────────────────────

export const NadoRiskSchema = z.object({
  long_weight_initial_x18: x18.optional(),
  short_weight_initial_x18: x18.optional(),
  long_weight_maintenance_x18: x18,
  short_weight_maintenance_x18: x18,
  price_x18: x18.optional(),
})
export type NadoRisk = z.infer<typeof NadoRiskSchema>

const NadoBookInfoSchema = z.object({
  size_increment: x18,
  price_increment_x18: x18,
  min_size: x18,
  collected_fees: x18,
})

const NadoSpotConfigSchema = z.object({
  token: z.string(),
  interest_inflection_util_x18: x18,
  interest_floor_x18: x18,
  interest_small_cap_x18: x18,
  interest_large_cap_x18: x18,
  withdraw_fee_x18: x18,
  min_deposit_rate_x18: x18,
})

const NadoSpotStateSchema = z.object({
  cumulative_deposits_multiplier_x18: x18,
  cumulative_borrows_multiplier_x18: x18,
  total_deposits_normalized: x18,
  total_borrows_normalized: x18,
})

const NadoPerpStateSchema = z.object({
  cumulative_funding_long_x18: x18,
  cumulative_funding_short_x18: x18,
  available_settle: x18,
  open_interest: x18,
})

export const NadoPerpProductSchema = z.object({
  product_id: z.number(),
  oracle_price_x18: x18,
  risk: NadoRiskSchema,
  state: NadoPerpStateSchema.optional(),
  book_info: NadoBookInfoSchema.optional(),
})
export type NadoPerpProduct = z.infer<typeof NadoPerpProductSchema>

export const NadoSpotProductSchema = z.object({
  product_id: z.number(),
  oracle_price_x18: x18,
  risk: NadoRiskSchema.optional(),
  config: NadoSpotConfigSchema.optional(),
  state: NadoSpotStateSchema.optional(),
  book_info: NadoBookInfoSchema.optional(),
})
export type NadoSpotProduct = z.infer<typeof NadoSpotProductSchema>

export const NadoPerpBalanceSchema = z.object({
  product_id: z.number(),
  balance: z.object({
    amount: x18,
    v_quote_balance: x18,
    last_cumulative_funding_x18: x18.optional(),
  }),
})
export type NadoPerpBalance = z.infer<typeof NadoPerpBalanceSchema>

export const NadoSpotBalanceSchema = z.object({
  product_id: z.number(),
  balance: z.object({
    amount: x18,
  }),
})
export type NadoSpotBalance = z.infer<typeof NadoSpotBalanceSchema>

export const NadoHealthSchema = z.object({
  assets: x18,
  liabilities: x18,
  health: x18,
})
export type NadoHealthEntry = z.infer<typeof NadoHealthSchema>

export const NadoSubaccountDataSchema = z.object({
  subaccount: z.string().optional(),
  exists: z.boolean().optional(),
  perp_products: z.array(NadoPerpProductSchema).optional().default([]),
  spot_products: z.array(NadoSpotProductSchema).optional().default([]),
  perp_balances: z.array(NadoPerpBalanceSchema).optional().default([]),
  spot_balances: z.array(NadoSpotBalanceSchema).optional().default([]),
  healths: z.array(NadoHealthSchema).optional().default([]),
  health_contributions: z.array(z.array(x18)).optional(),
  spot_count: z.number().optional(),
  perp_count: z.number().optional(),
})
export type NadoSubaccountData = z.infer<typeof NadoSubaccountDataSchema>

export const IsolatedPositionSchema = z.object({
  subaccount: z.string(),
})

export const IsolatedPositionsDataSchema = z.object({
  isolated_positions: z.array(IsolatedPositionSchema).optional().default([]),
})
export type IsolatedPositionsData = z.infer<typeof IsolatedPositionsDataSchema>

// ─── Liquidation Event (WS stream + DB API) ───────────────────────────────────

export const LiquidationEventRawSchema = z.object({
  type: z.literal('liquidation'),
  timestamp: z.string(),
  product_ids: z.array(z.number()),
  liquidator: z.string(),
  liquidatee: z.string(),
  amount: x18,
  price: x18,
})
export type LiquidationEventRaw = z.infer<typeof LiquidationEventRawSchema>

// ─── Archive: Liquidation Events ─────────────────────────────────────────────

export const ArchiveLiqEventSchema = z.object({
  subaccount: z.string(),
  product_id: z.number(),
  submission_idx: z.string(),
  pre_balance: z.object({
    perp: z
      .object({
        balance: z.object({ amount: x18, v_quote_balance: x18 }),
      })
      .optional(),
  }),
  post_balance: z.object({
    perp: z
      .object({
        balance: z.object({ amount: x18, v_quote_balance: x18 }),
      })
      .optional(),
  }),
  product: z.object({
    perp: z.object({ oracle_price_x18: x18 }).optional(),
  }),
})
export type ArchiveLiqEvent = z.infer<typeof ArchiveLiqEventSchema>

export const ArchiveLiqResponseSchema = z.object({
  events: z.array(ArchiveLiqEventSchema).optional().default([]),
})

// ─── Archive: Trade Matches ───────────────────────────────────────────────────

export const ArchiveMatchSchema = z.object({
  digest: z.string().optional(),
  order: z.object({ priceX18: x18, sender: z.string().optional() }),
  base_filled: x18,
  quote_filled: x18.optional(),
  fee: x18,
  sequencer_fee: x18.optional().default('0'),
  is_taker: z.boolean().optional(),
  isolated: z.boolean().optional(),
  submission_idx: z.string(),
  closed_amount: x18,
  realized_pnl: x18,
  pre_balance: z
    .object({
      base: z
        .object({
          perp: z
            .object({
              product_id: z.number(),
              balance: z.object({ amount: x18 }),
            })
            .optional(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
  post_balance: z
    .object({
      base: z
        .object({
          perp: z
            .object({
              product_id: z.number(),
              balance: z.object({ amount: x18 }),
            })
            .optional(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
})
export type ArchiveMatch = z.infer<typeof ArchiveMatchSchema>

const ArchiveTxSchema = z.object({
  submission_idx: z.string(),
  timestamp: z.string(), // Unix seconds as string
})

export const ArchiveMatchesResponseSchema = z.object({
  matches: z.array(ArchiveMatchSchema).optional().default([]),
  txs: z.array(ArchiveTxSchema).optional().default([]),
})

export const MatchesQueryRequestSchema = z.object({
  subaccounts: z.array(z.string()).min(1).max(5),
  limit: z.number().int().positive().max(500).default(500),
  idx: z.string().optional(),
  isolated: z.boolean().nullable().optional().default(null),
  /** When set, Archive returns only fills for these perp product ids (Nado matches API). */
  product_ids: z.array(z.number().int().nonnegative()).min(1).optional(),
})

export const FundingRateEntrySchema = z.object({
  product_id: z.number(),
  funding_rate_x18: x18,
  update_time: z.union([z.string(), z.number()]),
})

export const FundingRatesResponseSchema = z.record(
  z.string(),
  FundingRateEntrySchema,
)

const FundingOrInterestPaymentSchema = z.object({
  product_id: z.number(),
  idx: z.string(),
  timestamp: z.string(),
  amount: x18,
  balance_amount: x18.optional(),
  rate_x18: x18.optional(),
  oracle_price_x18: x18.optional(),
})

export const InterestAndFundingPaymentsResponseSchema = z.object({
  interest_payments: z.array(FundingOrInterestPaymentSchema).optional().default([]),
  funding_payments: z.array(FundingOrInterestPaymentSchema).optional().default([]),
  next_idx: z.union([z.string(), z.number()]).nullable().optional(),
})

export const InterestAndFundingRequestSchema = z.object({
  subaccount: z.string(),
  product_ids: z.array(z.number().int().nonnegative()).min(1),
  limit: z.number().int().positive().max(100).default(100),
  max_idx: z.string().optional(),
})

// ─── Orderbook ────────────────────────────────────────────────────────────────

/** v2 snapshot — bids/asks are [price, size] float tuples */
export const OrderbookSnapshotSchema = z.object({
  bids: z.array(z.tuple([z.number(), z.number()])).optional().default([]),
  asks: z.array(z.tuple([z.number(), z.number()])).optional().default([]),
})
export type OrderbookSnapshot = z.infer<typeof OrderbookSnapshotSchema>

/** book_depth SSE diff — prices/sizes are x18 strings */
export const BookDepthEventSchema = z.object({
  type: z.literal('book_depth'),
  product_id: z.number(),
  bids: z.array(z.tuple([x18, x18])),
  asks: z.array(z.tuple([x18, x18])),
})
export type BookDepthEvent = z.infer<typeof BookDepthEventSchema>

// ─── Predicted Liquidations ───────────────────────────────────────────────────

export const PredictedLiqLevelSchema = z.object({
  priceLow: z.number(),
  priceHigh: z.number(),
  longNotional: z.number(),
  shortNotional: z.number(),
})
export type PredictedLiqLevel = z.infer<typeof PredictedLiqLevelSchema>

export const PredictedLiqResponseSchema = z.object({
  levels: z.array(PredictedLiqLevelSchema),
  oraclePrice: z.number(),
  productId: z.number(),
  totalAccountsScanned: z.number(),
  positionsFound: z.number(),
})
export type PredictedLiqResponse = z.infer<typeof PredictedLiqResponseSchema>

// ─── OI Heatmap ──────────────────────────────────────────────────────────────

export const OIBucketSchema = z.object({
  price_low: z.number(),
  price_high: z.number(),
  long_oi_usd: z.number(),
  short_oi_usd: z.number(),
  risk_score: z.number(),
})

export const OIBucketPostBodySchema = z.object({
  product_id: z.number(),
  buckets: z.array(OIBucketSchema),
})

// ─── Archive: Subaccounts ─────────────────────────────────────────────────────

export const ArchiveSubaccountsResponseSchema = z.object({
  subaccounts: z
    .array(z.object({
      id: z.string().optional(),
      subaccount: z.string(),
      address: z.string().optional(),
      subaccount_name: z.string().optional(),
      created_at: z.string().optional(),
      isolated: z.boolean().optional().default(false),
    }))
    .optional()
    .default([]),
})

// ─── Archive: Tickers ────────────────────────────────────────────────────────

export const TickerDataSchema = z.object({
  product_id: z.number(),
  last_price: z.union([z.string(), z.number()]),  // V2 returns decimal number, not x18 string
})
export type TickerData = z.infer<typeof TickerDataSchema>

export const TickersResponseSchema = z.record(z.string(), TickerDataSchema)

// ─── Archive: Products (maint weight) ────────────────────────────────────────

export const ArchiveProductsResponseSchema = z.object({
  products: z
    .array(
      z.object({
        product: z
          .object({
            perp: z
              .object({
                risk: z
                  .object({
                    long_weight_maintenance_x18: x18.optional(),
                  })
                  .optional(),
              })
              .optional(),
          })
          .optional(),
      })
    )
    .optional()
    .default([]),
})

// ─── Archive: Account Snapshots ──────────────────────────────────────────────

/**
 * Single event in the account_snapshots response.
 * Captures fields for avg entry price and cumulative funding.
 * formula: |net_entry_unrealized / post_balance.perp.balance.amount|
 * funding: net_funding_cumulative (x18 USD, signed: positive = received)
 */
export const AccountSnapshotEventSchema = z.object({
  product_id: z.number(),
  isolated: z.boolean(),
  post_balance: z.object({
    perp: z.object({
      product_id: z.number().optional(),
      balance: z.object({ amount: x18 }),
    }).optional(),
  }).optional(),
  net_entry_unrealized: x18,
  net_funding_cumulative: x18.optional(),
})
export type AccountSnapshotEvent = z.infer<typeof AccountSnapshotEventSchema>

/** Real response: { snapshots: { [subaccount]: { [timestamp]: events[] } } } */
export const AccountSnapshotsResponseSchema = z.object({
  snapshots: z.record(
    z.string(),  // subaccount hex
    z.record(
      z.string(), // timestamp
      z.array(AccountSnapshotEventSchema.partial().required({ product_id: true, isolated: true, net_entry_unrealized: true })),
    ),
  ),
})

export const AccountSnapshotsRequestSchema = z.object({
  subaccounts: z.array(z.string()).min(1),
  isolated: z.boolean().optional(),
})

// ─── Gateway v1 — Response Envelope ──────────────────────────────────────────

export const GatewayResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    status: z.enum(['success', 'failure']),
    data: dataSchema.optional(),
    error: z.string().optional(),
    error_code: z.number().optional(),
    request_type: z.string().optional(),
  })

// ─── Gateway v1 — contracts ───────────────────────────────────────────────────

export const ContractsDataSchema = z.object({
  chain_id: z.string(),
  endpoint_addr: z.string(),
})
export type ContractsData = z.infer<typeof ContractsDataSchema>

// ─── Gateway v1 — market_price / market_prices ───────────────────────────────

export const MarketPriceSchema = z.object({
  product_id: z.number(),
  bid_x18: x18,
  ask_x18: x18,
})
export type MarketPrice = z.infer<typeof MarketPriceSchema>

export const MarketPricesDataSchema = z.object({
  market_prices: z.array(MarketPriceSchema),
})

// ─── Gateway v1 — subaccount_orders / orders ─────────────────────────────────

export const NadoOrderSchema = z.object({
  product_id: z.number(),
  sender: z.string(),
  price_x18: x18,
  amount: x18,
  expiration: x18.optional(),
  nonce: x18.optional(),
  appendix: x18.optional(),
  unfilled_amount: x18,
  digest: z.string(),
  placed_at: z.number(),
  order_type: z.enum(['default', 'ioc', 'fok', 'post_only']),
})
export type NadoOrder = z.infer<typeof NadoOrderSchema>

export const SubaccountOrdersDataSchema = z.object({
  sender: z.string().optional(),
  product_id: z.number().optional(),
  orders: z.array(NadoOrderSchema),
})

export const ProductOrdersDataSchema = z.object({
  sender: z.string().optional(),
  product_orders: z.array(
    z.object({
      product_id: z.number(),
      orders: z.array(NadoOrderSchema),
    })
  ),
})

// ─── Gateway v1 — all_products ────────────────────────────────────────────────

export const AllProductsDataSchema = z.object({
  perp_products: z.array(NadoPerpProductSchema).optional().default([]),
  spot_products: z.array(NadoSpotProductSchema).optional().default([]),
})

// ─── Gateway V2 REST — /v2/assets ────────────────────────────────────────────

export const V2AssetSchema = z.object({
  product_id: z.number(),
  name: z.string(),
  symbol: z.string(),
  maker_fee: z.union([z.string(), z.number()]).nullable(),   // API returns null or number
  taker_fee: z.union([z.string(), z.number()]).nullable(),
  can_withdraw: z.boolean(),
  can_deposit: z.boolean(),
  ticker_id: z.string().nullable(),
  market_type: z.string().nullable(),
})
export type V2Asset = z.infer<typeof V2AssetSchema>

export const V2AssetsResponseSchema = z.array(V2AssetSchema)

// ─── Gateway V2 REST — /v2/orderbook ─────────────────────────────────────────

export const V2OrderbookResponseSchema = z.object({
  ticker_id: z.string(),
  timestamp: z.number(),
  bids: z.array(z.tuple([z.number(), z.number()])).default([]),
  asks: z.array(z.tuple([z.number(), z.number()])).default([]),
})
export type V2OrderbookResponse = z.infer<typeof V2OrderbookResponseSchema>

// ─── Archive v1 — orders ──────────────────────────────────────────────────────

export const ArchiveOrderSchema = z.object({
  digest: z.string(),
  subaccount: z.string(),
  product_id: z.number(),
  amount: x18,
  price_x18: x18,
  base_filled: x18,
  fee: x18,
  realized_pnl: x18,
  first_fill_timestamp: z.string().optional(),
  last_fill_timestamp: z.string().optional(),
})
export type ArchiveOrder = z.infer<typeof ArchiveOrderSchema>

export const ArchiveOrdersResponseSchema = z.object({
  orders: z.array(ArchiveOrderSchema).optional().default([]),
})

// ─── Archive v1 — candlesticks ────────────────────────────────────────────────

export const CandlestickSchema = z.object({
  timestamp: z.union([z.number(), z.string()]),
  open_x18: x18,
  high_x18: x18,
  low_x18: x18,
  close_x18: x18,
  volume: x18,           // NB: field is "volume" not "volume_x18" in actual API
  volume_x18: x18.optional(), // kept for compat
})
export type Candlestick = z.infer<typeof CandlestickSchema>

export const CandlesticksResponseSchema = z.object({
  candlesticks: z.array(CandlestickSchema).optional().default([]),
})

// ─── WS Streams — remaining event types ──────────────────────────────────────

export const BestBidOfferEventSchema = z.object({
  type: z.literal('best_bid_offer'),
  timestamp: z.string(),
  product_id: z.number(),
  bid_price: x18,
  bid_qty: x18,
  ask_price: x18,
  ask_qty: x18,
})
export type BestBidOfferEvent = z.infer<typeof BestBidOfferEventSchema>

export const TradeEventSchema = z.object({
  type: z.literal('trade'),
  timestamp: z.string(),
  product_id: z.number(),
  price: x18,
  taker_qty: x18,
  maker_qty: x18,
  is_taker_buyer: z.boolean(),
})
export type TradeEvent = z.infer<typeof TradeEventSchema>

export const FillEventSchema = z.object({
  type: z.literal('fill'),
  timestamp: z.string(),
  product_id: z.number(),
  subaccount: z.string(),
  order_digest: z.string(),
  filled_qty: x18,
  remaining_qty: x18,
  original_qty: x18,
  price: x18,
  is_taker: z.boolean(),
  is_bid: z.boolean(),
  fee: x18,
  submission_idx: z.string(),
})
export type FillEvent = z.infer<typeof FillEventSchema>

export const PositionChangeEventSchema = z.object({
  type: z.literal('position_change'),
  timestamp: z.string(),
  product_id: z.number(),
  subaccount: z.string(),
  isolated: z.boolean(),
  amount: x18,
  v_quote_amount: x18,
  reason: z.string(),
})
export type PositionChangeEvent = z.infer<typeof PositionChangeEventSchema>

export const OrderUpdateEventSchema = z.object({
  type: z.literal('order_update'),
  timestamp: z.string(),
  product_id: z.number(),
  digest: z.string(),
  amount: x18,
  reason: z.enum(['placed', 'filled', 'cancelled']),
})
export type OrderUpdateEvent = z.infer<typeof OrderUpdateEventSchema>

export const LatestCandlestickEventSchema = z.object({
  type: z.literal('latest_candlestick'),
  timestamp: z.number(),
  product_id: z.number(),
  granularity: z.number(),
  open_x18: x18,
  high_x18: x18,
  low_x18: x18,
  close_x18: x18,
  volume: x18,
})
export type LatestCandlestickEvent = z.infer<typeof LatestCandlestickEventSchema>

export const FundingRateEventSchema = z.object({
  type: z.literal('funding_rate'),
  timestamp: z.string(),
  product_id: z.number(),
  funding_rate_x18: x18,
  update_time: z.number(),
})
export type FundingRateEvent = z.infer<typeof FundingRateEventSchema>

export const FundingPaymentEventSchema = z.object({
  type: z.literal('funding_payment'),
  timestamp: z.string(),
  product_id: z.number(),
  payment_amount: x18,
  open_interest: x18,
  cumulative_funding_long_x18: x18,
  cumulative_funding_short_x18: x18,
  dt: z.string(),
})
export type FundingPaymentEvent = z.infer<typeof FundingPaymentEventSchema>

// ─── WS Subscribe / ACK messages ─────────────────────────────────────────────

export const WsSubscribeMessageSchema = z.object({
  method: z.literal('subscribe'),
  stream: z.object({
    type: z.string(),
    product_id: z.number().nullable().optional(),
    subaccount: z.string().optional(),
    granularity: z.number().optional(),
  }),
  id: z.number(),
})

export const WsAckSchema = z.object({
  result: z.null(),
  id: z.number(),
  error: z.string().optional(),
})

// ─── Archive: Isolated Subaccounts ────────────────────────────────────────────

export const ArchiveIsolatedSubaccountEntrySchema = z.object({
  subaccount: z.string(),
  isolated_subaccount: z.string(),
  product_id: z.number(),
  created_at: z.string().optional(),
})
export type ArchiveIsolatedSubaccountEntry = z.infer<typeof ArchiveIsolatedSubaccountEntrySchema>

export const ArchiveIsolatedSubaccountsResponseSchema = z.object({
  isolated_subaccounts: z.array(ArchiveIsolatedSubaccountEntrySchema).optional().default([]),
})
export type ArchiveIsolatedSubaccountsResponse = z.infer<typeof ArchiveIsolatedSubaccountsResponseSchema>

// ─── Archive: Perp Prices ─────────────────────────────────────────────────────

export const PerpPriceEntrySchema = z.object({
  product_id: z.number(),
  index_price_x18: x18,
  mark_price_x18: x18,
  update_time: z.union([z.string(), z.number()]),
})
export type PerpPriceEntry = z.infer<typeof PerpPriceEntrySchema>

/** Single product: POST { price: { product_id } } */
export const PerpPriceResponseSchema = z.object({
  price: PerpPriceEntrySchema,
})

/** Multiple products: POST { perp_prices: { product_ids } } — response is product_id→entry map */
export const PerpPricesResponseSchema = z.object({
  perp_prices: z.record(z.string(), PerpPriceEntrySchema).optional().default({}),
})

// ─── Archive: Oracle Price ────────────────────────────────────────────────────

export const OraclePriceEntrySchema = z.object({
  product_id: z.number(),
  price_x18: x18,
})
export type OraclePriceEntry = z.infer<typeof OraclePriceEntrySchema>

/** Multiple oracle prices — response is product_id→entry map */
export const OraclePricesResponseSchema = z.object({
  prices: z.record(z.string(), OraclePriceEntrySchema).optional().default({}),
})

// ─── Archive: Liquidation Feed ────────────────────────────────────────────────

export const LiquidationFeedEntrySchema = z.object({
  subaccount: z.string(),
  update_time: z.union([z.string(), z.number()]),
})
export type LiquidationFeedEntry = z.infer<typeof LiquidationFeedEntrySchema>

export const LiquidationFeedResponseSchema = z.object({
  liquidation_feed: z.array(LiquidationFeedEntrySchema).optional().default([]),
})

// ─── Archive: Events (envelope — typed data varies by event_type) ─────────────

export const ArchiveEventsResponseSchema = z.object({
  events: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  txs: z.array(z.object({
    submission_idx: z.string(),
    timestamp: z.string().optional(),
  })).optional().default([]),
})

// ─── Archive: Ink Airdrop ─────────────────────────────────────────────────────

export const InkAirdropResponseSchema = z.object({
  amount: x18,
})
export type InkAirdropResponse = z.infer<typeof InkAirdropResponseSchema>

// ─── Archive: Direct Deposit Address ──────────────────────────────────────────

export const DirectDepositAddressResponseSchema = z.object({
  direct_deposit_address: z.string(),
})

// ─── Archive: Sequencer Backlog ───────────────────────────────────────────────

export const SequencerBacklogResponseSchema = z.object({
  total_txs: z.number().optional(),
  total_pending_txs: z.number().optional(),
})

// ─── Gateway v1 — symbols ─────────────────────────────────────────────────────

export const SymbolEntrySchema = z.object({
  product_id: z.number(),
  type: z.string().nullable().optional(),
  symbol: z.string().optional(),
  trading_status: z.enum(['live', 'post_only', 'not_tradable']).optional(),
  isolated_only: z.boolean().optional(),
})
export type SymbolEntry = z.infer<typeof SymbolEntrySchema>

/** symbols query — data is a map of ticker_id → SymbolEntry */
export const SymbolsDataSchema = z.object({
  symbols: z.record(z.string(), SymbolEntrySchema).optional().default({}),
})

// ─── Gateway V2 REST — /v2/symbols (with market_hours) ───────────────────────

export const MarketHoursSchema = z.object({
  is_open: z.boolean(),
  next_close: z.number().nullable(),
  next_open: z.number().nullable(),
})
export type MarketHours = z.infer<typeof MarketHoursSchema>

export const V2SymbolSchema = z.object({
  product_id: z.number(),
  symbol: z.string(),
  type: z.string().nullable().optional(),
  trading_status: z.enum(['live', 'post_only', 'not_tradable']).optional(),
  isolated_only: z.boolean().optional(),
  market_hours: MarketHoursSchema.optional(),
})
export type V2Symbol = z.infer<typeof V2SymbolSchema>

export const V2SymbolsResponseSchema = z.array(V2SymbolSchema)

// ─── Gateway v1 — fee_rates ───────────────────────────────────────────────────

/** Arrays indexed by fee tier bracket (Entry → Elite). All values x18. */
export const FeeRatesDataSchema = z.object({
  taker_fee_rates_x18: z.array(x18),
  maker_fee_rates_x18: z.array(x18),
})
export type FeeRatesData = z.infer<typeof FeeRatesDataSchema>

// ─── Gateway v1 — nonces ──────────────────────────────────────────────────────

/** tx_nonce: next on-chain sequence number (for withdraw, link_signer, etc.) */
export const NoncesDataSchema = z.object({
  tx_nonce: z.union([z.string(), z.number()]),
})
export type NoncesData = z.infer<typeof NoncesDataSchema>

// ─── Gateway v1 — linked_signer ───────────────────────────────────────────────

/** linked_signer: bytes32 of the authorized signer, or zero bytes if none */
export const LinkedSignerDataSchema = z.object({
  linked_signer: z.string(),
})
export type LinkedSignerData = z.infer<typeof LinkedSignerDataSchema>

// ─── Gateway v1 — max_order_size ──────────────────────────────────────────────

export const MaxOrderSizeDataSchema = z.object({
  max_order_size: x18,
})
export type MaxOrderSizeData = z.infer<typeof MaxOrderSizeDataSchema>

// ─── Gateway v1 — Execute response envelope ───────────────────────────────────

/**
 * Envelope for execute calls (place_order, cancel_orders, withdraw_collateral, …)
 * signature is the tx signature returned by the sequencer.
 */
export const ExecuteResponseSchema = z.object({
  status: z.enum(['success', 'failure']),
  signature: z.string().optional(),
  request_type: z.string().optional(),
  error: z.string().optional(),
  error_code: z.number().optional(),
})
