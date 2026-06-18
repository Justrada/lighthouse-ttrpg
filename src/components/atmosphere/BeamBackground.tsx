import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '../ui/hooks';
import { Starfield } from './Starfield';

export interface BeamBackgroundProps {
  /** Force-disable motion. Auto-disabled when the user prefers reduced motion. */
  reducedMotion?: boolean;
  /** Density of drifting motes. */
  motes?: number;
  /** Include the twinkling starfield layer. */
  stars?: boolean;
  /** Overall intensity of the beam (0–1). */
  intensity?: number;
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

/**
 * The signature LIGHTHOUSE backdrop: a deep arcane gradient, a warm gold beam
 * that slowly sweeps from the top, drifting luminous motes, and an optional
 * starfield. Pure CSS/SVG + framer-motion — no per-frame JS. Honors
 * `prefers-reduced-motion` (and the `reducedMotion` prop), which freezes the
 * beam and motes into a calm static glow.
 */
export function BeamBackground({
  reducedMotion,
  motes = 18,
  stars = true,
  intensity = 1,
  className,
}: BeamBackgroundProps) {
  const prefersReduced = usePrefersReducedMotion();
  const still = reducedMotion ?? prefersReduced;

  const moteData = useMemo(() => {
    const rand = mulberry32(0x1190a7 ^ motes);
    return Array.from({ length: motes }, () => ({
      x: rand() * 100,
      y: 20 + rand() * 75,
      size: 1.5 + rand() * 3.5,
      drift: 12 + rand() * 26,
      dur: 10 + rand() * 16,
      delay: rand() * 10,
      opacity: 0.2 + rand() * 0.45,
      gold: rand() > 0.5,
    }));
  }, [motes]);

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden bg-abyss',
        className,
      )}
    >
      {/* Deep base gradients */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 90% 60% at 50% -15%, rgba(245,185,66,0.16), transparent 60%),' +
            'radial-gradient(ellipse 70% 70% at 12% 108%, rgba(45,212,191,0.08), transparent 55%),' +
            'radial-gradient(ellipse 60% 60% at 88% 112%, rgba(167,139,250,0.07), transparent 55%)',
        }}
      />

      {/* Starfield */}
      {stars && <Starfield count={70} reducedMotion={still} tone="mixed" />}

      {/* The sweeping beam — a soft cone anchored at top-center */}
      <div className="absolute inset-x-0 top-0 flex justify-center">
        <motion.div
          className="origin-top"
          style={{
            width: '60vmax',
            height: '120vmax',
            background:
              'conic-gradient(from 180deg at 50% 0%, transparent 0deg, ' +
              `rgba(245,185,66,${0.16 * intensity}) 8deg, ` +
              `rgba(255,230,173,${0.1 * intensity}) 14deg, ` +
              `rgba(245,185,66,${0.16 * intensity}) 20deg, transparent 28deg)`,
            filter: 'blur(18px)',
            maskImage:
              'linear-gradient(to bottom, black 0%, black 55%, transparent 92%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, black 0%, black 55%, transparent 92%)',
          }}
          animate={
            still
              ? { rotate: 0, opacity: 0.5 }
              : { rotate: [-9, 9, -9], opacity: [0.55, 0.85, 0.55] }
          }
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Lantern bloom at the very top — the lamp itself */}
      <motion.div
        className="absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
        style={{
          background:
            'radial-gradient(circle, rgba(255,230,173,0.55) 0%, rgba(245,185,66,0.25) 45%, transparent 70%)',
        }}
        animate={still ? undefined : { opacity: [0.7, 1, 0.7], scale: [1, 1.06, 1] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Drifting luminous motes */}
      {moteData.map((m, i) => {
        const color = m.gold
          ? 'rgba(255,230,173,'
          : 'rgba(94,234,212,';
        return still ? (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${m.x}%`,
              top: `${m.y}%`,
              width: m.size,
              height: m.size,
              background: `${color}${m.opacity})`,
              boxShadow: `0 0 ${m.size * 2}px ${color}${m.opacity * 0.8})`,
            }}
          />
        ) : (
          <motion.span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${m.x}%`,
              top: `${m.y}%`,
              width: m.size,
              height: m.size,
              background: `${color}${m.opacity})`,
              boxShadow: `0 0 ${m.size * 2}px ${color}${m.opacity * 0.8})`,
            }}
            animate={{
              y: [0, -m.drift, 0],
              x: [0, m.drift * 0.4, 0],
              opacity: [m.opacity * 0.4, m.opacity, m.opacity * 0.4],
            }}
            transition={{
              duration: m.dur,
              delay: m.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        );
      })}

      {/* Vignette to seat content */}
      <div className="vignette absolute inset-0" />
    </div>
  );
}
