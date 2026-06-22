import { useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { Link2, Plus, Hand, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui';
import type { WorldpackContent, SkillNode } from '@/types';
import { cn } from '@/lib/cn';
import { CENTER, clamp, canvasSize, depthFromCenter } from './treeLayout';

/**
 * A lightweight visual editor for a custom skill tree: drag nodes to arrange
 * them, add a child straight off any node (the "+" affordance), and — in Link
 * mode — tap a prerequisite then the skill it unlocks to draw a directional
 * link. Children land one column further from Core, so a node's distance from
 * Core reads as its tier (what the engine charges points for). Edits ONLY custom
 * content — the base `center-0` shows as a fixed anchor so creators wire
 * prerequisites back to the root. Deliberately separate from the read-only
 * play-time SkillTreeGraph so editing can't regress play.
 */

interface Props {
  content: WorldpackContent;
  mutate: (fn: (c: WorldpackContent) => WorldpackContent) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Create a new ability as a child of `parentId` (its prerequisite). */
  onAddChild: (parentId: string) => void;
}

export function TreeEditor({ content, mutate, selectedId, onSelect, onAddChild }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; offX: number; offY: number; moved: boolean } | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);

  // Reachable-from-Core set (== keys of the BFS depth map). A node not in it is
  // unlearnable in play — a dead skill nobody can take.
  const reachable = new Set(depthFromCenter(content).keys());
  const unreachable = content.nodes.filter((n) => !reachable.has(n.id));
  const { width: W, height: H } = canvasSize(content);

  const posOf = (id: string): { x: number; y: number } | null => {
    if (id === 'center-0') return CENTER;
    const n = content.nodes.find((x) => x.id === id);
    return n ? { x: n.x, y: n.y } : null;
  };

  const toggleLink = (a: string, b: string) =>
    mutate((c) => {
      const exists = c.edges.find((e) => e.sourceId === a && e.targetId === b);
      const edges = exists
        ? c.edges.filter((e) => e !== exists)
        : [...c.edges, { id: `ed_${nanoid(6)}`, sourceId: a, targetId: b }];
      return { ...c, edges };
    });

  const onNodeClick = (id: string) => {
    if (!linking) {
      onSelect(id);
      return;
    }
    // Link mode: first tap = the PREREQUISITE, second tap = the skill it unlocks.
    if (linkSource === null) setLinkSource(id);
    else if (linkSource === id) setLinkSource(null);
    else {
      toggleLink(linkSource, id);
      setLinkSource(null);
    }
  };

  const onPointerDown = (e: React.PointerEvent, node: SkillNode) => {
    if (linking) {
      // In link mode a tap connects (no dragging). Register it on pointer-down —
      // otherwise drag.current is never set and pointer-up would no-op the tap.
      onNodeClick(node.id);
      return;
    }
    const rect = canvasRef.current!.getBoundingClientRect();
    // Set the drag ref BEFORE capturing — capture is best-effort (it can throw for
    // a synthetic/inactive pointer), and a tap must still select even if it fails.
    drag.current = { id: node.id, offX: e.clientX - rect.left - node.x, offY: e.clientY - rect.top - node.y, moved: false };
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* capture unavailable — selection and in-bounds drag still work */
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left - d.offX, 20, W - 20);
    const y = clamp(e.clientY - rect.top - d.offY, 20, H - 20);
    d.moved = true;
    mutate((c) => ({ ...c, nodes: c.nodes.map((n) => (n.id === d.id ? { ...n, x, y } : n)) }));
  };
  const onPointerUp = (e: React.PointerEvent, node: SkillNode) => {
    const d = drag.current;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be gone */
    }
    drag.current = null;
    if (d && !d.moved) onNodeClick(node.id); // a tap (not a drag) selects
  };

  // Edges drawn from the prerequisite to the skill it unlocks. Stop short of the
  // target so the arrowhead sits at its edge (showing direction).
  const segments = content.edges
    .map((e) => ({ e, a: posOf(e.sourceId), b: posOf(e.targetId) }))
    .filter((x): x is { e: typeof x.e; a: { x: number; y: number }; b: { x: number; y: number } } => !!x.a && !!x.b)
    .map(({ e, a, b }) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const gap = 20;
      return { id: e.id, x1: a.x, y1: a.y, x2: b.x - (dx / len) * gap, y2: b.y - (dy / len) * gap };
    });

  // A small "+" that spawns a child of the given node, shown on Core (always) and
  // on the selected node. Rendered as its own button (buttons can't nest) offset
  // toward where the child will appear — up and to the right.
  const AddChild = ({ x, y, parentId, title }: { x: number; y: number; parentId: string; title: string }) =>
    linking ? null : (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAddChild(parentId);
        }}
        className="absolute z-10 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-arcane/60 bg-arcane/30 text-arcane-soft shadow-sm transition hover:bg-arcane/50 tap-highlight-none"
        style={{ left: x + 22, top: y - 16 }}
        title={title}
        aria-label={title}
      >
        <Plus className="h-3 w-3" />
      </button>
    );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => onAddChild('center-0')}>
          New ability
        </Button>
        <Button
          variant={linking ? 'primary' : 'ghost'}
          size="sm"
          leftIcon={linking ? <Link2 className="h-3.5 w-3.5" /> : <Hand className="h-3.5 w-3.5" />}
          onClick={() => {
            setLinking((v) => !v);
            setLinkSource(null);
          }}
        >
          {linking ? 'Linking…' : 'Link prerequisites'}
        </Button>
        <span className="text-xs text-ink-faint">
          {linking
            ? linkSource
              ? 'Now tap the skill it unlocks (tap the same node to cancel).'
              : 'Tap the prerequisite first, then the skill it unlocks.'
            : 'Tap a node, then its “+” to branch a child · drag to arrange · columns = tiers.'}
        </span>
      </div>

      {unreachable.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {unreachable.length} {unreachable.length === 1 ? 'skill has' : 'skills have'} no path from Core, so no one
            can learn {unreachable.length === 1 ? 'it' : 'them'}. Use “Link prerequisites” to connect{' '}
            {unreachable.length === 1 ? 'it' : 'each'} back toward Core.
          </span>
        </div>
      )}

      <div className="overflow-auto rounded-xl border border-line bg-abyss/60">
        <div
          ref={canvasRef}
          className="relative"
          style={{
            width: W,
            height: H,
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(110,130,170,0.16) 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        >
          <svg width={W} height={H} className="pointer-events-none absolute inset-0">
            <defs>
              <marker id="te-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#5a6f9f" />
              </marker>
            </defs>
            {segments.map((s) => (
              <line key={s.id} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#3a4d77" strokeWidth={2} strokeOpacity={0.8} markerEnd="url(#te-arrow)" />
            ))}
          </svg>

          {/* center anchor */}
          <button
            type="button"
            onClick={() => onNodeClick('center-0')}
            className={cn(
              'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-1 text-[0.7rem] font-semibold tap-highlight-none',
              'border-amber-300/60 bg-amber-400/15 text-amber-200',
              linking && 'cursor-pointer ring-2 ring-amber-300/40',
              linkSource === 'center-0' && 'ring-2 ring-arcane',
            )}
            style={{ left: CENTER.x, top: CENTER.y }}
            title="Core — the root every learnable skill traces back to"
          >
            Core
          </button>

          {/* custom nodes */}
          {content.nodes.map((n) => {
            const dead = !reachable.has(n.id);
            return (
              <button
                key={n.id}
                type="button"
                onPointerDown={(e) => onPointerDown(e, n)}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => onPointerUp(e, n)}
                className={cn(
                  'absolute flex max-w-[130px] -translate-x-1/2 -translate-y-1/2 items-center gap-1 truncate rounded-lg border px-2 py-1 text-[0.7rem] font-medium tap-highlight-none',
                  linking ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
                  dead ? 'border-warn/60 bg-warn/10 text-warn' : 'border-arcane/40 bg-arcane/15 text-arcane-soft',
                  selectedId === n.id && 'ring-2 ring-arcane',
                  linkSource === n.id && 'ring-2 ring-beam',
                )}
                style={{ left: n.x, top: n.y, touchAction: 'none' }}
                title={dead ? 'Not reachable from Core — link it to a prerequisite' : undefined}
              >
                {dead && <TriangleAlert className="h-3 w-3 shrink-0" />}
                <span className="truncate">{(n.linkedItem?.name || n.label || 'Node').slice(0, 18)}</span>
              </button>
            );
          })}

          {/* "+" affordances: always on Core, and on the currently-selected node. */}
          <AddChild x={CENTER.x} y={CENTER.y} parentId="center-0" title="Add a skill branching from Core" />
          {content.nodes.map((n) =>
            selectedId === n.id ? (
              <AddChild
                key={`add-${n.id}`}
                x={n.x}
                y={n.y}
                parentId={n.id}
                title={`Add a child skill of “${n.linkedItem?.name || n.label || 'this'}”`}
              />
            ) : null,
          )}

          {content.nodes.length === 0 && (
            <div className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-ink-faint">
              Tap the “+” on Core to add your first skill, then keep branching children outward.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
