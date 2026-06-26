import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

const SIZE = { width: 1200, height: 630 }

function BrandingHeader() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
    </div>
  )
}

function BottomBar() {
  return (
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
  )
}

const ICON_MAP: Record<string, string> = {
  'All Time Points': '★',
  'All Time Rank': '#',
  'Trader Tier': '🏅',
  'Total Trading Volume': '📈',
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const pts = searchParams.get('pts')
  const rank = searchParams.get('rank')
  const tier = searchParams.get('tier')
  const vol = searchParams.get('vol')
  const val = searchParams.get('val')

  const hasFullStats = pts && rank && tier && vol

  const wrapper = {
    width: '100%',
    height: '100%',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    background:
      'linear-gradient(135deg, #0a0a0f 0%, #1a1025 50%, #0a0a0f 100%)',
    fontFamily: 'sans-serif',
  }

  // ── Full stats card (connected user with wallet data) ──
  if (hasFullStats) {
    const stats = [
      { label: 'All Time Points', value: pts },
      { label: 'All Time Rank', value: `#${rank}` },
      { label: 'Trader Tier', value: tier },
      { label: 'Total Trading Volume', value: vol },
    ]

    return new ImageResponse(
      (
        <div style={wrapper}>
          <BrandingHeader />
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
            {val ? `$INK Airdrop ≈ ${val}` : 'Check your $INK Airdrop'}
          </div>

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
                  {ICON_MAP[stat.label] ?? '★'}
                </div>
                <div
                  style={{ fontSize: '13px', color: '#a1a1aa', display: 'flex' }}
                >
                  {stat.label}
                </div>
                <div
                  style={{
                    fontSize: '24px',
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

          <BottomBar />
        </div>
      ),
      { ...SIZE },
    )
  }

  // ── Value-only card (not connected, but shared from simulator) ──
  if (val) {
    return new ImageResponse(
      (
        <div style={wrapper}>
          <BrandingHeader />

          {/* Estimated value card */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              padding: '48px 80px',
              borderRadius: '24px',
              background: 'rgba(20, 20, 35, 0.9)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
            }}
          >
            <div
              style={{
                fontSize: '20px',
                color: '#a1a1aa',
                display: 'flex',
              }}
            >
              Estimated Airdrop Value
            </div>
            <div
              style={{
                fontSize: '72px',
                fontWeight: 800,
                color: '#22c55e',
                letterSpacing: '-2px',
                display: 'flex',
              }}
            >
              {val}
            </div>
            <div
              style={{
                fontSize: '16px',
                color: '#a1a1aa',
                display: 'flex',
              }}
            >
              Simulated with NadoLens
            </div>
          </div>

          <BottomBar />
        </div>
      ),
      { ...SIZE },
    )
  }

  // ── Generic fallback (no params, manual share) ──
  return new ImageResponse(
    (
      <div style={wrapper}>
        <BrandingHeader />
        <div
          style={{
            fontSize: '52px',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-1.5px',
            display: 'flex',
          }}
        >
          Check your $INK Airdrop
        </div>
        <div
          style={{
            fontSize: '22px',
            color: '#a855f7',
            marginTop: '16px',
            display: 'flex',
          }}
        >
          Points · Rank · Tier · Volume · Simulator
        </div>
        <BottomBar />
      </div>
    ),
    { ...SIZE },
  )
}
