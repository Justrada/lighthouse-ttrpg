import { useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { Link2, Plus, Hand, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui';
import type { WorldpackContent, SkillNode } from '@/types';
import { cn } from '@/lib/cn';

/**
 * A lightweight visual editor for a custom skill tree: drag nodes to arrange
 * them, and (in Link mode) tap a prerequisite then the skill it unlocks to draw a
 * directional link. Edits ONLY custom content — the base `center-0` shows as a
 * fixed anchor so creators wire prerequisites back to the root. Deliberately
 * separate from the read-only play-time SkillTreeGraph so editing can't regress play.
 */

const W = 640;
const H = 360;
const CENTER = { x: 48, y: H / 2 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Set of node ids reachable from center-0 via prerequisite edges (a node not in
 *  it is unlearnable in play — a dead skill nobody can take). */
function reachableFromCenter(content: WorldpackContent): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of content.edges) {
    const list = adj.get(e.sourceId);
    if (list) list.push(e.targetId);
    else adj.set(e.sourceId, [e.targetId]);
  }
  const seen = new Set<string>(['center-0']);
  const q = ['center-0'];
  while (q.length) {
    const cur = q.shift()!;
    for (const t of adj.get(cur) ?? []) if (!seen.has(t)) { seen.add(t); q.push(t); }
  }
  return seen;
}

interface Props {
  content: WorldpackContent;
  mutate: (fn: (c: WorldpackContent) => WorldpackContent) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}

export function TreeEditor({ content, mutate, selectedId, onSelect, onAdd }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; offX: number; offY: number; moved: boolean } | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);

  const reachable = reachableFromCenter(content);
  const unreachable = content.nodes.filter((n) => !reachable.has(n.id));

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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={onAdd}>
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
            : 'Drag to arrange · tap to edit · arrows point to what a skill unlocks.'}
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

          {content.nodes.length === 0 && (
            <div className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-ink-faint">
              Add a skill, then drag it into place and link it back to Core so players can learn it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
