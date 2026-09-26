import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChromeCtx } from './context';
import type { ChromeInput, ChromeValue, SheetTab } from './context';
import type { FeedRow } from './rows';

/**
 * Owns the feed sheet's state (open, tab, what has been read) for as long as it is mounted. The pages mount it *around*
 * `TableScreen`, so the sheet — and the dev drawer in it — survives the table unmounting while /demo deals a new room.
 */
export function TableChrome({ feed, net, chat, reactions, dev, toast, children }: ChromeInput & { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SheetTab>('feed');
  // Newest log id / chat count the viewer has looked at. Local on purpose: nothing else reads it.
  const [seenFeed, setSeenFeed] = useState(0);
  const [seenChat, setSeenChat] = useState(0);

  const feedMax = feed.length > 0 ? feed[feed.length - 1]!.id : 0;
  const chatCount = chat?.messages.length ?? 0;
  const activeTab: SheetTab = tab === 'chat' && !chat ? 'feed' : tab === 'dev' && !dev ? 'feed' : tab;

  // Reading clears; a log or chat that restarted (new game, new room) is unread again from its start.
  useEffect(() => {
    const reading = open && activeTab === 'feed';
    setSeenFeed((prev) => (reading ? feedMax : Math.min(prev, feedMax)));
  }, [open, activeTab, feedMax]);
  useEffect(() => {
    const reading = open && activeTab === 'chat';
    setSeenChat((prev) => (reading ? chatCount : Math.min(prev, chatCount)));
  }, [open, activeTab, chatCount]);

  const openSheet = useCallback((to?: SheetTab) => {
    if (to) setTab(to);
    setOpen(true);
  }, []);
  const closeSheet = useCallback(() => setOpen(false), []);

  const unread = useMemo(() => {
    const f = feed.filter((r: FeedRow) => r.id > seenFeed && r.tone !== 'you').length;
    const c = chat ? chat.messages.slice(seenChat).filter((m) => m.playerId !== chat.selfId).length : 0;
    return { feed: f, chat: c, total: f + c };
  }, [feed, chat, seenFeed, seenChat]);

  const value = useMemo<ChromeValue>(
    () => ({
      feed,
      net: net ? { status: net.status, roomCode: net.roomCode ?? null } : null,
      chat: chat ?? null,
      reactions: reactions ?? null,
      dev: dev ?? null,
      toast: toast ?? null,
      open,
      tab: activeTab,
      openSheet,
      closeSheet,
      setTab,
      unread,
    }),
    [feed, net, chat, reactions, dev, toast, open, activeTab, openSheet, closeSheet, unread],
  );

  return <ChromeCtx.Provider value={value}>{children}</ChromeCtx.Provider>;
}
