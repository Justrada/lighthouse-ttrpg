import { useState } from 'react';
import { ChevronsDown, ChevronsUp, Dices, Eye, EyeOff } from 'lucide-react';
import type { AdvantageMode } from '@/types';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Input } from './Input';
import { Tooltip } from './Tooltip';

export interface DiceTrayProps {
  /** Called when the user commits a roll. Does NOT roll — parent rolls. */
  onRoll: (notation: string, mode: AdvantageMode, secret: boolean) => void;
  /** Initial notation in the input. */
  defaultNotation?: string;
  /** Quick d20 modifier buttons to render, e.g. [-1, 0, 1, 2, 3]. */
  quickModifiers?: number[];
  /** Allow the secret (GM) toggle. */
  allowSecret?: boolean;
  disabled?: boolean;
  className?: string;
}

const fmtMod = (m: number) => (m === 0 ? 'd20' : m > 0 ? `d20+${m}` : `d20${m}`);

/**
 * A presentational dice roller: a notation input, d20 quick-roll buttons, an
 * advantage/disadvantage toggle, an optional secret toggle, and a Roll button.
 * It never rolls — it surfaces the user's intent via `onRoll`.
 */
export function DiceTray({
  onRoll,
  defaultNotation = '1d20',
  quickModifiers = [0, 1, 2, 3, 5],
  allowSecret = true,
  disabled,
  className,
}: DiceTrayProps) {
  const [notation, setNotation] = useState(defaultNotation);
  const [mode, setMode] = useState<AdvantageMode>('normal');
  const [secret, setSecret] = useState(false);

  const roll = (n: string) => {
    const trimmed = n.trim();
    if (!trimmed || disabled) return;
    onRoll(trimmed, mode, secret);
  };

  const toggleMode = (m: Exclude<AdvantageMode, 'normal'>) =>
    setMode((cur) => (cur === m ? 'normal' : m));

  return (
    <div className={cn('lh-panel-raised flex flex-col gap-3 p-4', className)}>
      {/* Notation + Roll */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          roll(notation);
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={notation}
          onChange={(e) => setNotation(e.target.value)}
          placeholder="e.g. 2d6+3"
          mono
          disabled={disabled}
          aria-label="Dice notation"
          leftIcon={<Dices />}
          className="flex-1"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={disabled || !notation.trim()}
          leftIcon={<Dices className="h-4 w-4" />}
        >
          Roll
        </Button>
      </form>

      {/* d20 quick rolls */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-faint">
          d20
        </span>
        {quickModifiers.map((m) => (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => roll(fmtMod(m))}
            className={cn(
              'rounded-lg border border-line bg-void/60 px-2.5 py-1 font-mono text-xs text-ink-muted transition-colors hover:border-beam/40 hover:text-beam-soft focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            {m === 0 ? '+0' : m > 0 ? `+${m}` : m}
          </button>
        ))}
      </div>

      {/* Modes */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Tooltip content="Roll with advantage">
            <button
              type="button"
              disabled={disabled}
              aria-pressed={mode === 'advantage'}
              onClick={() => toggleMode('advantage')}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none disabled:opacity-40',
                mode === 'advantage'
                  ? 'border-success/50 bg-success/15 text-success'
                  : 'border-line bg-void/60 text-ink-muted hover:text-ink',
              )}
            >
              <ChevronsUp className="h-3.5 w-3.5" /> Adv
            </button>
          </Tooltip>
          <Tooltip content="Roll with disadvantage">
            <button
              type="button"
              disabled={disabled}
              aria-pressed={mode === 'disadvantage'}
              onClick={() => toggleMode('disadvantage')}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none disabled:opacity-40',
                mode === 'disadvantage'
                  ? 'border-danger/50 bg-danger/15 text-hp'
                  : 'border-line bg-void/60 text-ink-muted hover:text-ink',
              )}
            >
              <ChevronsDown className="h-3.5 w-3.5" /> Dis
            </button>
          </Tooltip>
        </div>

        {allowSecret && (
          <Tooltip content={secret ? 'Secret roll (hidden)' : 'Public roll'}>
            <button
              type="button"
              disabled={disabled}
              aria-pressed={secret}
              onClick={() => setSecret((s) => !s)}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none disabled:opacity-40',
                secret
                  ? 'border-mystic/50 bg-mystic/15 text-mystic-soft'
                  : 'border-line bg-void/60 text-ink-muted hover:text-ink',
              )}
            >
              {secret ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              {secret ? 'Secret' : 'Public'}
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
