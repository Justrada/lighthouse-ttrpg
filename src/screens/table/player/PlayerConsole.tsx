import { AnimatePresence, motion } from 'framer-motion';
import { Hourglass, Swords, ScrollText, UserX, Skull } from 'lucide-react';
import {
  Panel,
  PanelHeader,
  Badge,
  EmptyState,
  Spinner,
} from '@/components/ui';
import { GlowOrb } from '@/components/atmosphere';
import { CharacterSheet } from '@/components/character';
import {
  useSessionStore,
  useCombatStore,
  useMyCombatant,
  usePlayerCombatants,
  useNpcCombatants,
} from '@/store';
import { HexBoard, StagedActions, CombatLog, PhaseBanner } from '../combat';
import { PartyStatus } from './PartyStatus';
import { PendingCheckPrompt } from './PendingCheckPrompt';

/** The player's console — their hero, the party, prompts, and the battle. */
export function PlayerConsole() {
  const activeCharacter = useSessionStore((s) => s.activeCharacter);
  const party = useSessionStore((s) => s.party);
  const pendingCheck = useSessionStore((s) => s.pendingCheck);
  const combat = useCombatStore((s) => s.combat);

  const myCombatant = useMyCombatant();
  const players = usePlayerCombatants();
  const npcs = useNpcCombatants();

  const inCombat = combat.isActive;
  const combatants = [...players, ...npcs];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <GlowOrb tone="mystic" size={380} bottom="-10%" right="-8%" intensity={0.1} />

      {/* Main column */}
      <div className="flex flex-col gap-4">
        {/* Pending check rises to the top when present */}
        <AnimatePresence>
          {pendingCheck && (
            <motion.div
              key={pendingCheck.id}
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -8, height: 0 }}
            >
              <PendingCheckPrompt check={pendingCheck} character={activeCharacter} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Combat stage / waiting state */}
        {inCombat ? (
          <>
            <Panel padded className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-arcane/40 bg-arcane/10 text-arcane-soft">
                  <Swords className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-wide text-ink">
                    The Battle
                  </h2>
                  <PhaseBanner round={combat.round} phase={combat.phase} className="mt-0.5" />
                </div>
              </div>
              {myCombatant?.isDead ? (
                <Badge tone="danger" icon={<Skull />}>Fallen</Badge>
              ) : myCombatant?.isUnconscious ? (
                <Badge tone="warn" icon={<UserX />}>Unconscious</Badge>
              ) : null}
            </Panel>

            <Panel padded>
              <HexBoard
                activeActorId={myCombatant?.id ?? null}
                controllable={
                  combat.phase === 'declare' &&
                  !!myCombatant &&
                  !myCombatant.isDead &&
                  !myCombatant.isUnconscious
                }
              />
            </Panel>

            {/* Declaration (declare phase) or resolution view */}
            {combat.phase === 'declare' && myCombatant && !myCombatant.isDead && !myCombatant.isUnconscious ? (
              <Panel padded>
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-beam-soft">
                    Your Orders
                  </span>
                </div>
                <p className="mb-3 text-xs text-ink-muted">
                  Tap the battlefield to stage actions, then lock in. The round resolves once everyone is ready.
                </p>
                <StagedActions actorId={myCombatant.id} />
              </Panel>
            ) : combat.phase === 'declare' && myCombatant ? (
              <Panel padded>
                <EmptyState
                  size="sm"
                  icon={myCombatant.isDead ? <Skull /> : <UserX />}
                  title={myCombatant.isDead ? 'You have fallen' : 'You are unconscious'}
                  hint="You cannot act this round. The battle continues around you."
                />
              </Panel>
            ) : combat.phase === 'resolving' ? (
              <Panel padded className="flex flex-col items-center gap-3 py-8 text-center">
                <Spinner size="lg" tone="arcane" />
                <p className="font-display text-sm tracking-wide text-arcane-soft">
                  The round unfolds…
                </p>
              </Panel>
            ) : !myCombatant ? (
              <Panel padded>
                <EmptyState
                  size="sm"
                  icon={<Hourglass />}
                  title="Watching from the wings"
                  hint="You're not part of this fight. Follow along on the battlefield above."
                />
              </Panel>
            ) : null}

            {/* Log */}
            <Panel className="flex min-h-[14rem] flex-col">
              <PanelHeader
                title="Chronicle"
                leading={
                  <span className="grid h-9 w-9 place-items-center rounded-xl border border-beam/30 bg-beam/10 text-beam-soft">
                    <ScrollText className="h-4 w-4" />
                  </span>
                }
              />
              <CombatLog log={combat.log} className="m-3 max-h-72 flex-1" />
            </Panel>
          </>
        ) : (
          <Panel className="lh-ring">
            <EmptyState
              icon={<Hourglass />}
              title="Waiting for the GM to begin"
              hint="Ready your resolve. When the Game Master starts a battle, your console will spring to life."
            />
          </Panel>
        )}

        {/* Character sheet (full, at the bottom on mobile / main on desktop) */}
        {activeCharacter && (
          <Panel padded>
            <CharacterSheet character={activeCharacter} combatant={myCombatant} />
          </Panel>
        )}
      </div>

      {/* Side rail: party / battlefield status */}
      <div className="flex flex-col gap-4">
        <PartyStatus
          combatants={inCombat ? combatants : undefined}
          party={inCombat ? undefined : party}
          selfId={myCombatant?.id}
          className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]"
        />
      </div>
    </div>
  );
}
