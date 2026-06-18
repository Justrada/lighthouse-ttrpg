import { cn } from '@/lib/cn';
import { LighthouseMark } from './LighthouseMark';

export type WordmarkSize = 'sm' | 'md' | 'lg' | 'xl';

export interface WordmarkProps {
  size?: WordmarkSize;
  /** Optional tagline beneath the logotype. */
  tagline?: string;
  /** Show the LighthouseMark icon to the left. */
  showMark?: boolean;
  /** Render as inline (icon + text) vs centered stack. */
  layout?: 'inline' | 'stacked';
  /** Apply the glowing beam treatment to the text. */
  glow?: boolean;
  className?: string;
}

const textSize: Record<WordmarkSize, string> = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-4xl',
  xl: 'text-6xl',
};

const markSize: Record<WordmarkSize, number> = {
  sm: 22,
  md: 30,
  lg: 44,
  xl: 64,
};

const taglineSize: Record<WordmarkSize, string> = {
  sm: 'text-[0.5rem]',
  md: 'text-[0.625rem]',
  lg: 'text-xs',
  xl: 'text-sm',
};

/** The LIGHTHOUSE logotype (Cinzel) with a beam glow and optional mark + tagline. */
export function Wordmark({
  size = 'md',
  tagline,
  showMark = true,
  layout = 'inline',
  glow = true,
  className,
}: WordmarkProps) {
  const word = (
    <span
      className={cn(
        'font-display font-bold uppercase leading-none tracking-[0.18em] text-balance',
        textSize[size],
        glow ? 'text-glow-beam' : 'text-beam-soft',
      )}
    >
      Lighthouse
    </span>
  );

  if (layout === 'stacked') {
    return (
      <div className={cn('flex flex-col items-center gap-2 text-center', className)}>
        {showMark && <LighthouseMark size={markSize[size]} glow={glow} />}
        {word}
        {tagline && (
          <span
            className={cn(
              'font-sans uppercase tracking-[0.35em] text-ink-faint',
              taglineSize[size],
            )}
          >
            {tagline}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cn('inline-flex items-center gap-2.5', className)}>
      {showMark && <LighthouseMark size={markSize[size]} glow={glow} />}
      <span className="flex flex-col">
        {word}
        {tagline && (
          <span
            className={cn(
              'font-sans uppercase tracking-[0.3em] text-ink-faint',
              taglineSize[size],
            )}
          >
            {tagline}
          </span>
        )}
      </span>
    </div>
  );
}
