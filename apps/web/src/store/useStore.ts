import { useSyncExternalStore } from 'react';
import type { FixtureName } from '@monopoly-deal/engine';
import type { Command, PlayTarget, PlayZone, PropertySet } from '@monopoly-deal/shared';
import type { GameStoreApi, StoreSnapshot } from './types';
import { createDemoAdapter } from './demoAdapter';
import { createLocalAdapter } from './localAdapter';
import { createNetworkAdapter } from './networkAdapter';

let localAdapter: GameStoreApi | null = null;
let networkAdapter: GameStoreApi | null = null;
let demoAdapter: GameStoreApi | null = null;
let activeAdapter: GameStoreApi | null = null;

export function getLocalAdapter(): GameStoreApi {
  if (!localAdapter) localAdapter = createLocalAdapter();
  return localAdapter;
}

export function getNetworkAdapter(): GameStoreApi {
  if (!networkAdapter) networkAdapter = createNetworkAdapter();
  return networkAdapter;
}

export function getDemoAdapter(): GameStoreApi {
  if (!demoAdapter) demoAdapter = createDemoAdapter();
  return demoAdapter;
}

export function setActiveAdapter(adapter: GameStoreApi) {
  activeAdapter = adapter;
}

export function getActiveAdapter(): GameStoreApi {
  if (!activeAdapter) {
    activeAdapter = getNetworkAdapter();
  }
  return activeAdapter;
}

function subscribeAdapter(listener: () => void) {
  return getActiveAdapter().subscribe(listener);
}

function getAdapterSnapshot(): StoreSnapshot {
  return getActiveAdapter().getSnapshot();
}

export function useStoreSnapshot(): StoreSnapshot {
  return useSyncExternalStore(subscribeAdapter, getAdapterSnapshot, getAdapterSnapshot);
}

export function useGameStore<T>(selector: (api: GameStoreApi) => T): T {
  const snapshot = useStoreSnapshot();
  void snapshot;
  return selector(getActiveAdapter());
}

export type { LogEntry, StoreSnapshot, GameStoreApi } from './types';

// Convenience selectors
export function selectClientState(s: StoreSnapshot) {
  return s.clientState;
}

export function selectYou(s: StoreSnapshot) {
  return s.clientState?.you;
}

export function selectRejected(s: StoreSnapshot) {
  return s.rejected;
}

export function selectLog(s: StoreSnapshot) {
  return s.log;
}

export function selectRoom(s: StoreSnapshot) {
  return s.room;
}

// Re-export adapter actions for direct use
export function useStoreActions() {
  const api = getActiveAdapter();
  return {
    draw: () => api.draw(),
    endTurn: () => api.endTurn(),
    playCard: (cardId: string, zone: PlayZone, target?: PlayTarget) =>
      api.playCard(cardId, zone, target),
    send: (command: Command) => api.send(command),
    dispatchCommand: api.dispatchCommand.bind(api),
    rejectLocal: (msg: string) => api.rejectLocal(msg),
    clearRejected: () => api.clearRejected(),
    getLegalPlayZones: (cardId: string) => api.getLegalPlayZones(cardId),
    canDraw: () => api.canDraw(),
    canEndTurn: () => api.canEndTurn(),
    pickPlayCommand: api.pickPlayCommand.bind(api),
    validatePayment: api.validatePayment.bind(api),
    stealableProperties: api.stealableProperties.bind(api),
    isCompleteSet: (set: PropertySet) => api.isCompleteSet(set),
    removalCost: (cardId: string) => api.removalCost(cardId),
    wastedDiscardPlay: (cardId: string) => api.wastedDiscardPlay(cardId),
    setSeat: api.setSeat?.bind(api),
    startNewGame: api.startNewGame?.bind(api),
    loadFixture: api.loadFixture?.bind(api) as ((name: FixtureName) => void) | undefined,
    createRoom: api.createRoom?.bind(api),
    joinRoom: api.joinRoom?.bind(api),
    startGame: api.startGame?.bind(api),
    leaveRoom: api.leaveRoom?.bind(api),
    reconnect: api.reconnect?.bind(api),
    sendChat: api.sendChat?.bind(api),
  };
}
