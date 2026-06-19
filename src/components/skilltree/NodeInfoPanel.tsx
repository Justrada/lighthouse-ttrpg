import { Sparkles, Lock, Check, Trash2, Zap, Shield as ShieldIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import type { SkillNode, SkillChoice } from '@/types';
import { Badge, Button, Divider, Select, StatBadge } from '@/components/ui';
import { getSkillCost } from '@/engine';
import { cn } from '@/lib/cn';
import { useReskin } from '@/lib/reskin';
import {
  CORE_SKILL_CHOICES,
  RESOURCE_CHOICES,
  costText,
  describeEffect,
  isChoiceEffect,
  isCoreSkillChoice,
} from './effectText';

export interface NodeInfoPanelProps {
  node: SkillNode | null;
  learned: boolean;
  isCenter: boolean;
  /** Result of the learnability check for blocked reasons. */
  learnCheck: { ok: boolean; reason?: string };
  /** Recorded player choices for this node, keyed by effectId. */
  choices: SkillChoice[];
  onLearn: (id: string) => void;
  onUnlearn: (id: string) => void;
  onChoice: (nodeId: string, effectId: string, choice: string) => void;
  className?: string;
}

const META_LABELS: Array<{ key: 'range' | 'aoe' | 'hitType' | 'rollModifier'; label: string }> = [
  { key: 'range', label: 'Range' },
  { key: 'aoe', label: 'Area' },
  { key: 'hitType', label: 'Hit' },
  { key: 'rollModifier', label: 'Roll' },
];

/** Detail card for the currently selected skill node. */
export function NodeInfoPanel({
  node,
  learned,
  isCenter,
  learnCheck,
  choices,
  onLearn,
  onUnlearn,
  onChoice,
  className,
}: NodeInfoPanelProps) {
  const reskin = useReskin();
  if (!node) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center gap-3 p-6 text-center',
          className,
        )}
      >
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-void/50 text-ink-faint">
          <Sparkles className="h-7 w-7" />
        </div>
        <div>
          <h4 className="font-display text-base text-ink">Select a node</h4>
          <p className="mt-1 max-w-[16rem] text-sm text-ink-muted">
            Tap any node in the constellation to inspect its ability, then learn
            it to spend skill points.
          </p>
        </div>
      </div>
    );
  }

  const item = node.linkedItem;
  const cost = getSkillCost(node.id);
  const isAbility = item?.type === 'Ability';

  return (
    <motion.div
      key={node.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={cn('flex h-full flex-col', className)}
    >
      {/* Header */}
      <div className="space-y-2 p-4">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border',
              isCenter
                ? 'border-beam/50 bg-beam/15 text-beam'
                : learned
                  ? 'border-beam/40 bg-beam/10 text-beam-soft'
                  : learnCheck.ok
                    ? 'border-arcane/40 bg-arcane/10 text-arcane'
                    : 'border-line bg-void/50 text-ink-faint',
            )}
          >
            {isCenter ? (
              <Sparkles className="h-4 w-4" />
            ) : isAbility ? (
              <Zap className="h-4 w-4" />
            ) : item ? (
              <ShieldIcon className="h-4 w-4" />
            ) : (
              <Lock className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="font-display text-lg leading-tight text-ink">
              {reskin.nodeName(node.id, node.label)}
            </h4>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {item && (
                <Badge tone={isAbility ? 'arcane' : 'mystic'} size="sm">
                  {item.type}
                </Badge>
              )}
              {learned && !isCenter && (
                <Badge tone="beam" size="sm" icon={<Check />}>
                  Learned
                </Badge>
              )}
              {isCenter && (
                <Badge tone="beam" size="sm">
                  Core
                </Badge>
              )}
              {!learned && !isCenter && (
                <Badge tone="neutral" size="sm">
                  {cost} pt{cost === 1 ? '' : 's'}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {(item?.description || node.description) && (
          <p className="text-sm leading-relaxed text-ink-muted">
            {reskin.nodeDescription(node.id, item?.description || node.description || '')}
          </p>
        )}
      </div>

      <Divider />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* Combat meta */}
        {item && (item.cost || META_LABELS.some((m) => item[m.key])) && (
          <div className="flex flex-wrap gap-1.5">
            {costText(item) && (
              <StatBadge size="sm" label="Cost" value={costText(item)!} tone="arcane" />
            )}
            {META_LABELS.map((m) =>
              item[m.key] ? (
                <StatBadge
                  key={m.key}
                  size="sm"
                  label={m.label}
                  value={String(item[m.key])}
                />
              ) : null,
            )}
          </div>
        )}

        {/* Effects */}
        {item && item.effects.length > 0 && (
          <section className="space-y-2">
            <h5 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-faint">
              Effects
            </h5>
            <ul className="space-y-1.5">
              {item.effects.map((eff) => {
                const chosen = choices.find((c) => c.effectId === eff.id)?.choice;
                return (
                  <li
                    key={eff.id}
                    className="rounded-lg border border-line bg-void/40 px-3 py-2 text-sm text-ink"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-beam/70" />
                      <span className="flex-1">{describeEffect(eff, chosen)}</span>
                    </div>

                    {/* Player choice selector (learned nodes only) */}
                    {learned && isChoiceEffect(eff) && (
                      <div className="mt-2 pl-3.5">
                        <Select
                          size="sm"
                          aria-label="Choose target"
                          placeholder={
                            isCoreSkillChoice(eff)
                              ? 'Choose a skill…'
                              : 'Choose a resource…'
                          }
                          value={chosen ?? null}
                          onChange={(v) => onChoice(node.id, eff.id, v)}
                          options={(isCoreSkillChoice(eff)
                            ? CORE_SKILL_CHOICES
                            : RESOURCE_CHOICES
                          ).map((o) => ({ value: o, label: o }))}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {isCenter && (
          <p className="rounded-lg border border-beam/30 bg-beam/5 px-3 py-2 text-sm text-ink-muted">
            The heart of your tree — always unlocked. Every path begins here.
          </p>
        )}

        {!learned && !isCenter && !learnCheck.ok && learnCheck.reason && (
          <p className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-warn">
            {learnCheck.reason}
          </p>
        )}
      </div>

      {/* Actions */}
      {!isCenter && (
        <>
          <Divider />
          <div className="p-4">
            {learned ? (
              <Button
                variant="danger"
                fullWidth
                leftIcon={<Trash2 />}
                onClick={() => onUnlearn(node.id)}
              >
                Unlearn
              </Button>
            ) : (
              <Button
                variant="primary"
                fullWidth
                leftIcon={<Check />}
                disabled={!learnCheck.ok}
                onClick={() => onLearn(node.id)}
              >
                Learn ({cost} pt{cost === 1 ? '' : 's'})
              </Button>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
