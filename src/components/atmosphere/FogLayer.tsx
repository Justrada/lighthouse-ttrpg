import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '../ui/hooks';

export interface FogLayerProps {
  /** Anchor edge for the fog gradient. */
  position?: 'bottom' | 'top';
  tone?: 'abyss' | 'arcane' | 'beam';
  /** 0–1 opacity of the fog. */
  intensity?: number;
  /** Drift the fog horizontally (disabled by reduced motion). */
  animate?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

const toneColor: Record<NonNullable<FogLayerProps['tone']>, string> = {
  abyss: '5,8,16',
  arcane: '15,30,38',
  beam: '40,28,8',
};

/**
 * A soft drifting fog/haze gradient anchored to an edge — adds atmospheric
 * depth at the base (or top) of a scene. Pure CSS gradient + slow transform.
 */
export function FogLayer({
  position = 'bottom',
  tone = 'abyss',
  intensity = 0.6,
  animate = true,
  reducedMotion,
  className,
}: FogLayerProps) {
  const prefersReduced = usePrefersReducedMotion();
  const still = reducedMotion ?? prefersReduced ?? false;
  const rgb = toneColor[tone];
  const dir = position === 'bottom' ? 'to top' : 'to bottom';

  return (
    <motion.div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 h-2/5',
        position === 'bottom' ? 'bottom-0' : 'top-0',
        className,
      )}
      style={{
        background: `linear-gradient(${dir}, rgba(${rgb},${intensity}) 0%, rgba(${rgb},${
          intensity * 0.5
        }) 40%, transparent 100%)`,
      }}
      animate={
        animate && !still
          ? { x: ['-2%', '2%', '-2%'], opacity: [0.85, 1, 0.85] }
          : undefined
      }
      transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}
