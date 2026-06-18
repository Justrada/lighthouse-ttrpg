import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Combatant, DeclaredAction, HexCoord } from '@/types';
import {
  gridHexes,
  hexToPixel,
  hexDistance,
  hexKey,
  hexEquals,
  reachableHexes,
  isTargetInRange,
} from '@/engine';
import { useCombatStore } from '@/store';
import { BATTLE_GRID, MOVE_RANGE } from '@/data/constants';
import { usePrefersReducedMotion } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useCombatantCharacter } from '../shared/useCombatantCharacter';
import {
  buildActionOptions,
  actionSlotCount,
  type ActionOption,
} from '../shared/actionOptions';
import { HexTile, type HexTileTint } from './HexTile';
import { CombatantToken } from './CombatantToken';
import { ActionMenu, type ActionMenuItem } from './ActionMenu';

export interface HexBoardProps {
  /** Combatant currently being ordered (drives interaction). */
  activeActorId?: string | null;
  /** Whether the local user may stage actions on this board. */
  controllable?: boolean;
  /** GM hook: switch which friendly NPC is being ordered. */
  onSelectActor?: (id: string) => void;
  className?: string;
}

/** The tabletop tilt — locked viewpoint. */
const TILT = 52;
/** Base hex radius (px); scaled down responsively. */
const BASE_SIZE = 46;

/** Who is resolving right now (for the active glow + glide emphasis). */
function useActiveResolutionId(): string | undefined {
  return useCombatStore((s) =>
    s.combat.phase === 'resolving' && s.combat.activeResolutionIndex >= 0
      ? s.combat.resolutionQueue[s.combat.activeResolutionIndex]?.sourceId
      : undefined,
  );
}

/** Menu state: which token was clicked and where it sits on screen. */
interface MenuState {
  target: Combatant;
  anchor: { x: number; y: number };
}

/**
 * The 2.5D isometric hex battlefield. Lays the rectangular grid out flat with
 * `hexToPixel`, then tilts the whole plane with a CSS perspective transform for
 * the tabletop look; tokens are counter-rotated so they stand upright on their
 * tiles, gliding between hexes (Framer spring) as positions change during
 * resolution.
 *
 * During the declare phase — when `controllable` and an `activeActorId` is set —
 * reachable tiles tint, clicking an empty reachable tile stages a Move, and
 * clicking a combatant opens an {@link ActionMenu} of the in-range options for
 * that target (offensive on enemies, supportive on allies, self/utility on the
 * actor's own token). In GM mode, clicking another friendly NPC switches who is
 * being ordered instead.
 */
export function HexBoard({
  activeActorId = null,
  controllable = false,
  onSelectActor,
  className,
}: HexBoardProps) {
  const combatants = useCombatStore((s) => s.combat.combatants);
  const phase = useCombatStore((s) => s.combat.phase);
  const declareAction = useCombatStore((s) => s.declareAction);
  const activeResolutionId = useActiveResolutionId();
  const reduced = usePrefersReducedMotion();

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [hovered, setHovered] = useState<HexCoord | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const actor = useMemo(
    () => combatants.find((c) => c.id === activeActorId) ?? null,
    [combatants, activeActorId],
  );
  const actorChar = useCombatantCharacter(actor);

  // Declared actions + lock state for the active actor (gates interaction).
  const declared = useCombatStore((s) =>
    activeActorId ? s.combat.declaredActions[activeActorId] : undefined,
  );
  const locked = useCombatStore((s) =>
    activeActorId ? Boolean(s.combat.lockedActions[activeActorId]) : false,
  );

  const slotCount = useMemo(() => actionSlotCount(actorChar), [actorChar]);
  const usedSlots = declared?.length ?? 0;
  const nextFreeSlot = useMemo(() => {
    const taken = new Set((declared ?? []).map((a) => a.actionIndex));
    for (let i = 0; i < slotCount; i += 1) if (!taken.has(i)) return i;
    return -1;
  }, [declared, slotCount]);

  const options = useMemo(() => buildActionOptions(actorChar), [actorChar]);

  const interactive =
    controllable && phase === 'declare' && Boolean(actor) && !locked && nextFreeSlot >= 0;

  // Layout: flat pixel centers for every hex, then normalize to a 0-based box.
  const layout = useMemo(() => {
    const hexes = gridHexes(BATTLE_GRID);
    const raw = hexes.map((h) => ({ hex: h, px: hexToPixel(h, BASE_SIZE) }));
    const xs = raw.map((r) => r.px.x);
    const ys = raw.map((r) => r.px.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const pad = BASE_SIZE * 1.2;
    const width = maxX - minX + pad * 2;
    const height = maxY - minY + pad * 2;
    const cells = raw.map(({ hex, px }, i) => ({
      hex,
      i,
      center: { x: px.x - minX + pad, y: px.y - minY + pad },
    }));
    // O(1) lookup from hexKey → pixel center for token placement.
    const centerByKey = new Map(cells.map((c) => [hexKey(c.hex), c.center]));
    return { cells, width, height, centerByKey };
  }, []);

  // Occupancy: a hex is blocked for movement if a live combatant stands on it.
  const occupiedByOther = useMemo(() => {
    const keys = new Set<string>();
    for (const c of combatants) {
      if (c.id === activeActorId) continue;
      if (c.isDead) continue; // corpses don't block; downed bodies still do
      keys.add(hexKey(c.position));
    }
    return keys;
  }, [combatants, activeActorId]);

  // Reachable tiles for the active actor (declare phase only).
  const reachableKeys = useMemo(() => {
    if (!interactive || !actor) return new Set<string>();
    const reach = reachableHexes(
      actor.position,
      MOVE_RANGE,
      (c) => occupiedByOther.has(hexKey(c)),
      BATTLE_GRID,
    );
    return new Set(reach.map(hexKey));
  }, [interactive, actor, occupiedByOther]);

  // Close the menu when interaction context changes out from under it.
  useEffect(() => {
    if (!interactive) setMenu(null);
  }, [interactive]);
  useEffect(() => {
    setMenu(null);
  }, [activeActorId]);

  const combatantByHex = useMemo(() => {
    const m = new Map<string, Combatant>();
    for (const c of combatants) m.set(hexKey(c.position), c);
    return m;
  }, [combatants]);

  // --- Interaction handlers -------------------------------------------------

  const stage = (action: Omit<DeclaredAction, 'actionIndex'>) => {
    if (!activeActorId || nextFreeSlot < 0) return;
    declareAction(activeActorId, { ...action, actionIndex: nextFreeSlot });
    setMenu(null);
  };

  const handleTileClick = (hex: HexCoord) => {
    if (!interactive) return;
    // Clicking an occupied tile defers to the token's own handler.
    if (combatantByHex.has(hexKey(hex))) return;
    if (!reachableKeys.has(hexKey(hex))) return;
    stage({ actionType: 'Move', label: 'Move', targetHex: hex });
  };

  /** Build the menu items appropriate to the clicked combatant. */
  const itemsFor = (target: Combatant): ActionMenuItem[] => {
    if (!actor) return [];
    const isSelf = target.id === actor.id;
    const isAlly = !isSelf && target.team === actor.team;

    return options
      .filter((opt) => {
        if (opt.actionType === 'Move' || opt.actionType === 'Flee') return false;
        if (isSelf) {
          // Self / utility: Guard, Pass, self-range or supportive abilities/items,
          // Use Item, and Change Equipment.
          if (opt.actionType === 'Guard' || opt.actionType === 'Pass') return true;
          if (opt.actionType === 'Change Equipment') return true;
          if (opt.actionType === 'Use Item') return true;
          if (opt.range === 'Self') return true;
          if (opt.supportive) return true; // a buff/heal the actor can cast on self
          return false;
        }
        if (isAlly) return Boolean(opt.needsTarget && opt.supportive);
        // Enemy: offensive, target-seeking options.
        return Boolean(opt.needsTarget && !opt.supportive);
      })
      .map((opt) => ({
        option: opt,
        inRange:
          isSelf || !opt.needsTarget ? true : isTargetInRange(actor, target, opt.range),
      }));
  };

  const handleTokenClick = (c: Combatant, el: HTMLElement | null) => {
    // GM ordering: clicking another friendly NPC switches the active actor.
    if (onSelectActor && c.team === 'npc' && c.id !== activeActorId && !c.isDead) {
      onSelectActor(c.id);
      setMenu(null);
      return;
    }
    if (!interactive || !actor) return;
    if (c.isDead) return;
    // Allies that are downed can still be revived/targeted; enemies that are
    // unconscious are typically not re-targeted, but we let range gating decide.
    const rect = el?.getBoundingClientRect();
    const anchor = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    setMenu({ target: c, anchor });
  };

  const pickFromMenu = (opt: ActionOption) => {
    if (!menu) return;
    const target = menu.target;
    const isSelf = target.id === actor?.id;
    if (opt.actionType === 'Change Equipment') {
      stage({ actionType: 'Change Equipment', actionId: opt.actionId, label: opt.label });
      return;
    }
    if (opt.actionType === 'Guard' || opt.actionType === 'Pass') {
      stage({ actionType: opt.actionType, label: opt.label });
      return;
    }
    stage({
      actionType: opt.actionType,
      actionId: opt.actionId,
      label: opt.label,
      // Self-range options still resolve against the actor; otherwise the target.
      targetId: isSelf && opt.range === 'Self' ? actor?.id : target.id,
    });
  };

  // Tint for a given tile.
  const tintFor = (hex: HexCoord): HexTileTint => {
    if (!interactive) return null;
    if (combatantByHex.has(hexKey(hex))) return null;
    return reachableKeys.has(hexKey(hex)) ? 'reachable' : null;
  };

  // Responsive scale: shrink the whole plane to fit narrow screens.
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => {
      const avail = el.clientWidth;
      // The tilt foreshortens height; width is the binding constraint.
      const next = Math.min(1, avail / (layout.width + 24));
      setScale(Number.isFinite(next) && next > 0 ? next : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.width]);

  const tiltStyle = reduced ? undefined : `perspective(1200px) rotateX(${TILT}deg)`;
  const counterRotate = reduced ? undefined : `rotateX(-${TILT}deg)`;

  return (
    <div
      ref={boardRef}
      className={cn('relative w-full select-none overflow-hidden', className)}
    >
      {/* Soft floor glow under the board */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-arcane-radial opacity-60"
      />

      {/* Scale wrapper keeps the tilted plane centered + responsive */}
      <div
        className="relative mx-auto"
        style={{
          width: layout.width * scale,
          height: layout.height * scale * 0.74 + 48, // foreshortened footprint
        }}
      >
        <div
          className="absolute left-1/2 top-6"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translateX(-50%) scale(${scale})`,
            transformOrigin: 'top center',
          }}
        >
          {/* Tilted tabletop plane */}
          <div
            className="absolute inset-0"
            style={{
              transform: tiltStyle,
              transformOrigin: 'center center',
              transformStyle: 'preserve-3d',
            }}
          >
            {/* Floor plate */}
            <div
              aria-hidden
              className="absolute inset-0 rounded-[40%] border border-line/40 bg-void/30 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]"
            />

            {/* Tiles */}
            {layout.cells.map(({ hex, center, i }) => (
              <HexTile
                key={hexKey(hex)}
                hex={hex}
                center={center}
                size={BASE_SIZE}
                tint={tintFor(hex)}
                interactive={interactive && !combatantByHex.has(hexKey(hex))}
                hovered={hovered != null && hexEquals(hovered, hex)}
                onHexClick={handleTileClick}
                onHexHover={setHovered}
                reducedMotion={reduced}
                delayStep={i}
              />
            ))}

            {/* Tokens — counter-rotated to stand upright, glide on position change */}
            {combatants.map((c) => {
              const center = layout.centerByKey.get(hexKey(c.position));
              if (!center) return null;
              const isActor = c.id === activeActorId;
              return (
                <motion.div
                  key={c.id}
                  className="absolute"
                  style={{ zIndex: Math.round(center.y) }}
                  initial={false}
                  // Animate left/top directly so tokens glide between hexes during
                  // resolution. Driving the CSS box position (rather than a layout
                  // transform) keeps the path correct inside the 3D-tilted plane.
                  animate={{ left: center.x, top: center.y }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 220, damping: 26 }
                  }
                >
                  <div
                    style={{
                      // Anchor the token's base at the hex center, then stand it
                      // upright against the tabletop tilt. A small extra lift gives
                      // the raised, "standing on the tile" depth.
                      transform: counterRotate
                        ? `translate(-50%, -100%) ${counterRotate}`
                        : 'translate(-50%, -100%)',
                      transformOrigin: 'bottom center',
                    }}
                  >
                    <TokenButton
                      combatant={c}
                      active={c.id === activeResolutionId}
                      controllable={controllable}
                      isActor={isActor}
                      hexSize={BASE_SIZE * 1.05}
                      onClick={handleTokenClick}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Declare-phase hint */}
      {interactive && (
        <p className="mt-2 text-center text-xs text-ink-faint">
          Tap a glowing tile to move, or tap a combatant to act.{' '}
          <span className="text-ink-muted">
            {usedSlots}/{slotCount} actions staged
          </span>
        </p>
      )}

      {/* Action menu popover */}
      {menu && actor && (
        <ActionMenu
          title={menu.target.id === actor.id ? `${menu.target.name} (you)` : menu.target.name}
          subtitle={menuSubtitle(actor, menu.target)}
          items={itemsFor(menu.target)}
          anchor={menu.anchor}
          onPick={pickFromMenu}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

/** "Enemy · 2 hexes" / "Ally" / "Self" descriptor for the menu header. */
function menuSubtitle(actor: Combatant, target: Combatant): string {
  if (target.id === actor.id) return 'Self';
  const rel = target.team === actor.team ? 'Ally' : 'Enemy';
  const d = hexDistance(actor.position, target.position);
  return `${rel} · ${d} hex${d === 1 ? '' : 'es'}`;
}

/**
 * Wraps the on-hex token so we can capture the clicked element for popover
 * anchoring. Stays a plain button when not controllable (status display only).
 */
function TokenButton({
  combatant,
  active,
  controllable,
  isActor,
  hexSize,
  onClick,
}: {
  combatant: Combatant;
  active: boolean;
  controllable: boolean;
  isActor: boolean;
  hexSize: number;
  onClick: (c: Combatant, el: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      role={controllable ? 'button' : undefined}
      tabIndex={controllable ? 0 : undefined}
      aria-label={controllable ? `${combatant.name}` : undefined}
      onClick={controllable ? () => onClick(combatant, ref.current) : undefined}
      onKeyDown={
        controllable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(combatant, ref.current);
              }
            }
          : undefined
      }
      className={cn(controllable && 'cursor-pointer focus-visible:outline-none')}
    >
      <CombatantToken
        combatant={combatant}
        onHex
        active={active}
        hexSize={hexSize}
        selected={isActor}
        className={cn(
          isActor && 'drop-shadow-[0_0_10px_rgba(245,185,66,0.6)]',
        )}
      />
    </div>
  );
}
