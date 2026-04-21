// NadoLens WS Proxy — Bun
// - Market streams (liquidation, book_depth): broadcast to all SSE clients
// - Account streams (fill, position_change): routed by subaccount bytes32

import { WebSocket } from 'ws'

const PORT = parseInt(process.env.PORT ?? '3001')
const NADO_WS_URL =
  process.env.NADO_SUBSCRIPTIONS_WS ?? 'wss://gateway.prod.nado.xyz/v1/subscribe'
const PING_INTERVAL_MS = 30_000
const MAX_BACKOFF_MS = 30_000

type SSEClient = {
  id: string
  writer: WritableStreamDefaultWriter<Uint8Array>
  subaccount: string | null
}

// All connected SSE clients
const clients = new Map<string, SSEClient>()

// Account routing: subaccount bytes32 → Set of client IDs watching it
const accountClients = new Map<string, Set<string>>()

// Which subaccounts are subscribed on the Nado WS (persists across reconnects)
const subscribedAccounts = new Set<string>()

// IDs 1–5 reserved for static market subscriptions; account subs start at 10
let nextSubId = 10

const encoder = new TextEncoder()

function broadcastToAll(raw: string) {
  const chunk = encoder.encode(`data: ${raw}\n\n`)
  for (const [id, client] of clients) {
    client.writer.write(chunk).catch(() => clients.delete(id))
  }
}

function routeToAccount(subaccount: string, raw: string) {
  const ids = accountClients.get(subaccount)
  if (!ids || ids.size === 0) return
  const chunk = encoder.encode(`data: ${raw}\n\n`)
  for (const id of ids) {
    const client = clients.get(id)
    if (!client) { ids.delete(id); continue }
    client.writer.write(chunk).catch(() => {
      clients.delete(id)
      ids.delete(id)
    })
  }
}

function handleMessage(raw: string) {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { broadcastToAll(raw); return }

  // Route account events by their subaccount field
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    'subaccount' in parsed &&
    typeof (parsed as Record<string, unknown>).subaccount === 'string'
  ) {
    routeToAccount((parsed as Record<string, unknown>).subaccount as string, raw)
    return
  }

  broadcastToAll(raw)
}

// ─── WebSocket Connection ─────────────────────────────────────────────────────

let ws: WebSocket | null = null
let wsConnected = false

function subscribeAccount(subaccount: string) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ id: nextSubId++, method: 'subscribe', stream: { type: 'fill', subaccount } }))
  ws.send(JSON.stringify({ id: nextSubId++, method: 'subscribe', stream: { type: 'position_change', subaccount } }))
  console.log(`[ws-proxy] Subscribed fill+position_change for ${subaccount.slice(0, 10)}…`)
}

function connect(attempt = 0): void {
  const socket = new WebSocket(NADO_WS_URL, {
    headers: { 'Sec-WebSocket-Extensions': 'permessage-deflate' },
  })
  ws = socket

  socket.on('open', () => {
    wsConnected = true
    attempt = 0
    console.log(`[ws-proxy] Connected to ${NADO_WS_URL}`)

    // Market subscriptions (static)
    socket.send(JSON.stringify({ id: 1, method: 'subscribe', stream: { type: 'liquidation', product_id: null } }))
    socket.send(JSON.stringify({ id: 2, method: 'subscribe', stream: { type: 'book_depth', product_id: 2 } }))
    socket.send(JSON.stringify({ id: 3, method: 'subscribe', stream: { type: 'book_depth', product_id: 4 } }))
    socket.send(JSON.stringify({ id: 4, method: 'subscribe', stream: { type: 'book_depth', product_id: 8 } }))

    // Re-subscribe account streams after reconnect
    for (const subaccount of subscribedAccounts) {
      subscribeAccount(subaccount)
    }

    const pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ id: 5, method: 'ping' }))
      } else {
        clearInterval(pingInterval)
      }
    }, PING_INTERVAL_MS)

    socket.on('close', () => {
      clearInterval(pingInterval)
      wsConnected = false
      ws = null
      console.log(`[ws-proxy] Disconnected — reconnecting (attempt ${attempt + 1})`)
      reconnect(attempt + 1)
    })
  })

  socket.on('message', (data) => {
    const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data)
    handleMessage(raw)
  })

  socket.on('error', (error: Error) => {
    console.error('[ws-proxy] WebSocket error:', error.message)
    wsConnected = false
    ws = null
    reconnect(attempt + 1)
  })
}

function reconnect(attempt: number): void {
  const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS)
  console.log(`[ws-proxy] Reconnecting in ${delay}ms…`)
  setTimeout(() => connect(attempt), delay)
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,

  fetch(req: Request) {
    const url = new URL(req.url)

    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          uptime: process.uptime(),
          ws_connected: wsConnected,
          sse_clients: clients.size,
          account_subs: subscribedAccounts.size,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (url.pathname === '/sse') {
      const id = crypto.randomUUID()
      const subaccount = url.searchParams.get('subaccount') ?? null

      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
      const writer = writable.getWriter()

      clients.set(id, { id, writer, subaccount })
      console.log(`[ws-proxy] SSE connected (${id}) sub=${subaccount?.slice(0, 10) ?? 'none'}… total: ${clients.size}`)

      // Register account routing and subscribe if this is a new subaccount
      if (subaccount) {
        if (!accountClients.has(subaccount)) {
          accountClients.set(subaccount, new Set())
        }
        accountClients.get(subaccount)!.add(id)

        if (!subscribedAccounts.has(subaccount)) {
          subscribedAccounts.add(subaccount)
          subscribeAccount(subaccount)
        }
      }

      writer.write(encoder.encode(': connected\n\n'))

      req.signal.addEventListener('abort', () => {
        clients.delete(id)

        if (subaccount) {
          const ids = accountClients.get(subaccount)
          if (ids) {
            ids.delete(id)
            if (ids.size === 0) accountClients.delete(subaccount)
          }
        }

        writer.close().catch(() => {})
        console.log(`[ws-proxy] SSE disconnected (${id}) — total: ${clients.size}`)
      })

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    return new Response('Not Found', { status: 404 })
  },
})

console.log(`[ws-proxy] HTTP server listening on port ${server.port}`)

connect()
