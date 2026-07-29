import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The generator has to stay pure, and "we'll be careful" is not a mechanism.
 *
 * Worlds are addressed lazily and reproduced from a seed on every peer, so a
 * single `Date.now()` or `Math.random()` in here doesn't fail loudly — it makes
 * two players' maps quietly disagree, which is the hardest class of bug this
 * feature can produce. Cheaper to forbid it than to debug it.
 */
const DIR = join(process.cwd(), 'src/engine/atlas');

const sources = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bMath\.random\b/, why: 'randomness must be derived from the seed' },
  { pattern: /\bDate\.now\b/, why: 'output must not depend on when it ran' },
  { pattern: /\bnew Date\b/, why: 'output must not depend on when it ran' },
  { pattern: /\bconsole\./, why: 'the engine emits data, never console output' },
  { pattern: /\bsetTimeout\b|\bsetInterval\b|requestAnimationFrame/, why: 'no timers in the engine' },
  { pattern: /\bwindow\b|\bdocument\b|localStorage/, why: 'no DOM or browser storage in the engine' },
  { pattern: /from '@\/store|from "@\/store/, why: 'the engine must never import a store' },
  { pattern: /from 'react|from "react/, why: 'no React in the engine' },
];

describe('src/engine/atlas stays pure', () => {
  it('has sources to check', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each(sources)('%s contains nothing non-deterministic', (file) => {
    const text = readFileSync(join(DIR, file), 'utf8');
    // Strip comments so prose explaining *why* Math.random is banned doesn't
    // trip the check that bans it.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const { pattern, why } of FORBIDDEN) {
      const hit = code.match(pattern);
      expect(hit ? `${file}: ${hit[0]} — ${why}` : null).toBeNull();
    }
  });
});
