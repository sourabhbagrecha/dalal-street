import { useEffect, useMemo, useReducer, useState } from 'react';
import type { ActionType, Card, PropertyColor, PropertySet } from '@monopoly-deal/shared';
import { PROPERTY_SET_DEFS } from '@monopoly-deal/shared';
import { theme } from '../../theme';
import type { Beat, Confirm, FeedItem, Fx, Phase, Prompt, Seat, TableGame, TargetKind, Zone } from '../../table/model';
import { ACTION_VALUE, HAND_LIMIT, bankTotal, buildColors, cardName, completeCount, isComplete, rentFor, stateName, zonesFor } from '../../table/model';

/**
 * A tiny, fully client-side stand-in for the game that feeds the same `TableScreen` the real game does
 * (see table/model.ts). It plays one whole loop — draw → play up to 3 → end turn → rivals act → an
 * interruption aimed at you (pay, or Just Say No) → draw — with just enough rules to make each gesture
 * land. It is NOT the engine and shares nothing with it.
 */

/** The mock's own, simpler prompt shapes; `useMockGame` widens them into the table's `Prompt`. */
type MockPrompt =
  | { kind: 'target'; cardId: string; action: Exclude<TargetKind, 'rent_player' | 'forced_deal' | 'building'> }
  | { kind: 'pay'; toId: string; amount: number; reason: string; sel: string[] }
  | { kind: 'jsn'; fromId: string; card: Card; label: string }
  | { kind: 'discard'; excess: number };
type Bare<T> = T extends unknown ? Omit<T, 'id'> : never;

interface State {
  me: Seat;
  rivals: Seat[];
  hand: Card[];
  deck: number;
  drawn: number;
  discard: Card[];
  turn: string;
  phase: Phase;
  plays: number;
  prompt: MockPrompt | null;
  secs: number;
  cycle: number;
  rivalIdx: number;
  feed: FeedItem[];
  fx: Fx | null;
  beat: Beat | null;
  won: string | null;
  seq: number;
}

// ── card + set helpers ───────────────────────────────────────────────────────

let uid = 0;
const nid = (p: string) => `${p}${++uid}`;

const money = (amount: number): Card => ({ id: nid('m'), kind: 'money', amount, value: amount });
const prop = (color: PropertyColor, i = 0): Card => {
  const def = PROPERTY_SET_DEFS[color];
  return { id: nid('p'), kind: 'property', color, value: def.value, name: def.names[i] ?? def.names[0]! };
};
const wild = (colors: PropertyColor[]): Card => ({ id: nid('w'), kind: 'property_wild', colors, value: 2 });
const action = (a: ActionType): Card => ({ id: nid('a'), kind: 'action', action: a, value: ACTION_VALUE[a] });
const rent = (colors: [PropertyColor, PropertyColor]): Card => ({
  id: nid('r'),
  kind: 'rent',
  rentType: 'dual',
  colors,
  value: 1,
});
const mkSet = (color: PropertyColor, count: number, extra?: Partial<PropertySet>): PropertySet => ({
  id: nid('s'),
  color,
  cards: Array.from({ length: count }, (_, i) => prop(color, i)),
  ...extra,
});

function addProperty(sets: PropertySet[], card: Card, color: PropertyColor) {
  const placed: Card = card.kind === 'property_wild' ? { ...card, assignedColor: color } : card;
  const at = sets.findIndex((s) => s.color === color && !isComplete(s));
  let set: PropertySet;
  let next: PropertySet[];
  if (at >= 0) {
    set = { ...sets[at]!, cards: [...sets[at]!.cards, placed] };
    next = sets.map((s, i) => (i === at ? set : s));
  } else {
    set = { id: nid('s'), color, cards: [placed] };
    next = [...sets, set];
  }
  return { sets: next, set, completed: isComplete(set) };
}

function removeCard(sets: PropertySet[], cardId: string) {
  let found: Card | undefined;
  const next = sets
    .map((s) => {
      const hit = s.cards.find((c) => c.id === cardId);
      if (!hit) return s;
      found = hit;
      return { ...s, cards: s.cards.filter((c) => c.id !== cardId) };
    })
    .filter((s) => s.cards.length > 0);
  return { sets: next, card: found };
}

const colorOf = (card: Card): PropertyColor =>
  card.kind === 'property' ? card.color : card.kind === 'property_wild' ? (card.assignedColor ?? card.colors[0]!) : 'brown';

/** Take up to `amount` from a seat's bank, smallest notes first. */
function take(bank: Card[], amount: number) {
  const sorted = [...bank].sort((a, b) => a.value - b.value);
  const taken: Card[] = [];
  let sum = 0;
  for (const c of sorted) {
    if (sum >= amount) break;
    taken.push(c);
    sum += c.value;
  }
  const ids = new Set(taken.map((c) => c.id));
  return { taken, rest: bank.filter((c) => !ids.has(c.id)), sum };
}

const DRAWS: (() => Card)[] = [
  () => prop('red', 2),
  () => money(2),
  () => action('debt_collector'),
  () => prop('pink', 1),
  () => action('pass_go'),
  () => money(3),
  () => wild(['light_blue', 'brown']),
  () => money(5),
  () => action('its_my_birthday'),
  () => prop('orange', 1),
];

// ── initial table ────────────────────────────────────────────────────────────

function seat(i: number, name: string, extra: Partial<Seat>): Seat {
  return {
    id: name.toLowerCase(),
    name,
    color: theme.opponentColor(i),
    ink: theme.opponentTextColor(i),
    handCount: 4,
    connected: true,
    bank: [],
    sets: [],
    ...extra,
  };
}

/** Sets for `?mine=N`: a pile of sets on your seat, to see the seat when it is crowded. */
const crowd = (n: number): PropertySet[] =>
  ([['brown', 2], ['light_blue', 3], ['pink', 1], ['orange', 2], ['red', 1], ['yellow', 2], ['green', 3], ['dark_blue', 1], ['railroad', 2], ['utility', 1], ['brown', 1], ['pink', 2]] as [PropertyColor, number][])
    .slice(0, n)
    .map(([color, count]) => mkSet(color, count));

function initial({ cycle = 0, rivals: rivalCount = 4, mine = 0 }: { cycle?: number; rivals?: number; mine?: number } = {}): State {
  const me: Seat = {
    id: 'you',
    name: 'You',
    color: theme.selfColor,
    ink: theme.selfTextColor,
    handCount: 7,
    connected: true,
    bank: [money(1), money(3), money(2), money(5)],
    sets: mine ? crowd(mine) : [mkSet('brown', 2), mkSet('light_blue', 2), mkSet('pink', 1)],
  };
  const allRivals: Seat[] = [
    seat(0, 'Priya', { handCount: 5, bank: [money(3), money(1), money(4)], sets: [mkSet('railroad', 2), mkSet('orange', 1)] }),
    seat(1, 'Marcus', {
      handCount: 4,
      bank: [money(5), money(2)],
      sets: [mkSet('dark_blue', 2, { house: action('house') }), mkSet('yellow', 1)],
    }),
    seat(2, 'Yuki', { handCount: 3, connected: false, bank: [money(1), money(1)] }),
    seat(3, 'Alex', {
      handCount: 6,
      bank: [money(10), money(2), money(3), money(1), money(5)],
      sets: [mkSet('green', 3, { hotel: action('hotel') }), mkSet('utility', 2), mkSet('red', 2)],
    }),
  ];
  const rivals = allRivals.slice(0, Math.max(1, Math.min(4, rivalCount)));
  const hand: Card[] = [
    prop('light_blue', 2),
    money(4),
    wild(['pink', 'orange']),
    action('sly_deal'),
    rent(['light_blue', 'brown']),
    action('just_say_no'),
    action('deal_breaker'),
  ];
  return {
    me,
    rivals,
    hand,
    deck: 62,
    drawn: 0,
    discard: [action('debt_collector')],
    turn: 'you',
    phase: 'play',
    plays: 3,
    prompt: null,
    secs: 60,
    cycle,
    rivalIdx: 0,
    feed: [
      { id: 1, tone: 'rival', who: 'Alex', text: 'played Debt Collector on Marcus' },
      { id: 2, tone: 'sys', who: '', text: 'Your turn' },
    ],
    fx: null,
    beat: null,
    won: null,
    seq: 3,
  };
}

// ── reducer ──────────────────────────────────────────────────────────────────

type Act =
  | { type: 'tick' }
  | { type: 'draw' }
  | { type: 'play'; cardId: string; zone: Zone; color?: PropertyColor }
  | { type: 'target'; rivalId?: string; cardId?: string; setId?: string; color?: PropertyColor }
  | { type: 'cancel' }
  | { type: 'endTurn' }
  | { type: 'discard'; cardId: string }
  | { type: 'paySel'; cardId: string }
  | { type: 'payAuto' }
  | { type: 'payConfirm' }
  | { type: 'jsn' }
  | { type: 'allow' }
  | { type: 'rivalStep' }
  | { type: 'reset' };

function log(s: State, tone: FeedItem['tone'], who: string, text: string): State {
  const seq = s.seq + 1;
  return { ...s, seq, feed: [...s.feed.slice(-24), { id: seq, tone, who, text }] };
}
function fx(s: State, f: Omit<Fx, 'id'>): State {
  const seq = s.seq + 1;
  return { ...s, seq, fx: { id: seq, ...f } };
}
function emit(s: State, b: Bare<Beat>): State {
  const seq = s.seq + 1;
  return { ...s, seq, beat: { id: seq, ...b } as Beat };
}
const rivalOf = (s: State, id: string) => s.rivals.find((r) => r.id === id)!;
const setRival = (s: State, id: string, patch: Partial<Seat>): State => ({
  ...s,
  rivals: s.rivals.map((r) => (r.id === id ? { ...r, ...patch } : r)),
});

function checkWin(s: State): State {
  if (completeCount(s.me.sets) >= 3) return fx({ ...s, won: 'you' }, { kind: 'win', text: 'Three sets!' });
  return s;
}

function startMyTurn(s: State): State {
  const next: State = {
    ...s,
    turn: 'you',
    phase: 'draw',
    plays: 3,
    prompt: null,
    secs: 60,
    cycle: s.cycle + 1,
    rivalIdx: 0,
  };
  return log(next, 'sys', '', 'Your turn — draw 2');
}

function startRivals(s: State): State {
  const next: State = { ...s, phase: 'rivals', turn: s.rivals[0]!.id, rivalIdx: 0, prompt: null, plays: 0 };
  return log(next, 'you', 'You', 'ended the turn');
}

function spend(s: State, cardId: string): State {
  const card = s.hand.find((c) => c.id === cardId)!;
  return {
    ...s,
    hand: s.hand.filter((c) => c.id !== cardId),
    me: { ...s.me, handCount: s.hand.length - 1 },
    discard: card.kind === 'action' || card.kind === 'rent' ? [...s.discard, card] : s.discard,
    plays: s.plays - 1,
  };
}

function drawCards(s: State, n: number): State {
  const cards = Array.from({ length: n }, (_, i) => DRAWS[(s.drawn + i) % DRAWS.length]!());
  return {
    ...s,
    hand: [...s.hand, ...cards],
    me: { ...s.me, handCount: s.hand.length + n },
    deck: s.deck - n,
    drawn: s.drawn + n,
  };
}

function autoSel(s: State, amount: number): string[] {
  const assets = [...s.me.bank, ...s.me.sets.flatMap((x) => x.cards)].sort((a, b) => a.value - b.value);
  const sel: string[] = [];
  let sum = 0;
  for (const c of assets) {
    if (sum >= amount) break;
    sel.push(c.id);
    sum += c.value;
  }
  return sel;
}

function settlePayment(s: State, prompt: Extract<MockPrompt, { kind: 'pay' }>): State {
  let me = s.me;
  let payee = rivalOf(s, prompt.toId);
  let paid = 0;
  const handed: Card[] = [];
  for (const id of prompt.sel) {
    const inBank = me.bank.find((c) => c.id === id);
    if (inBank) {
      me = { ...me, bank: me.bank.filter((c) => c.id !== id) };
      payee = { ...payee, bank: [...payee.bank, inBank] };
      paid += inBank.value;
      handed.push(inBank);
      continue;
    }
    const cut = removeCard(me.sets, id);
    if (cut.card) {
      me = { ...me, sets: cut.sets };
      payee = { ...payee, sets: addProperty(payee.sets, cut.card, colorOf(cut.card)).sets };
      paid += cut.card.value;
      handed.push(cut.card);
    }
  }
  let next: State = { ...s, me, rivals: s.rivals.map((r) => (r.id === payee.id ? payee : r)) };
  next = log(next, 'bad', 'You', `paid ${payee.name} ${theme.formatMoney(paid)}`);
  next = fx(next, { kind: 'pay', text: `Paid ${theme.formatMoney(paid)}`, amount: paid });
  next = emit(next, { kind: 'pay', by: 'you', to: payee.id, cards: handed, label: `−${theme.formatMoney(paid)}` });
  return startMyTurn(next);
}

function stealFromMe(s: State, prompt: Extract<MockPrompt, { kind: 'jsn' }>): State {
  const cut = removeCard(s.me.sets, prompt.card.id);
  if (!cut.card) return startMyTurn(s);
  const thief = rivalOf(s, prompt.fromId);
  const placed = addProperty(thief.sets, cut.card, colorOf(cut.card));
  let next: State = { ...s, me: { ...s.me, sets: cut.sets } };
  next = setRival(next, thief.id, { sets: placed.sets });
  next = log(next, 'bad', thief.name, `stole your ${cardName(cut.card)}`);
  next = fx(next, { kind: 'stolen', text: `${thief.name} stole ${cardName(cut.card)}`, color: colorOf(cut.card) });
  next = emit(next, { kind: 'loot', by: thief.id, from: 'you', card: cut.card, setId: placed.set.id, played: action('sly_deal'), label: 'SLY DEAL' });
  return startMyTurn(next);
}

function rivalStep(s: State): State {
  const i = s.rivalIdx;
  const r = s.rivals[i]!;
  const last = i === s.rivals.length - 1;

  if (!last) {
    let next = s;
    if (!r.connected) {
      next = log(next, 'sys', r.name, 'is away — turn skipped');
    } else if (r.id === 'priya') {
      const note = money(3);
      next = setRival(next, r.id, { bank: [...r.bank, note], handCount: r.handCount - 1 });
      next = log(next, 'rival', r.name, `banked ${theme.formatMoney(3)}`);
      next = emit(next, { kind: 'lay', by: r.id, card: note, into: 'bank' });
    } else {
      const card = prop('yellow', 1);
      const placed = addProperty(r.sets, card, 'yellow');
      next = setRival(next, r.id, { sets: placed.sets, handCount: r.handCount - 1 });
      next = log(next, 'rival', r.name, 'played Madurai');
      next = emit(next, { kind: 'lay', by: r.id, card, into: 'set', setId: placed.set.id, completed: placed.completed });
    }
    return { ...next, rivalIdx: i + 1, turn: s.rivals[i + 1]!.id };
  }

  // Alex closes the round with something aimed at you.
  const beat = s.cycle % 3;
  if (beat === 1) {
    const targets = s.me.sets.filter((x) => !isComplete(x)).flatMap((x) => x.cards);
    const card = targets.find((c) => c.kind === 'property' && c.color === 'light_blue') ?? targets[0];
    if (card) {
      let next = log(s, 'bad', r.name, `plays Sly Deal on your ${cardName(card)}`);
      const prompt: MockPrompt = { kind: 'jsn', fromId: r.id, card, label: 'Sly Deal' };
      if (!s.hand.some((c) => c.kind === 'action' && c.action === 'just_say_no')) return stealFromMe(next, prompt);
      next = { ...next, prompt, secs: 20 };
      return emit(next, { kind: 'grab', by: r.id, from: 'you', card, played: action('sly_deal'), label: 'SLY DEAL' });
    }
  }
  const amount = beat === 2 ? 6 : 5;
  const reason = beat === 2 ? 'Rent · Goa' : 'Debt Collector';
  const total = bankTotal(s.me.bank) + bankTotal(s.me.sets.flatMap((x) => x.cards));
  let next = log(s, 'bad', r.name, `plays ${reason} — you owe ${theme.formatMoney(amount)}`);
  next = emit(next, {
    kind: 'levy',
    by: r.id,
    played: beat === 2 ? rent(['red', 'yellow']) : action('debt_collector'),
    label: beat === 2 ? `RENT ${theme.formatMoney(amount)}` : `DEBT ${theme.formatMoney(amount)}`,
    takes: [],
    aimed: 'you',
  });
  if (total === 0) return startMyTurn(next);
  next = { ...next, prompt: { kind: 'pay', toId: r.id, amount, reason, sel: [] }, secs: 30 };
  return next;
}

function reducer(s: State, a: Act): State {
  switch (a.type) {
    case 'reset':
      return emit(initial({ rivals: s.rivals.length }), { kind: 'reset' });

    case 'tick': {
      if (s.won) return s;
      const p = s.prompt;
      if (p?.kind === 'pay' || p?.kind === 'jsn') {
        if (s.secs > 1) return { ...s, secs: s.secs - 1 };
        return p.kind === 'pay'
          ? settlePayment(s, { ...p, sel: autoSel(s, Math.min(p.amount, bankTotal(s.me.bank) + bankTotal(s.me.sets.flatMap((x) => x.cards)))) })
          : stealFromMe(s, p);
      }
      if (s.turn === 'you' && s.secs > 0) return { ...s, secs: s.secs - 1 };
      return s;
    }

    case 'draw': {
      if (s.phase !== 'draw') return s;
      const n = s.hand.length === 0 ? 5 : 2;
      const next = drawCards({ ...s, phase: 'play' }, n);
      const dealt = emit(next, { kind: 'deal', to: 'you', cards: next.hand.slice(-n) });
      return fx(log(dealt, 'you', 'You', `drew ${n} cards`), { kind: 'draw', text: `+${n} cards`, amount: n });
    }

    case 'play': {
      if (s.phase !== 'play' || s.plays <= 0 || s.prompt) return s;
      const card = s.hand.find((c) => c.id === a.cardId);
      if (!card || !zonesFor(card).includes(a.zone)) return s;

      if (a.zone === 'bank') {
        let next = spend(s, card.id);
        next = { ...next, me: { ...next.me, bank: [...next.me.bank, card] } };
        next = log(next, 'you', 'You', `banked ${cardName(card)}${card.kind === 'money' ? '' : ` (${theme.formatMoney(card.value)})`}`);
        next = emit(next, { kind: 'lay', by: 'you', card, into: 'bank' });
        return fx(next, { kind: 'bank', text: `+${theme.formatMoney(card.value)}`, amount: card.value });
      }

      if (a.zone === 'build') {
        const colors = buildColors(card);
        const color = a.color && colors.includes(a.color) ? a.color : colors[0]!;
        let next = spend(s, card.id);
        const placed = addProperty(next.me.sets, card, color);
        next = { ...next, me: { ...next.me, sets: placed.sets } };
        next = log(next, 'you', 'You', `played ${cardName(card)}`);
        next = emit(next, { kind: 'lay', by: 'you', card, into: 'set', setId: placed.set.id, completed: placed.completed });
        next = fx(next, placed.completed
          ? { kind: 'set', text: `${stateName(color)} complete!`, color }
          : { kind: 'build', text: card.kind === 'property_wild' ? `${stateName(color)} +1` : cardName(card), color });
        return placed.completed ? checkWin(next) : next;
      }

      // zone === 'play'
      if (card.kind === 'rent') return { ...s, prompt: { kind: 'target', cardId: card.id, action: 'rent' } };
      if (card.kind !== 'action') return s;
      switch (card.action) {
        case 'pass_go': {
          const next = drawCards(spend(s, card.id), 2);
          const dealt = emit(next, { kind: 'deal', to: 'you', cards: next.hand.slice(-2), played: card });
          return fx(log(dealt, 'you', 'You', 'played Pass Go'), { kind: 'draw', text: '+2 cards', amount: 2 });
        }
        case 'its_my_birthday': {
          let next = spend(s, card.id);
          let gained = 0;
          const takes: { from: string; owed: number; cards: Card[] }[] = [];
          const rivals = next.rivals.map((r) => {
            const t = take(r.bank, 2);
            gained += t.sum;
            takes.push({ from: r.id, owed: 2, cards: t.taken });
            return { ...r, bank: t.rest, _t: t.taken } as Seat & { _t: Card[] };
          });
          next = {
            ...next,
            rivals: rivals.map(({ _t, ...r }) => r),
            me: { ...next.me, bank: [...next.me.bank, ...rivals.flatMap((r) => r._t)] },
          };
          next = log(next, 'good', 'You', `played It's My Birthday — collected ${theme.formatMoney(gained)}`);
          next = emit(next, { kind: 'levy', by: 'you', played: card, label: 'HAPPY BIRTHDAY!', takes });
          return fx(next, { kind: 'collect', text: `+${theme.formatMoney(gained)}`, amount: gained });
        }
        case 'sly_deal':
        case 'deal_breaker':
        case 'debt_collector':
          return { ...s, prompt: { kind: 'target', cardId: card.id, action: card.action } };
        default:
          return s;
      }
    }

    case 'target': {
      const p = s.prompt;
      if (p?.kind !== 'target') return s;
      const card = s.hand.find((c) => c.id === p.cardId)!;
      let next = spend({ ...s, prompt: null }, card.id);

      if (p.action === 'sly_deal' && a.rivalId && a.cardId) {
        const victim = rivalOf(next, a.rivalId);
        const cut = removeCard(victim.sets, a.cardId);
        if (!cut.card) return s;
        const placed = addProperty(next.me.sets, cut.card, colorOf(cut.card));
        next = setRival(next, victim.id, { sets: cut.sets });
        next = { ...next, me: { ...next.me, sets: placed.sets } };
        next = log(next, 'good', 'You', `Sly Dealt ${cardName(cut.card)} from ${victim.name}`);
        next = fx(next, { kind: 'steal', text: `Stole ${cardName(cut.card)}`, color: colorOf(cut.card) });
        next = emit(next, { kind: 'loot', by: 'you', from: victim.id, card: cut.card, setId: placed.set.id, played: card, label: 'SLY DEAL' });
        return placed.completed ? checkWin(next) : next;
      }

      if (p.action === 'deal_breaker' && a.rivalId && a.setId) {
        const victim = rivalOf(next, a.rivalId);
        const taken = victim.sets.find((x) => x.id === a.setId);
        if (!taken) return s;
        next = setRival(next, victim.id, { sets: victim.sets.filter((x) => x.id !== a.setId) });
        next = { ...next, me: { ...next.me, sets: [...next.me.sets, taken] } };
        next = log(next, 'good', 'You', `Deal Breaker! took ${victim.name}'s ${stateName(taken.color)}`);
        next = fx(next, { kind: 'steal', text: `Took ${stateName(taken.color)}`, color: taken.color });
        next = emit(next, { kind: 'raid', by: 'you', from: victim.id, set: taken, played: card, label: 'DEAL BREAKER' });
        return checkWin(next);
      }

      if (p.action === 'debt_collector' && a.rivalId) {
        const victim = rivalOf(next, a.rivalId);
        const t = take(victim.bank, 5);
        next = setRival(next, victim.id, { bank: t.rest });
        next = { ...next, me: { ...next.me, bank: [...next.me.bank, ...t.taken] } };
        next = log(next, 'good', 'You', `collected ${theme.formatMoney(t.sum)} from ${victim.name}`);
        next = emit(next, { kind: 'levy', by: 'you', played: card, label: 'DEBT COLLECTOR', takes: [{ from: victim.id, owed: 5, cards: t.taken }], aimed: victim.id });
        return fx(next, { kind: 'collect', text: `+${theme.formatMoney(t.sum)}`, amount: t.sum });
      }

      if (p.action === 'rent' && a.color) {
        const mine = next.me.sets.find((x) => x.color === a.color);
        const due = mine ? rentFor(mine) : 0;
        let gained = 0;
        const taken: Card[] = [];
        const takes: { from: string; owed: number; cards: Card[] }[] = [];
        next = {
          ...next,
          rivals: next.rivals.map((r) => {
            const t = take(r.bank, due);
            gained += t.sum;
            taken.push(...t.taken);
            takes.push({ from: r.id, owed: due, cards: t.taken });
            return { ...r, bank: t.rest };
          }),
        };
        next = { ...next, me: { ...next.me, bank: [...next.me.bank, ...taken] } };
        next = log(next, 'good', 'You', `charged ${theme.formatMoney(due)} rent — collected ${theme.formatMoney(gained)}`);
        next = emit(next, { kind: 'levy', by: 'you', played: card, label: `RENT ${theme.formatMoney(due)}`, setId: mine?.id, takes });
        return fx(next, { kind: 'collect', text: `+${theme.formatMoney(gained)}`, amount: gained });
      }
      return s;
    }

    case 'cancel':
      return s.prompt?.kind === 'target' ? { ...s, prompt: null } : s;

    case 'endTurn': {
      if (s.phase !== 'play' || s.prompt) return s;
      if (s.hand.length > HAND_LIMIT) return { ...s, prompt: { kind: 'discard', excess: s.hand.length - HAND_LIMIT } };
      return startRivals(s);
    }

    case 'discard': {
      const p = s.prompt;
      if (p?.kind !== 'discard') return s;
      const card = s.hand.find((c) => c.id === a.cardId);
      if (!card) return s;
      const next: State = {
        ...s,
        hand: s.hand.filter((c) => c.id !== card.id),
        me: { ...s.me, handCount: s.hand.length - 1 },
        discard: [...s.discard, card],
      };
      const tossed = emit(next, { kind: 'toss', by: 'you', card });
      return p.excess <= 1 ? startRivals(tossed) : { ...tossed, prompt: { kind: 'discard', excess: p.excess - 1 } };
    }

    case 'paySel': {
      const p = s.prompt;
      if (p?.kind !== 'pay') return s;
      const on = p.sel.includes(a.cardId);
      return { ...s, prompt: { ...p, sel: on ? p.sel.filter((id) => id !== a.cardId) : [...p.sel, a.cardId] } };
    }

    case 'payAuto': {
      const p = s.prompt;
      if (p?.kind !== 'pay') return s;
      return { ...s, prompt: { ...p, sel: autoSel(s, p.amount) } };
    }

    case 'payConfirm': {
      const p = s.prompt;
      return p?.kind === 'pay' ? settlePayment(s, p) : s;
    }

    case 'jsn': {
      const p = s.prompt;
      const card = s.hand.find((c) => c.kind === 'action' && c.action === 'just_say_no');
      if (p?.kind !== 'jsn' || !card) return s;
      let next: State = {
        ...s,
        hand: s.hand.filter((c) => c.id !== card.id),
        me: { ...s.me, handCount: s.hand.length - 1 },
        discard: [...s.discard, card],
      };
      next = log(next, 'good', 'You', `said NO to ${rivalOf(s, p.fromId).name}'s ${p.label}`);
      next = fx(next, { kind: 'jsn', text: 'Just Say No!' });
      next = emit(next, { kind: 'block', by: 'you', against: p.fromId, played: card, card: p.card, label: 'JUST SAY NO!' });
      return startMyTurn(next);
    }

    case 'allow': {
      const p = s.prompt;
      return p?.kind === 'jsn' ? stealFromMe(s, p) : s;
    }

    case 'rivalStep':
      return s.phase === 'rivals' && !s.prompt ? rivalStep(s) : s;
  }
}

// ── hook ─────────────────────────────────────────────────────────────────────

/** `cycle` picks what the rivals throw at you first: 0 a debt, 1 a Sly Deal you can Just Say No, 2 rent. */
export function useMockGame(cycle = 0, rivals = 4, mine = 0): TableGame {
  const [s, dispatch] = useReducer(reducer, { cycle, rivals, mine }, initial);

  useEffect(() => {
    const t = window.setInterval(() => dispatch({ type: 'tick' }), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (s.phase !== 'rivals' || s.prompt || s.won) return;
    const t = window.setTimeout(() => dispatch({ type: 'rivalStep' }), 1150);
    return () => window.clearTimeout(t);
  }, [s.phase, s.rivalIdx, s.prompt, s.won]);

  const actions = useMemo<TableGame['actions']>(
    () => ({
      draw: () => dispatch({ type: 'draw' }),
      play: (cardId, zone, color) => dispatch({ type: 'play', cardId, zone, color }),
      target: (pick) => dispatch({ type: 'target', ...pick }),
      cancel: () => dispatch({ type: 'cancel' }),
      endTurn: () => dispatch({ type: 'endTurn' }),
      discard: (cardId) => dispatch({ type: 'discard', cardId }),
      discardConfirm: () => undefined,
      resumePlay: () => undefined,
      paySel: (cardId) => dispatch({ type: 'paySel', cardId }),
      payAuto: () => dispatch({ type: 'payAuto' }),
      payConfirm: () => dispatch({ type: 'payConfirm' }),
      jsn: () => dispatch({ type: 'jsn' }),
      allow: () => dispatch({ type: 'allow' }),
      rearrange: () => undefined,
      reset: () => dispatch({ type: 'reset' }),
    }),
    [],
  );

  const assets = [...s.me.bank, ...s.me.sets.flatMap((x) => x.cards)];
  const prompt: Prompt | null = (() => {
    const p = s.prompt;
    if (!p) return null;
    switch (p.kind) {
      case 'target': {
        const card = s.hand.find((c) => c.id === p.cardId) ?? null;
        // A rent card charges on the sets of its colours; each says what it would collect.
        const colors =
          p.action === 'rent' && card?.kind === 'rent'
            ? s.me.sets.filter((x) => card.colors.includes(x.color)).map((x) => ({ color: x.color, amount: rentFor(x) }))
            : undefined;
        return { kind: 'target', action: p.action, card, ...(colors ? { colors } : {}) };
      }
      case 'pay': {
        const sum = assets.filter((c) => p.sel.includes(c.id)).reduce((n, c) => n + c.value, 0);
        return { ...p, assets, valid: sum >= Math.min(p.amount, bankTotal(assets)) };
      }
      case 'jsn':
        return { kind: 'jsn', fromId: p.fromId, label: p.label, card: action('sly_deal'), at: p.card, threat: `${s.rivals.find((r) => r.id === p.fromId)?.name} is taking your ${cardName(p.card)}` };
      case 'discard':
        return { kind: 'discard', excess: p.excess, sel: [], canResume: false };
    }
  })();

  return {
    me: s.me,
    rivals: s.rivals,
    hand: s.hand,
    sent: [],
    sending: null,
    deck: s.deck,
    discardTop: s.discard[s.discard.length - 1] ?? null,
    discardCount: s.discard.length,
    turn: s.turn,
    phase: s.phase,
    plays: s.plays,
    prompt,
    confirm: null,
    wait: null,
    secs: s.secs,
    maxSecs: s.prompt?.kind === 'pay' ? 30 : s.prompt?.kind === 'jsn' ? 20 : 60,
    feed: s.feed,
    fx: s.fx,
    beat: s.beat,
    won: s.won,
    canAct: s.phase === 'play' && s.plays > 0 && !s.prompt && !s.won,
    hasJsn: s.hand.some((c) => c.kind === 'action' && c.action === 'just_say_no'),
    canRearrange: false,
    actions,
  };
}

// ── canned scenes ────────────────────────────────────────────────────────────

/**
 * `/scratchpad?scene=<name>` lays a canned prompt over the running mock, to look at each interruption the real game
 * has without playing to it. No reducer changes: a scene only replaces `prompt` / `confirm` / `wait` (and a few
 * cards) on the returned `TableGame`, and its actions write to `document.body.dataset.lastAction` and the console.
 */
export const SCENES = [
  'forced_own',
  'forced_rival',
  'building',
  'rent',
  'rent_player',
  'debt_collector',
  'discard',
  'pay_break',
  'jsn_multi',
  'wait',
  'flip',
  'confirm_wasted',
  'confirm_bank_action',
  'confirm_building_choice',
  'confirm_rent_double',
  'confirm_flip',
] as const;
export type SceneName = (typeof SCENES)[number];
export const isScene = (v: string | null): v is SceneName => !!v && (SCENES as readonly string[]).includes(v);

const noteAction = (name: string, arg?: unknown) => {
  const line = arg === undefined ? name : `${name} ${JSON.stringify(arg)}`;
  document.body.dataset.lastAction = line;
  console.info('[scene]', line);
};

export function useScene(g: TableGame, scene: string | null): TableGame {
  const [sel, setSel] = useState<string[]>([]);
  const [gone, setGone] = useState(false);
  // The pieces a scene adds to the table, made once so their ids hold still.
  const extra = useMemo(
    () => ({
      cards: [money(1), money(2), prop('yellow', 2)],
      jsn: action('just_say_no'),
      house: action('house'),
      forced: action('forced_deal'),
      rentCard: rent(['light_blue', 'brown']),
      doubleCard: action('double_the_rent'),
      wildTwo: { ...wild(['pink', 'orange']), assignedColor: 'pink' as PropertyColor },
      wildAll: { ...wild(Object.keys(PROPERTY_SET_DEFS) as PropertyColor[]), assignedColor: 'light_blue' as PropertyColor },
      completeSet: mkSet('dark_blue', 2),
    }),
    [],
  );
  // A new scene starts from a clean selection.
  useEffect(() => {
    setGone(false);
    setSel(scene === 'discard' ? [g.hand[0]?.id ?? ''] : []);
  }, [scene]);

  if (!isScene(scene)) return g;

  const rival = g.rivals[0]!;
  const withSets = (sets: PropertySet[]): Seat => ({ ...g.me, sets });
  const mineIncomplete = g.me.sets.find((x) => !isComplete(x))!;
  const done = () => setGone(true);
  const base: TableGame = {
    ...g,
    phase: 'play',
    turn: g.me.id,
    canAct: false,
    secs: 42,
    actions: {
      ...g.actions,
      target: (pick) => noteAction('target', pick),
      cancel: () => noteAction('cancel'),
      endTurn: () => noteAction('endTurn'),
      discard: (id) => {
        noteAction('discard', id);
        setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
      },
      discardConfirm: () => noteAction('discardConfirm'),
      resumePlay: () => noteAction('resumePlay'),
      paySel: (id) => {
        noteAction('paySel', id);
        setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
      },
      payAuto: () => {
        noteAction('payAuto');
        setSel(autoSel({ me: g.me } as State, 5));
      },
      payConfirm: () => noteAction('payConfirm'),
      jsn: (id) => noteAction('jsn', id),
      allow: () => noteAction('allow'),
      rearrange: (id, color) => noteAction('rearrange', { id, color }),
    },
  };

  switch (scene) {
    case 'forced_own':
      return { ...base, prompt: { kind: 'target', action: 'forced_deal', card: extra.forced, step: 'own' } };
    case 'forced_rival':
      return { ...base, prompt: { kind: 'target', action: 'forced_deal', card: extra.forced, step: 'rival', give: mineIncomplete.cards[0]!.id } };
    case 'building': {
      const me = withSets([...g.me.sets, extra.completeSet]);
      return {
        ...base,
        me,
        prompt: { kind: 'target', action: 'building', card: extra.house, building: 'house', eligibleSets: me.sets.filter(isComplete).map((x) => x.id) },
      };
    }
    case 'rent': {
      const colors = g.me.sets.filter((x) => x.color === 'brown' || x.color === 'light_blue').map((x) => ({ color: x.color, amount: rentFor(x) }));
      return { ...base, prompt: { kind: 'target', action: 'rent', card: extra.rentCard, colors } };
    }
    case 'rent_player': {
      const lb = g.me.sets.find((x) => x.color === 'light_blue')!;
      return { ...base, prompt: { kind: 'target', action: 'rent_player', card: extra.rentCard, colors: [{ color: 'light_blue', amount: rentFor(lb) }], amount: rentFor(lb) } };
    }
    case 'debt_collector':
      return { ...base, prompt: { kind: 'target', action: 'debt_collector', card: action('debt_collector'), amount: 5 } };
    case 'discard':
      return {
        ...base,
        hand: [...g.hand, ...extra.cards],
        prompt: { kind: 'discard', excess: 3, sel, canResume: true },
      };
    case 'pay_break': {
      const assets = [...g.me.bank, ...g.me.sets.flatMap((x) => x.cards), extra.house];
      const sum = assets.filter((c) => sel.includes(c.id)).reduce((n, c) => n + c.value, 0);
      return { ...base, maxSecs: 30, prompt: { kind: 'pay', toId: rival.id, amount: 5, reason: 'Debt Collector', sel, assets, valid: sum >= 5 } };
    }
    case 'jsn_multi': {
      const at = mineIncomplete.cards[mineIncomplete.cards.length - 1]!;
      return {
        ...base,
        maxSecs: 20,
        hand: [...g.hand, extra.jsn],
        hasJsn: true,
        prompt: { kind: 'jsn', fromId: rival.id, card: action('sly_deal'), at, label: 'Sly Deal', threat: `${rival.name} is taking your ${cardName(at)}` },
      };
    }
    case 'wait':
      return { ...base, wait: `${rival.name} is choosing who pays…` };
    case 'flip': {
      const sets = g.me.sets.map((x) =>
        x.color === 'pink' ? { ...x, cards: [...x.cards, extra.wildTwo] } : x.color === 'light_blue' ? { ...x, cards: [...x.cards, extra.wildAll] } : x,
      );
      return { ...base, me: withSets(sets), canAct: true, canRearrange: true };
    }
    case 'confirm_wasted':
      return { ...base, confirm: gone ? null : wasted(g.hand[3]!, done) };
    case 'confirm_bank_action':
      return { ...base, confirm: gone ? null : { kind: 'bank_action', card: g.hand[3]!, canPlay: true, cash: done, play: done, keep: done } };
    case 'confirm_building_choice':
      return { ...base, hand: [...g.hand, extra.house], confirm: gone ? null : { kind: 'building_choice', card: extra.house, canBuild: true, cash: done, build: done, undo: done } };
    case 'confirm_rent_double':
      return { ...base, confirm: gone ? null : { kind: 'rent_double', card: g.hand[4]!, double: extra.doubleCard, twice: done, plain: done, undo: done } };
    case 'confirm_flip':
      return { ...base, confirm: gone ? null : { kind: 'flip', card: extra.wildTwo, toColor: 'orange', copy: 'It leaves your complete Pink set, which breaks it.', yes: done, undo: done } };
  }
}

const wasted = (card: Card, done: () => void): Confirm => ({
  kind: 'wasted',
  card,
  copy: 'No opponent has a property you could steal — every property they own is locked in a completed set.',
  yes: done,
  undo: done,
});
