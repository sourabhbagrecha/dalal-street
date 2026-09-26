import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Card, ClientGameState, Command, PlayTarget, PlayZone } from '@monopoly-deal/shared';
import { canRearrangeProperties } from '../legality';
import type { CommandResult } from '../store/types';
import { getActiveAdapter, useStoreSnapshot } from '../store/useStore';
import { autoPaySelection } from './live/autopay';
import type { ConfirmIO, Held, PlayDeps } from './live/plays';
import { buildConfirm, heldStillValid, planPlay, planRearrange } from './live/plays';
import type { PromptDeps } from './live/prompts';
import { derivePrompt } from './live/prompts';
import { buildSeats } from './live/seats';
import type { Outgoing } from './live/sent';
import { ACK_GRACE_MS, acked, begin, failed, handLess, mayChangePhase, nextExpiry, spentPlays, waiting } from './live/sent';
import { TURN_SECS, deriveWait, pendingWindowSecs } from './live/status';
import { useSecondsLeft } from './live/useSecondsLeft';
import { useLiveEvents } from './liveEvents';
import type { Phase, Prompt, Sending, TableActions, TableGame } from './model';

interface LiveGameOptions {
  /** Deals a fresh game from the win screen (demo only); leave unset in a networked room. */
  restart?: () => void;
}

/** What the (stable) actions read at call time: the freshest render's view of the game. */
interface Latest {
  state: ClientGameState | null;
  prompt: Prompt | null;
  sending: Sending | null;
  restart?: () => void;
}

type SendPlay = (cardId: string, zone: PlayZone, target: PlayTarget | undefined, run: () => Promise<CommandResult>) => Promise<CommandResult>;

type SendAnswer = (kind: Sending, run: () => Promise<CommandResult>) => void;

/** A command of the viewer's that the server has not answered yet, and the projection it was sent against. */
interface Flight {
  kind: Sending;
  at: ClientGameState | null;
}

const isJsnCard = (c: Card): boolean => c.kind === 'action' && c.action === 'just_say_no';

/**
 * The real game as a `TableGame`: store snapshot (server projection + event log) in, view-model + actions out.
 * Null until the first projection arrives. Every action posts the same command the old UI posted, through the
 * store API — the only local state is what the viewer has picked but not yet sent (forced-deal give, payment and
 * discard selections, a held play awaiting its OK) and what they have sent but the server has not yet confirmed.
 *
 * That second part is presentation, never game state: a card just put down leaves `hand` at once (`sent`), and a
 * prompt just answered stops taking input (`sending`), so a slow network costs a beat of waiting rather than a card
 * that seems not to have moved. Both end the moment the projection speaks, or the command fails and they are undone.
 */
export function useLiveGame(opts?: LiveGameOptions): TableGame | null {
  const snap = useStoreSnapshot();
  const api = getActiveAdapter();
  const state = snap.clientState;
  const events = useLiveEvents(snap.log, state);

  const [give, setGive] = useState<string | null>(null);
  const [paySel, setPaySel] = useState<string[]>([]);
  const [discardSel, setDiscardSel] = useState<string[]>([]);
  const [held, setHeld] = useState<Held | null>(null);
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const [flight, setFlight] = useState<Flight | null>(null);
  /** `sendPlay`, as of the latest render, for the stable callbacks that cannot close over it. */
  const sendPlayRef = useRef<SendPlay>(async (_id, _zone, _target, run) => run());
  const sendAnswerRef = useRef<SendAnswer>((_kind, run) => void run());

  const pendingSecs = useSecondsLeft(state?.deadlines?.pendingMs);
  const turnSecs = useSecondsLeft(state?.deadlines?.turnMs);

  const promptDeps = useMemo<PromptDeps>(
    () => ({
      isCompleteSet: (set) => api.isCompleteSet(set),
      validatePayment: (payerId, amountDue, cardIds) => api.validatePayment(payerId, amountDue, cardIds),
    }),
    [api],
  );
  const playDeps = useMemo<PlayDeps>(
    () => ({
      getLegalPlayZones: (cardId) => api.getLegalPlayZones(cardId),
      pickPlayCommand: (cardId, zone, target) => api.pickPlayCommand(cardId, zone, target),
      wastedDiscardPlay: (cardId) => api.wastedDiscardPlay(cardId),
      isCompleteSet: (set) => api.isCompleteSet(set),
      removalCost: (cardId) => api.removalCost(cardId),
    }),
    [api],
  );
  const confirmIO = useMemo<ConfirmIO>(
    () => ({
      playCard: (cardId, zone, target) => {
        void sendPlayRef.current(cardId, zone, target, () => api.playCard(cardId, zone, target));
      },
      dispatchCommand: (type, payload) =>
        type === 'PLAY_CARD' && typeof payload?.cardId === 'string'
          ? sendPlayRef.current(payload.cardId, payload.zone as PlayZone, payload.target as PlayTarget | undefined, () => api.dispatchCommand(type, payload))
          : api.dispatchCommand(type, payload),
      pickPlayCommand: (cardId, zone, target) => api.pickPlayCommand(cardId, zone, target),
      send: (command) => api.send(command),
      rejectLocal: (message) => api.rejectLocal(message),
      isCompleteSet: (set) => api.isCompleteSet(set),
      clear: () => setHeld(null),
    }),
    [api],
  );

  const seats = useMemo(() => (state ? buildSeats(state) : null), [state]);
  const prompt = useMemo(
    () => (state ? derivePrompt(state, { give, paySel, discardSel }, promptDeps) : null),
    [state, give, paySel, discardSel, promptDeps],
  );
  const confirm = useMemo(() => (held && state ? buildConfirm(held, state, confirmIO) : null), [held, state, confirmIO]);

  // ── local picks live only as long as what they answer ──
  const viewerId = state?.viewerId ?? null;
  const promptKind = prompt?.kind ?? null;
  const targetAction = prompt?.kind === 'target' ? prompt.action : null;
  useEffect(() => {
    // A new viewer (pass-and-play seat switch, a fresh game) starts clean.
    setOutgoing([]);
    setFlight(null);
    setGive(null);
    setPaySel((s) => (s.length > 0 ? [] : s));
    setDiscardSel((s) => (s.length > 0 ? [] : s));
    setHeld(null);
  }, [viewerId]);
  useEffect(() => {
    if (targetAction !== 'forced_deal') setGive(null);
  }, [targetAction]);
  useEffect(() => {
    if (promptKind !== 'pay') setPaySel((s) => (s.length > 0 ? [] : s));
  }, [promptKind]);
  useEffect(() => {
    if (promptKind !== 'discard') setDiscardSel((s) => (s.length > 0 ? [] : s));
  }, [promptKind]);
  // A card can leave the hand while a confirmation sits open (an interrupt resolving, the clock, a seat switch):
  // drop the held play rather than let "Yes" fire a command for a card that is gone.
  useEffect(() => {
    if (held && (!state || !heldStillValid(held, state))) setHeld(null);
  }, [held, state]);

  // ── auto-draw: the viewer's turn starts with the draw, no click needed ──
  // Deck size is part of the key so a freshly dealt game (same seat, turn 1 again) still draws.
  const drawEnabled = state ? api.canDraw() : false;
  const turnKey = state ? `${state.currentPlayerId}:${state.turnNumber}:${state.deckCount}` : null;
  const autoDrawKey = useRef<string | null>(null);
  useEffect(() => {
    if (!drawEnabled || turnKey === null || autoDrawKey.current === turnKey) return;
    autoDrawKey.current = turnKey;
    api.draw();
  }, [drawEnabled, turnKey, api]);

  // ── actions: stable, reading the latest render at call time ──
  const latest = useRef<Latest>({ state: null, prompt: null, sending: null });
  const sending: Sending | null = flight && flight.at === state ? flight.kind : null;
  useLayoutEffect(() => {
    latest.current = { state, prompt, sending, restart: opts?.restart };
  });
  const hasRestart = Boolean(opts?.restart);

  // ── what has been sent and not yet confirmed (presentation only; see the header) ──
  const sent = useMemo(() => waiting(outgoing, state, Date.now()), [outgoing, state]);
  // The projection has spoken for a card (it left the server's hand): forget it.
  useEffect(() => {
    setOutgoing((list) => {
      const next = waiting(list, state, Date.now());
      return next.length === list.length ? list : next;
    });
    // A new projection is the answer to whatever was sent against the last one.
    setFlight((f) => (f && f.at !== state ? null : f));
  }, [state]);
  // A yes with no projection behind it for too long: hand the card back rather than leave it in limbo.
  useEffect(() => {
    const ms = nextExpiry(outgoing, Date.now());
    if (ms === null) return;
    const t = window.setTimeout(() => setOutgoing((list) => waiting(list, latest.current.state, Date.now())), ms + 20);
    return () => window.clearTimeout(t);
  }, [outgoing]);

  /**
   * Put a hand card down: it leaves the hand now, and comes back if the server refuses (or never hears). `run` is
   * the store call that sends it, so every path a play can take (a drop, a pill, a confirmation) shares this.
   */
  const sendPlay: SendPlay = async (cardId, zone, target, run) => {
    const card = latest.current.state?.you.hand.find((c) => c.id === cardId);
    if (!card) return run();
    const color = target?.assignedColor ?? (card.kind === 'property' ? card.color : undefined);
    setOutgoing((list) => begin(list, card, zone, color));
    const result = await run();
    setOutgoing((list) => (result.ok ? acked(list, cardId, Date.now()) : failed(list, cardId)));
    return result;
  };
  useLayoutEffect(() => {
    sendPlayRef.current = sendPlay;
    sendAnswerRef.current = sendAnswer;
  });

  /** The command out right now, read at once (state lands a render later): a double tap must not send twice. */
  const flightRef = useRef<Flight | null>(null);
  /** Send a command that answers a prompt, or ends the turn: the table treats it as done until the server says otherwise. */
  const sendAnswer: SendAnswer = (kind, run) => {
    const out = flightRef.current;
    if (out && out.at === latest.current.state) return;
    const flightNow: Flight = { kind, at: latest.current.state };
    flightRef.current = flightNow;
    setFlight(flightNow);
    const clear = () => {
      if (flightRef.current === flightNow) flightRef.current = null;
      setFlight((f) => (f === flightNow ? null : f));
    };
    void run().then((result) => {
      if (!result.ok) clear();
      // Told yes but the projection never comes (the stream is down): stop waiting for it.
      else window.setTimeout(clear, ACK_GRACE_MS);
    });
  };

  const actions = useMemo<TableActions>(() => {
    const ctx = () => latest.current;
    const answer = (command: Command) => sendAnswerRef.current('answer', () => api.send(command));
    const toggleDiscard = (cardId: string) => {
      const p = ctx().prompt;
      if (p?.kind !== 'discard') return;
      setDiscardSel((prev) => (prev.includes(cardId) ? prev.filter((id) => id !== cardId) : prev.length >= p.excess ? prev : [...prev, cardId]));
    };
    const ownsCard = (s: ClientGameState, cardId: string) => s.you.board.sets.some((set) => set.cards.some((c) => c.id === cardId));

    return {
      draw: () => {
        if (api.canDraw()) api.draw();
      },

      play: (cardId, zone, color) => {
        const s = ctx().state;
        if (!s) return;
        const plan = planPlay(s, playDeps, cardId, zone, color);
        switch (plan.kind) {
          case 'reject':
            api.rejectLocal(plan.message);
            return;
          case 'toggle-discard':
            toggleDiscard(plan.cardId);
            return;
          case 'hold':
            setHeld(plan.held);
            return;
          case 'send':
            setHeld(null);
            void sendPlayRef.current(cardId, plan.zone, plan.target, () => api.playCard(cardId, plan.zone, plan.target));
            return;
        }
      },

      target: (pick) => {
        const { state: s, prompt: p } = ctx();
        if (!s || p?.kind !== 'target') return;
        const me = s.viewerId;
        switch (p.action) {
          case 'sly_deal':
            if (!pick.cardId) return;
            if (!api.stealableProperties(me).some((o) => o.card.id === pick.cardId)) {
              api.rejectLocal('That property cannot be stolen');
              return;
            }
            answer({ type: 'SELECT_STEAL_TARGET', playerId: me, targetCardId: pick.cardId });
            return;
          case 'deal_breaker':
            if (pick.setId) answer({ type: 'SELECT_STEAL_TARGET', playerId: me, targetSetId: pick.setId });
            return;
          case 'debt_collector':
            if (pick.rivalId) answer({ type: 'SELECT_DEBT_COLLECTOR_PLAYER', playerId: me, targetPlayerId: pick.rivalId });
            return;
          case 'rent':
            if (pick.color) answer({ type: 'SELECT_RENT_COLOR', playerId: me, color: pick.color });
            return;
          case 'rent_player':
            if (pick.rivalId) answer({ type: 'SELECT_RENT_PLAYER', playerId: me, targetPlayerId: pick.rivalId });
            return;
          case 'forced_deal': {
            const cardId = pick.cardId;
            if (!cardId) return;
            // Your own property first (the one you give), then theirs; tapping another of yours while picking theirs re-picks the give.
            if (p.step === 'rival' && p.give && !ownsCard(s, cardId)) {
              if (!api.stealableProperties(me).some((o) => o.card.id === cardId)) {
                api.rejectLocal('That property cannot be swapped for');
                return;
              }
              answer({ type: 'SELECT_STEAL_TARGET', playerId: me, targetCardId: cardId, ownCardId: p.give });
              setGive(null);
              return;
            }
            if (!api.stealableProperties(me, true).some((o) => o.card.id === cardId)) {
              api.rejectLocal('You cannot trade that property away');
              return;
            }
            setGive(cardId);
            return;
          }
          case 'building':
            if (!pick.setId) return;
            if (!p.eligibleSets?.includes(pick.setId)) {
              api.rejectLocal(`This set cannot take a ${p.building ?? 'building'}`);
              return;
            }
            answer({ type: 'SELECT_BUILDING_SET', playerId: me, setId: pick.setId });
            return;
        }
      },

      endTurn: () => {
        if (api.canEndTurn()) sendAnswerRef.current('end', () => api.endTurn());
      },

      discard: toggleDiscard,

      discardConfirm: () => {
        const { state: s, prompt: p } = ctx();
        if (!s || p?.kind !== 'discard' || p.sel.length !== p.excess) return;
        // Keep the marks until the server moves the game on (the prompt going away clears them), so the tray does not
        // flash back to "0 of N" for the round trip; a rejected discard leaves them for another try.
        answer({ type: 'DISCARD_EXCESS', playerId: s.viewerId, cardIds: p.sel });
      },

      resumePlay: () => {
        const { state: s, prompt: p } = ctx();
        if (!s || p?.kind !== 'discard' || !p.canResume) return;
        answer({ type: 'RESUME_PLAY', playerId: s.viewerId });
      },

      paySel: (cardId) => {
        const p = ctx().prompt;
        if (p?.kind !== 'pay' || !p.assets.some((c) => c.id === cardId)) return;
        setPaySel((prev) => (prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]));
      },

      payAuto: () => {
        const { state: s, prompt: p } = ctx();
        if (!s || p?.kind !== 'pay') return;
        setPaySel(
          autoPaySelection(
            s.you.board,
            (set) => api.isCompleteSet(set),
            (ids) => api.validatePayment(s.viewerId, p.amount, ids),
          ),
        );
      },

      payConfirm: () => {
        const { state: s, prompt: p } = ctx();
        if (!s || p?.kind !== 'pay' || !api.validatePayment(s.viewerId, p.amount, p.sel)) return;
        // The ticks stay until the server moves the game on (the prompt going away clears them); a refusal leaves them for another try.
        answer({ type: 'SELECT_PAYMENT', playerId: s.viewerId, cardIds: p.sel });
      },

      jsn: (cardId) => {
        const { state: s, prompt: p } = ctx();
        if (!s || p?.kind !== 'jsn') return;
        const card = cardId ? s.you.hand.find((c) => c.id === cardId) : s.you.hand.find(isJsnCard);
        if (!card) {
          api.rejectLocal('You have no Just Say No to play');
          return;
        }
        answer({ type: 'RESPOND_JUST_SAY_NO', playerId: s.viewerId, cardId: card.id });
      },

      allow: () => {
        const { state: s, prompt: p } = ctx();
        if (!s || p?.kind !== 'jsn') return;
        answer({ type: 'DECLINE_JUST_SAY_NO', playerId: s.viewerId });
      },

      rearrange: (cardId, toColor) => {
        const s = ctx().state;
        if (!s) return;
        const plan = planRearrange(s, playDeps, cardId, toColor);
        switch (plan.kind) {
          case 'reject':
            api.rejectLocal(plan.message);
            return;
          case 'noop':
            return;
          case 'hold':
            setHeld(plan.held);
            return;
          case 'send':
            api.send({ type: 'REARRANGE_PROPERTY', playerId: s.viewerId, cardId, toColor, toSetId: plan.toSetId });
            return;
        }
      },

      // No `cancel`: the engine has no way back out of a target choice; the clock forfeits it.
      reset: hasRestart ? () => ctx().restart?.() : undefined,
    };
  }, [api, playDeps, hasRestart]);

  const wait = useMemo(() => (state ? deriveWait(state, prompt) : null), [state, prompt]);

  const secs = pendingSecs ?? turnSecs;
  const onPendingClock = state?.deadlines?.pendingMs !== undefined;
  const windowSecs = state && onPendingClock ? (pendingWindowSecs(state) ?? 30) : TURN_SECS;
  const maxSecs = Math.max(windowSecs, secs ?? 0);

  const { beat, fx, feed } = events;

  return useMemo<TableGame | null>(() => {
    if (!state || !seats) return null;
    const mine = state.currentPlayerId === state.viewerId;
    const phase: Phase = mine ? (state.turnPhase === 'awaiting_draw' ? 'draw' : 'play') : 'rivals';
    return {
      me: seats.me,
      rivals: seats.rivals,
      hand: handLess(state.you.hand, sent),
      sent,
      sending,
      deck: state.deckCount,
      discardTop: state.discardTop,
      discardCount: state.discardCount,
      turn: state.currentPlayerId,
      phase,
      plays: Math.max(0, state.playsRemaining - spentPlays(sent)),
      prompt,
      confirm,
      wait,
      secs,
      maxSecs,
      feed,
      fx,
      beat,
      won: state.winnerId,
      // Cards already put down count against the plays; one that may open a prompt (or pass the turn) holds the rest back.
      canAct:
        mine &&
        state.turnPhase === 'playing' &&
        state.playsRemaining > spentPlays(sent) &&
        !state.winnerId &&
        state.pendingStack.every((p) => p.kind === 'double_rent_pending') &&
        !mayChangePhase(sent) &&
        sending !== 'end',
      hasJsn: state.you.hand.some(isJsnCard),
      canRearrange: canRearrangeProperties(state, state.viewerId),
      actions,
    };
  }, [state, seats, sent, sending, prompt, confirm, wait, secs, maxSecs, feed, fx, beat, actions]);
}
