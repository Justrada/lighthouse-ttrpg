import { Dices } from 'lucide-react';
import { ToastViewport, Drawer, DiceTray, DiceResult } from '@/components/ui';
import { useUIStore, performRoll } from '@/store';

/**
 * App-level chrome rendered above every screen: toast notifications and a
 * floating dice tray wired to the shared roll feed + network broadcast.
 */
export function AppOverlays() {
  const toasts = useUIStore((s) => s.toasts);
  const dismissToast = useUIStore((s) => s.dismissToast);
  const trayOpen = useUIStore((s) => s.diceTrayOpen);
  const toggleDiceTray = useUIStore((s) => s.toggleDiceTray);
  const rollFeed = useUIStore((s) => s.rollFeed);

  return (
    <>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} position="top-right" />

      <button
        type="button"
        aria-label="Open dice tray"
        onClick={() => toggleDiceTray()}
        className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full border border-beam/40 bg-surface-raised/90 text-beam-soft shadow-glow-beam backdrop-blur transition hover:scale-105 hover:shadow-glow-beam-lg tap-highlight-none"
      >
        <Dices className="h-6 w-6" />
      </button>

      <Drawer open={trayOpen} onClose={() => toggleDiceTray(false)} side="right" title="Dice Tray">
        <DiceTray
          allowSecret
          quickModifiers={[-1, 0, 1, 2, 3]}
          onRoll={(notation, mode, secret) => {
            const trimmed = notation.trim();
            const m = /^\s*1?d20\s*([+-]\s*\d+)?\s*$/i.exec(trimmed);
            // Advantage/disadvantage only applies to a d20. Route to the d20 path
            // for a d20 notation OR an empty input (the "roll a d20 with advantage"
            // case); any other notation (e.g. 2d6+3) keeps its dice instead of
            // being silently replaced by a d20.
            if (m || trimmed === '') {
              const modifier = m && m[1] ? parseInt(m[1].replace(/\s+/g, ''), 10) : 0;
              performRoll({ d20: { mode, modifier }, secret });
            } else {
              performRoll({ notation, secret });
            }
          }}
        />

        <div className="mt-5 space-y-3">
          <h4 className="text-xs uppercase tracking-widest text-ink-faint">Recent rolls</h4>
          {rollFeed.length === 0 && <p className="text-sm text-ink-faint">No rolls yet — cast the bones.</p>}
          {rollFeed.slice(0, 8).map((r, i) => (
            <div key={i} className="rounded-lg border border-line bg-void/40 p-2">
              <div className="mb-1 text-xs text-ink-faint">{r.roller}</div>
              <DiceResult result={r} dieSize={28} />
            </div>
          ))}
        </div>
      </Drawer>
    </>
  );
}
