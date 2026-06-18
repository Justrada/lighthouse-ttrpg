import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Swords, Wand2, Dices, Play, Flag, ScrollText, ShieldQuestion } from 'lucide-react';
import {
  Panel,
  PanelHeader,
  Button,
  Badge,
  EmptyState,
  Spinner,
} from '@/components/ui';
import { GlowOrb } from '@/components/atmosphere';
import { useSessionStore, useCombatStore } from '@/store';
import type { Combatant } from '@/types';
import { CombatBoard, CombatLog, PhaseBanner } from '../combat';
import { PartyPanel } from './PartyPanel';
import { StartCombatModal } from './StartCombatModal';
import { RequestCheckModal } from './RequestCheckModal';
import { GMToolsDrawer } from './GMToolsDrawer';
import { NpcActionPanel } from './NpcActionPanel';

/** The Game Master's command center — party oversight + combat direction. */
export function GMConsole() {
  const party = useSessionStore((s) => s.party);
  const combat = useCombatStore((s) => s.combat);
  const allLocked = useCombatStore((s) => s.allLocked);
  const resolveRound = useCombatStore((s) => s.resolveRound);
  const endCombat = useCombatStore((s) => s.endCombat);

  const [startOpen, setStartOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsTarget, setToolsTarget] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const inCombat = combat.isActive;
  const npcs = combat.combatants.filter((c) => c.team === 'npc' && !c.isDead);
  const ready = allLocked();

  // Keep the local "resolving" guard in sync with the store phase.
  useEffect(() => {
    if (combat.phase !== 'resolving') setResolving(false);
  }, [combat.phase]);

  const handleResolve = async (force = false) => {
    if (resolving || (!ready && !force)) return;
    setResolving(true);
    await resolveRound();
    setResolving(false);
  };

  const openToolsFor = (c: Combatant) => {
    setToolsTarget(c.id);
    setToolsOpen(true);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <GlowOrb tone="arcane" size={420} top="-12%" left="-10%" intensity={0.12} />

      {/* Left rail: party + log */}
      <div className="flex flex-col gap-4">
        <PartyPanel party={party} className="lg:max-h-[26rem]" />

        {inCombat && (
          <Panel className="flex min-h-[16rem] flex-col lg:max-h-[24rem]">
            <PanelHeader
              title="Chronicle"
              leading={
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-beam/30 bg-beam/10 text-beam-soft">
                  <ScrollText className="h-4 w-4" />
                </span>
              }
            />
            <CombatLog log={combat.log} className="m-3 flex-1" />
          </Panel>
        )}
      </div>

      {/* Main stage */}
      <div className="flex flex-col gap-4">
        {/* Command bar */}
        <Panel padded className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-beam/40 bg-beam/10 text-beam-soft">
              <Swords className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold tracking-wide text-ink">
                Game Master
              </h2>
              {inCombat ? (
                <PhaseBanner round={combat.round} phase={combat.phase} className="mt-0.5" />
              ) : (
                <p className="text-xs text-ink-muted">The table awaits your word.</p>
              )}
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<ShieldQuestion className="h-4 w-4" />}
              onClick={() => setCheckOpen(true)}
              disabled={party.length === 0}
            >
              Request Check
            </Button>
            {inCombat && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Wand2 className="h-4 w-4" />}
                onClick={() => {
                  setToolsTarget(null);
                  setToolsOpen(true);
                }}
              >
                GM Tools
              </Button>
            )}
            {inCombat ? (
              <Button
                variant="danger"
                size="sm"
                leftIcon={<Flag className="h-4 w-4" />}
                onClick={endCombat}
              >
                End Combat
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Swords className="h-4 w-4" />}
                onClick={() => setStartOpen(true)}
              >
                Begin Combat
              </Button>
            )}
          </div>
        </Panel>

        {/* Stage body */}
        {!inCombat ? (
          <Panel className="lh-ring">
            <EmptyState
              icon={<Dices />}
              title="No battle underway"
              hint="When the story turns to steel, gather the heroes and their foes to begin combat. Until then, you can still call for skill checks."
              action={
                <Button
                  variant="primary"
                  leftIcon={<Swords className="h-4 w-4" />}
                  onClick={() => setStartOpen(true)}
                >
                  Begin Combat
                </Button>
              }
            />
          </Panel>
        ) : (
          <>
            <Panel padded>
              <CombatBoard
                combat={combat}
                selectable
                selectedId={toolsTarget}
                onSelect={openToolsFor}
              />
              <p className="mt-3 text-center text-xs text-ink-faint">
                Tap any combatant to open GM Tools for them.
              </p>
            </Panel>

            {/* NPC declarations + resolve */}
            <Panel padded>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-ink-faint">
                  Foe Orders
                </h3>
                <Badge tone={ready ? 'success' : 'neutral'} variant="soft">
                  {ready ? 'All locked in' : 'Awaiting locks'}
                </Badge>
              </div>

              {combat.phase === 'resolving' ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <Spinner size="lg" tone="arcane" />
                  <p className="font-display text-sm tracking-wide text-arcane-soft">
                    The round unfolds…
                  </p>
                </div>
              ) : npcs.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-muted">
                  No foes to command. Lock the heroes in and resolve.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {npcs.map((c) => (
                    <NpcActionPanel key={c.id} combatant={c} combatants={combat.combatants} />
                  ))}
                </div>
              )}

              <AnimatePresence>
                {combat.phase === 'declare' && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-4"
                  >
                    <Button
                      variant="primary"
                      size="lg"
                      fullWidth
                      disabled={!ready || resolving}
                      loading={resolving}
                      leftIcon={<Play className="h-5 w-5" />}
                      onClick={() => handleResolve()}
                    >
                      {ready ? 'Resolve Round' : 'Waiting for everyone to lock in…'}
                    </Button>
                    {!ready && !resolving && (
                      <button
                        type="button"
                        onClick={() => handleResolve(true)}
                        className="mx-auto mt-2 block text-xs text-ink-faint underline-offset-2 transition-colors hover:text-beam-soft hover:underline"
                      >
                        Force resolve without waiting
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </Panel>
          </>
        )}
      </div>

      {/* Modals & drawers */}
      <StartCombatModal open={startOpen} onClose={() => setStartOpen(false)} party={party} />
      <RequestCheckModal open={checkOpen} onClose={() => setCheckOpen(false)} party={party} />
      <GMToolsDrawer
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        initialCombatantId={toolsTarget}
      />
    </div>
  );
}
