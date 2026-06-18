import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  User,
  Gem,
  Swords,
  Backpack as BackpackIcon,
  Sparkles,
} from 'lucide-react';
import { useDraftStore, useRosterStore, useUIStore } from '@/store';
import { PageShell, TopBar, Tabs, Button, IconButton } from '@/components/ui';
import type { TabItem } from '@/components/ui';
import { Wordmark } from '@/components/brand';
import {
  IdentitySection,
  StatsSection,
  SkillTreeSection,
  EquipmentSection,
  LivePreview,
} from './forge';

type ForgeTab = 'identity' | 'stats' | 'skills' | 'equipment';

const TABS: TabItem<ForgeTab>[] = [
  { value: 'identity', label: 'Identity', icon: <User /> },
  { value: 'stats', label: 'Stats', icon: <Gem /> },
  { value: 'skills', label: 'Skill Tree', icon: <Swords /> },
  { value: 'equipment', label: 'Equipment', icon: <BackpackIcon /> },
];

export default function ForgeScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const draft = useDraftStore((s) => s.draft);
  const pushToast = useUIStore((s) => s.pushToast);
  const [tab, setTab] = useState<ForgeTab>('identity');

  // --- Mount: load existing by id, or start fresh ---
  useEffect(() => {
    const store = useDraftStore.getState();
    if (id) {
      if (store.draft?.id !== id) {
        const existing = useRosterStore.getState().get(id);
        if (existing) {
          store.editExisting(existing);
        } else {
          // Unknown id — fall back to a fresh hero on the bare /forge route.
          store.startNew();
          navigate('/forge', { replace: true });
        }
      }
    } else if (!store.draft) {
      store.startNew();
    }
    // Run once on mount / when the route id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = () => {
    const saved = useDraftStore.getState().commit();
    if (saved) {
      pushToast({
        title: 'Hero forged',
        body: `${saved.name} joined your roster.`,
        tone: 'success',
      });
      navigate('/roster');
    } else {
      pushToast({ title: 'Nothing to save', tone: 'warn' });
    }
  };

  const handleDiscard = () => {
    useDraftStore.getState().discard();
    navigate('/roster');
  };

  if (!draft) {
    return (
      <PageShell center>
        <div className="flex flex-col items-center gap-3 text-center">
          <Sparkles className="h-8 w-8 animate-pulse text-beam" />
          <p className="text-ink-muted">Kindling the Forge…</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      maxWidth="2xl"
      contentClassName="pb-24"
      topBar={
        <TopBar
          brand={
            <button
              type="button"
              onClick={handleDiscard}
              aria-label="Leave the Forge"
              className="flex items-center gap-2 rounded-lg focus-visible:outline-none"
            >
              <Wordmark size="sm" />
            </button>
          }
          actions={
            <>
              <IconButton
                aria-label="Discard and leave"
                variant="ghost"
                icon={<ArrowLeft />}
                onClick={handleDiscard}
                className="sm:hidden"
              />
              <Button
                variant="ghost"
                leftIcon={<ArrowLeft />}
                onClick={handleDiscard}
                className="hidden sm:inline-flex"
              >
                Discard
              </Button>
              <Button variant="primary" leftIcon={<Save />} onClick={handleSave}>
                Save Hero
              </Button>
            </>
          }
        />
      }
    >
      {/* Title */}
      <div className="mb-5 flex items-center gap-3">
        <h1 className="font-display text-2xl text-glow-beam sm:text-3xl">
          Character Forge
        </h1>
        <span className="hidden text-sm text-ink-faint sm:inline">
          {id ? 'Editing your hero' : 'Forge a new hero'}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
        {/* LEFT — live preview */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <LivePreview />
        </aside>

        {/* RIGHT — working area */}
        <section className="min-w-0">
          <div className="lh-panel p-4 sm:p-6">
            <Tabs
              value={tab}
              onChange={setTab}
              items={TABS}
              variant="pill"
              fullWidth
              aria-label="Forge sections"
              className="mb-5"
            />

            {tab === 'identity' && <IdentitySection />}
            {tab === 'stats' && <StatsSection />}
            {tab === 'skills' && <SkillTreeSection />}
            {tab === 'equipment' && <EquipmentSection />}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
