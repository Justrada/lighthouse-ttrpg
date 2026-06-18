import { useCallback, useMemo, useState } from 'react';
import { useDraftStore, useUIStore } from '@/store';
import { skillNodes, skillEdges, findNode } from '@/data/skillTree';
import { SkillTreeGraph, NodeInfoPanel } from '@/components/skilltree';
import { cn } from '@/lib/cn';

/**
 * Skill Tree tab — wires the presentational {@link SkillTreeGraph} to the draft
 * store. Clicking a node selects it; learnable nodes can be learned and learned
 * non-center nodes can be unlearned from the info panel. A single click on a
 * learnable node also learns it directly for tactile, game-like feedback.
 */
export function SkillTreeSection() {
  const draft = useDraftStore((s) => s.draft);
  const learnSkill = useDraftStore((s) => s.learnSkill);
  const unlearnSkill = useDraftStore((s) => s.unlearnSkill);
  const canLearn = useDraftStore((s) => s.canLearn);
  const isLearned = useDraftStore((s) => s.isLearned);
  const setSkillChoice = useDraftStore((s) => s.setSkillChoice);
  const pushToast = useUIStore((s) => s.pushToast);

  const [selectedId, setSelectedId] = useState<string>('center-0');

  const learnedIds = draft?.learnedSkills ?? [];
  const learnedKey = learnedIds.join('|');
  const budgetAvail = useDraftStore((s) => s.budget.available);

  // Recompute the learnable frontier whenever learned set or budget changes.
  const learnableSet = useMemo(() => {
    const set = new Set<string>();
    if (!draft) return set;
    for (const n of skillNodes) {
      if (canLearn(n.id).ok) set.add(n.id);
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, learnedKey, budgetAvail]);

  const isLearnable = useCallback((id: string) => learnableSet.has(id), [learnableSet]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      // Direct-learn on selecting a learnable node for snappy feedback.
      if (canLearn(id).ok) {
        const node = findNode(id);
        learnSkill(id);
        pushToast({
          title: 'Skill learned',
          body: node?.label,
          tone: 'arcane',
        });
      }
    },
    [canLearn, learnSkill, pushToast],
  );

  const handleLearn = useCallback(
    (id: string) => {
      const node = findNode(id);
      learnSkill(id);
      pushToast({ title: 'Skill learned', body: node?.label, tone: 'arcane' });
    },
    [learnSkill, pushToast],
  );

  const handleUnlearn = useCallback(
    (id: string) => {
      const node = findNode(id);
      unlearnSkill(id);
      pushToast({ title: 'Skill removed', body: node?.label, tone: 'warn' });
    },
    [unlearnSkill, pushToast],
  );

  if (!draft) return null;

  const selectedNode = selectedId ? findNode(selectedId) ?? null : null;
  const selectedLearned = selectedNode ? isLearned(selectedNode.id) : false;
  const selectedCheck = selectedNode
    ? canLearn(selectedNode.id)
    : { ok: false };
  const selectedChoices = selectedNode
    ? draft.skillChoices?.[selectedNode.id] ?? []
    : [];

  const abilityCount = learnedIds.filter((id) => {
    const n = findNode(id);
    return n?.linkedItem?.type === 'Ability';
  }).length;
  const enhCount = learnedIds.filter((id) => {
    const n = findNode(id);
    return n?.linkedItem?.type === 'Enhancement';
  }).length;

  return (
    <div className="space-y-3">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          Pan, zoom, and tap to chart your constellation.
        </p>
        <div className="flex gap-1.5 text-xs">
          <span className="rounded-full border border-arcane/30 bg-arcane/10 px-2.5 py-1 text-arcane-soft">
            {abilityCount} abilities
          </span>
          <span className="rounded-full border border-mystic/30 bg-mystic/10 px-2.5 py-1 text-mystic-soft">
            {enhCount} enhancements
          </span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        {/* Graph */}
        <div
          className={cn(
            'h-[58vh] min-h-[360px] w-full lg:h-[64vh]',
          )}
        >
          <SkillTreeGraph
            nodes={skillNodes}
            edges={skillEdges}
            learnedIds={learnedIds}
            isLearnable={isLearnable}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </div>

        {/* Info panel */}
        <div className="lh-panel-raised max-h-[64vh] overflow-hidden lg:sticky lg:top-20">
          <NodeInfoPanel
            node={selectedNode}
            learned={selectedLearned}
            isCenter={selectedNode?.isCenter ?? false}
            learnCheck={selectedCheck}
            choices={selectedChoices}
            onLearn={handleLearn}
            onUnlearn={handleUnlearn}
            onChoice={setSkillChoice}
          />
        </div>
      </div>
    </div>
  );
}
