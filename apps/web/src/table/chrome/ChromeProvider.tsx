import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChromeCtx } from './context';
import type { ChromeInput, ChromeValue, SheetTab } from './context';

/**
 * Owns the feed sheet's state (open, tab, what has been read) for as long as it is mounted. The pages mount it *around*
 * `TableScreen`, so the sheet — and the dev drawer in it — survives the table unmounting while /demo deals a new room.
 */
export function TableChrome({
  feed,
  net,
  chat,
  reactions,
  dev,
  toast,
  youreNext,
  children,
}: ChromeInput & { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SheetTab>('chat');
  // Chat count the viewer has looked at. Local on purpose: nothing else reads it. Only chat is counted; the game log never is.
  const [seenChat, setSeenChat] = useState(0);

  const chatCount = chat?.messages.length ?? 0;
  const activeTab: SheetTab = tab === 'chat' && !chat ? 'feed' : tab === 'dev' && !dev ? 'feed' : tab;

  // Reading clears; a chat that restarted (new room) is unread again from its start.
  useEffect(() => {
    const reading = open && activeTab === 'chat';
    setSeenChat((prev) => (reading ? chatCount : Math.min(prev, chatCount)));
  }, [open, activeTab, chatCount]);

  const openSheet = useCallback((to?: SheetTab) => {
    setTab(to ?? 'chat');
    setOpen(true);
  }, []);
  const closeSheet = useCallback(() => setOpen(false), []);

  const unread = useMemo(
    () => (chat ? chat.messages.slice(seenChat).filter((m) => m.playerId !== chat.selfId).length : 0),
    [chat, seenChat],
  );

  const value = useMemo<ChromeValue>(
    () => ({
      feed,
      net: net ? { status: net.status, roomCode: net.roomCode ?? null } : null,
      chat: chat ?? null,
      reactions: reactions ?? null,
      dev: dev ?? null,
      toast: toast ?? null,
      youreNext: youreNext ?? null,
      open,
      tab: activeTab,
      openSheet,
      closeSheet,
      setTab,
      unread,
    }),
    [feed, net, chat, reactions, dev, toast, youreNext, open, activeTab, openSheet, closeSheet, unread],
  );

  return <ChromeCtx.Provider value={value}>{children}</ChromeCtx.Provider>;
}
