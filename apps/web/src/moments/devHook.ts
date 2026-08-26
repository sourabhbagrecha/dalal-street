/**
 * Dev-only console hook: `window.__MD_MOMENTS__.fire(kind, perspective)`
 * fabricates a realistic moment from whatever game is currently on screen and
 * runs it through the same ingest + flight-building path as a real event —
 * letting the UI phase (and the screenshot loop) preview every kind ×
 * perspective combination without having to actually play the game out.
 * Installed from `useTableMoments` only when `import.meta.env.DEV`.
 */
import type { Card, ClientGameState, PlayerBoard, PropertyColor } from '@monopoly-deal/shared';
import { synthesizeFaceCard } from './derive';
import { momentStore } from './store';
import type { Moment, MomentKind, MomentState, Perspective } from './types';

declare global {
  interface Window {
    __MD_MOMENTS__?: {
      fire: (kind: MomentKind, perspective: Perspective) => void;
      state: () => MomentState;
    };
  }
}

export interface DevMomentsHookDeps {
  getClientState: () => ClientGameState | null;
  runMoments: (moments: Moment[], viewerId: string) => void;
}

let fireSeq = 0;

function allPlayerIds(state: ClientGameState): string[] {
  return [state.you.id, ...state.players.map((p) => p.id)];
}

function otherPlayerIds(state: ClientGameState): string[] {
  return allPlayerIds(state).filter((id) => id !== state.viewerId);
}

function boardFor(state: ClientGameState, playerId: string): PlayerBoard | undefined {
  return playerId === state.you.id ? state.you.board : state.players.find((p) => p.id === playerId)?.board;
}

function pickPropertyCard(state: ClientGameState, playerId: string): Card | undefined {
  const board = boardFor(state, playerId);
  if (!board) return undefined;
  for (const set of board.sets) {
    if (set.cards.length > 0) return set.cards[0];
  }
  return board.bank[0];
}

function colorOfCard(card: Card | undefined): PropertyColor | undefined {
  if (!card) return undefined;
  if (card.kind === 'property') return card.color;
  if (card.kind === 'property_wild') return card.assignedColor ?? card.colors[0];
  return undefined;
}

/** Places the viewer in the requested role, picking a plausible other seat for the rest. */
function twoRoleIds(state: ClientGameState, perspective: Perspective): { actorId: string; targetId: string } {
  const others = otherPlayerIds(state);
  const first = others[0] ?? state.viewerId;
  const second = others.find((id) => id !== first) ?? first;
  if (perspective === 'actor') return { actorId: state.viewerId, targetId: first };
  if (perspective === 'spectator') return { actorId: first, targetId: second };
  return { actorId: first, targetId: state.viewerId };
}

/** For single-role kinds (`set_broken`): the viewer, unless spectating. */
function singleRoleId(state: ClientGameState, perspective: Perspective): string {
  if (perspective !== 'spectator') return state.viewerId;
  return otherPlayerIds(state)[0] ?? state.viewerId;
}

function fabricate(state: ClientGameState, kind: MomentKind, perspective: Perspective, id: number): Moment | undefined {
  const at = Date.now();
  const base = { id, witnessedBy: [] as string[], at };

  if (kind === 'set_broken') {
    const owner = singleRoleId(state, perspective);
    const set = boardFor(state, owner)?.sets.find((s) => s.cards.length > 0);
    return {
      ...base,
      kind,
      actorId: owner,
      targetIds: [owner],
      cards: [],
      faceCard: null,
      color: set?.color,
      reason: 'steal',
    };
  }

  const { actorId, targetId } = twoRoleIds(state, perspective);

  if (kind === 'action_cancelled') {
    return {
      ...base,
      kind,
      actorId,
      targetIds: [targetId],
      cards: [],
      faceCard: null,
      contestedType: 'sly_deal',
    };
  }

  if (kind === 'payment') {
    const card = pickPropertyCard(state, actorId);
    return {
      ...base,
      kind,
      actorId,
      targetIds: [targetId],
      cards: card ? [card] : [],
      faceCard: null,
      amount: 5,
    };
  }

  const amount = kind === 'debt_collector' ? 5 : kind === 'birthday' ? 2 : kind === 'rent' ? 8 : undefined;
  const isSteal = kind === 'sly_deal' || kind === 'forced_deal' || kind === 'deal_breaker';
  const stolen = isSteal ? pickPropertyCard(state, targetId) : undefined;
  const given = kind === 'forced_deal' ? pickPropertyCard(state, actorId) : undefined;

  return {
    ...base,
    kind,
    actorId,
    targetIds: [targetId],
    cards: stolen ? [stolen] : [],
    givenCard: given,
    faceCard: synthesizeFaceCard(kind),
    amount,
    color: colorOfCard(stolen),
    chain: kind === 'just_say_no' ? 1 : undefined,
    contestedType: kind === 'just_say_no' ? 'sly_deal' : undefined,
  };
}

export function installDevMomentsHook(deps: DevMomentsHookDeps): () => void {
  const api: NonNullable<Window['__MD_MOMENTS__']> = {
    fire(kind, perspective) {
      const state = deps.getClientState();
      if (!state) return;
      fireSeq += 1;
      const moment = fabricate(state, kind, perspective, -fireSeq);
      if (!moment) return;
      deps.runMoments([moment], state.viewerId);
    },
    state() {
      return momentStore.getState();
    },
  };

  window.__MD_MOMENTS__ = api;
  return () => {
    if (window.__MD_MOMENTS__ === api) delete window.__MD_MOMENTS__;
  };
}
