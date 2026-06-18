import { useNavigate, Navigate } from 'react-router-dom';
import { Copy, LogOut, Crown, Swords } from 'lucide-react';
import {
  PageShell,
  TopBar,
  Badge,
  Button,
  IconButton,
  Tooltip,
} from '@/components/ui';
import { LighthouseMark } from '@/components/brand';
import { useSessionStore } from '@/store';
import type { ConnectionStatus } from '@/types';
import { GMConsole } from './table/gm';
import { PlayerConsole } from './table/player';
import { useCopyRoomCode } from './table/shared/useCopyRoomCode';

const statusTone: Record<ConnectionStatus, 'success' | 'warn' | 'danger' | 'neutral'> = {
  idle: 'neutral',
  connecting: 'warn',
  connected: 'success',
  reconnecting: 'warn',
  disconnected: 'danger',
  error: 'danger',
};

const statusLabel: Record<ConnectionStatus, string> = {
  idle: 'Offline',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
  error: 'Error',
};

/**
 * The live session table. Redirects home when there's no active session;
 * otherwise renders the GM or player console under a shared bar carrying the
 * brand, room code (copy-to-clipboard), connection status, and Leave.
 */
export default function TableScreen() {
  const navigate = useNavigate();
  const role = useSessionStore((s) => s.role);
  const roomCode = useSessionStore((s) => s.roomCode);
  const status = useSessionStore((s) => s.status);
  const copyRoomCode = useCopyRoomCode(roomCode);

  // No active session → back to the start.
  if (!role || status === 'idle') {
    return <Navigate to="/" replace />;
  }

  const leave = () => {
    useSessionStore.getState().leave();
    navigate('/');
  };

  const isGM = role === 'gm';

  const topBar = (
    <TopBar
      brand={
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="LIGHTHOUSE home"
          className="flex items-center gap-2 rounded-lg tap-highlight-none focus-visible:outline-none"
        >
          <LighthouseMark size={28} />
          <span className="hidden font-display text-sm font-semibold tracking-widest text-ink sm:inline">
            LIGHTHOUSE
          </span>
        </button>
      }
      center={
        roomCode ? (
          <Tooltip content="Copy room code">
            <button
              type="button"
              onClick={copyRoomCode}
              className="group inline-flex items-center gap-2 rounded-xl border border-line bg-void/60 px-3 py-1.5 transition-colors hover:border-beam/40 focus-visible:outline-none"
            >
              <span className="text-[0.625rem] uppercase tracking-widest text-ink-faint">Room</span>
              <span className="font-mono text-sm font-bold tracking-[0.2em] text-beam-soft">
                {roomCode}
              </span>
              <Copy className="h-3.5 w-3.5 text-ink-faint transition-colors group-hover:text-beam" />
            </button>
          </Tooltip>
        ) : undefined
      }
      actions={
        <>
          <Badge
            tone={isGM ? 'beam' : 'arcane'}
            variant="soft"
            size="sm"
            icon={isGM ? <Crown /> : <Swords />}
            className="hidden sm:inline-flex"
          >
            {isGM ? 'Game Master' : 'Adventurer'}
          </Badge>
          <Badge tone={statusTone[status]} variant="soft" size="sm" dot>
            {statusLabel[status]}
          </Badge>
          <span className="hidden sm:inline-flex">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<LogOut className="h-4 w-4" />}
              onClick={leave}
            >
              Leave
            </Button>
          </span>
          <span className="inline-flex sm:hidden">
            <IconButton
              aria-label="Leave table"
              icon={<LogOut />}
              variant="ghost"
              size="sm"
              onClick={leave}
            />
          </span>
        </>
      }
    />
  );

  return (
    <PageShell topBar={topBar} maxWidth="2xl" contentClassName="px-3 py-4 sm:px-6 sm:py-6">
      {isGM ? <GMConsole /> : <PlayerConsole />}
    </PageShell>
  );
}
