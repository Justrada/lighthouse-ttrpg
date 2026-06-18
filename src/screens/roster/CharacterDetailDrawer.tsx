import { Pencil, Copy, Trash2 } from 'lucide-react';
import { Drawer, Button } from '@/components/ui';
import { CharacterSheet } from '@/components/character';
import type { Character } from '@/types';

export interface CharacterDetailDrawerProps {
  /** The character to show; the drawer is open when this is non-null. */
  character: Character | null;
  onClose: () => void;
  onEdit: (c: Character) => void;
  onDuplicate: (c: Character) => void;
  onDelete: (c: Character) => void;
}

/**
 * Right-side drawer presenting a full CharacterSheet with Edit / Duplicate /
 * Delete actions. Kept presentational — all mutations are delegated upward.
 */
export function CharacterDetailDrawer({
  character,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
}: CharacterDetailDrawerProps) {
  return (
    <Drawer
      open={Boolean(character)}
      onClose={onClose}
      side="right"
      title={character?.name || 'Hero'}
      className="w-[min(30rem,94vw)]"
      footer={
        character && (
          <div className="flex w-full items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => onDelete(character)}
            >
              Delete
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Copy className="h-4 w-4" />}
              onClick={() => onDuplicate(character)}
              className="ml-auto"
            >
              Duplicate
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Pencil className="h-4 w-4" />}
              onClick={() => onEdit(character)}
            >
              Edit
            </Button>
          </div>
        )
      }
    >
      {character && <CharacterSheet character={character} />}
    </Drawer>
  );
}
