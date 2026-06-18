import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Maximize2, Minus, Plus, Crosshair } from 'lucide-react';
import type { SkillNode, SkillEdge } from '@/types';
import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { SkillNodeShape, type NodeVisualState } from './SkillNodeShape';
import {
  clampScale,
  computeBounds,
  curvePath,
  fitTransform,
  resolveEdges,
  type ViewTransform,
} from './geometry';

/**
 * Skill-tree-specific keyframes injected inside the SVG so the component is
 * self-contained (no edits to the shared global stylesheet). Animations are
 * disabled under prefers-reduced-motion.
 */
const GRAPH_CSS = `
  .lh-node-glow { filter: drop-shadow(0 0 6px rgba(245,185,66,0.55)); }
  .lh-node-learnable {
    filter: drop-shadow(0 0 4px rgba(45,212,191,0.45));
    animation: lh-pulse 2.4s ease-in-out infinite;
  }
  .lh-node-spin { animation: lh-spin 14s linear infinite; transform-origin: center; transform-box: fill-box; }
  .lh-edge-pulse { animation: lh-edge 2.4s ease-in-out infinite; }
  @keyframes lh-pulse {
    0%, 100% { filter: drop-shadow(0 0 3px rgba(45,212,191,0.35)); }
    50% { filter: drop-shadow(0 0 10px rgba(45,212,191,0.8)); }
  }
  @keyframes lh-edge {
    0%, 100% { stroke-opacity: 0.4; }
    50% { stroke-opacity: 0.85; }
  }
  @keyframes lh-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .lh-node-learnable, .lh-node-spin, .lh-edge-pulse { animation: none; }
  }
`;

export interface SkillTreeGraphProps {
  nodes: SkillNode[];
  edges: SkillEdge[];
  learnedIds: string[];
  /** Whether a node can be learned right now (frontier highlight). */
  isLearnable: (id: string) => boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  /** Id of the always-unlocked root (defaults to `center-0`). */
  centerId?: string;
  className?: string;
}

/**
 * Presentational pan/zoom skill-tree canvas. Nodes are placed by their data
 * coordinates; edges are drawn beneath. The consumer owns learn/unlearn — this
 * component only reports selection and reflects learned/learnable state.
 */
export function SkillTreeGraph({
  nodes,
  edges,
  learnedIds,
  isLearnable,
  selectedId,
  onSelect,
  centerId = 'center-0',
  className,
}: SkillTreeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const didInitFit = useRef(false);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const learnedSet = useMemo(() => new Set(learnedIds), [learnedIds]);
  const bounds = useMemo(() => computeBounds(nodes), [nodes]);
  const resolvedEdges = useMemo(() => resolveEdges(edges, byId), [edges, byId]);
  const centerNode = byId.get(centerId);

  // Track viewport size.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitToView = useCallback(() => {
    if (size.w === 0 || size.h === 0) return;
    setView(
      fitTransform(bounds, size.w, size.h, {
        x: centerNode?.x ?? bounds.centerX,
        y: centerNode?.y ?? bounds.centerY,
      }),
    );
  }, [bounds, size.w, size.h, centerNode?.x, centerNode?.y]);

  // Fit-to-view once the size is known.
  useEffect(() => {
    if (didInitFit.current || size.w === 0 || size.h === 0) return;
    didInitFit.current = true;
    fitToView();
  }, [size.w, size.h, fitToView]);

  const centerOnSelection = useCallback(() => {
    if (!selectedId) return;
    const n = byId.get(selectedId);
    if (!n) return;
    setView((v) => ({ ...v, x: n.x, y: n.y }));
  }, [selectedId, byId]);

  // --- Pan (pointer drag on empty canvas) ---
  const drag = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  }>({ active: false, startX: 0, startY: 0, originX: 0, originY: 0, moved: false });

  const onPointerDown = (e: React.PointerEvent) => {
    // Only primary button / touch.
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: view.x,
      originY: view.y,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.current.moved = true;
    setView((v) => ({
      ...v,
      x: drag.current.originX - dx / v.scale,
      y: drag.current.originY - dy / v.scale,
    }));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be gone */
    }
    drag.current.active = false;
  };

  // --- Zoom (wheel / pinch), anchored at the cursor ---
  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      setView((v) => {
        const nextScale = clampScale(v.scale * factor);
        if (nextScale === v.scale) return v;
        // Keep the data point under the cursor stationary.
        const dataX = v.x + (px - size.w / 2) / v.scale;
        const dataY = v.y + (py - size.h / 2) / v.scale;
        const nx = dataX - (px - size.w / 2) / nextScale;
        const ny = dataY - (py - size.h / 2) / nextScale;
        return { x: nx, y: ny, scale: nextScale };
      });
    },
    [size.w, size.h],
  );

  // Non-passive wheel listener so we can preventDefault scroll-zoom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoomAt(e.clientX, e.clientY, factor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // --- Pinch-to-zoom (two pointers) ---
  const pinch = useRef<{ d: number } | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());

  const trackPointer = (e: React.PointerEvent, remove = false) => {
    if (remove) pointers.current.delete(e.pointerId);
    else pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const onPointerMovePinch = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current) {
        const factor = d / pinch.current.d;
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, factor);
      }
      pinch.current = { d };
      drag.current.active = false; // suppress pan while pinching
    }
  };

  // SVG viewBox follows the view transform: width/height in data units.
  const vbW = size.w / view.scale;
  const vbH = size.h / view.scale;
  const vbX = view.x - vbW / 2;
  const vbY = view.y - vbH / 2;
  const labelScale = 1; // labels live in data space; legibility handled by zoom band

  const visualState = useCallback(
    (n: SkillNode): NodeVisualState => {
      if (n.id === centerId || n.isCenter) return 'center';
      if (learnedSet.has(n.id)) return 'learned';
      if (isLearnable(n.id)) return 'learnable';
      return 'locked';
    },
    [centerId, learnedSet, isLearnable],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative h-full w-full touch-none overflow-hidden rounded-2xl border border-line bg-abyss/60',
        className,
      )}
    >
      {/* atmospheric backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_45%,rgba(245,185,66,0.08),transparent_70%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(110,130,170,0.18) 1px, transparent 0)',
          backgroundSize: '34px 34px',
        }}
      />

      {size.w > 0 && size.h > 0 && (
        <svg
          width="100%"
          height="100%"
          viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
          className="relative block h-full w-full cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={(e) => {
            trackPointer(e);
            onPointerDown(e);
          }}
          onPointerMove={(e) => {
            onPointerMovePinch(e);
            onPointerMove(e);
          }}
          onPointerUp={(e) => {
            trackPointer(e, true);
            if (pointers.current.size < 2) pinch.current = null;
            endDrag(e);
          }}
          onPointerCancel={(e) => {
            trackPointer(e, true);
            pinch.current = null;
            endDrag(e);
          }}
          onPointerLeave={endDrag}
        >
          <defs>
            <style>{GRAPH_CSS}</style>
            <radialGradient id="lh-grad-center" cx="50%" cy="38%" r="70%">
              <stop offset="0%" stopColor="#ffe6ad" />
              <stop offset="60%" stopColor="#ffd479" />
              <stop offset="100%" stopColor="#f5b942" />
            </radialGradient>
            <radialGradient id="lh-grad-learned" cx="50%" cy="38%" r="70%">
              <stop offset="0%" stopColor="#ffd479" />
              <stop offset="100%" stopColor="#e9a72f" />
            </radialGradient>
            <linearGradient id="lh-edge-learned" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffd479" />
              <stop offset="100%" stopColor="#2dd4bf" />
            </linearGradient>
          </defs>

          {/* Edges beneath nodes */}
          <g fill="none" strokeLinecap="round">
            {resolvedEdges.map((e) => {
              const aLearned = learnedSet.has(e.sourceId);
              const bLearned = learnedSet.has(e.targetId);
              const bLearnable = isLearnable(e.targetId);
              const active = aLearned && bLearned;
              const frontier = aLearned && bLearnable;
              return (
                <path
                  key={e.id}
                  d={curvePath(e)}
                  stroke={
                    active
                      ? 'url(#lh-edge-learned)'
                      : frontier
                        ? '#2dd4bf'
                        : '#22304f'
                  }
                  strokeWidth={active ? 3 : frontier ? 2 : 1.5}
                  strokeOpacity={active ? 0.9 : frontier ? 0.6 : 0.4}
                  className={frontier ? 'lh-edge-pulse' : undefined}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {nodes.map((n) => (
              <SkillNodeShape
                key={n.id}
                node={n}
                state={visualState(n)}
                selected={n.id === selectedId}
                labelScale={labelScale}
                onSelect={onSelect}
              />
            ))}
          </g>
        </svg>
      )}

      {/* Zoom / fit controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <IconButton
          aria-label="Zoom in"
          size="sm"
          variant="secondary"
          icon={<Plus />}
          onClick={() => zoomAt(
            (containerRef.current?.getBoundingClientRect().left ?? 0) + size.w / 2,
            (containerRef.current?.getBoundingClientRect().top ?? 0) + size.h / 2,
            1.2,
          )}
        />
        <IconButton
          aria-label="Zoom out"
          size="sm"
          variant="secondary"
          icon={<Minus />}
          onClick={() => zoomAt(
            (containerRef.current?.getBoundingClientRect().left ?? 0) + size.w / 2,
            (containerRef.current?.getBoundingClientRect().top ?? 0) + size.h / 2,
            1 / 1.2,
          )}
        />
        <IconButton
          aria-label="Center on selection"
          size="sm"
          variant="secondary"
          icon={<Crosshair />}
          disabled={!selectedId}
          onClick={centerOnSelection}
        />
        <IconButton
          aria-label="Fit tree to view"
          size="sm"
          variant="secondary"
          icon={<Maximize2 />}
          onClick={fitToView}
        />
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5 rounded-xl border border-line/70 bg-surface/70 px-3 py-2 text-[0.7rem] backdrop-blur-md">
        <LegendRow color="#ffd479" label="Learned" />
        <LegendRow color="#2dd4bf" label="Learnable" ring />
        <LegendRow color="#2e3f64" label="Locked" />
      </div>
    </div>
  );
}

function LegendRow({
  color,
  label,
  ring,
}: {
  color: string;
  label: string;
  ring?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-ink-muted">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={
          ring
            ? { border: `2px solid ${color}` }
            : { background: color }
        }
      />
      {label}
    </div>
  );
}
