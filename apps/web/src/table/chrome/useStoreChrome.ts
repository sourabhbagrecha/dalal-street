import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useGameStore, useStoreSnapshot } from '../../store';
import type { ChatPort, ChromeInput, ReactionPort, ToastPort } from './context';
import { rowsFromLog } from './rows';

/**
 * The chrome's inputs from the live store: event log as feed rows, chat (only when the adapter has any: networked
 * rooms), table reactions (networked rooms and /demo), connection state and rejected commands. Spread the result onto `<TableChrome>`.
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
  const reactions = useMemo<ReactionPort | null>(() => {
    const { sendReaction, onReaction } = api;
    if (!sendReaction || !onReaction) return null;
    return { selfId: playerId, send: (kind) => sendReaction(kind), subscribe: (listener) => onReaction(listener) };
  }, [api, playerId]);
  const net = useMemo(() => ({ status: sseStatus, roomCode: room ? roomCode : null }), [sseStatus, roomCode, room]);
  const toast = useMemo<ToastPort>(() => ({ text: rejected, clear: clearRejected }), [rejected, clearRejected]);

  return { feed, net, chat, reactions, toast, dev };
}
