import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '../ui/hooks';

export interface StarfieldProps {
  /** Number of stars/motes to scatter. */
  count?: number;
  /** Force-disable motion (also auto-disabled by prefers-reduced-motion). */
  reducedMotion?: boolean;
  /** Tint of the stars. */
  tone?: 'beam' | 'arcane' | 'mixed' | 'ink';
  className?: string;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const palette: Record<NonNullable<StarfieldProps['tone']>, string[]> = {
  beam: ['#ffe6ad', '#f5b942'],
  arcane: ['#5eead4', '#2dd4bf'],
  mixed: ['#ffe6ad', '#5eead4', '#c4b5fd', '#e8eefb'],
  ink: ['#e8eefb', '#9aa8c8'],
};

/**
 * A subtle field of twinkling stars/motes. Deterministic layout; uses
 * lightweight CSS opacity/scale animations (no JS loop). Respects reduced motion.
 */
export function Starfield({
  count = 60,
  reducedMotion,
  tone = 'mixed',
  className,
}: StarfieldProps) {
  const prefersReduced = usePrefersReducedMotion();
  const still = reducedMotion ?? prefersReduced;
  const colors = palette[tone];

  const stars = useMemo(() => {
    const rand = mulberry32(0xbeac04 ^ count);
    return Array.from({ length: count }, () => ({
      x: rand() * 100,
      y: rand() * 100,
      r: 0.5 + rand() * 1.6,
      color: colors[Math.floor(rand() * colors.length)],
      delay: rand() * 6,
      dur: 3 + rand() * 5,
      baseOpacity: 0.25 + rand() * 0.5,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, tone]);

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <svg className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        {stars.map((s, i) =>
          still ? (
            <circle
              key={i}
              cx={`${s.x}%`}
              cy={`${s.y}%`}
              r={s.r}
              fill={s.color}
              opacity={s.baseOpacity}
            />
          ) : (
            <motion.circle
              key={i}
              cx={`${s.x}%`}
              cy={`${s.y}%`}
              r={s.r}
              fill={s.color}
              initial={{ opacity: s.baseOpacity * 0.4 }}
              animate={{
                opacity: [s.baseOpacity * 0.4, s.baseOpacity, s.baseOpacity * 0.4],
                scale: [1, 1.25, 1],
              }}
              transition={{
                duration: s.dur,
                delay: s.delay,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ),
        )}
      </svg>
    </div>
  );
}
