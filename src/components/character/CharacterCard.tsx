import type { ReactNode } from 'react';
import { Card, Avatar, Badge, StatBadge } from '@/components/ui';
import { calculateDerivedStats } from '@/engine';
import { findNode } from '@/data/skillTree';
import type { Character } from '@/types';
import { cn } from '@/lib/cn';

export interface CharacterCardProps {
  character: Character;
  onClick?: () => void;
  selected?: boolean;
  footer?: ReactNode;
  className?: string;
}

export function CharacterCard({ character, onClick, selected, footer, className }: CharacterCardProps) {
  const d = calculateDerivedStats(character);
  const abilityCount = character.learnedSkills.filter(
    (id) => findNode(id)?.linkedItem?.type === 'Ability',
  ).length;

  return (
    <Card
      interactive={Boolean(onClick)}
      accent="beam"
      edge
      onClick={onClick}
      className={cn('flex flex-col gap-3 p-4', selected && 'border-beam/60 shadow-glow-beam', className)}
    >
      <div className="flex items-center gap-3">
        <Avatar seed={character.portraitSeed ?? character.id} name={character.name} size={52} ring="beam" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg text-ink">{character.name || 'Unnamed Hero'}</h3>
          <p className="text-xs text-ink-faint">
            {abilityCount} {abilityCount === 1 ? 'ability' : 'abilities'} learned
          </p>
        </div>
        <Badge tone="beam">Lv {character.level}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatBadge stacked size="sm" label="Mind" value={character.coreStats.mind} tone="arcane" />
        <StatBadge stacked size="sm" label="Body" value={character.coreStats.body} tone="beam" />
        <StatBadge stacked size="sm" label="Soul" value={character.coreStats.soul} tone="mystic" />
      </div>

      <div className="flex items-center gap-3 font-mono text-xs">
        <span className="text-hp">{d.hp} HP</span>
        <span className="text-mp">{d.mp} MP</span>
        <span className="text-sp">{d.sp} SP</span>
        <span className="ml-auto text-ink-faint">AC {d.ac}</span>
      </div>

      {footer && (
        <>
          <div className="hairline" />
          {footer}
        </>
      )}
    </Card>
  );
}
