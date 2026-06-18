import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DoorOpen, User, Hash, Users, Hammer } from 'lucide-react';
import {
  PageShell,
  Field,
  Input,
  Button,
  EmptyState,
  usePrefersReducedMotion,
} from '@/components/ui';
import { GlowOrb, FogLayer } from '@/components/atmosphere';
import { CharacterCard } from '@/components/character';
import { useSessionStore, useRosterStore, useUIStore } from '@/store';
import { BackLink } from './lobby';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export default function JoinScreen() {
  const navigate = useNavigate();
  const characters = useRosterStore((s) => s.characters);
  const pushToast = useUIStore((s) => s.pushToast);
  const status = useSessionStore((s) => s.status);
  const reduced = usePrefersReducedMotion();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = characters.find((c) => c.id === selectedId) ?? null;
  const trimmedCode = code.trim();
  const trimmedName = name.trim();
  const isConnecting = busy || status === 'connecting';
  const canSubmit =
    trimmedCode.length > 0 && trimmedName.length > 0 && !!selected && !isConnecting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selected) return;
    setBusy(true);
    try {
      await useSessionStore.getState().joinGame(trimmedCode, selected, trimmedName);
      navigate('/table');
    } catch (err) {
      pushToast({
        title: 'Could not reach that table',
        body:
          err instanceof Error && err.message
            ? err.message
            : 'Check the room code and try again.',
        tone: 'danger',
      });
      setBusy(false);
    }
  };

  const hasHeroes = characters.length > 0;

  return (
    <PageShell center contentClassName="px-4 py-12 sm:py-16">
      <GlowOrb tone="arcane" size={460} top="-10%" left="50%" intensity={0.26} className="-translate-x-1/2" />
      <GlowOrb tone="mystic" size={300} bottom="4%" right="-8%" intensity={0.16} />
      <FogLayer position="bottom" tone="abyss" intensity={0.6} />

      <motion.div
        variants={container}
        initial={reduced ? false : 'hidden'}
        animate="show"
        className="relative z-10 mx-auto w-full max-w-xl"
      >
        <form
          onSubmit={handleSubmit}
          className="lh-panel lh-ring relative flex flex-col gap-6 p-7 sm:p-8"
        >
          {/* Header */}
          <motion.div variants={item} className="flex flex-col items-center gap-3 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl border border-arcane/30 bg-void/50 shadow-glow-arcane">
              <DoorOpen className="h-8 w-8 text-arcane-soft" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-wide text-glow-arcane sm:text-3xl">
                Follow the Light
              </h1>
              <p className="mt-1.5 text-sm text-ink-muted">
                Answer the beam with a room code and bring your hero to the table.
              </p>
            </div>
          </motion.div>

          {/* Code + name */}
          <motion.div variants={item} className="grid gap-4 sm:grid-cols-2">
            <Field label="Room code" htmlFor="join-code" required>
              <Input
                id="join-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                placeholder="ABC123"
                leftIcon={<Hash />}
                mono
                maxLength={8}
                autoComplete="off"
                spellCheck={false}
                autoFocus
                className="uppercase tracking-[0.2em]"
              />
            </Field>
            <Field label="Your name" htmlFor="join-name" required>
              <Input
                id="join-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Wanderer"
                leftIcon={<User />}
                maxLength={32}
                autoComplete="off"
              />
            </Field>
          </motion.div>

          {/* Character picker */}
          <motion.div variants={item} className="flex flex-col gap-2.5">
            <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-ink-muted">
              Choose your hero <span className="text-beam">*</span>
            </span>

            {hasHeroes ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {characters.map((c) => (
                  <CharacterCard
                    key={c.id}
                    character={c}
                    selected={c.id === selectedId}
                    onClick={() => setSelectedId(c.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="lh-panel-raised px-6">
                <EmptyState
                  icon={<Users />}
                  title="No heroes to bring"
                  hint="Forge a hero first, then return to answer the beam."
                  action={
                    <Button
                      variant="primary"
                      leftIcon={<Hammer className="h-4 w-4" />}
                      onClick={() => navigate('/forge')}
                    >
                      Forge a hero
                    </Button>
                  }
                />
              </div>
            )}
          </motion.div>

          {/* Submit */}
          <motion.div variants={item}>
            <Button
              type="submit"
              variant="arcane"
              size="lg"
              fullWidth
              loading={isConnecting}
              disabled={!canSubmit}
              leftIcon={<DoorOpen />}
            >
              {isConnecting ? 'Reaching the table…' : 'Follow the Light'}
            </Button>
          </motion.div>

          {/* Back link */}
          <motion.div variants={item} className="flex justify-center">
            <BackLink />
          </motion.div>
        </form>
      </motion.div>
    </PageShell>
  );
}
