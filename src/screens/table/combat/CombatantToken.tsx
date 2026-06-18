import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Shield, Skull, Swords } from 'lucide-react';
import type { Combatant } from '@/types';
import { Avatar, ResourceBar, ConditionBadge } from '@/components/ui';
import { CONDITIONS } from '@/data/constants';
import { cn } from '@/lib/cn';

export interface CombatantTokenProps {
  combatant: Combatant;
  /** Highlight as the actor currently resolving. */
  active?: boolean;
  /** Render selection affordance + ring. */
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (combatant: Combatant) => void;
  /** Compact layout for dense rosters / phones. */
  compact?: boolean;
  /**
   * Render the tight, board-ready footprint (circular avatar, slim HP bar,
   * upright on a hex) instead of the full roster card.
   */
  onHex?: boolean;
  /** Footprint diameter in px for the on-hex form (drives avatar size). */
  hexSize?: number;
  /** Disable the floating damage/heal numbers (e.g. in setup previews). */
  noFloaters?: boolean;
  className?: string;
}

interface Floater {
  id: number;
  amount: number;
  kind: 'damage' | 'heal';
}

const conditionMeta = (conditionKey: string) =>
  CONDITIONS.find((c) => c.key === conditionKey);

/** HP-change floaters, shared by both render forms. */
function useFloaters(currentHP: number, noFloaters: boolean) {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const prevHP = useRef(currentHP);
  const floaterSeq = useRef(0);

  useEffect(() => {
    const delta = currentHP - prevHP.current;
    prevHP.current = currentHP;
    if (noFloaters || delta === 0) return;
    const id = floaterSeq.current++;
    setFloaters((f) => [...f, { id, amount: Math.abs(delta), kind: delta < 0 ? 'damage' : 'heal' }]);
    const t = setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 1100);
    return () => clearTimeout(t);
  }, [currentHP, noFloaters]);

  return floaters;
}

function Floaters({ floaters }: { floaters: Floater[] }) {
  return (
    <AnimatePresence>
      {floaters.map((f) => (
        <motion.span
          key={f.id}
          initial={{ opacity: 0, y: 0, scale: 0.6 }}
          animate={{ opacity: 1, y: -34, scale: 1.1 }}
          exit={{ opacity: 0, y: -48 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            'pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 font-mono text-lg font-bold drop-shadow',
            f.kind === 'damage' ? 'text-hp' : 'text-sp',
          )}
        >
          {f.kind === 'damage' ? '−' : '+'}
          {f.amount}
        </motion.span>
      ))}
    </AnimatePresence>
  );
}

function ConditionRow({ combatant, max = 4 }: { combatant: Combatant; max?: number }) {
  if (combatant.statusEffects.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {combatant.statusEffects.slice(0, max).map((e) => {
        const key = e.data?.conditionKey as string | undefined;
        const meta = key ? conditionMeta(key) : undefined;
        return (
          <ConditionBadge
            key={e.id}
            size="sm"
            iconOnly
            label={e.label}
            tone={(e.tone as 'buff' | 'debuff' | 'neutral') ?? 'neutral'}
            description={meta?.description}
            icon={<span aria-hidden>{meta?.icon ?? '◆'}</span>}
          />
        );
      })}
      {combatant.statusEffects.length > max && (
        <span className="text-[0.625rem] text-ink-faint">
          +{combatant.statusEffects.length - max}
        </span>
      )}
    </div>
  );
}

/**
 * A single combatant on the board. Two render forms share the same HP-floater
 * behavior and visual language:
 *
 * - The **roster card** (default): portrait, name, animated HP bar, MP/SP pips,
 *   AC, condition badges, and clear unconscious / dead states.
 * - The **on-hex footprint** (`onHex`): a tight, upright circular token — avatar
 *   with a team-tinted ring, a slim HP bar, a name chip, condition icons, and
 *   the same KO / dead overlays — sized to drop onto an isometric tile.
 *
 * HP changes spawn a floating damage (red) or heal (green) number in both forms.
 */
export function CombatantToken(props: CombatantTokenProps) {
  return props.onHex ? <HexToken {...props} /> : <CardToken {...props} />;
}

/** The compact, board-ready token that stands upright on a hex tile. */
function HexToken({
  combatant,
  active = false,
  selectable = false,
  selected = false,
  onSelect,
  hexSize = 52,
  noFloaters = false,
  className,
}: CombatantTokenProps) {
  const floaters = useFloaters(combatant.currentHP, noFloaters);
  const seed = combatant.characterId ?? combatant.portraitSeed ?? combatant.id;
  const down = combatant.isUnconscious || combatant.isDead;
  const isEnemy = combatant.team === 'npc';
  const avatarSize = Math.round(hexSize * 0.82);

  const inner = (
    <>
      {/* Active-actor beam halo on the floor behind the token */}
      <AnimatePresence>
        {active && (
          <motion.span
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-beam/25 blur-md"
            style={{ width: hexSize * 1.4, height: hexSize * 1.4 }}
          />
        )}
      </AnimatePresence>

      {/* Floaters live above the portrait */}
      <div className="relative">
        <Floaters floaters={floaters} />

        <div className="relative">
          <Avatar
            seed={seed}
            name={combatant.name}
            size={avatarSize}
            ring={active ? 'beam' : isEnemy ? 'none' : 'arcane'}
            status={combatant.isDead ? 'offline' : combatant.isUnconscious ? 'away' : null}
            className={cn(
              isEnemy && !active && 'ring-2 ring-danger/50',
              active && 'ring-2',
            )}
          />

          {/* Team marker pip */}
          <span
            className={cn(
              'absolute -left-1 -top-1 grid h-4 w-4 place-items-center rounded-full border text-[0.5rem]',
              isEnemy
                ? 'border-danger/40 bg-surface text-hp'
                : 'border-arcane/40 bg-surface text-arcane-soft',
            )}
            aria-hidden
          >
            {isEnemy ? <Swords className="h-2.5 w-2.5" /> : <Shield className="h-2.5 w-2.5" />}
          </span>

          {combatant.isGuarding && !down && (
            <span
              className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full border border-beam/50 bg-surface text-beam"
              title="Guarding"
            >
              <Shield className="h-2.5 w-2.5" />
            </span>
          )}

          {/* Defeated overlays */}
          {combatant.isDead && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-abyss/70">
              <Skull className="h-5 w-5 text-hp" />
            </span>
          )}
          {combatant.isUnconscious && !combatant.isDead && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-abyss/60">
              <span className="font-display text-[0.5rem] font-bold uppercase tracking-widest text-warn">
                Down
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Name chip */}
      <span
        className={cn(
          'max-w-[8rem] truncate rounded-md bg-void/80 px-1.5 py-0.5 font-display text-[0.625rem] font-semibold leading-tight tracking-wide backdrop-blur-sm',
          down ? 'text-ink-muted' : 'text-ink',
        )}
      >
        {combatant.name}
      </span>

      {/* Slim HP bar */}
      <ResourceBar
        kind="hp"
        size="sm"
        current={combatant.currentHP}
        max={combatant.maxHP}
        hideValue
        className="w-[4.5rem]"
      />

      <ConditionRow combatant={combatant} max={3} />
    </>
  );

  const frameClass = cn(
    'flex flex-col items-center gap-1 drop-shadow-[0_6px_8px_rgba(0,0,0,0.6)]',
    down && 'opacity-70',
    className,
  );

  if (selectable) {
    return (
      <motion.button
        type="button"
        onClick={() => onSelect?.(combatant)}
        whileHover={{ y: -3, scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        aria-pressed={selected}
        aria-label={`${combatant.name}${isEnemy ? ' (enemy)' : ''}`}
        className={cn(frameClass, 'cursor-pointer tap-highlight-none focus-visible:outline-none')}
      >
        {inner}
      </motion.button>
    );
  }

  return <div className={frameClass}>{inner}</div>;
}

/** The full roster card (used outside the board). */
function CardToken({
  combatant,
  active = false,
  selectable = false,
  selected = false,
  onSelect,
  compact = false,
  noFloaters = false,
  className,
}: CombatantTokenProps) {
  const floaters = useFloaters(combatant.currentHP, noFloaters);

  const seed = combatant.characterId ?? combatant.portraitSeed ?? combatant.id;
  const down = combatant.isUnconscious || combatant.isDead;
  const isEnemy = combatant.team === 'npc';
  const size = compact ? 44 : 56;

  const frameClass = cn(
    'relative flex flex-col items-center gap-1.5 rounded-2xl border px-2.5 pb-2.5 pt-3 text-center transition-colors duration-300',
    compact ? 'w-28' : 'w-32 sm:w-36',
    'bg-surface/70 backdrop-blur-sm',
    isEnemy ? 'border-danger/25' : 'border-line',
    selectable && 'cursor-pointer tap-highlight-none focus-visible:outline-none',
    selected && 'border-beam/60 shadow-glow-beam',
    active && 'border-beam/70 shadow-glow-beam-lg',
    down && 'opacity-60',
    className,
  );

  const inner = (
    <>
      {/* Active-actor beam pulse */}
      <AnimatePresence>
        {active && (
          <motion.span
            layoutId="active-actor-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute -inset-px rounded-2xl ring-2 ring-beam/70"
          />
        )}
      </AnimatePresence>

      {/* Team marker */}
      <span
        className={cn(
          'absolute left-2 top-2 grid h-5 w-5 place-items-center rounded-md text-[0.625rem]',
          isEnemy ? 'bg-danger/15 text-hp' : 'bg-arcane/15 text-arcane-soft',
        )}
        aria-hidden
      >
        {isEnemy ? <Swords className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
      </span>

      {/* Portrait + overlays + floaters */}
      <div className="relative">
        <Avatar
          seed={seed}
          name={combatant.name}
          size={size}
          ring={active ? 'beam' : isEnemy ? 'none' : 'arcane'}
          status={combatant.isDead ? 'offline' : combatant.isUnconscious ? 'away' : null}
        />

        {combatant.isGuarding && !down && (
          <span
            className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border border-beam/50 bg-surface text-beam"
            title="Guarding"
          >
            <Shield className="h-3 w-3" />
          </span>
        )}

        {/* Defeated overlays */}
        {combatant.isDead && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-abyss/70">
            <Skull className="h-6 w-6 text-hp" />
          </span>
        )}
        {combatant.isUnconscious && !combatant.isDead && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-abyss/60">
            <span className="font-display text-[0.625rem] font-bold uppercase tracking-widest text-warn">
              Down
            </span>
          </span>
        )}

        <Floaters floaters={floaters} />
      </div>

      {/* Name */}
      <span
        className={cn(
          'max-w-full truncate font-display text-xs font-semibold tracking-wide',
          down ? 'text-ink-muted' : 'text-ink',
        )}
      >
        {combatant.name}
      </span>

      {/* HP bar (animated) */}
      <ResourceBar
        kind="hp"
        size="sm"
        current={combatant.currentHP}
        max={combatant.maxHP}
        hideValue
        className="w-full"
      />
      <div className="flex w-full items-center justify-between font-mono text-[0.625rem] text-ink-faint">
        <span className="text-hp/90">
          {combatant.currentHP}
          <span className="text-ink-faint">/{combatant.maxHP}</span>
        </span>
        <span className="inline-flex items-center gap-0.5 rounded bg-void/60 px-1 text-ink-muted">
          <Shield className="h-2.5 w-2.5" /> {combatant.ac}
        </span>
      </div>

      {/* MP / SP pips */}
      {!compact && (
        <div className="flex w-full items-center justify-center gap-2 text-[0.625rem]">
          <ResourcePips kind="mp" current={combatant.currentMP} max={combatant.maxMP} />
          <ResourcePips kind="sp" current={combatant.currentSP} max={combatant.maxSP} />
        </div>
      )}

      {/* Conditions */}
      <ConditionRow combatant={combatant} />
    </>
  );

  if (selectable) {
    return (
      <motion.button
        type="button"
        onClick={() => onSelect?.(combatant)}
        layout
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        aria-pressed={selected}
        className={frameClass}
      >
        {inner}
      </motion.button>
    );
  }

  return (
    <motion.div
      layout
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={frameClass}
    >
      {inner}
    </motion.div>
  );
}

/** A capped row of pips representing MP or SP. */
function ResourcePips({
  kind,
  current,
  max,
}: {
  kind: 'mp' | 'sp';
  current: number;
  max: number;
}) {
  const color = kind === 'mp' ? 'bg-mp' : 'bg-sp';
  const text = kind === 'mp' ? 'text-mp' : 'text-sp';
  const shown = Math.min(max, 6);
  if (max <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1" title={`${kind.toUpperCase()} ${current}/${max}`}>
      <span className={cn('font-display text-[0.5625rem] font-bold uppercase', text)}>
        {kind}
      </span>
      <span className="inline-flex items-center gap-0.5">
        {Array.from({ length: shown }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              i < current ? color : 'bg-line-strong',
            )}
          />
        ))}
        {max > 6 && <span className={cn('font-mono text-[0.5625rem]', text)}>{current}</span>}
      </span>
    </span>
  );
}
