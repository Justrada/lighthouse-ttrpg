import type { ReactNode } from 'react';
import { Avatar, ResourceBar, StatBadge, Badge, ConditionBadge } from '@/components/ui';
import { calculateDerivedStats } from '@/engine';
import { findNode, findItem } from '@/data/skillTree';
import { SKILL_LABELS } from '@/data/constants';
import { SKILL_KEYS, type Character, type Combatant, type SkillNode } from '@/types';
import { cn } from '@/lib/cn';

export interface CharacterSheetProps {
  character: Character;
  /** When provided, live combat resources/status override the derived maxes. */
  combatant?: Combatant;
  className?: string;
}

const mod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-faint">{title}</h4>
      {children}
    </section>
  );
}

export function CharacterSheet({ character, combatant, className }: CharacterSheetProps) {
  const d = calculateDerivedStats(character);
  const res = {
    hp: combatant ? { cur: combatant.currentHP, max: combatant.maxHP } : { cur: d.hp, max: d.hp },
    mp: combatant ? { cur: combatant.currentMP, max: combatant.maxMP } : { cur: d.mp, max: d.mp },
    sp: combatant ? { cur: combatant.currentSP, max: combatant.maxSP } : { cur: d.sp, max: d.sp },
  };

  const learned = character.learnedSkills
    .map((id) => findNode(id))
    .filter((n): n is SkillNode => Boolean(n?.linkedItem));
  const abilities = learned.filter((n) => n.linkedItem?.type === 'Ability');
  const enhancements = learned.filter((n) => n.linkedItem?.type === 'Enhancement');

  const equipped = [
    character.inventory.armor,
    character.inventory.weapon,
    character.inventory.shield,
    ...character.inventory.accessories,
  ]
    .filter((id): id is string => Boolean(id))
    .map((id) => findItem(id))
    .filter(Boolean);

  return (
    <div className={cn('space-y-5', className)}>
      {/* Identity */}
      <div className="flex items-center gap-4">
        <Avatar
          seed={character.portraitSeed ?? character.id}
          name={character.name}
          size={64}
          ring="beam"
          status={combatant?.isDead ? 'offline' : combatant?.isUnconscious ? 'away' : undefined}
        />
        <div className="min-w-0">
          <h3 className="truncate font-display text-2xl text-glow-beam">{character.name || 'Unnamed Hero'}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge tone="beam">Level {character.level}</Badge>
            <Badge tone="arcane">{abilities.length} abilities</Badge>
            <Badge tone="mystic">{enhancements.length} enhancements</Badge>
          </div>
        </div>
      </div>

      {/* Resources */}
      <div className="space-y-2">
        <ResourceBar kind="hp" current={res.hp.cur} max={res.hp.max} />
        <ResourceBar kind="mp" current={res.mp.cur} max={res.mp.max} />
        <ResourceBar kind="sp" current={res.sp.cur} max={res.sp.max} />
      </div>

      {/* Core stats + defenses */}
      <div className="grid grid-cols-3 gap-2">
        <StatBadge stacked label="Mind" value={character.coreStats.mind} tone="arcane" />
        <StatBadge stacked label="Body" value={character.coreStats.body} tone="beam" />
        <StatBadge stacked label="Soul" value={character.coreStats.soul} tone="mystic" />
        <StatBadge stacked label="Armor" value={combatant?.ac ?? d.ac} />
        <StatBadge stacked label="Initiative" value={mod(d.initiative)} />
        <StatBadge stacked label="Actions" value={d.actionsPerRound} />
      </div>

      {/* Skills */}
      <Section title="Skills">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {SKILL_KEYS.map((k) => (
            <div key={k} className="stat-pill justify-between">
              <span className="text-ink-muted">{SKILL_LABELS[k]}</span>
              <span className="text-beam-soft">{mod(d[k])}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Status effects (combat only) */}
      {combatant && combatant.statusEffects.length > 0 && (
        <Section title="Status">
          <div className="flex flex-wrap gap-1.5">
            {combatant.statusEffects.map((e) => (
              <ConditionBadge
                key={e.id}
                label={e.label}
                tone={e.tone ?? 'neutral'}
                duration={e.durationValue ? `${e.durationValue}` : undefined}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Abilities */}
      {abilities.length > 0 && (
        <Section title="Abilities">
          <ul className="space-y-1.5">
            {abilities.map((n) => {
              const item = n.linkedItem!;
              return (
                <li
                  key={n.id}
                  className="flex items-center gap-2 rounded-lg border border-line bg-void/40 px-3 py-2 text-sm"
                >
                  <span className="flex-1 truncate text-ink">{item.name}</span>
                  {item.cost && (
                    <span className="font-mono text-xs text-mp">
                      {item.cost.value} {item.cost.type}
                    </span>
                  )}
                  {item.range && <span className="text-xs text-ink-faint">{item.range}</span>}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* Equipment */}
      {equipped.length > 0 && (
        <Section title="Equipment">
          <div className="flex flex-wrap gap-1.5">
            {equipped.map((it) => (
              <Badge key={it!.id} tone="neutral" icon={<span aria-hidden>⚒️</span>}>
                {it!.name}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {/* Notes */}
      {character.notes && (
        <Section title="Notes">
          <p className="whitespace-pre-wrap rounded-lg border border-line bg-void/40 p-3 text-sm text-ink-muted">
            {character.notes}
          </p>
        </Section>
      )}
    </div>
  );
}
