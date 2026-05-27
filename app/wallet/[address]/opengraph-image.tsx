import { ImageResponse } from 'next/og'

export const alt = 'Wallet Analytics — NadoLens'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

function truncateAddress(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export default async function Image({
  params,
}: {
  params: Promise<{ address: string }>
}) {
  const { address } = await params
  const short = truncateAddress(address)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'linear-gradient(135deg, #0a0a0f 0%, #1a1025 50%, #0a0a0f 100%)',
          fontFamily: 'monospace, sans-serif',
        }}
      >
        {/* Purple glow */}
        <div
          style={{
            position: 'absolute',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
          }}
        />

        {/* NadoLens label */}
        <div
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#a855f7',
            letterSpacing: '3px',
            textTransform: 'uppercase' as const,
            marginBottom: '24px',
            display: 'flex',
          }}
        >
          NadoLens
        </div>

        {/* Wallet label */}
        <div
          style={{
            fontSize: '24px',
            fontWeight: 400,
            color: '#a1a1aa',
            marginBottom: '12px',
            display: 'flex',
          }}
        >
          Wallet Analytics
        </div>

        {/* Address */}
        <div
          style={{
            fontSize: '52px',
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '-1px',
            display: 'flex',
          }}
        >
          {short}
        </div>

        {/* Tags */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '36px',
          }}
        >
          {['Positions', 'PnL', 'Trade History'].map((tag) => (
            <div
              key={tag}
              style={{
                padding: '8px 20px',
                borderRadius: '999px',
                border: '1px solid rgba(34,197,94,0.4)',
                color: '#22c55e',
                fontSize: '16px',
                fontWeight: 500,
                display: 'flex',
              }}
            >
              {tag}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '0',
            left: '0',
            right: '0',
            height: '4px',
            background: 'linear-gradient(90deg, #a855f7 0%, #22c55e 100%)',
            display: 'flex',
          }}
        />
      </div>
    ),
    { ...size },
  )
}
