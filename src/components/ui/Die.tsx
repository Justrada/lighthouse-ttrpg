import { cn } from '@/lib/cn';

export type DieSides = 4 | 6 | 8 | 10 | 12 | 20;
export type DieTone = 'beam' | 'arcane' | 'mystic' | 'crit' | 'fail' | 'neutral';

export interface DieProps {
  sides: DieSides;
  /** Face value to display. */
  value: number;
  size?: number;
  tone?: DieTone;
  className?: string;
}

const toneVars: Record<
  DieTone,
  { stroke: string; fill: string; text: string; glow: string }
> = {
  beam: {
    stroke: 'rgb(245,185,66)',
    fill: 'rgba(245,185,66,0.12)',
    text: '#ffe6ad',
    glow: 'rgba(245,185,66,0.5)',
  },
  arcane: {
    stroke: 'rgb(45,212,191)',
    fill: 'rgba(45,212,191,0.12)',
    text: '#5eead4',
    glow: 'rgba(45,212,191,0.5)',
  },
  mystic: {
    stroke: 'rgb(167,139,250)',
    fill: 'rgba(167,139,250,0.12)',
    text: '#c4b5fd',
    glow: 'rgba(167,139,250,0.45)',
  },
  crit: {
    stroke: 'rgb(245,185,66)',
    fill: 'rgba(245,185,66,0.25)',
    text: '#fff',
    glow: 'rgba(245,185,66,0.85)',
  },
  fail: {
    stroke: 'rgb(239,68,68)',
    fill: 'rgba(239,68,68,0.2)',
    text: '#fff',
    glow: 'rgba(239,68,68,0.7)',
  },
  neutral: {
    stroke: 'rgb(46,63,100)',
    fill: 'rgba(19,29,51,0.9)',
    text: '#e8eefb',
    glow: 'transparent',
  },
};

/** Outline path (on a 0..100 viewBox) approximating each polyhedron's silhouette. */
function shapeFor(sides: DieSides): { kind: 'poly' | 'rect'; points?: string } {
  switch (sides) {
    case 4:
      return { kind: 'poly', points: '50,6 94,90 6,90' };
    case 6:
      return { kind: 'rect' };
    case 8:
      return { kind: 'poly', points: '50,4 92,50 50,96 8,50' };
    case 10:
      return { kind: 'poly', points: '50,4 90,38 74,92 26,92 10,38' };
    case 12:
      return {
        kind: 'poly',
        points: '50,3 79,15 95,44 86,76 59,95 41,95 14,76 5,44 21,15',
      };
    case 20:
      return { kind: 'poly', points: '50,3 91,26 91,74 50,97 9,74 9,26' };
  }
}

/**
 * An SVG die face for d4/d6/d8/d10/d12/d20 showing a value. d6 renders pips;
 * all others render the number. Gold/arcane themed with a subtle glow.
 */
export function Die({
  sides,
  value,
  size = 48,
  tone = 'beam',
  className,
}: DieProps) {
  const v = toneVars[tone];
  const shape = shapeFor(sides);
  const showPips = sides === 6 && value >= 1 && value <= 6;

  // d6 pip grid positions (3x3 cells on a 0..100 box).
  const cell = [22, 50, 78];
  const pipMap: Record<number, [number, number][]> = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`d${sides} showing ${value}`}
      className={cn('drag-none', className)}
      style={{ filter: v.glow !== 'transparent' ? `drop-shadow(0 0 6px ${v.glow})` : undefined }}
    >
      <defs>
        <linearGradient id={`die-sheen-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      {shape.kind === 'rect' ? (
        <rect
          x="6"
          y="6"
          width="88"
          height="88"
          rx="16"
          fill={v.fill}
          stroke={v.stroke}
          strokeWidth="3"
        />
      ) : (
        <polygon
          points={shape.points}
          fill={v.fill}
          stroke={v.stroke}
          strokeWidth="3"
          strokeLinejoin="round"
        />
      )}

      {/* Sheen overlay */}
      {shape.kind === 'rect' ? (
        <rect x="6" y="6" width="88" height="88" rx="16" fill={`url(#die-sheen-${tone})`} />
      ) : (
        <polygon points={shape.points} fill={`url(#die-sheen-${tone})`} />
      )}

      {showPips ? (
        pipMap[value].map(([r, c], i) => (
          <circle key={i} cx={cell[c]} cy={cell[r]} r="7" fill={v.text} />
        ))
      ) : (
        <text
          x="50"
          y={sides === 4 ? '70' : '50'}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily='"JetBrains Mono", ui-monospace, monospace'
          fontWeight="700"
          fontSize={value >= 100 ? '30' : value >= 10 ? '38' : '44'}
          fill={v.text}
        >
          {value}
        </text>
      )}
    </svg>
  );
}
