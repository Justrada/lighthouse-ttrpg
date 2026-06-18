import { cn } from '@/lib/cn';
import { Sigil } from './Sigil';

export type AvatarStatus = 'online' | 'away' | 'busy' | 'offline' | null;
export type AvatarRing = 'beam' | 'arcane' | 'mystic' | 'none';

export interface AvatarProps {
  /** Image URL. If omitted, a Sigil is generated from `seed` (or `name`). */
  src?: string;
  /** Seed for the generated Sigil fallback. */
  seed?: string;
  /** Used for alt text and as a seed fallback. */
  name?: string;
  size?: number;
  /** Glowing ring tone around the frame. */
  ring?: AvatarRing;
  /** Status dot in the corner. */
  status?: AvatarStatus;
  /** Square (rounded) vs circular frame. */
  square?: boolean;
  className?: string;
}

const ringStyle: Record<AvatarRing, string> = {
  beam: 'ring-2 ring-beam/60 shadow-glow-beam',
  arcane: 'ring-2 ring-arcane/60 shadow-glow-arcane',
  mystic: 'ring-2 ring-mystic/60 shadow-[0_0_18px_-2px_rgba(167,139,250,0.5)]',
  none: 'ring-1 ring-line',
};

const statusColor: Record<NonNullable<AvatarStatus>, string> = {
  online: 'bg-success',
  away: 'bg-warn',
  busy: 'bg-danger',
  offline: 'bg-ink-faint',
};

/** Frames a Sigil or image with a glowing ring and optional status dot. */
export function Avatar({
  src,
  seed,
  name,
  size = 48,
  ring = 'beam',
  status = null,
  square = false,
  className,
}: AvatarProps) {
  const sigilSeed = seed ?? name ?? 'lighthouse';
  const dotSize = Math.max(8, Math.round(size * 0.28));

  return (
    <span
      className={cn('relative inline-block shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <span
        className={cn(
          'block h-full w-full overflow-hidden bg-surface',
          square ? 'rounded-xl' : 'rounded-full',
          ringStyle[ring],
        )}
      >
        {src ? (
          <img
            src={src}
            alt={name ? `${name} avatar` : 'avatar'}
            className="h-full w-full object-cover drag-none"
            draggable={false}
          />
        ) : (
          <Sigil seed={sigilSeed} size={size} title={name} />
        )}
      </span>

      {status && (
        <span
          aria-label={status}
          className={cn(
            'absolute bottom-0 right-0 rounded-full ring-2 ring-abyss',
            statusColor[status],
          )}
          style={{ width: dotSize, height: dotSize }}
        />
      )}
    </span>
  );
}
