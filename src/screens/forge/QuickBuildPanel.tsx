import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Swords,
  Scale,
  User,
  Wand2,
  Dices,
  Info,
} from 'lucide-react';
import { useDraftStore } from '@/store';
import type { Archetype } from '@/store/contracts';
import { Button, Card, Field, Input, NumberStepper } from '@/components/ui';
import { cn } from '@/lib/cn';
import { LivePreview } from './LivePreview';

interface ArchetypeOption {
  value: Archetype;
  label: string;
  emoji: string;
  icon: React.ReactNode;
  blurb: string;
  accent: 'arcane' | 'beam' | 'mystic';
}

const ARCHETYPES: ArchetypeOption[] = [
  {
    value: 'magic',
    label: 'Magic',
    emoji: '✨',
    icon: <Wand2 />,
    blurb: 'Mind-forged spellcaster — deep MP, arcane abilities, robes.',
    accent: 'arcane',
  },
  {
    value: 'skill',
    label: 'Skill',
    emoji: '⚔️',
    icon: <Swords />,
    blurb: 'Battle-hardened martial — high HP & AC, physical strikes, steel.',
    accent: 'beam',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    emoji: '⚖️',
    icon: <Scale />,
    blurb: 'A versatile keeper — even stats, a blend of spell and steel.',
    accent: 'mystic',
  },
];

/**
 * Quick Build — the fast path through the Forge. Give a name, level, and a
 * play-style focus; the engine auto-allocates stats, auto-picks a themed skill
 * spread (with randomness), and equips starter gear. The result lands in the
 * same draft store as the Advanced tabs, so it stays fully editable — and
 * "Re-roll" regenerates with the same inputs so the randomness is visible.
 */
export function QuickBuildPanel() {
  const [name, setName] = useState('');
  const [level, setLevel] = useState(1);
  const [archetype, setArchetype] = useState<Archetype>('balanced');
  const [generated, setGenerated] = useState(false);

  const generate = () => {
    useDraftStore.getState().quickBuild({ name, level, archetype });
    setGenerated(true);
  };

  // Seed an initial preview once on mount so the panel never opens empty.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (!useDraftStore.getState().draft) generate();
    else setGenerated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
      {/* LEFT — live preview of the generated hero */}
      <aside className="order-2 lg:order-1 lg:sticky lg:top-20 lg:self-start">
        <LivePreview />
      </aside>

      {/* RIGHT — the quick-build form */}
      <section className="order-1 min-w-0 lg:order-2">
        <div className="lh-panel space-y-6 p-4 sm:p-6">
          {/* Intro */}
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-beam/40 bg-beam/10 text-beam">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-lg text-glow-beam">Quick Build</h2>
              <p className="text-sm text-ink-muted">
                Name your hero, choose a focus, and let the Forge do the rest.
              </p>
            </div>
          </div>

          {/* Name + Level */}
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="Hero Name" htmlFor="qb-name">
              <Input
                id="qb-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name your hero…"
                leftIcon={<User />}
                maxLength={40}
              />
            </Field>
            <Field label="Level" hint="More levels, more power.">
              <NumberStepper
                value={level}
                onChange={setLevel}
                min={1}
                max={20}
                editable
                aria-label="Character level"
              />
            </Field>
          </div>

          {/* Archetype picker */}
          <fieldset>
            <legend className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-ink-muted">
              Focus
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {ARCHETYPES.map((opt) => {
                const active = opt.value === archetype;
                return (
                  <Card
                    key={opt.value}
                    interactive
                    accent={opt.accent}
                    role="radio"
                    aria-checked={active}
                    tabIndex={0}
                    onClick={() => setArchetype(opt.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setArchetype(opt.value);
                      }
                    }}
                    className={cn(
                      'flex flex-col gap-1.5',
                      active
                        ? 'border-beam/60 bg-beam/5 shadow-glow-beam'
                        : 'opacity-80 hover:opacity-100',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'grid h-7 w-7 shrink-0 place-items-center rounded-lg [&_svg]:h-4 [&_svg]:w-4',
                          active
                            ? 'bg-beam/15 text-beam'
                            : 'bg-surface-raised/70 text-ink-muted',
                        )}
                      >
                        {opt.icon}
                      </span>
                      <span className="font-display text-sm text-ink">
                        {opt.emoji} {opt.label}
                      </span>
                    </div>
                    <p className="text-xs leading-snug text-ink-faint">
                      {opt.blurb}
                    </p>
                  </Card>
                );
              })}
            </div>
          </fieldset>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              leftIcon={<Sparkles />}
              onClick={generate}
              className="flex-1 sm:flex-none"
            >
              Generate Hero
            </Button>
            <Button
              variant="secondary"
              leftIcon={
                <motion.span
                  key={archetype + level}
                  initial={{ rotate: -90 }}
                  animate={{ rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                  className="inline-flex"
                >
                  <Dices className="h-4 w-4" />
                </motion.span>
              }
              onClick={generate}
              disabled={!generated}
              className="flex-1 sm:flex-none"
            >
              Re-roll
            </Button>
          </div>

          {/* Hint */}
          <div className="flex items-start gap-2.5 rounded-xl border border-line bg-void/40 p-3.5 text-sm text-ink-muted">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-arcane-soft" />
            <p className="leading-relaxed">
              Happy with the result? Hit{' '}
              <span className="text-beam-soft">Save Hero</span> up top. Want to
              fine-tune the stats, skill tree, or gear by hand? Switch to{' '}
              <span className="text-ink">Advanced</span> — your generated draft
              carries over and stays fully editable.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
