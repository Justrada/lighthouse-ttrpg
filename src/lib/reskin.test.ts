import { describe, it, expect } from 'vitest';
import {
  reskinNodeName,
  reskinNodeDescription,
  reskinItemName,
  reskinTerm,
} from './reskin';
import { createEmptyWorldpack } from './worldpack';

describe('reskin resolvers', () => {
  it('applies overrides and falls back when absent or blank', () => {
    const pack = createEmptyWorldpack();
    pack.reskins.terms.Mind = 'Tech';
    pack.reskins.nodes['node-1'] = { name: 'Plasma Bolt', description: 'Zap.' };
    expect(reskinTerm(pack, 'Mind', 'Mind')).toBe('Tech');
    expect(reskinTerm(pack, 'Body', 'Body')).toBe('Body'); // absent → fallback
    expect(reskinNodeName(pack, 'node-1', 'Magic Light')).toBe('Plasma Bolt');
    pack.reskins.terms.Soul = '   '; // blank → fallback
    expect(reskinTerm(pack, 'Soul', 'Soul')).toBe('Soul');
  });

  it('falls back (no throw, no prototype leak) for Object.prototype-named ids', () => {
    const pack = createEmptyWorldpack();
    for (const k of ['toString', 'valueOf', 'constructor', 'hasOwnProperty', '__proto__']) {
      expect(reskinTerm(pack, k, 'FB')).toBe('FB');
      expect(reskinNodeName(pack, k, 'FB')).toBe('FB');
      expect(reskinItemName(pack, k, 'FB')).toBe('FB');
      expect(reskinNodeDescription(pack, k, 'FB')).toBe('FB');
    }
  });

  it('falls back for a null/undefined pack', () => {
    expect(reskinTerm(null, 'Mind', 'Mind')).toBe('Mind');
    expect(reskinNodeName(undefined, 'x', 'base')).toBe('base');
  });
});
