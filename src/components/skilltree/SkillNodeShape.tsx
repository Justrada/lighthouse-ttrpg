import { memo } from 'react';
import type { SkillNode } from '@/types';
import { cn } from '@/lib/cn';
import { useReskin } from '@/lib/reskin';

export type NodeVisualState = 'center' | 'learned' | 'learnable' | 'locked';

export interface SkillNodeShapeProps {
  node: SkillNode;
  state: NodeVisualState;
  selected: boolean;
  /** Inverse of the current zoom — keeps labels legible regardless of scale. */
  labelScale: number;
  onSelect: (id: string) => void;
}

/** Radius (data units) of a regular node; the center is larger. */
const R = 26;
const R_CENTER = 34;

const FILL: Record<NodeVisualState, string> = {
  center: 'url(#lh-grad-center)',
  learned: 'url(#lh-grad-learned)',
  learnable: 'rgba(8,13,24,0.92)',
  locked: 'rgba(8,13,24,0.7)',
};

const STROKE: Record<NodeVisualState, string> = {
  center: '#ffe6ad',
  learned: '#ffd479',
  learnable: '#2dd4bf',
  locked: '#2e3f64',
};

const STROKE_W: Record<NodeVisualState, number> = {
  center: 3,
  learned: 2.5,
  learnable: 2.25,
  locked: 1.5,
};

const TEXT_FILL: Record<NodeVisualState, string> = {
  center: '#1a1205',
  learned: '#1a1205',
  learnable: '#cdebe6',
  locked: '#6b7a9c',
};

/** Wrap a label into up to three short lines for the circular face. */
function wrapLabel(label: string): string[] {
  const words = label.split(/\s+/);
  if (words.length === 1) return [label];
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 11 && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function SkillNodeShapeInner({
  node,
  state,
  selected,
  labelScale,
  onSelect,
}: SkillNodeShapeProps) {
  const reskin = useReskin();
  const label = reskin.nodeName(node.id, node.label);
  const r = state === 'center' ? R_CENTER : R;
  const lines = wrapLabel(label);
  const fontSize = 9.5 * labelScale;
  const lineH = fontSize * 1.05;
  const startY = -((lines.length - 1) * lineH) / 2;

  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      className={cn(
        'cursor-pointer outline-none transition-[filter] duration-200',
        state === 'learnable' && 'lh-node-learnable',
        (state === 'learned' || state === 'center') && 'lh-node-glow',
        state === 'locked' && 'opacity-70 hover:opacity-100',
      )}
      role="button"
      tabIndex={0}
      aria-label={`${label}${state === 'learned' ? ', learned' : state === 'learnable' ? ', learnable' : state === 'locked' ? ', locked' : ''}`}
      onPointerDown={(e) => {
        // Don't let a node tap start a canvas pan.
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(node.id);
        }
      }}
    >
      {/* Selection halo */}
      {selected && (
        <circle
          r={r + 8}
          fill="none"
          stroke="#ffd479"
          strokeWidth={2}
          strokeDasharray="4 5"
          className="lh-node-spin"
          opacity={0.9}
        />
      )}

      <circle
        r={r}
        fill={FILL[state]}
        stroke={STROKE[state]}
        strokeWidth={STROKE_W[state]}
      />

      {/* Inner ring accent for depth */}
      <circle
        r={r - 5}
        fill="none"
        stroke={state === 'locked' ? '#1f2c49' : 'rgba(255,255,255,0.12)'}
        strokeWidth={1}
      />

      <text
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight={state === 'learned' || state === 'center' ? 700 : 600}
        fill={TEXT_FILL[state]}
        className="pointer-events-none select-none"
        style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        {lines.map((ln, i) => (
          <tspan key={i} x={0} y={startY + i * lineH}>
            {ln}
          </tspan>
        ))}
      </text>
    </g>
  );
}

export const SkillNodeShape = memo(SkillNodeShapeInner);
