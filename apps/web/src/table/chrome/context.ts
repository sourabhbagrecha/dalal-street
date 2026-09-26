import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ChatMessage } from '@monopoly-deal/shared';
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

/** The server said no to a command; the text shows for a moment above the tray. */
export interface ToastPort {
  text: string | null;
  clear(): void;
}

export interface ChromeInput {
  feed: FeedRow[];
  /** Connection to the server; leave out where there is none (the /scratchpad mock). */
  net?: { status: NetStatus; roomCode?: string | null };
  chat?: ChatPort | null;
  /** /demo's dev drawer, shown as a third tab. */
  dev?: ReactNode;
  toast?: ToastPort | null;
}

export interface ChromeValue {
  feed: FeedRow[];
  net: { status: NetStatus; roomCode: string | null } | null;
  chat: ChatPort | null;
  dev: ReactNode;
  toast: ToastPort | null;
  open: boolean;
  tab: SheetTab;
  openSheet(tab?: SheetTab): void;
  closeSheet(): void;
  setTab(tab: SheetTab): void;
  /** Lines and chat messages the viewer has not looked at yet (their own do not count). */
  unread: { feed: number; chat: number; total: number };
}

export const ChromeCtx = createContext<ChromeValue | null>(null);

/** The surrounding chrome, or null when the screen is rendered bare (never inside TableScreen, which supplies one). */
export function useChrome(): ChromeValue | null {
  return useContext(ChromeCtx);
}
