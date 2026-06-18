import { useCallback } from 'react';
import { useUIStore } from '@/store';

/** Returns a callback that copies the room code to the clipboard and toasts. */
export function useCopyRoomCode(roomCode: string | null) {
  const pushToast = useUIStore((s) => s.pushToast);
  return useCallback(async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      pushToast({ title: 'Room code copied', body: roomCode, tone: 'arcane' });
    } catch {
      pushToast({ title: 'Copy failed', body: `Code: ${roomCode}`, tone: 'warn' });
    }
  }, [roomCode, pushToast]);
}
