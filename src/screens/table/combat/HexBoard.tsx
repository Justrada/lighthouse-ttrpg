import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { BoardToken } from './CombatantToken';
import { ActionMenu, type ActionMenuItem } from './ActionMenu';

export interface HexBoardProps {
  /** Combatant currently being ordered (drives interaction). */
  activeActorId?: string | null;
  /** Whether the local user may stage actions / drag on this board. */
  controllable?: boolean;
  className?: string;
}

/** Base hex radius (px) in the flat layout; the whole board scales to fit. */
const BASE_SIZE = 40;
/** Token piece height relative to the hex radius (it stands taller than the tile). */
const PIECE_RATIO = 1.7;
/** Pointer travel (px) before a press becomes a drag instead of a click. */
const DRAG_THRESHOLD = 6;

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

/** Live drag state while the GM is repositioning a token. */
interface DragState {
  id: string;
  /** Pointer offset from the board's content origin (pre-scale px). */
  x: number;
  y: number;
  /** Whether travel has exceeded the threshold (so a click isn't a drag). */
  moved: boolean;
}

/**
 * The LIGHTHOUSE combat board — a clean **top-down** hex battlefield. The
 * rectangular grid is laid out flat with `hexToPixel` and rendered with plain
 * absolute positioning; the only transform is a single uniform `scale` to fit
 * the container width (no `perspective`/`rotateX` anywhere), so a real mouse
 * click lands exactly on the tile or token under the cursor. Combatants are
 * upright {@link BoardToken} chess pieces that glide between hexes (Framer
 * spring) as positions change during resolution.
 *
 * Interaction depends on phase:
 * - **setup** (+ `controllable`): every token is draggable; on drop it snaps to
 *   the nearest hex and calls `placeCombatant`. No action menus, no reachable
 *   tinting — all in-bounds tiles are subtle drop targets.
 * - **declare** (+ `controllable` + an unlocked `activeActorId` with a free
 *   slot): reachable tiles tint; clicking an empty reachable tile stages a Move;
 *   clicking any token opens an {@link ActionMenu} of what the *active actor* can
 *   do *to that target* (self / ally / enemy). The GM may also drag a token to
 *   reposition it (drag = instant `placeCombatant`; a plain click = the menu).
 * - **resolving**: read-only; tokens glide and play floaters.
 */
export function HexBoard({
  activeActorId = null,
  controllable = false,
  className,
}: HexBoardProps) {
  const combatants = useCombatStore((s) => s.combat.combatants);
  const phase = useCombatStore((s) => s.combat.phase);
  const declareAction = useCombatStore((s) => s.declareAction);
  const placeCombatant = useCombatStore((s) => s.placeCombatant);
  const activeResolutionId = useActiveResolutionId();
  const reduced = usePrefersReducedMotion();

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [hovered, setHovered] = useState<HexCoord | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);

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

  const isSetup = phase === 'setup';
  const isDeclare = phase === 'declare';
  const isResolving = phase === 'resolving';

  // Declare-phase targeting is live when there's a free slot on an unlocked actor.
  const declareInteractive =
    controllable && isDeclare && Boolean(actor) && !locked && nextFreeSlot >= 0;
  // The GM may drag-reposition during setup and (as a convenience) declare.
  const canDrag = controllable && (isSetup || isDeclare) && !isResolving;

  // Layout: flat pixel centers for every hex, normalized to a 0-based box.
  const layout = useMemo(() => {
    const hexes = gridHexes(BATTLE_GRID);
    const raw = hexes.map((h) => ({ hex: h, px: hexToPixel(h, BASE_SIZE) }));
    const xs = raw.map((r) => r.px.x);
    const ys = raw.map((r) => r.px.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const pad = BASE_SIZE * 1.4;
    const width = maxX - minX + pad * 2;
    const height = maxY - minY + pad * 2;
    const cells = raw.map(({ hex, px }, i) => ({
      hex,
      i,
      center: { x: px.x - minX + pad, y: px.y - minY + pad },
    }));
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
    if (!declareInteractive || !actor) return new Set<string>();
    const reach = reachableHexes(
      actor.position,
      MOVE_RANGE,
      (c) => occupiedByOther.has(hexKey(c)),
      BATTLE_GRID,
    );
    return new Set(reach.map(hexKey));
  }, [declareInteractive, actor, occupiedByOther]);

  // Close the menu when interaction context changes out from under it.
  useEffect(() => {
    if (!declareInteractive) setMenu(null);
  }, [declareInteractive]);
  useEffect(() => {
    setMenu(null);
  }, [activeActorId]);

  const combatantByHex = useMemo(() => {
    const m = new Map<string, Combatant>();
    for (const c of combatants) m.set(hexKey(c.position), c);
    return m;
  }, [combatants]);

  // --- Responsive scale: fit the flat board to the container width ----------
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => {
      const avail = el.clientWidth;
      const next = Math.min(1, avail / layout.width);
      setScale(Number.isFinite(next) && next > 0 ? next : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.width]);

  // --- Interaction handlers -------------------------------------------------

  const stage = (action: Omit<DeclaredAction, 'actionIndex'>) => {
    if (!activeActorId || nextFreeSlot < 0) return;
    declareAction(activeActorId, { ...action, actionIndex: nextFreeSlot });
    setMenu(null);
  };

  const handleTileClick = (hex: HexCoord) => {
    if (!declareInteractive) return;
    if (combatantByHex.has(hexKey(hex))) return; // token handles its own clicks
    if (!reachableKeys.has(hexKey(hex))) return;
    stage({ actionType: 'Move', label: 'Move', targetHex: hex });
  };

  /** Build the menu items appropriate to the clicked combatant. */
  const itemsFor = (target: Combatant): ActionMenuItem[] => {
    if (!actor) return [];
    const isSelf = target.id === actor.id;

    return options
      .filter((opt) => {
        if (opt.actionType === 'Move' || opt.actionType === 'Flee') return false;
        if (isSelf) {
          if (opt.actionType === 'Guard' || opt.actionType === 'Pass') return true;
          if (opt.actionType === 'Change Equipment') return true;
          if (opt.actionType === 'Use Item') return true;
          if (opt.range === 'Self') return true;
          if (opt.supportive) return true; // a buff/heal the actor can cast on self
          return false;
        }
        // Any other combatant — ally or enemy — may be targeted by ANY targeted
        // option: heal a foe, strike an ally, or centre an AOE on anyone. Range
        // still gates what's actually reachable.
        return Boolean(opt.needsTarget);
      })
      .map((opt) => {
        // Consumables carry a per-combat charge tally; show the remaining count
        // and disable the option when the actor has none left.
        const remaining =
          opt.actionType === 'Use Item' && opt.actionId
            ? actor.consumables?.[opt.actionId]
            : undefined;
        const outOfStock = remaining !== undefined && remaining <= 0;
        const inRange =
          !outOfStock &&
          (isSelf || !opt.needsTarget ? true : isTargetInRange(actor, target, opt.range));
        return {
          option: opt,
          inRange,
          badge: remaining !== undefined ? `×${remaining}` : undefined,
          note: outOfStock ? 'none left' : undefined,
        };
      });
  };

  const openMenuFor = (c: Combatant, el: HTMLElement | null) => {
    if (!declareInteractive || !actor) return;
    if (c.isDead) return;
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
      targetId: isSelf && opt.range === 'Self' ? actor?.id : target.id,
    });
  };

  /** Nearest layout hex to a board-local (pre-scale) point. */
  const nearestHex = useCallback(
    (localX: number, localY: number): HexCoord | null => {
      let best: HexCoord | null = null;
      let bestD = Infinity;
      for (const cell of layout.cells) {
        const dx = cell.center.x - localX;
        const dy = cell.center.y - localY;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = cell.hex;
        }
      }
      return best;
    },
    [layout.cells],
  );

  /** Convert a viewport pointer event to board-local (pre-scale) coordinates. */
  const toLocal = useCallback(
    (clientX: number, clientY: number) => {
      const plane = planeRef.current;
      if (!plane) return { x: 0, y: 0 };
      const rect = plane.getBoundingClientRect();
      // rect is post-scale; divide back out so we land in layout space.
      return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale,
      };
    },
    [scale],
  );

  // --- Drag (GM reposition) -------------------------------------------------
  //
  // Listeners live on `window` (attached imperatively on pointerdown) rather than
  // on the token element, so a re-render mid-gesture can never detach them — the
  // failure mode that previously swallowed the pointerup and broke both drop and
  // the "plain click opens the menu" path. We only flip to visual drag state once
  // travel crosses the threshold, so a click causes no re-render before its menu.

  const beginDrag = (c: Combatant, e: React.PointerEvent) => {
    if (!canDrag) return;
    if (e.button != null && e.button !== 0) return;
    const startClient = { x: e.clientX, y: e.clientY };
    const startEl = e.currentTarget as HTMLElement;
    dragRef.current = {
      id: c.id,
      x: toLocal(e.clientX, e.clientY).x,
      y: toLocal(e.clientX, e.clientY).y,
      moved: false,
    };

    const onMove = (ev: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      const local = toLocal(ev.clientX, ev.clientY);
      const movedEnough =
        cur.moved ||
        Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y) > DRAG_THRESHOLD;
      const next: DragState = { ...cur, x: local.x, y: local.y, moved: movedEnough };
      dragRef.current = next;
      if (movedEnough) setDrag(next); // only re-render once it's a real drag
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      const cur = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!cur) return;
      if (cur.moved) {
        // A real drag → reposition to the nearest hex.
        const local = toLocal(ev.clientX, ev.clientY);
        const hex = nearestHex(local.x, local.y);
        if (hex && !hexEquals(hex, c.position)) placeCombatant(c.id, hex);
      } else if (isDeclare) {
        // A plain click (no travel): declare-phase opens the target menu.
        openMenuFor(c, startEl);
      }
    };

    const onCancel = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      dragRef.current = null;
      setDrag(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  // Tint for a given tile.
  const tintFor = (hex: HexCoord): HexTileTint => {
    if (!declareInteractive) return null;
    if (combatantByHex.has(hexKey(hex))) return null;
    return reachableKeys.has(hexKey(hex)) ? 'reachable' : null;
  };

  // Tiles accept hover/clicks during setup (drop targets) and declare (move/menu).
  const tilesInteractive = controllable && (isSetup || declareInteractive);
  const pieceHeight = BASE_SIZE * PIECE_RATIO;

  return (
    <div
      ref={boardRef}
      className={cn('relative w-full select-none', className)}
    >
      {/* Soft floor glow under the board */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-arcane-radial opacity-50"
      />

      {/* Scrollable viewport: the board fits width and scrolls vertically if tall. */}
      <div className="relative max-h-[70vh] overflow-y-auto overflow-x-hidden">
        <div
          className="relative mx-auto"
          style={{ width: layout.width * scale, height: layout.height * scale }}
        >
          {/* Flat plane — uniform scale only; no 3D transform. */}
          <div
            ref={planeRef}
            className="absolute left-0 top-0"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            {/* Floor plate */}
            <div
              aria-hidden
              className="absolute inset-3 rounded-[36px] border border-line/40 bg-void/40 shadow-[inset_0_0_60px_rgba(0,0,0,0.5)]"
            />

            {/* Tiles */}
            {layout.cells.map(({ hex, center, i }) => (
              <HexTile
                key={hexKey(hex)}
                hex={hex}
                center={center}
                size={BASE_SIZE}
                tint={tintFor(hex)}
                interactive={tilesInteractive && !combatantByHex.has(hexKey(hex))}
                hovered={hovered != null && hexEquals(hovered, hex)}
                onHexClick={handleTileClick}
                onHexHover={setHovered}
                reducedMotion={reduced}
                delayStep={i}
              />
            ))}

            {/* Tokens — upright pieces; glide on position change; draggable in setup. */}
            {combatants.map((c) => {
              const home = layout.centerByKey.get(hexKey(c.position));
              if (!home) return null;
              const dragging = drag?.id === c.id && drag.moved;
              const center = dragging && drag ? { x: drag.x, y: drag.y } : home;
              const isActor = c.id === activeActorId;
              const draggable = canDrag;

              const interactiveToken = draggable || declareInteractive;
              return (
                <motion.div
                  key={c.id}
                  // Positioner only: framer animates left/top to the hex center;
                  // the sized, interactive token hangs from its bottom-centre so
                  // the piece "stands" on the tile. The wrapper itself is 0×0 so
                  // it never steals clicks from neighbouring tiles.
                  className="absolute"
                  style={{ zIndex: dragging ? 1000 : Math.round(home.y), width: 0, height: 0 }}
                  initial={false}
                  animate={{ left: center.x, top: center.y }}
                  transition={
                    dragging || reduced
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 240, damping: 26 }
                  }
                >
                  {/* The interactive surface == the visible token, so the hit area
                      matches exactly what's drawn (no transform that diverges from
                      the paint). Its bottom-centre sits on the hex centre. */}
                  <div
                    className={cn(
                      'absolute bottom-0 left-0 -translate-x-1/2 touch-none',
                      draggable && (dragging ? 'cursor-grabbing' : 'cursor-grab'),
                      declareInteractive && !draggable && 'cursor-pointer',
                      interactiveToken && 'focus-visible:outline-none',
                    )}
                    role={controllable ? 'button' : undefined}
                    tabIndex={interactiveToken ? 0 : undefined}
                    aria-label={controllable ? c.name : undefined}
                    // Draggable (GM): pointerdown starts the gesture; window
                    // listeners decide drag-vs-click and fire the menu on a click.
                    onPointerDown={draggable ? (e) => beginDrag(c, e) : undefined}
                    // Non-draggable (player): a plain click targets.
                    onClick={
                      !draggable && declareInteractive
                        ? (e) => openMenuFor(c, e.currentTarget as HTMLElement)
                        : undefined
                    }
                    onKeyDown={
                      interactiveToken
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (isDeclare) openMenuFor(c, e.currentTarget as HTMLElement);
                            }
                          }
                        : undefined
                    }
                  >
                    <BoardToken
                      combatant={c}
                      active={c.id === activeResolutionId}
                      isActor={isActor}
                      pieceHeight={pieceHeight}
                      noFloaters={isSetup}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Phase hint */}
      {controllable && isSetup && (
        <p className="mt-2 text-center text-xs text-ink-faint">
          Drag each combatant onto the field to position them, then begin the round.
        </p>
      )}
      {declareInteractive && (
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
