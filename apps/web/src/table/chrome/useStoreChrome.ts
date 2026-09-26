import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useGameStore, useStoreSnapshot } from '../../store';
import type { ChatPort, ChromeInput, ToastPort } from './context';
import { rowsFromLog } from './rows';

/**
 * The chrome's inputs from the live store: event log as feed rows, chat (only when the adapter has any: networked
 * rooms), connection state and rejected commands. Spread the result onto `<TableChrome>`.
 */
export function useStoreChrome({ room = false, dev }: { room?: boolean; dev?: ReactNode } = {}): ChromeInput {
  const snapshot = useStoreSnapshot();
  const api = useGameStore((a) => a);
  const { log, clientState, chatMessages, playerId, rejected, sseStatus, roomCode, playerToken, mode } = snapshot;
  const hasChat = typeof api.sendChat === 'function';
  const clearRejected = api.clearRejected;

  const feed = useMemo(() => rowsFromLog(log, clientState), [log, clientState]);
  const send = useCallback(async (text: string) => (await api.sendChat?.(text)) ?? { ok: false }, [api]);
  const online = mode === 'network' && Boolean(roomCode && playerToken);
  const chat = useMemo<ChatPort | null>(
    () => (hasChat ? { messages: chatMessages, selfId: playerId, online, send } : null),
    [hasChat, chatMessages, playerId, online, send],
  );
  const net = useMemo(() => ({ status: sseStatus, roomCode: room ? roomCode : null }), [sseStatus, roomCode, room]);
  const toast = useMemo<ToastPort>(() => ({ text: rejected, clear: clearRejected }), [rejected, clearRejected]);

  return { feed, net, chat, toast, dev };
}
