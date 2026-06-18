import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface ProgressRingProps {
  /** 0–1 fraction, or pass value/max instead. */
  value: number;
  max?: number;
  size?: number;
  /** Stroke width in px. */
  thickness?: number;
  tone?: 'beam' | 'arcane' | 'mystic' | 'hp' | 'mp' | 'sp';
  /** Center content (number, icon). */
  children?: ReactNode;
  /** Show the rounded percentage in the center automatically. */
  showPercent?: boolean;
  className?: string;
  'aria-label'?: string;
}

const stroke: Record<NonNullable<ProgressRingProps['tone']>, string> = {
  beam: 'stroke-beam',
  arcane: 'stroke-arcane',
  mystic: 'stroke-mystic',
  hp: 'stroke-hp',
  mp: 'stroke-mp',
  sp: 'stroke-sp',
};

const glow: Record<NonNullable<ProgressRingProps['tone']>, string> = {
  beam: 'drop-shadow-[0_0_6px_rgba(245,185,66,0.6)]',
  arcane: 'drop-shadow-[0_0_6px_rgba(45,212,191,0.6)]',
  mystic: 'drop-shadow-[0_0_6px_rgba(167,139,250,0.6)]',
  hp: 'drop-shadow-[0_0_6px_rgba(240,80,110,0.6)]',
  mp: 'drop-shadow-[0_0_6px_rgba(74,168,255,0.6)]',
  sp: 'drop-shadow-[0_0_6px_rgba(90,209,127,0.6)]',
};

/** A circular progress indicator with an animated, glowing arc. */
export function ProgressRing({
  value,
  max = 1,
  size = 64,
  thickness = 6,
  tone = 'beam',
  children,
  showPercent = false,
  className,
  'aria-label': ariaLabel,
}: ProgressRingProps) {
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - fraction);

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(fraction * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      className={cn('relative inline-grid place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className="stroke-line"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: offset }}
          transition={{ type: 'spring', stiffness: 140, damping: 24 }}
          className={cn(stroke[tone], glow[tone])}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-mono text-sm font-semibold text-ink">
        {children ?? (showPercent ? `${Math.round(fraction * 100)}%` : null)}
      </div>
    </div>
  );
}
