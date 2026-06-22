import { describe, it, expect } from 'vitest';
import type { WorldpackContent, SkillNode } from '@/types';
import { CENTER, canvasSize, depthFromCenter, placeChild } from './treeLayout';

// Layout cares only about id/x/y and the edge graph, so a bare node is enough.
const node = (id: string, x = 0, y = 0): SkillNode => ({ id, x, y, label: id, description: '', isCenter: false } as SkillNode);
const edge = (sourceId: string, targetId: string) => ({ id: `e_${sourceId}_${targetId}`, sourceId, targetId });

function content(nodes: SkillNode[], edges: { id: string; sourceId: string; targetId: string }[]): WorldpackContent {
  return { nodes, edges, worldItems: {} };
}

describe('depthFromCenter', () => {
  it('is 0 at Core and increments one hop per prerequisite edge', () => {
    const c = content([node('a'), node('b')], [edge('center-0', 'a'), edge('a', 'b')]);
    const d = depthFromCenter(c);
    expect(d.get('center-0')).toBe(0);
    expect(d.get('a')).toBe(1);
    expect(d.get('b')).toBe(2);
  });

  it('omits nodes with no path from Core (unreachable / dead skills)', () => {
    const c = content([node('a'), node('orphan')], [edge('center-0', 'a')]);
    const d = depthFromCenter(c);
    expect(d.has('a')).toBe(true);
    expect(d.has('orphan')).toBe(false);
  });
});

describe('placeChild', () => {
  it('drops a child of Core one column out, centered on Core', () => {
    const pos = placeChild(content([], []), 'center-0');
    expect(pos.x).toBeGreaterThan(CENTER.x); // further from Core
    expect(pos.y).toBe(CENTER.y); // first child sits straight out
  });

  it('places a grandchild a full column further than its tier-1 parent', () => {
    const c = content([node('a', 180, 180)], [edge('center-0', 'a')]);
    const child = placeChild(c, 'a');
    const tier1 = placeChild(content([], []), 'center-0');
    expect(child.x).toBeGreaterThan(tier1.x); // deeper tier == further right
  });

  it('fans repeated children of the same parent so they do not stack', () => {
    let c = content([], []);
    // first child
    const p1 = placeChild(c, 'center-0');
    c = content([node('a', p1.x, p1.y)], [edge('center-0', 'a')]);
    // second child of Core
    const p2 = placeChild(c, 'center-0');
    expect(p2.y).not.toBe(p1.y); // staggered vertically
    expect(p2.x).toBe(p1.x); // same tier == same column
  });
});

describe('canvasSize', () => {
  it('grows to fit a node placed past the base canvas (so deep trees scroll)', () => {
    const c = content([node('far', 900, 700)], [edge('center-0', 'far')]);
    const { width, height } = canvasSize(c);
    expect(width).toBeGreaterThanOrEqual(1000);
    expect(height).toBeGreaterThanOrEqual(760);
  });
});
