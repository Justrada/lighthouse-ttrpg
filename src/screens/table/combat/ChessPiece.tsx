import { memo, useId } from 'react';
import type { Combatant } from '@/types';
import { cn } from '@/lib/cn';

/**
 * The six chess silhouettes. Assigned to a combatant by "tier" (proxied from
 * maxHP) so beefier units read as stronger pieces; team decides the palette and
 * a per-unit hash nudges the hue so same-tier units stay differentiable.
 */
export type ChessRank = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export interface ChessPieceProps {
  combatant: Combatant;
  /** Height of the piece art in px (it stands taller than its hex tile). */
  height?: number;
  /** Dim + desaturate (downed / dead). */
  muted?: boolean;
  className?: string;
}

/* --------------------------------------------------------------------------
 * Palettes — players/allies in arcane teal, enemies in danger red. Each unit
 * gets a hue/lightness nudge from a stable hash so a row of pawns isn't a wall
 * of identical tokens.
 * ------------------------------------------------------------------------ */

interface Palette {
  /** Light face (top of the body gradient). */
  light: string;
  /** Mid body. */
  base: string;
  /** Shadowed lower body (bottom of the gradient). */
  deep: string;
  /** Rim / edge highlight. */
  rim: string;
}

/** Cheap deterministic 32-bit hash of a string → unsigned int. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** HSL → CSS string. */
const hsl = (h: number, s: number, l: number) => `hsl(${h} ${s}% ${l}%)`;

/**
 * Build a team palette, hue-shifted per unit. Allies center on teal (~168°),
 * enemies on red (~358°); the per-unit offset spreads ±18° so neighbours differ.
 */
function paletteFor(combatant: Combatant): Palette {
  const seed = hashStr(combatant.characterId ?? combatant.id);
  const enemy = combatant.team === 'npc';
  const baseHue = enemy ? 358 : 168;
  const hueSpread = enemy ? 26 : 30; // red wraps to orange; teal toward green/cyan
  const hue = (baseHue + ((seed % 1000) / 1000) * hueSpread - hueSpread / 2 + 360) % 360;
  // A little lightness jitter on top of the hue shift.
  const lift = ((seed >> 10) % 7) - 3; // -3..+3
  const sat = enemy ? 70 : 62;
  return {
    light: hsl(hue, sat, 70 + lift),
    base: hsl(hue, sat, 54 + lift),
    deep: hsl(hue, Math.min(sat + 8, 85), 32 + lift),
    rim: hsl(hue, Math.min(sat + 12, 90), 86),
  };
}

/* --------------------------------------------------------------------------
 * Rank assignment — derive from maxHP buckets (a stand-in for tier/role since
 * Combatant carries no explicit role). The hash perturbs the bucket slightly so
 * two units with the same HP don't always share a silhouette.
 * ------------------------------------------------------------------------ */
export function rankFor(combatant: Combatant): ChessRank {
  const hp = combatant.maxHP || 0;
  const jitter = (hashStr(combatant.id) % 9) - 4; // -4..+4 HP wobble
  const v = hp + jitter;
  if (v >= 90) return 'king';
  if (v >= 70) return 'queen';
  if (v >= 50) return 'rook';
  if (v >= 34) return 'bishop';
  if (v >= 20) return 'knight';
  return 'pawn';
}

/* --------------------------------------------------------------------------
 * Silhouette paths. Drawn in a shared 64×96 viewBox, baseline at y≈90 so every
 * piece "stands" on the same ground line. Paths are intentionally chunky so they
 * read at small sizes.
 * ------------------------------------------------------------------------ */

const VB_W = 64;
const VB_H = 96;

/** Per-rank body path (everything above the base collar). */
const BODY_PATHS: Record<ChessRank, string> = {
  // Pawn: round head, slim neck, flared foot.
  pawn:
    'M32 12 a10 10 0 1 1 -0.01 0 Z ' +
    'M24 30 h16 l-3 8 h-10 Z ' +
    'M22 40 q10 6 20 0 l4 30 h-28 Z',
  // Knight: horse-head profile.
  knight:
    'M22 84 q-2 -22 6 -36 q-4 -2 -3 -8 q1 -6 8 -10 q2 -5 8 -6 q-2 5 0 8 ' +
    'q8 2 11 12 q3 10 1 22 q-1 8 1 18 Z ' +
    'M30 34 a2.6 2.6 0 1 1 -0.01 0 Z',
  // Bishop: tall mitre with a slit and a beaded tip.
  bishop:
    'M32 8 a4 4 0 1 1 -0.01 0 Z ' +
    'M24 24 q8 -10 16 0 q5 8 0 18 q-8 8 -16 0 q-5 -10 0 -18 Z ' +
    'M30 28 l4 8 -4 6 Z ' +
    'M24 46 q8 6 16 0 l3 26 h-22 Z',
  // Rook: castle with crenellations.
  rook:
    'M20 22 h6 v6 h4 v-6 h4 v6 h4 v-6 h6 v14 l-4 4 l3 30 h-22 l3 -30 l-4 -4 Z',
  // Queen: crown of points + beads, full skirt.
  queen:
    'M16 26 l5 16 l5 -16 l6 16 l6 -16 l5 16 l5 -16 l-3 30 h-26 Z ' +
    'M19 60 q13 8 26 0 l3 12 h-32 Z ' +
    'M16 24 a3 3 0 1 1 -0.01 0 Z M48 24 a3 3 0 1 1 -0.01 0 Z M32 22 a3 3 0 1 1 -0.01 0 Z',
  // King: cross-topped crown, broad body.
  king:
    'M29 6 h6 v5 h5 v6 h-5 v6 h-6 v-6 h-5 v-6 h5 Z ' +
    'M20 30 q12 -8 24 0 q4 6 0 14 q-12 8 -24 0 q-4 -8 0 -14 Z ' +
    'M19 46 q13 8 26 0 l3 26 h-32 Z',
};

/**
 * An upright, dimensional chess silhouette for one combatant. Rendered as flat
 * SVG (no 3D transform) so clicks land exactly on what's drawn. A vertical body
 * gradient + rim highlight give depth; a ground ellipse and soft drop shadow
 * seat it "on" the hex.
 */
export const ChessPiece = memo(function ChessPiece({
  combatant,
  height = 72,
  muted = false,
  className,
}: ChessPieceProps) {
  const uid = useId().replace(/[:]/g, '');
  const pal = paletteFor(combatant);
  const rank = rankFor(combatant);
  const width = (height * VB_W) / VB_H;

  const bodyGrad = `body-${uid}`;
  const baseGrad = `base-${uid}`;
  const shadowId = `pieceshadow-${uid}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className={cn('overflow-visible', muted && 'opacity-70 saturate-50', className)}
      // Decorative; the interactive wrapper carries the label/role.
      aria-hidden
    >
      <defs>
        {/* Top-lit body: light crown → mid → shadowed foot. */}
        <linearGradient id={bodyGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pal.light} />
          <stop offset="45%" stopColor={pal.base} />
          <stop offset="100%" stopColor={pal.deep} />
        </linearGradient>
        {/* Base collar: brighter front lip → dark underside. */}
        <linearGradient id={baseGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pal.base} />
          <stop offset="100%" stopColor={pal.deep} />
        </linearGradient>
        <filter id={shadowId} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" floodColor="#000" floodOpacity="0.55" />
        </filter>
      </defs>

      {/* Contact shadow on the ground line. */}
      <ellipse cx={VB_W / 2} cy={91} rx={18} ry={5} fill="#000" opacity={0.4} />

      {/* Standing base (small plinth + collar) reads as "on the tile". */}
      <g filter={`url(#${shadowId})`}>
        <ellipse cx={VB_W / 2} cy={88} rx={17} ry={5.5} fill={`url(#${baseGrad})`} />
        <rect x={16} y={80} width={32} height={7} rx={3} fill={`url(#${baseGrad})`} />
        <ellipse cx={VB_W / 2} cy={80} rx={16} ry={4.5} fill={pal.base} />

        {/* The piece body. */}
        <path d={BODY_PATHS[rank]} fill={`url(#${bodyGrad})`} stroke={pal.deep} strokeWidth={1} strokeLinejoin="round" />
        {/* Left-edge rim light for a sculpted, dimensional look. */}
        <path
          d={BODY_PATHS[rank]}
          fill="none"
          stroke={pal.rim}
          strokeOpacity={0.55}
          strokeWidth={1.4}
          strokeLinejoin="round"
          style={{ mixBlendMode: 'screen' }}
          transform="translate(-0.8 -0.8)"
        />
      </g>
    </svg>
  );
});
