import { useMemo, useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home,
  Plus,
  Wand2,
  Store,
  Save,
  Trash2,
  Copy,
  Download,
  Power,
  Search,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import {
  PageShell,
  TopBar,
  Button,
  IconButton,
  Input,
  Textarea,
  Badge,
  EmptyState,
  SegmentedControl,
  Divider,
} from '@/components/ui';
import { Wordmark } from '@/components/brand';
import { GlowOrb } from '@/components/atmosphere';
import { useWorldpackStore, useUIStore } from '@/store';
import { skillNodes, allWorldItems } from '@/data/skillTree';
import { RESKINNABLE_TERMS } from '@/data/constants';
import { createEmptyWorldpack, reskinCount, creatorPayout, platformCut } from '@/lib/worldpack';
import type { ReskinEntry, Worldpack } from '@/types';
import { cn } from '@/lib/cn';
import { ContentSection } from './worldforge/ContentSection';

type Section = 'details' | 'terms' | 'skills' | 'items' | 'create' | 'preview';
const SECTIONS: { value: Section; label: string }[] = [
  { value: 'details', label: 'Details' },
  { value: 'terms', label: 'Terms' },
  { value: 'skills', label: 'Skills' },
  { value: 'items', label: 'Items' },
  { value: 'create', label: 'Create' },
  { value: 'preview', label: 'Preview' },
];

/** A base entity to reskin (skill node or item) + its current overrides. */
interface ReskinTarget {
  id: string;
  baseName: string;
  baseDescription: string;
}

const SKILL_TARGETS: ReskinTarget[] = skillNodes
  .filter((n) => !n.isCenter)
  .map((n) => ({
    id: n.id,
    baseName: n.linkedItem?.name ?? n.label,
    baseDescription: n.linkedItem?.description ?? n.description ?? '',
  }));

const ITEM_TARGETS: ReskinTarget[] = allWorldItems.map((i) => ({
  id: i.id,
  baseName: i.name,
  baseDescription: i.description ?? '',
}));

export default function WorldforgeScreen() {
  const navigate = useNavigate();
  const worldpacks = useWorldpackStore((s) => s.worldpacks);
  const activeId = useWorldpackStore((s) => s.activeId);
  const [editing, setEditing] = useState<Worldpack | null>(null);

  if (editing) {
    return (
      <PackEditor
        key={editing.id}
        initial={editing}
        isActive={activeId === editing.id}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <PackList
      packs={worldpacks}
      activeId={activeId}
      onNew={() => setEditing(createEmptyWorldpack())}
      onEdit={(p) => setEditing(p)}
      onHome={() => navigate('/')}
      onMarket={() => navigate('/marketplace')}
    />
  );
}

// ---------------------------------------------------------------------------
// List of saved systems
// ---------------------------------------------------------------------------

interface PackListProps {
  packs: Worldpack[];
  activeId: string | null;
  onNew: () => void;
  onEdit: (p: Worldpack) => void;
  onHome: () => void;
  onMarket: () => void;
}

function PackList({ packs, activeId, onNew, onEdit, onHome, onMarket }: PackListProps) {
  const setActive = useWorldpackStore((s) => s.setActive);
  const duplicate = useWorldpackStore((s) => s.duplicate);
  const remove = useWorldpackStore((s) => s.remove);
  const pushToast = useUIStore((s) => s.pushToast);

  const exportPack = (p: Worldpack) => {
    const json = JSON.stringify(p, null, 2);
    navigator.clipboard?.writeText(json).then(
      () => pushToast({ title: 'Copied to clipboard', body: `${p.name} exported as JSON.`, tone: 'success' }),
      () => pushToast({ title: 'Export', body: json.slice(0, 80) + '…', tone: 'arcane' }),
    );
  };

  const topBar = (
    <TopBar
      brand={
        <button type="button" onClick={onHome} aria-label="LIGHTHOUSE home" className="rounded-lg tap-highlight-none focus-visible:outline-none">
          <Wordmark size="sm" tagline="Worldforge" />
        </button>
      }
      actions={
        <>
          <Button variant="ghost" size="sm" leftIcon={<Store className="h-4 w-4" />} onClick={onMarket}>
            Marketplace
          </Button>
          <IconButton aria-label="Home" icon={<Home />} variant="ghost" size="md" onClick={onHome} />
          <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={onNew}>
            New System
          </Button>
        </>
      }
    />
  );

  return (
    <PageShell topBar={topBar} maxWidth="2xl" contentClassName="px-4 py-8 sm:px-6 sm:py-10">
      <GlowOrb tone="arcane" size={420} top="-10%" right="-8%" intensity={0.16} />
      <header className="relative z-10 mb-7 max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-wide text-glow-arcane sm:text-4xl">Worldforge</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Build your own <span className="text-ink">system</span> on the LIGHTHOUSE engine — rename and
          re-describe every stat, skill, ability, and item to theme the whole game your way. The rules and
          balance stay identical, so your reskins are safe to share and sell on the marketplace.
        </p>
      </header>

      <div className="relative z-10">
        {packs.length === 0 ? (
          <div className="lh-panel lh-ring px-6 py-4">
            <EmptyState
              icon={<Wand2 />}
              title="No systems yet"
              hint="Forge your first system — rename Mind/Body/Soul, turn 'Fireball' into 'Hadouken', reskin the gear — then activate it to play your way or list it on the marketplace."
              action={
                <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={onNew}>
                  Create your first system
                </Button>
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {packs.map((p) => {
              const active = p.id === activeId;
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex flex-col gap-3 rounded-2xl border bg-surface/60 p-4 backdrop-blur-xl transition-colors',
                    active ? 'border-arcane/60 shadow-glow-arcane' : 'border-line',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-base font-semibold text-ink">{p.name}</h3>
                      <p className="truncate text-xs text-ink-faint">
                        {p.author ? `by ${p.author}` : 'unattributed'} · v{p.version}
                      </p>
                    </div>
                    {active && <Badge tone="arcane" variant="soft" size="sm">Active</Badge>}
                  </div>
                  {p.description && <p className="line-clamp-2 text-xs text-ink-muted">{p.description}</p>}
                  <div className="flex flex-wrap items-center gap-2 text-[0.7rem] text-ink-faint">
                    <span className="rounded bg-void/50 px-1.5 py-0.5 font-mono">{reskinCount(p)} reskins</span>
                    <span className="rounded bg-void/50 px-1.5 py-0.5 font-mono">{p.price > 0 ? `${p.price} cr` : 'free'}</span>
                    {p.published && <Badge tone="success" variant="soft" size="sm">Listed</Badge>}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                    <Button variant="secondary" size="sm" onClick={() => onEdit(p)}>Edit</Button>
                    <Button
                      variant={active ? 'ghost' : 'primary'}
                      size="sm"
                      leftIcon={<Power className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setActive(active ? null : p.id);
                        pushToast({ title: active ? 'Reverted to base system' : `${p.name} activated`, tone: 'arcane' });
                      }}
                    >
                      {active ? 'Deactivate' : 'Activate'}
                    </Button>
                    <IconButton aria-label="Export" icon={<Download />} variant="ghost" size="sm" onClick={() => exportPack(p)} />
                    <IconButton aria-label="Duplicate" icon={<Copy />} variant="ghost" size="sm" onClick={() => duplicate(p.id)} />
                    <IconButton aria-label="Delete" icon={<Trash2 />} variant="ghost" size="sm" onClick={() => remove(p.id)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

interface PackEditorProps {
  initial: Worldpack;
  isActive: boolean;
  onClose: () => void;
}

function PackEditor({ initial, isActive, onClose }: PackEditorProps) {
  const save = useWorldpackStore((s) => s.save);
  const setActive = useWorldpackStore((s) => s.setActive);
  const pushToast = useUIStore((s) => s.pushToast);

  const [draft, setDraft] = useState<Worldpack>(() => structuredClone(initial));
  const [section, setSection] = useState<Section>('details');
  const [query, setQuery] = useState('');

  const patch = useCallback((p: Partial<Worldpack>) => setDraft((d) => ({ ...d, ...p })), []);

  const setReskin = useCallback(
    (kind: 'nodes' | 'items', id: string, entry: ReskinEntry) => {
      setDraft((d) => {
        const map = { ...d.reskins[kind] };
        const merged = { ...map[id], ...entry };
        // Treat a whitespace-only override as empty (matches save-time cleaning)
        // so the reskin count and "renamed" marker don't lie.
        if (!merged.name?.trim() && !merged.description?.trim()) delete map[id];
        else map[id] = merged;
        return { ...d, reskins: { ...d.reskins, [kind]: map } };
      });
    },
    [],
  );

  const setTerm = useCallback((key: string, value: string) => {
    setDraft((d) => {
      const terms = { ...d.reskins.terms };
      if (value.trim()) terms[key] = value;
      else delete terms[key];
      return { ...d, reskins: { ...d.reskins, terms } };
    });
  }, []);

  const doSave = (alsoActivate = false) => {
    const name = draft.name.trim() || 'Untitled System';
    const finalized = { ...draft, name };
    save(finalized);
    if (alsoActivate) setActive(finalized.id);
    pushToast({ title: 'System saved', body: alsoActivate ? `${name} is now active.` : `${name} saved.`, tone: 'success' });
    onClose();
  };

  const topBar = (
    <TopBar
      brand={
        <button type="button" onClick={onClose} aria-label="Back to Worldforge" className="flex items-center gap-2 rounded-lg tap-highlight-none focus-visible:outline-none">
          <ArrowLeft className="h-4 w-4 text-ink-muted" />
          <Wordmark size="sm" tagline="Editing system" />
        </button>
      }
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" size="sm" leftIcon={<Power className="h-4 w-4" />} onClick={() => doSave(true)}>
            Save & Activate
          </Button>
          <Button variant="primary" size="sm" leftIcon={<Save className="h-4 w-4" />} onClick={() => doSave(false)}>
            Save
          </Button>
        </>
      }
    />
  );

  const targets = section === 'skills' ? SKILL_TARGETS : ITEM_TARGETS;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((t) => t.baseName.toLowerCase().includes(q));
  }, [targets, query]);

  return (
    <PageShell topBar={topBar} maxWidth="2xl" contentClassName="px-4 py-6 sm:px-6 sm:py-8">
      <GlowOrb tone="arcane" size={380} top="-10%" left="-8%" intensity={0.12} />

      <div className="relative z-10 mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-arcane/40 bg-arcane/10 text-arcane-soft">
          <Wand2 className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-semibold text-ink">{draft.name || 'Untitled System'}</h1>
          <p className="text-xs text-ink-faint">{reskinCount(draft)} reskins{isActive ? ' · active' : ''}</p>
        </div>
      </div>

      <div className="relative z-10 mb-5">
        <SegmentedControl
          value={section}
          onChange={(v) => {
            setSection(v as Section);
            setQuery(''); // the search box is shared; clear it when changing sections
          }}
          options={SECTIONS}
        />
      </div>

      <div className="relative z-10 space-y-4">
        {section === 'details' && <DetailsSection draft={draft} patch={patch} />}

        {section === 'terms' && (
          <div className="space-y-5">
            {(['Core Stat', 'Resource', 'Skill'] as const).map((group) => (
              <div key={group}>
                <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">{group}s</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {RESKINNABLE_TERMS.filter((t) => t.group === group).map((t) => (
                    <label key={t.key} className="flex items-center gap-3 rounded-xl border border-line bg-surface/40 px-3 py-2">
                      <span className="w-24 shrink-0 truncate text-sm text-ink-muted">{t.label}</span>
                      <Input
                        value={draft.reskins.terms[t.key] ?? ''}
                        placeholder={t.label}
                        maxLength={60}
                        onChange={(e) => setTerm(t.key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {(section === 'skills' || section === 'items') && (
          <div className="space-y-3">
            <Input
              leftIcon={<Search />}
              placeholder={`Search ${section}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <p className="text-xs text-ink-faint">{filtered.length} {section}</p>
            <div className="space-y-2">
              {filtered.map((t) => (
                <ReskinRow
                  key={t.id}
                  target={t}
                  entry={draft.reskins[section === 'skills' ? 'nodes' : 'items'][t.id]}
                  onChange={(entry) => setReskin(section === 'skills' ? 'nodes' : 'items', t.id, entry)}
                />
              ))}
            </div>
          </div>
        )}

        {section === 'create' && <ContentSection draft={draft} setDraft={setDraft} />}

        {section === 'preview' && <PreviewSection draft={draft} />}
      </div>
    </PageShell>
  );
}

function DetailsSection({ draft, patch }: { draft: Worldpack; patch: (p: Partial<Worldpack>) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Labeled label="System name">
        <Input value={draft.name} placeholder="Untitled System" maxLength={80} onChange={(e) => patch({ name: e.target.value })} />
      </Labeled>
      <Labeled label="Author">
        <Input value={draft.author} placeholder="Your name / handle" onChange={(e) => patch({ author: e.target.value })} />
      </Labeled>
      <Labeled label="Description" className="sm:col-span-2">
        <Textarea
          value={draft.description}
          placeholder="What's the theme? Sci-fi? Mythic? Grimdark?"
          rows={3}
          maxLength={600}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </Labeled>
      <Labeled label="Version">
        <Input value={draft.version} placeholder="1.0.0" onChange={(e) => patch({ version: e.target.value })} />
      </Labeled>
      <Labeled label="Price (credits, 0 = free)">
        <Input
          type="number"
          min={0}
          mono
          value={String(draft.price)}
          onChange={(e) => patch({ price: Math.max(0, Math.min(1_000_000, Math.trunc(Number(e.target.value) || 0))) })}
        />
      </Labeled>
      {draft.price > 0 && (
        <div className="rounded-xl border border-line bg-surface/40 px-3 py-2 text-xs text-ink-muted sm:col-span-2">
          On a sale you'd earn <span className="font-semibold text-ink">{creatorPayout(draft.price)} cr</span> — the
          platform keeps <span className="text-ink">{platformCut(draft.price)} cr</span> (15%) to facilitate.
        </div>
      )}
    </div>
  );
}

function Labeled({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</span>
      {children}
    </label>
  );
}

const ReskinRow = memo(function ReskinRow({
  target,
  entry,
  onChange,
}: {
  target: ReskinTarget;
  entry: ReskinEntry | undefined;
  onChange: (entry: ReskinEntry) => void;
}) {
  const renamed = Boolean(entry?.name || entry?.description);
  return (
    <div className={cn('rounded-xl border bg-surface/40 p-3', renamed ? 'border-arcane/40' : 'border-line')}>
      <div className="mb-2 flex items-center gap-2">
        <span className="truncate text-xs text-ink-faint">base: {target.baseName}</span>
        {renamed && <Sparkles className="h-3 w-3 shrink-0 text-arcane-soft" />}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <Input
          value={entry?.name ?? ''}
          placeholder={target.baseName}
          maxLength={120}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <Input
          value={entry?.description ?? ''}
          placeholder={target.baseDescription || 'Custom description…'}
          maxLength={600}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>
    </div>
  );
});

function PreviewSection({ draft }: { draft: Worldpack }) {
  const stat = (key: string, base: string) => draft.reskins.terms[key]?.trim() || base;
  const sampleSkills = SKILL_TARGETS.slice(0, 6);
  const sampleItems = ITEM_TARGETS.slice(0, 4);
  return (
    <div className="space-y-5">
      <Divider label="Core terms" />
      <div className="flex flex-wrap gap-2">
        {RESKINNABLE_TERMS.map((t) => (
          <span key={t.key} className="rounded-lg border border-line bg-surface/50 px-2.5 py-1 text-xs">
            <span className="text-ink-faint">{t.label}</span>
            <span className="mx-1 text-ink-faint">→</span>
            <span className="font-semibold text-arcane-soft">{stat(t.key, t.label)}</span>
          </span>
        ))}
      </div>
      <Divider label="Sample reskins" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[...sampleSkills, ...sampleItems].map((t) => {
          const isSkill = sampleSkills.includes(t);
          const e = draft.reskins[isSkill ? 'nodes' : 'items'][t.id];
          return (
            <div key={t.id} className="rounded-xl border border-line bg-surface/40 p-3">
              <p className="text-xs text-ink-faint line-through">{t.baseName}</p>
              <p className="font-display text-sm font-semibold text-ink">{e?.name?.trim() || t.baseName}</p>
              <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{e?.description?.trim() || t.baseDescription}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
