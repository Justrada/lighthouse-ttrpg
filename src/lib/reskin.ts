import type { Worldpack } from '@/types';
import { useWorldpackStore } from '@/store/worldpackStore';

/** Trim-or-undefined: blank or non-string overrides fall back to the base. */
function ov(s: unknown): string | undefined {
  return typeof s === 'string' && s.trim() ? s : undefined;
}

/** Read an OWN property only — never the prototype chain — so ids like
 *  'toString' or 'valueOf' resolve to undefined (and fall back) instead of
 *  leaking inherited members or throwing. */
function own<T>(map: Record<string, T> | undefined, key: string): T | undefined {
  return map && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

// --- Pure resolvers (engine-free, testable) --------------------------------
// Mechanics are NEVER changed by a worldpack; these resolve display text only.

export function reskinNodeName(pack: Worldpack | null | undefined, id: string, fallback: string): string {
  return ov(own(pack?.reskins?.nodes, id)?.name) ?? fallback;
}

export function reskinNodeDescription(pack: Worldpack | null | undefined, id: string, fallback: string): string {
  return ov(own(pack?.reskins?.nodes, id)?.description) ?? fallback;
}

export function reskinItemName(pack: Worldpack | null | undefined, id: string, fallback: string): string {
  return ov(own(pack?.reskins?.items, id)?.name) ?? fallback;
}

export function reskinItemDescription(pack: Worldpack | null | undefined, id: string, fallback: string): string {
  return ov(own(pack?.reskins?.items, id)?.description) ?? fallback;
}

export function reskinTerm(pack: Worldpack | null | undefined, term: string, fallback: string): string {
  return ov(own(pack?.reskins?.terms, term)) ?? fallback;
}

// --- React bindings ---------------------------------------------------------

/** The pack currently re-skinning the game (null = base system). Reactive. */
export function useActiveWorldpack(): Worldpack | null {
  return useWorldpackStore((s) => s.worldpacks.find((p) => p.id === s.activeId) ?? null);
}

/** Resolvers bound to the active pack, for display components. */
export function useReskin() {
  const pack = useActiveWorldpack();
  return {
    pack,
    nodeName: (id: string, fallback: string) => reskinNodeName(pack, id, fallback),
    nodeDescription: (id: string, fallback: string) => reskinNodeDescription(pack, id, fallback),
    itemName: (id: string, fallback: string) => reskinItemName(pack, id, fallback),
    itemDescription: (id: string, fallback: string) => reskinItemDescription(pack, id, fallback),
    term: (term: string, fallback: string) => reskinTerm(pack, term, fallback),
  };
}
