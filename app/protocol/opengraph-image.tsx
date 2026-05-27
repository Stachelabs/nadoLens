import { ImageResponse } from 'next/og'

export const alt = 'Nado Protocol Dashboard — NadoLens'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

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
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(168,85,247,0.25) 0%, transparent 70%)',
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

        {/* Title */}
        <div
          style={{
            fontSize: '56px',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-2px',
            display: 'flex',
          }}
        >
          Protocol Dashboard
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: '24px',
            fontWeight: 400,
            color: '#a1a1aa',
            marginTop: '16px',
            display: 'flex',
          }}
        >
          OI · Volumes · TVL · Revenue · Funding
        </div>

        {/* Tags */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '40px',
          }}
        >
          {['Open Interest', 'Volume', 'TVL'].map((tag) => (
            <div
              key={tag}
              style={{
                padding: '8px 20px',
                borderRadius: '999px',
                border: '1px solid rgba(168,85,247,0.4)',
                color: '#a855f7',
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
