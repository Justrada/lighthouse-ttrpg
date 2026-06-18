import { cn } from '@/lib/cn';

export interface LighthouseMarkProps {
  size?: number;
  /** Emit the signature gold beam from the lamp. */
  beam?: boolean;
  /** Add a soft glow drop-shadow. */
  glow?: boolean;
  className?: string;
  title?: string;
}

/**
 * The LIGHTHOUSE logomark — a compact SVG lighthouse with an arcane lamp and an
 * optional gold beam. Currentcolor-aware for the tower; gold/teal accents fixed.
 */
export function LighthouseMark({
  size = 32,
  beam = true,
  glow = true,
  className,
  title = 'Lighthouse',
}: LighthouseMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={cn('drag-none', className)}
      style={glow ? { filter: 'drop-shadow(0 0 6px rgba(245,185,66,0.45))' } : undefined}
    >
      <defs>
        <linearGradient id="lh-tower" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a2742" />
          <stop offset="100%" stopColor="#0e1626" />
        </linearGradient>
        <linearGradient id="lh-lamp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe6ad" />
          <stop offset="100%" stopColor="#f5b942" />
        </linearGradient>
      </defs>

      {/* Beam */}
      {beam && (
        <>
          <path
            d="M32 16 L8 28 L8 22 L32 16Z"
            fill="#f5b942"
            opacity="0.35"
          />
          <path
            d="M32 16 L56 28 L56 22 L32 16Z"
            fill="#f5b942"
            opacity="0.35"
          />
        </>
      )}

      {/* Lamp room glow */}
      <circle cx="32" cy="16" r="7" fill="#ffe6ad" opacity="0.25" />

      {/* Tower body (tapered) */}
      <path
        d="M26 24 L38 24 L41 56 L23 56 Z"
        fill="url(#lh-tower)"
        stroke="#2e3f64"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Stripe bands */}
      <path d="M25 36 L39 36 L39.4 41 L24.6 41 Z" fill="#2dd4bf" opacity="0.5" />
      <path d="M24.2 47 L39.8 47 L40.2 52 L23.8 52 Z" fill="#f5b942" opacity="0.45" />

      {/* Gallery deck */}
      <rect x="24" y="20" width="16" height="4" rx="1" fill="#2e3f64" />

      {/* Lamp room */}
      <rect x="28" y="11" width="8" height="9" rx="1.5" fill="url(#lh-lamp)" />
      {/* Roof */}
      <path d="M27 11 L37 11 L32 5 Z" fill="#c8881f" />
      {/* Finial */}
      <circle cx="32" cy="4" r="1.4" fill="#ffe6ad" />

      {/* Base */}
      <rect x="21" y="55" width="22" height="4" rx="1.5" fill="#1a2742" stroke="#2e3f64" strokeWidth="1" />
    </svg>
  );
}
