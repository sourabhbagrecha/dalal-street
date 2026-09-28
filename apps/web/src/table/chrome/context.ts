import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ChatMessage, Reaction, ReactionKind } from '@monopoly-deal/shared';
import type { FeedRow } from './rows';

/** Everything around the table that is not the table: feed/chat/dev sheet, connection banner, rejected-command toast. */

export type NetStatus = 'idle' | 'connecting' | 'connected' | 'error';
export type SheetTab = 'feed' | 'chat' | 'dev';

/** Table chat. Only networked rooms have one, so the tab is hidden while this is absent. */
export interface ChatPort {
  messages: ChatMessage[];
  /** The viewer's player id, to tell their lines from everyone else's. */
  selfId: string | null;
  /** False until the room holds a seat for this tab (input stays disabled). */
  online: boolean;
  send(text: string): Promise<{ ok: boolean }>;
}

/** Table reactions: faces a seat throws at the table. Absent where the adapter has no room to throw them in. */
export interface ReactionPort {
  /** The viewer's player id: their own reactions show the moment they are thrown, so the room's echo is skipped. */
  selfId: string | null;
  send(kind: ReactionKind): void;
  subscribe(listener: (reaction: Reaction) => void): () => void;
}

/** The server said no to a command; the text shows for a moment above the tray. Also reused for the
 * "you're next" cue (same shape: a transient line plus a way to dismiss it early). */
export interface ToastPort {
  text: string | null;
  clear(): void;
}

export interface ChromeInput {
  feed: FeedRow[];
  /** Connection to the server; leave out where there is none. */
  net?: { status: NetStatus; roomCode?: string | null };
  chat?: ChatPort | null;
  reactions?: ReactionPort | null;
  /** /demo's dev drawer, shown as a third tab. */
  dev?: ReactNode;
  toast?: ToastPort | null;
  /** Advance notice that the viewer's turn is coming up next. */
  youreNext?: ToastPort | null;
}

export interface ChromeValue {
  feed: FeedRow[];
  net: { status: NetStatus; roomCode: string | null } | null;
  chat: ChatPort | null;
  reactions: ReactionPort | null;
  dev: ReactNode;
  toast: ToastPort | null;
  youreNext: ToastPort | null;
  open: boolean;
  tab: SheetTab;
  openSheet(tab?: SheetTab): void;
  closeSheet(): void;
  setTab(tab: SheetTab): void;
  /** Chat messages the viewer has not looked at yet (their own do not count). The game log is never counted. */
  unread: number;
}

export const ChromeCtx = createContext<ChromeValue | null>(null);

/** The surrounding chrome, or null outside a `TableChrome`. */
export function useChrome(): ChromeValue | null {
  return useContext(ChromeCtx);
}
