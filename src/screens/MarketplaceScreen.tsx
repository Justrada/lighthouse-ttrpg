import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Store, Wand2, Power, Download, Upload, Tag, BadgeCheck, Info } from 'lucide-react';
import {
  PageShell,
  TopBar,
  Button,
  IconButton,
  Badge,
  EmptyState,
  Modal,
  Textarea,
} from '@/components/ui';
import { Wordmark } from '@/components/brand';
import { GlowOrb } from '@/components/atmosphere';
import { useWorldpackStore, useUIStore } from '@/store';
import { reskinCount, creatorPayout, platformCut } from '@/lib/worldpack';
import { WORLDFORGE_FEE_RATE } from '@/data/constants';
import type { Worldpack } from '@/types';
import { cn } from '@/lib/cn';

export default function MarketplaceScreen() {
  const navigate = useNavigate();
  const worldpacks = useWorldpackStore((s) => s.worldpacks);
  const activeId = useWorldpackStore((s) => s.activeId);
  const setActive = useWorldpackStore((s) => s.setActive);
  const save = useWorldpackStore((s) => s.save);
  const importPack = useWorldpackStore((s) => s.importPack);
  const pushToast = useUIStore((s) => s.pushToast);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const feePct = Math.round(WORLDFORGE_FEE_RATE * 100);

  const exportPack = (p: Worldpack) => {
    const json = JSON.stringify(p, null, 2);
    navigator.clipboard?.writeText(json).then(
      () => pushToast({ title: 'Copied to clipboard', body: `${p.name} exported as JSON — share or sell it.`, tone: 'success' }),
      () => pushToast({ title: 'Export', body: 'Copy failed; see console.', tone: 'warn' }),
    );
  };

  const doImport = () => {
    const pack = importPack(importText);
    if (pack) {
      pushToast({ title: 'System imported', body: `${pack.name} added to your library.`, tone: 'success' });
      setImportText('');
      setImportOpen(false);
    } else {
      pushToast({ title: 'Import failed', body: "That doesn't look like a valid worldpack JSON.", tone: 'danger' });
    }
  };

  const topBar = (
    <TopBar
      brand={
        <button type="button" onClick={() => navigate('/')} aria-label="LIGHTHOUSE home" className="rounded-lg tap-highlight-none focus-visible:outline-none">
          <Wordmark size="sm" tagline="Marketplace" />
        </button>
      }
      actions={
        <>
          <Button variant="ghost" size="sm" leftIcon={<Wand2 className="h-4 w-4" />} onClick={() => navigate('/worldforge')}>
            Worldforge
          </Button>
          <IconButton aria-label="Home" icon={<Home />} variant="ghost" size="md" onClick={() => navigate('/')} />
          <Button variant="primary" size="sm" leftIcon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
            Import
          </Button>
        </>
      }
    />
  );

  return (
    <PageShell topBar={topBar} maxWidth="2xl" contentClassName="px-4 py-8 sm:px-6 sm:py-10">
      <GlowOrb tone="mystic" size={420} top="-10%" right="-8%" intensity={0.16} />

      <header className="relative z-10 mb-6 max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-wide text-glow-mystic sm:text-4xl">Creator Marketplace</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Discover, activate, and share community <span className="text-ink">systems</span> — full reskins of the
          LIGHTHOUSE engine. Build one in the Worldforge, set a price, and list it; the platform facilitates the
          sale for a {feePct}% fee and you keep the rest.
        </p>
      </header>

      {/* Foundation notice */}
      <div className="relative z-10 mb-6 flex items-start gap-3 rounded-xl border border-mystic/30 bg-mystic/5 px-4 py-3 text-xs text-ink-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-mystic-soft" />
        <p>
          <span className="font-semibold text-ink">Foundation preview.</span> Systems live in your browser for now —
          export a pack to JSON to share it, and import others' packs below. Hosted payments and a global catalog are
          the next phase; the {feePct}% platform fee shown on each listing is how facilitation will work.
        </p>
      </div>

      <div className="relative z-10">
        {worldpacks.length === 0 ? (
          <div className="lh-panel lh-ring px-6 py-4">
            <EmptyState
              icon={<Store />}
              title="No systems in your library"
              hint="Create one in the Worldforge, or import a pack someone shared with you."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="primary" leftIcon={<Wand2 className="h-4 w-4" />} onClick={() => navigate('/worldforge')}>
                    Open Worldforge
                  </Button>
                  <Button variant="secondary" leftIcon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
                    Import a system
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {worldpacks.map((p) => {
              const active = p.id === activeId;
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex flex-col gap-3 rounded-2xl border bg-surface/60 p-4 backdrop-blur-xl transition-colors',
                    active ? 'border-mystic/60 shadow-glow-mystic' : 'border-line',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-base font-semibold text-ink">{p.name}</h3>
                      <p className="truncate text-xs text-ink-faint">{p.author ? `by ${p.author}` : 'unattributed'} · v{p.version}</p>
                    </div>
                    {p.published ? (
                      <Badge tone="success" variant="soft" size="sm"><BadgeCheck className="mr-1 h-3 w-3" />Listed</Badge>
                    ) : (
                      <Badge tone="neutral" variant="soft" size="sm">Draft</Badge>
                    )}
                  </div>

                  <p className="line-clamp-2 min-h-[2rem] text-xs text-ink-muted">{p.description || 'No description.'}</p>

                  <div className="flex items-center justify-between rounded-lg border border-line bg-void/40 px-2.5 py-1.5 text-xs">
                    <span className="flex items-center gap-1 font-semibold text-ink">
                      <Tag className="h-3.5 w-3.5 text-mystic-soft" />
                      {p.price > 0 ? `${p.price} cr` : 'Free'}
                    </span>
                    {p.price > 0 && (
                      <span className="text-ink-faint">
                        you keep <span className="text-ink">{creatorPayout(p.price)}</span> · fee {platformCut(p.price)}
                      </span>
                    )}
                  </div>

                  <span className="text-[0.7rem] font-mono text-ink-faint">{reskinCount(p)} reskins</span>

                  <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                    <Button
                      variant={active ? 'ghost' : 'primary'}
                      size="sm"
                      leftIcon={<Power className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setActive(active ? null : p.id);
                        pushToast({ title: active ? 'Reverted to base system' : `Playing with ${p.name}`, tone: 'arcane' });
                      }}
                    >
                      {active ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        save({ ...p, published: !p.published });
                        pushToast({ title: p.published ? 'Unlisted' : 'Listed for sale', body: p.published ? undefined : `${p.name} is now listed at ${p.price > 0 ? `${p.price} cr` : 'free'}.`, tone: 'arcane' });
                      }}
                    >
                      {p.published ? 'Unlist' : 'List'}
                    </Button>
                    <IconButton aria-label="Export" icon={<Download />} variant="ghost" size="sm" onClick={() => exportPack(p)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        size="md"
        title="Import a system"
        description="Paste a worldpack JSON (exported from any Worldforge) to add it to your library."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" leftIcon={<Upload className="h-4 w-4" />} disabled={!importText.trim()} onClick={doImport}>
              Import
            </Button>
          </>
        }
      >
        <Textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={10}
          placeholder='{ "name": "My System", "reskins": { ... } }'
          className="font-mono text-xs"
        />
      </Modal>
    </PageShell>
  );
}
