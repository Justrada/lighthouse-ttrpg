import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Plus, Users, Radio, DoorOpen, Trash2, ArrowRight } from 'lucide-react';
import {
  PageShell,
  TopBar,
  Button,
  IconButton,
  Modal,
  EmptyState,
  Divider,
  usePrefersReducedMotion,
} from '@/components/ui';
import { Wordmark } from '@/components/brand';
import { GlowOrb } from '@/components/atmosphere';
import { CharacterCard } from '@/components/character';
import { useRosterStore, useDraftStore, useUIStore } from '@/store';
import type { Character } from '@/types';
import { cn } from '@/lib/cn';
import { CharacterDetailDrawer } from './roster/CharacterDetailDrawer';

const gridItem = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export default function RosterScreen() {
  const navigate = useNavigate();
  const characters = useRosterStore((s) => s.characters);
  const pushToast = useUIStore((s) => s.pushToast);
  const reduced = usePrefersReducedMotion();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Character | null>(null);

  // Resolve from the live store so the drawer reflects edits/duplicates.
  const selected = characters.find((c) => c.id === selectedId) ?? null;

  const newHero = () => {
    useDraftStore.getState().startNew();
    navigate('/forge');
  };

  const editHero = (c: Character) => {
    useDraftStore.getState().editExisting(c);
    navigate(`/forge/${c.id}`);
  };

  const duplicateHero = (c: Character) => {
    useRosterStore.getState().duplicate(c.id);
    pushToast({ title: 'Hero duplicated', body: `A copy of ${c.name || 'the hero'} was added.`, tone: 'arcane' });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const name = pendingDelete.name || 'Hero';
    useRosterStore.getState().remove(pendingDelete.id);
    if (selectedId === pendingDelete.id) setSelectedId(null);
    setPendingDelete(null);
    pushToast({ title: 'Hero deleted', body: `${name} was removed from your roster.`, tone: 'danger' });
  };

  const topBar = (
    <TopBar
      brand={
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="LIGHTHOUSE home"
          className="rounded-lg tap-highlight-none focus-visible:outline-none"
        >
          <Wordmark size="sm" tagline="Roster" />
        </button>
      }
      actions={
        <>
          <IconButton
            aria-label="Back to home"
            icon={<Home />}
            variant="ghost"
            size="md"
            onClick={() => navigate('/')}
          />
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={newHero}
          >
            New Hero
          </Button>
        </>
      }
    />
  );

  return (
    <PageShell topBar={topBar} maxWidth="2xl" contentClassName="px-4 py-8 sm:px-6 sm:py-10">
      <GlowOrb tone="beam" size={420} top="-10%" right="-8%" intensity={0.16} />
      <GlowOrb tone="arcane" size={320} bottom="0%" left="-10%" intensity={0.12} />

      {/* Header */}
      <header className="relative z-10 mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-glow-beam sm:text-4xl">
            Your Roster
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            {characters.length === 0
              ? 'Your heroes will gather here.'
              : `${characters.length} ${characters.length === 1 ? 'hero' : 'heroes'} ready for the table.`}
          </p>
        </div>
      </header>

      {/* Grid or empty state */}
      <div className="relative z-10">
        {characters.length === 0 ? (
          <div className="lh-panel lh-ring px-6 py-4">
            <EmptyState
              icon={<Users />}
              title="No heroes yet"
              hint="Forge your first hero to begin your legend. They'll be saved here, ready to bring to any table."
              action={
                <Button
                  variant="primary"
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={newHero}
                >
                  Forge your first hero
                </Button>
              }
            />
          </div>
        ) : (
          <motion.div
            initial={reduced ? false : 'hidden'}
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.06 } } }}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {characters.map((c) => (
              <motion.div key={c.id} variants={gridItem}>
                <CharacterCard
                  character={c}
                  selected={c.id === selectedId}
                  onClick={() => setSelectedId(c.id)}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Quick links to host/join a table */}
      <section className="relative z-10 mt-14">
        <Divider label="Take your party to a table" />
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <QuickLink
            icon={<Radio />}
            title="Host a Table"
            description="Run a session as the Game Master."
            accent="arcane"
            onClick={() => navigate('/host')}
          />
          <QuickLink
            icon={<DoorOpen />}
            title="Join a Table"
            description="Enter a room code and bring a hero."
            accent="mystic"
            onClick={() => navigate('/join')}
          />
        </div>
      </section>

      {/* Detail drawer */}
      <CharacterDetailDrawer
        character={selected}
        onClose={() => setSelectedId(null)}
        onEdit={editHero}
        onDuplicate={duplicateHero}
        onDelete={(c) => setPendingDelete(c)}
      />

      {/* Delete confirmation */}
      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        size="sm"
        title="Delete this hero?"
        description={
          pendingDelete
            ? `${pendingDelete.name || 'This hero'} will be permanently removed from your roster. This can't be undone.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </>
        }
      />
    </PageShell>
  );
}

interface QuickLinkProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: 'arcane' | 'mystic';
  onClick: () => void;
}

function QuickLink({ icon, title, description, accent, onClick }: QuickLinkProps) {
  const accents = {
    arcane: {
      hover: 'hover:border-arcane/50',
      icon: 'text-arcane-soft group-hover:border-arcane/50',
      title: 'group-hover:text-arcane-soft',
    },
    mystic: {
      hover: 'hover:border-mystic/50',
      icon: 'text-mystic-soft group-hover:border-mystic/50',
      title: 'group-hover:text-mystic-soft',
    },
  }[accent];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={cn(
        'group flex items-center gap-4 rounded-xl border border-line bg-surface/60 px-5 py-4 text-left backdrop-blur-xl transition-colors duration-300 tap-highlight-none focus-visible:outline-none',
        accents.hover,
      )}
    >
      <span
        className={cn(
          'grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line-strong bg-void/50 transition-colors duration-300 [&_svg]:h-5 [&_svg]:w-5',
          accents.icon,
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block font-display text-base font-semibold tracking-wide text-ink transition-colors duration-300',
            accents.title,
          )}
        >
          {title}
        </span>
        <span className="block text-xs text-ink-muted">{description}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint transition-all duration-300 group-hover:translate-x-1" />
    </motion.button>
  );
}
