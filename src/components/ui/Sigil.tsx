import { useMemo } from 'react';
import { cn } from '@/lib/cn';

export interface SigilProps {
  /** Deterministic seed — same seed always renders the same sigil. */
  seed: string;
  size?: number;
  className?: string;
  /** Decorative by default; pass a label to expose it to AT. */
  title?: string;
}

/** Tiny deterministic string hash (xfnv1a-ish), returns an unsigned 32-bit int. */
function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — deterministic stream of [0,1) from a seed int. */
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES: [string, string, string][] = [
  ['#f5b942', '#2dd4bf', '#a78bfa'], // beam / arcane / mystic
  ['#ffd479', '#5eead4', '#c4b5fd'],
  ['#2dd4bf', '#a78bfa', '#f5b942'],
  ['#a78bfa', '#f5b942', '#2dd4bf'],
];

/**
 * A deterministic arcane emblem generated from a `seed`. Renders a symmetric
 * runic/geometric glyph (radial spokes, an inner polygon, orbiting nodes, a
 * rune slash) themed in gold/teal/violet. Pure function of the seed → stable.
 */
export function Sigil({ seed, size = 64, className, title }: SigilProps) {
  const art = useMemo(() => {
    const rand = mulberry32(hashSeed(seed || 'lighthouse'));
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

    const [c1, c2, c3] = pick(PALETTES);
    const spokes = 3 + Math.floor(rand() * 4); // 3..6 → symmetry order
    const polySides = 3 + Math.floor(rand() * 4); // inner polygon 3..6
    const ringR = 30 + rand() * 6;
    const nodeR = 2.2 + rand() * 1.8;
    const rotation = Math.floor(rand() * 360);
    const innerR = 12 + rand() * 8;
    const hasOuterRing = rand() > 0.35;
    const hasSlash = rand() > 0.4;

    const cx = 50;
    const cy = 50;

    // Symmetric spoke endpoints + orbiting nodes.
    const spokeLines: { x: number; y: number }[] = [];
    for (let i = 0; i < spokes; i += 1) {
      const ang = (i / spokes) * Math.PI * 2 + (rotation * Math.PI) / 180;
      spokeLines.push({
        x: cx + Math.cos(ang) * ringR,
        y: cy + Math.sin(ang) * ringR,
      });
    }

    // Inner polygon points.
    const polyPts: string[] = [];
    for (let i = 0; i < polySides; i += 1) {
      const ang = (i / polySides) * Math.PI * 2 - Math.PI / 2;
      polyPts.push(
        `${(cx + Math.cos(ang) * innerR).toFixed(2)},${(
          cy +
          Math.sin(ang) * innerR
        ).toFixed(2)}`,
      );
    }

    return {
      c1,
      c2,
      c3,
      spokeLines,
      poly: polyPts.join(' '),
      ringR,
      nodeR,
      rotation,
      hasOuterRing,
      hasSlash,
      seedHash: hashSeed(seed),
    };
  }, [seed]);

  const gid = `sig-${art.seedHash}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn('drag-none', className)}
    >
      <defs>
        <radialGradient id={`${gid}-bg`} cx="50%" cy="42%" r="65%">
          <stop offset="0%" stopColor={art.c1} stopOpacity="0.18" />
          <stop offset="60%" stopColor={art.c2} stopOpacity="0.08" />
          <stop offset="100%" stopColor="#050810" stopOpacity="0.9" />
        </radialGradient>
        <linearGradient id={`${gid}-stroke`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={art.c1} />
          <stop offset="55%" stopColor={art.c2} />
          <stop offset="100%" stopColor={art.c3} />
        </linearGradient>
      </defs>

      {/* Backing disc */}
      <circle cx="50" cy="50" r="48" fill={`url(#${gid}-bg)`} />
      <circle
        cx="50"
        cy="50"
        r="47"
        fill="none"
        stroke={art.c2}
        strokeOpacity="0.25"
        strokeWidth="1"
      />

      <g
        stroke={`url(#${gid}-stroke)`}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {art.hasOuterRing && (
          <circle cx="50" cy="50" r={art.ringR} strokeOpacity="0.55" />
        )}

        {/* Spokes + terminal nodes (symmetric) */}
        {art.spokeLines.map((p, i) => (
          <g key={i}>
            <line x1="50" y1="50" x2={p.x} y2={p.y} strokeOpacity="0.7" />
            <circle
              cx={p.x}
              cy={p.y}
              r={art.nodeR}
              fill={i % 2 === 0 ? art.c1 : art.c3}
              stroke="none"
            />
          </g>
        ))}

        {/* Inner polygon glyph */}
        <polygon points={art.poly} strokeOpacity="0.9" />

        {/* Rune slash for asymmetric flavor */}
        {art.hasSlash && (
          <line
            x1="50"
            y1="38"
            x2="50"
            y2="62"
            stroke={art.c1}
            strokeWidth="2"
            transform={`rotate(${art.rotation} 50 50)`}
          />
        )}

        {/* Core */}
        <circle cx="50" cy="50" r="3" fill={art.c1} stroke="none" />
      </g>
    </svg>
  );
}
