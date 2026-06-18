import { useId } from './hooks';
import { cn } from '@/lib/cn';

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  tone?: 'beam' | 'arcane' | 'mystic';
  /** Show the current value bubble above the thumb. */
  showValue?: boolean;
  /** Format the displayed value. */
  format?: (value: number) => string;
  className?: string;
  'aria-label'?: string;
}

const toneFill: Record<NonNullable<SliderProps['tone']>, string> = {
  beam: 'from-beam-deep to-beam',
  arcane: 'from-arcane-deep to-arcane',
  mystic: 'from-mystic to-mystic-soft',
};

const toneThumb: Record<NonNullable<SliderProps['tone']>, string> = {
  beam: 'bg-beam shadow-glow-beam',
  arcane: 'bg-arcane shadow-glow-arcane',
  mystic: 'bg-mystic',
};

/**
 * A styled range slider built on a native input for full keyboard + a11y
 * support, with a custom-painted track and thumb.
 */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  tone = 'beam',
  showValue = false,
  format = (v) => String(v),
  className,
  'aria-label': ariaLabel,
}: SliderProps) {
  const id = useId('slider');
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <div className={cn('relative w-full', disabled && 'opacity-50', className)}>
      {showValue && (
        <div
          className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md border border-line bg-surface-overlay px-1.5 py-0.5 font-mono text-xs text-beam-soft"
          style={{ left: `calc(${pct}% )` }}
        >
          {format(value)}
        </div>
      )}
      <div className="relative h-2 w-full">
        {/* Track */}
        <div className="absolute inset-0 rounded-full bg-void/80 ring-1 ring-inset ring-line" />
        {/* Fill */}
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full bg-gradient-to-r',
            toneFill[tone],
          )}
          style={{ width: `${pct}%` }}
        />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={ariaLabel}
          onChange={(e) => onChange(Number(e.target.value))}
          className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none disabled:cursor-not-allowed [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-transparent"
        />
        {/* Thumb (after input so peer-active scale works; clicks pass through) */}
        <div
          className={cn(
            'pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-abyss transition-transform peer-focus-visible:ring-beam',
            toneThumb[tone],
            !disabled && 'peer-active:scale-110',
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}
