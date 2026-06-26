import { ImageResponse } from 'next/og'

export const alt = 'NadoLens — $INK Airdrop Dashboard'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

const STATS = [
  { label: 'Points', icon: '★', example: 'Track yours' },
  { label: 'Rank', icon: '#', example: 'See position' },
  { label: 'Tier', icon: '🏅', example: 'Breeze → Tornado' },
  { label: 'Volume', icon: '📈', example: 'All-time stats' },
]

export default async function Image() {
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

        {/* Top: NadoLens branding */}
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
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background:
                'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
            }}
          >
            🔍
          </div>
          <div
            style={{
              fontSize: '36px',
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
            fontSize: '20px',
            fontWeight: 400,
            color: '#a1a1aa',
            marginBottom: '40px',
            display: 'flex',
          }}
        >
          Analytics for Nado Protocol
        </div>

        {/* Main headline */}
        <div
          style={{
            fontSize: '48px',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-1.5px',
            marginBottom: '8px',
            display: 'flex',
          }}
        >
          Check your $INK Airdrop
        </div>

        <div
          style={{
            fontSize: '22px',
            fontWeight: 400,
            color: '#a855f7',
            marginBottom: '40px',
            display: 'flex',
          }}
        >
          Points · Rank · Tier · Volume · Simulator
        </div>

        {/* 4 stat cards */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
          }}
        >
          {STATS.map((stat) => (
            <div
              key={stat.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                padding: '20px 28px',
                borderRadius: '16px',
                background: 'rgba(26, 26, 46, 0.8)',
                border: '1px solid rgba(168, 85, 247, 0.25)',
                minWidth: '200px',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background:
                    'linear-gradient(135deg, rgba(168,85,247,0.3) 0%, rgba(124,58,237,0.3) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                }}
              >
                {stat.icon}
              </div>
              <div
                style={{
                  fontSize: '14px',
                  color: '#a1a1aa',
                  display: 'flex',
                }}
              >
                {stat.label}
              </div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#ffffff',
                  display: 'flex',
                }}
              >
                {stat.example}
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
    { ...size },
  )
}
