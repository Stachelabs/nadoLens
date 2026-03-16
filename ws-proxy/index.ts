// NadoLens WS Proxy — Bun
// Maintains a persistent WebSocket to wss://gateway.prod.nado.xyz/v1/subscribe
// Fans out messages to all connected SSE clients

import { WebSocket } from 'ws'

const PORT = parseInt(process.env.PORT ?? '3001')
const NADO_WS_URL =
  process.env.NADO_SUBSCRIPTIONS_WS ?? 'wss://gateway.prod.nado.xyz/v1/subscribe'
const PING_INTERVAL_MS = 30_000
const MAX_BACKOFF_MS = 30_000

type SSEClient = {
  id: string
  writer: WritableStreamDefaultWriter<Uint8Array>
}

const clients = new Map<string, SSEClient>()
const encoder = new TextEncoder()

function broadcastToClients(data: string) {
  const chunk = encoder.encode(`data: ${data}\n\n`)
  for (const [id, client] of clients) {
    client.writer.write(chunk).catch(() => {
      clients.delete(id)
    })
  }
}

// ─── WebSocket Connection ─────────────────────────────────────────────────────

let wsConnected = false

function connect(attempt = 0): void {
  const ws = new WebSocket(NADO_WS_URL, {
    headers: {
      'Sec-WebSocket-Extensions': 'permessage-deflate',
    },
  })

  ws.on('open', () => {
    wsConnected = true
    attempt = 0
    console.log(`[ws-proxy] Connected to ${NADO_WS_URL}`)

    // Subscribe to public streams (id required by server)
    ws.send(JSON.stringify({ id: 1, method: 'subscribe', stream: { type: 'liquidation', product_id: null } }))
    ws.send(JSON.stringify({ id: 2, method: 'subscribe', stream: { type: 'best_bid_offer', product_id: 1 } }))

    // Ping every 30s to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ method: 'ping' }))
      } else {
        clearInterval(pingInterval)
      }
    }, PING_INTERVAL_MS)

    ws.on('close', () => {
      clearInterval(pingInterval)
      wsConnected = false
      console.log(`[ws-proxy] Disconnected — reconnecting (attempt ${attempt + 1})`)
      reconnect(attempt + 1)
    })
  })

  ws.on('message', (data) => {
    if (typeof data === 'string') {
      broadcastToClients(data)
    } else if (Buffer.isBuffer(data)) {
      broadcastToClients(data.toString('utf8'))
    }
  })

  ws.on('error', (error: Error & { response?: { statusCode: number; headers: Record<string, string> } }) => {
    console.error('[ws-proxy] WebSocket error:', error.message)
    if (error.response) {
      console.error('[ws-proxy] HTTP status:', error.response.statusCode)
      console.error('[ws-proxy] HTTP headers:', JSON.stringify(error.response.headers))
    }
    wsConnected = false
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

    // Health endpoint
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          uptime: process.uptime(),
          ws_connected: wsConnected,
          sse_clients: clients.size,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    // SSE endpoint
    if (url.pathname === '/sse') {
      const id = crypto.randomUUID()
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
      const writer = writable.getWriter()

      clients.set(id, { id, writer })
      console.log(`[ws-proxy] SSE client connected (${id}) — total: ${clients.size}`)

      // Send initial heartbeat
      writer.write(encoder.encode(': connected\n\n'))

      // Clean up on client disconnect
      req.signal.addEventListener('abort', () => {
        clients.delete(id)
        writer.close().catch(() => {})
        console.log(`[ws-proxy] SSE client disconnected (${id}) — total: ${clients.size}`)
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

// Start WebSocket connection
connect()
