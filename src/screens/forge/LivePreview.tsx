import { useDraftStore } from '@/store';
import { CharacterSheet } from '@/components/character';
import { BudgetMeter } from './BudgetMeter';

/**
 * The left pane of the Forge — a live, always-current character sheet plus the
 * prominent skill-point budget meter. Everything here reflects the draft store
 * as the player edits on the right.
 */
export function LivePreview() {
  const draft = useDraftStore((s) => s.draft);
  const budget = useDraftStore((s) => s.budget);

  if (!draft) return null;

  return (
    <div className="space-y-4">
      <BudgetMeter budget={budget} />
      <div className="lh-panel p-5">
        <CharacterSheet character={draft} />
      </div>
    </div>
  );
}
