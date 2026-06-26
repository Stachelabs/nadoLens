import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

const SIZE = { width: 1200, height: 630 }

const FALLBACK_STATS = [
  { label: 'Points', value: 'Track yours' },
  { label: 'Rank', value: 'See position' },
  { label: 'Tier', value: 'Breeze → Tornado' },
  { label: 'Volume', value: 'All-time stats' },
]

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const pts = searchParams.get('pts')
  const rank = searchParams.get('rank')
  const tier = searchParams.get('tier')
  const vol = searchParams.get('vol')
  const val = searchParams.get('val')

  const hasData = pts && rank && tier && vol
  const stats = hasData
    ? [
        { label: 'All Time Points', value: pts },
        { label: 'All Time Rank', value: `#${rank}` },
        { label: 'Trader Tier', value: tier },
        { label: 'Total Trading Volume', value: vol },
      ]
    : FALLBACK_STATS

  const headline = val
    ? `$INK Airdrop ≈ ${val}`
    : 'Check your $INK Airdrop'

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
          fontFamily: 'sans-serif',
        }}
      >
        {/* Purple glow */}
        <div
          style={{
            position: 'absolute',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)',
            top: '30%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
          }}
        />

        {/* NadoLens branding */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background:
                'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
            }}
          >
            🔍
          </div>
          <div
            style={{
              fontSize: '32px',
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '-1px',
              display: 'flex',
            }}
          >
            NadoLens
          </div>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: '18px',
            color: '#a1a1aa',
            marginBottom: '36px',
            display: 'flex',
          }}
        >
          Analytics for Nado Protocol
        </div>

        {/* Main headline */}
        <div
          style={{
            fontSize: '52px',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-1.5px',
            marginBottom: '36px',
            display: 'flex',
          }}
        >
          {headline}
        </div>

        {/* 4 stat cards */}
        <div style={{ display: 'flex', gap: '16px' }}>
          {stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                padding: '20px 24px',
                borderRadius: '16px',
                background: 'rgba(20, 20, 35, 0.9)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                minWidth: '220px',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: 'rgba(168,85,247,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  color: '#a855f7',
                  fontWeight: 700,
                }}
              >
                {stat.label === 'All Time Points' || stat.label === 'Points'
                  ? '★'
                  : stat.label === 'All Time Rank' || stat.label === 'Rank'
                    ? '#'
                    : stat.label === 'Trader Tier' || stat.label === 'Tier'
                      ? '🏅'
                      : '📈'}
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: '#a1a1aa',
                  display: 'flex',
                }}
              >
                {stat.label}
              </div>
              <div
                style={{
                  fontSize: hasData ? '24px' : '16px',
                  fontWeight: 700,
                  color: '#ffffff',
                  display: 'flex',
                }}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom accent bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '0',
            left: '0',
            right: '0',
            height: '4px',
            background:
              'linear-gradient(90deg, #a855f7 0%, #22c55e 100%)',
            display: 'flex',
          }}
        />
      </div>
    ),
    { ...SIZE },
  )
}
