import { useState } from 'react';
import { Dices } from 'lucide-react';
import type { PartyMember, SkillKey } from '@/types';
import { SKILL_KEYS } from '@/types';
import { Modal, Button, Field, Select, NumberStepper, Switch } from '@/components/ui';
import { SKILL_LABELS } from '@/data/constants';
import { requestCheck, useUIStore } from '@/store';

export interface RequestCheckModalProps {
  open: boolean;
  onClose: () => void;
  party: PartyMember[];
}

/** GM dialog to ask a specific player for a skill check, with an optional DC. */
export function RequestCheckModal({ open, onClose, party }: RequestCheckModalProps) {
  const pushToast = useUIStore((s) => s.pushToast);
  const [peerId, setPeerId] = useState<string | null>(party[0]?.peerId ?? null);
  const [skill, setSkill] = useState<SkillKey>('awareness');
  const [useDC, setUseDC] = useState(true);
  const [dc, setDC] = useState(12);

  const send = () => {
    if (!peerId) return;
    const target = party.find((m) => m.peerId === peerId);
    requestCheck(peerId, SKILL_LABELS[skill], useDC ? dc : undefined);
    pushToast({
      title: 'Check requested',
      body: `${target?.character.name ?? 'Player'} · ${SKILL_LABELS[skill]}${useDC ? ` (DC ${dc})` : ''}`,
      tone: 'arcane',
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Request a Check"
      description="Prompt a hero to test their mettle."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!peerId}
            leftIcon={<Dices className="h-4 w-4" />}
            onClick={send}
          >
            Send Request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Player">
          {party.length === 0 ? (
            <p className="rounded-xl border border-line bg-void/40 p-3 text-sm text-ink-muted">
              No players are connected.
            </p>
          ) : (
            <Select
              aria-label="Player"
              value={peerId}
              onChange={setPeerId}
              options={party.map((m) => ({ value: m.peerId, label: m.character.name }))}
            />
          )}
        </Field>

        <Field label="Skill">
          <Select
            aria-label="Skill"
            value={skill}
            onChange={(v) => setSkill(v as SkillKey)}
            options={SKILL_KEYS.map((k) => ({ value: k, label: SKILL_LABELS[k] }))}
          />
        </Field>

        <div className="flex items-center justify-between rounded-xl border border-line bg-void/40 p-3">
          <div>
            <p className="text-sm font-medium text-ink">Set a difficulty</p>
            <p className="text-xs text-ink-faint">Players see pass/fail against the DC.</p>
          </div>
          <Switch checked={useDC} onChange={setUseDC} aria-label="Use difficulty class" />
        </div>

        {useDC && (
          <Field label="Difficulty Class">
            <NumberStepper value={dc} onChange={setDC} min={1} max={40} editable aria-label="DC" />
          </Field>
        )}
      </div>
    </Modal>
  );
}
