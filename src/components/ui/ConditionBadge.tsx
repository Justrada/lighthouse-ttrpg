import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Tooltip } from './Tooltip';

export type ConditionTone = 'buff' | 'debuff' | 'neutral';

export interface ConditionBadgeProps {
  label: string;
  icon?: ReactNode;
  tone?: ConditionTone;
  /** Rich description shown in a tooltip on hover/focus. */
  description?: ReactNode;
  /** Optional remaining-duration text, e.g. "2 rounds". */
  duration?: string;
  size?: 'sm' | 'md';
  /** Show only the icon (label still announced for a11y). */
  iconOnly?: boolean;
  className?: string;
}

const tones: Record<ConditionTone, string> = {
  buff: 'border-success/40 bg-success/10 text-success',
  debuff: 'border-danger/40 bg-danger/10 text-hp',
  neutral: 'border-arcane/40 bg-arcane/10 text-arcane-soft',
};

/**
 * A status-effect chip (buff / debuff / neutral) with icon, label, optional
 * duration, and an accessible tooltip describing the effect.
 */
export function ConditionBadge({
  label,
  icon,
  tone = 'neutral',
  description,
  duration,
  size = 'md',
  iconOnly = false,
  className,
}: ConditionBadgeProps) {
  const badge = (
    <span
      role="status"
      aria-label={duration ? `${label}, ${duration}` : label}
      tabIndex={description ? 0 : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border font-medium transition-colors focus-visible:outline-none',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
        iconOnly && (size === 'sm' ? 'px-1.5' : 'px-2'),
        tones[tone],
        '[&_svg]:h-3.5 [&_svg]:w-3.5',
        className,
      )}
    >
      {icon}
      {!iconOnly && <span className="truncate">{label}</span>}
      {!iconOnly && duration && (
        <span className="font-mono text-[0.6875rem] opacity-70">{duration}</span>
      )}
    </span>
  );

  if (!description && !iconOnly) return badge;

  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">{label}</span>
          {duration && (
            <span className="font-mono text-[0.6875rem] text-ink-muted">
              {duration}
            </span>
          )}
          {description && (
            <span className="text-ink-muted">{description}</span>
          )}
        </span>
      }
    >
      {badge}
    </Tooltip>
  );
}
