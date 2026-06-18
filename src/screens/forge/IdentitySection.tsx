import { RefreshCw, Scroll, User } from 'lucide-react';
import { useDraftStore } from '@/store';
import { Field, Input, NumberStepper, Sigil, IconButton, Divider } from '@/components/ui';

/**
 * Identity tab — name, level, and the generated portrait sigil. The portrait
 * seed re-rolls deterministically so players can reshuffle their emblem.
 */
export function IdentitySection() {
  const draft = useDraftStore((s) => s.draft);
  const setName = useDraftStore((s) => s.setName);
  const setLevel = useDraftStore((s) => s.setLevel);

  if (!draft) return null;
  const seed = draft.portraitSeed ?? draft.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* Portrait */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <div className="rounded-2xl border border-line-strong bg-void/60 p-2 shadow-glow-beam/30">
              <Sigil seed={seed} size={128} title={`${draft.name || 'Hero'} sigil`} />
            </div>
            <IconButton
              aria-label="Re-roll portrait"
              size="sm"
              variant="secondary"
              icon={<RefreshCw />}
              className="absolute -bottom-2 -right-2"
              onClick={() => {
                // Re-roll the seed deterministically via name+timestamp salt.
                const next = `${seed}-${Math.random().toString(36).slice(2, 8)}`;
                // setName keeps the draft intact; we mutate portraitSeed through it.
                useDraftStore.setState((st) =>
                  st.draft
                    ? { draft: { ...st.draft, portraitSeed: next } }
                    : st,
                );
              }}
            />
          </div>
          <span className="text-[0.7rem] uppercase tracking-widest text-ink-faint">
            Arcane Sigil
          </span>
        </div>

        {/* Fields */}
        <div className="w-full flex-1 space-y-4">
          <Field label="Hero Name" htmlFor="forge-name">
            <Input
              id="forge-name"
              value={draft.name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name your hero…"
              leftIcon={<User />}
              maxLength={40}
            />
          </Field>

          <Field
            label="Level"
            hint="Higher levels grant more skill points to spend."
          >
            <NumberStepper
              value={draft.level}
              onChange={setLevel}
              min={1}
              max={20}
              editable
              aria-label="Character level"
            />
          </Field>
        </div>
      </div>

      <Divider label="Lore" />

      <div className="flex items-start gap-3 rounded-xl border border-line bg-void/40 p-4">
        <Scroll className="mt-0.5 h-5 w-5 shrink-0 text-beam/70" />
        <p className="text-sm leading-relaxed text-ink-muted">
          Every keeper of the Lighthouse begins as a flicker in the dark. Shape
          your hero's <span className="text-arcane-soft">Mind</span>,{' '}
          <span className="text-beam-soft">Body</span>, and{' '}
          <span className="text-mystic-soft">Soul</span>, then chart a
          constellation of skills across the Forge. What you build here is who
          they become at the table.
        </p>
      </div>
    </div>
  );
}
