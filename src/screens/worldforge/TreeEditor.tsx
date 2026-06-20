import { useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { Link2, Plus, Hand } from 'lucide-react';
import { Button } from '@/components/ui';
import type { WorldpackContent, SkillNode } from '@/types';
import { cn } from '@/lib/cn';

/**
 * A lightweight visual editor for a custom skill tree: drag nodes to arrange
 * them, and (in Link mode) click two nodes to connect a prerequisite. It edits
 * ONLY custom content — the base `center-0` shows as a fixed anchor so creators
 * can wire prerequisites back to the root. Deliberately separate from the
 * read-only play-time SkillTreeGraph so editing can't regress play.
 */

const W = 640;
const H = 360;
const CENTER = { x: 48, y: H / 2 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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
    if (id === 'center-0' && linkSource === null) {
      setLinkSource('center-0');
      return;
    }
    if (linkSource === null) setLinkSource(id);
    else if (linkSource === id) setLinkSource(null);
    else {
      toggleLink(linkSource, id);
      setLinkSource(null);
    }
  };

  const onPointerDown = (e: React.PointerEvent, node: SkillNode) => {
    if (linking) return; // in link mode, taps connect — no dragging
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

  // Only draw edges whose endpoints are both on this canvas (custom or center).
  const drawableEdges = content.edges
    .map((e) => ({ e, a: posOf(e.sourceId), b: posOf(e.targetId) }))
    .filter((x): x is { e: typeof x.e; a: { x: number; y: number }; b: { x: number; y: number } } => !!x.a && !!x.b);

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
          {linking ? 'Linking — tap two nodes' : 'Link prerequisites'}
        </Button>
        <span className="text-xs text-ink-faint">
          {linking ? 'Tap a node, then another, to connect or disconnect.' : 'Drag to arrange · tap to edit.'}
        </span>
      </div>

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
            {drawableEdges.map(({ e, a, b }) => (
              <line
                key={e.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#3a4d77"
                strokeWidth={2}
                strokeOpacity={0.7}
              />
            ))}
          </svg>

          {/* center anchor */}
          <button
            type="button"
            onClick={() => onNodeClick('center-0')}
            className={cn(
              'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-1 text-[0.7rem] font-semibold tap-highlight-none',
              'border-amber-300/60 bg-amber-400/15 text-amber-200',
              linking && 'ring-2 ring-amber-300/50',
              linkSource === 'center-0' && 'ring-2 ring-arcane',
            )}
            style={{ left: CENTER.x, top: CENTER.y }}
            title="Core (root prerequisite)"
          >
            Core
          </button>

          {/* custom nodes */}
          {content.nodes.map((n) => (
            <button
              key={n.id}
              type="button"
              onPointerDown={(e) => onPointerDown(e, n)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerUp(e, n)}
              className={cn(
                'absolute max-w-[120px] -translate-x-1/2 -translate-y-1/2 truncate rounded-lg border px-2 py-1 text-[0.7rem] font-medium tap-highlight-none',
                linking ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
                'border-arcane/40 bg-arcane/15 text-arcane-soft',
                selectedId === n.id && 'ring-2 ring-arcane',
                linkSource === n.id && 'ring-2 ring-beam',
              )}
              style={{ left: n.x, top: n.y, touchAction: 'none' }}
            >
              {(n.linkedItem?.name || n.label || 'Node').slice(0, 18)}
            </button>
          ))}

          {content.nodes.length === 0 && (
            <div className="absolute inset-0 grid place-items-center text-xs text-ink-faint">
              Add an ability, then drag it into place and link it to Core.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
