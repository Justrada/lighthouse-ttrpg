import { memo } from 'react';
import { motion } from 'framer-motion';
import type { HexCoord } from '@/types';
import { cn } from '@/lib/cn';

export type HexTileTint = 'reachable' | 'target' | 'ally' | 'self' | null;

export interface HexTileProps {
  hex: HexCoord;
  /** Pixel center of the hex in the flat (pre-tilt) layout. */
  center: { x: number; y: number };
  /** Hex "radius" in px (center → vertex). Drives the polygon footprint. */
  size: number;
  /** Highlight tint for interaction affordances. */
  tint?: HexTileTint;
  /** Render the tile as clickable (cursor + hover lift). */
  interactive?: boolean;
  /** Pointer hovering this tile (drives a brighter rim). */
  hovered?: boolean;
  onHexClick?: (hex: HexCoord) => void;
  onHexHover?: (hex: HexCoord | null) => void;
  /** Freeze ambient motion (prefers-reduced-motion). */
  reducedMotion?: boolean;
  /** Stagger seed (row+col) so the floor shimmers in like a wave. */
  delayStep?: number;
}

/** Pointy-top hexagon vertices for a given radius, as an SVG points string. */
function hexPoints(size: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    // Pointy-top: first vertex at the top (−90°), then every 60°.
    const angle = (Math.PI / 180) * (60 * i - 90);
    const x = size * Math.cos(angle);
    const y = size * Math.sin(angle);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(' ');
}

const tintFill: Record<NonNullable<HexTileTint>, string> = {
  reachable: 'rgba(45,212,191,0.10)', // arcane wash for movement
  target: 'rgba(240,80,110,0.14)', // hp/red for offensive targets
  ally: 'rgba(90,209,127,0.14)', // sp/green for supportive
  self: 'rgba(245,185,66,0.14)', // beam/gold for self
};

const tintStroke: Record<NonNullable<HexTileTint>, string> = {
  reachable: 'rgba(94,234,212,0.55)',
  target: 'rgba(240,80,110,0.7)',
  ally: 'rgba(90,209,127,0.7)',
  self: 'rgba(255,212,121,0.75)',
};

/**
 * A single battlefield hex rendered as an SVG polygon. The whole grid is tilted
 * by the parent's CSS perspective transform; each tile is just a flat shape at
 * its pixel center. Highlight tints (reachable / target / ally / self) and a
 * hover rim provide the interaction affordances; the base tile is a faint
 * arcane-night cell with a soft inner edge.
 */
export const HexTile = memo(function HexTile({
  hex,
  center,
  size,
  tint = null,
  interactive = false,
  hovered = false,
  onHexClick,
  onHexHover,
  reducedMotion = false,
  delayStep = 0,
}: HexTileProps) {
  const w = Math.sqrt(3) * size; // pointy-top width
  const h = 2 * size; // pointy-top height
  const points = hexPoints(size);

  const fill = tint ? tintFill[tint] : 'rgba(14,22,38,0.55)';
  const stroke = hovered
    ? 'rgba(255,212,121,0.85)'
    : tint
      ? tintStroke[tint]
      : 'rgba(46,63,100,0.6)';

  return (
    <motion.svg
      width={w}
      height={h}
      viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`}
      className={cn(
        'absolute',
        interactive ? 'cursor-pointer' : 'pointer-events-none',
      )}
      style={{
        left: center.x,
        top: center.y,
        // Center the svg on the hex's pixel center.
        marginLeft: -w / 2,
        marginTop: -h / 2,
      }}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { delay: Math.min(delayStep * 0.012, 0.4), duration: 0.35, ease: [0.22, 1, 0.36, 1] }
      }
      onClick={interactive ? () => onHexClick?.(hex) : undefined}
      onPointerEnter={interactive ? () => onHexHover?.(hex) : undefined}
      onPointerLeave={interactive ? () => onHexHover?.(null) : undefined}
      aria-hidden
    >
      {/* Tile face */}
      <polygon
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={hovered ? 2 : 1}
        vectorEffect="non-scaling-stroke"
        style={{ transition: 'fill 200ms ease, stroke 200ms ease' }}
      />
      {/* Soft inner highlight along the top edge for a faux-bevel */}
      <polygon
        points={points}
        fill="none"
        stroke="rgba(255,255,255,0.04)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        transform="scale(0.9)"
      />
      {/* Pulse ring on actively highlighted (non-reachable) tiles */}
      {tint && tint !== 'reachable' && !reducedMotion && (
        <motion.polygon
          points={points}
          fill="none"
          stroke={tintStroke[tint]}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          initial={{ opacity: 0.2 }}
          animate={{ opacity: [0.2, 0.7, 0.2] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </motion.svg>
  );
});
