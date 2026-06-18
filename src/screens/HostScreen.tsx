import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Radio, User, Hash, Sparkles } from 'lucide-react';
import { PageShell, Field, Input, Button, usePrefersReducedMotion } from '@/components/ui';
import { LighthouseMark } from '@/components/brand';
import { GlowOrb, FogLayer } from '@/components/atmosphere';
import { useSessionStore, useUIStore } from '@/store';
import { cn } from '@/lib/cn';
import { BackLink } from './lobby';

/** Staggered reveal for the card's contents. */
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export default function HostScreen() {
  const navigate = useNavigate();
  const pushToast = useUIStore((s) => s.pushToast);
  const status = useSessionStore((s) => s.status);
  const reduced = usePrefersReducedMotion();

  const [name, setName] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [busy, setBusy] = useState(false);

  const trimmedName = name.trim();
  const isConnecting = busy || status === 'connecting';
  const canSubmit = trimmedName.length > 0 && !isConnecting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      await useSessionStore.getState().hostGame(trimmedName, customCode.trim() || undefined);
      navigate('/table');
    } catch (err) {
      pushToast({
        title: 'The beacon would not light',
        body:
          err instanceof Error && err.message
            ? err.message
            : 'That room code may already be taken. Try another.',
        tone: 'danger',
      });
      setBusy(false);
    }
  };

  return (
    <PageShell center contentClassName="px-4 py-12 sm:py-16">
      {/* Atmospheric depth above the PageShell beam. */}
      <GlowOrb tone="beam" size={460} top="-10%" left="50%" intensity={0.28} className="-translate-x-1/2" />
      <GlowOrb tone="arcane" size={300} bottom="4%" left="-8%" intensity={0.16} />
      <FogLayer position="bottom" tone="abyss" intensity={0.6} />

      <motion.div
        variants={container}
        initial={reduced ? false : 'hidden'}
        animate="show"
        className="relative z-10 mx-auto w-full max-w-md"
      >
        <form
          onSubmit={handleSubmit}
          className="lh-panel lh-ring relative flex flex-col gap-6 p-7 sm:p-8"
        >
          {/* Header — mark + title */}
          <motion.div variants={item} className="flex flex-col items-center gap-3 text-center">
            <span
              className={cn(
                'grid h-16 w-16 place-items-center rounded-2xl border border-beam/30 bg-void/50 shadow-glow-beam',
                !reduced && 'animate-float',
              )}
            >
              <LighthouseMark size={40} />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-wide text-glow-beam sm:text-3xl">
                Light the Beacon
              </h1>
              <p className="mt-1.5 text-sm text-ink-muted">
                Run the table as Game Master and call your party to the light.
              </p>
            </div>
          </motion.div>

          {/* Name (required) */}
          <motion.div variants={item}>
            <Field label="Your name (GM)" htmlFor="gm-name" required>
              <Input
                id="gm-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="The Lightkeeper"
                leftIcon={<User />}
                autoFocus
                maxLength={32}
                autoComplete="off"
                enterKeyHint="go"
              />
            </Field>
          </motion.div>

          {/* Custom room code (optional) */}
          <motion.div variants={item}>
            <Field
              label="Custom room code (optional)"
              htmlFor="room-code"
              hint="Leave blank to auto-generate a code."
            >
              <Input
                id="room-code"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                placeholder="AUTO"
                leftIcon={<Hash />}
                mono
                maxLength={8}
                autoComplete="off"
                spellCheck={false}
                className="uppercase tracking-[0.2em]"
              />
            </Field>
          </motion.div>

          {/* Submit */}
          <motion.div variants={item} className="flex flex-col gap-3">
            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={isConnecting}
              disabled={!canSubmit}
              leftIcon={<Radio />}
            >
              {isConnecting ? 'Lighting the beacon…' : 'Light the Beacon'}
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-faint">
              <Sparkles className="h-3.5 w-3.5 text-beam-soft" />
              Players join with the room code you&apos;ll see at the table.
            </p>
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
