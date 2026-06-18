import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '../ui/hooks';

export interface GlowOrbProps {
  tone?: 'beam' | 'arcane' | 'mystic';
  /** Diameter in px (or any CSS size via `style`). */
  size?: number;
  /** Position — any CSS inset values. */
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
  /** 0–1 peak opacity. */
  intensity?: number;
  /** Gently drift/breathe (disabled by reduced motion). */
  animate?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

const toneColor: Record<NonNullable<GlowOrbProps['tone']>, string> = {
  beam: 'rgba(245,185,66,1)',
  arcane: 'rgba(45,212,191,1)',
  mystic: 'rgba(167,139,250,1)',
};

/** A positionable soft radial glow — atmospheric light source behind content. */
export function GlowOrb({
  tone = 'beam',
  size = 360,
  top,
  left,
  right,
  bottom,
  intensity = 0.5,
  animate = true,
  reducedMotion,
  className,
}: GlowOrbProps) {
  const prefersReduced = usePrefersReducedMotion();
  const still = reducedMotion ?? prefersReduced ?? false;
  const color = toneColor[tone];

  return (
    <motion.div
      aria-hidden
      className={cn('pointer-events-none absolute rounded-full blur-3xl', className)}
      style={{
        width: size,
        height: size,
        top,
        left,
        right,
        bottom,
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        opacity: intensity,
      }}
      animate={
        animate && !still
          ? {
              opacity: [intensity * 0.7, intensity, intensity * 0.7],
              scale: [1, 1.08, 1],
            }
          : undefined
      }
      transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}
