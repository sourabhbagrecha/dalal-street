import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ActionType, Card, PropertyColor } from '@monopoly-deal/shared';
import {
  HAND_LIMIT,
  HOTEL_RENT_BONUS,
  HOUSE_RENT_BONUS,
  MAX_PLAYS,
  PROPERTY_SET_DEFS,
  RENT_TABLE,
  SET_SIZES,
  WIN_SETS,
} from '@monopoly-deal/shared';
import { PlayingCard } from '../components/PlayingCard';
import { buildDeckReference, type DeckEntry } from '../deckReference';
import { useCurrency } from '../hooks/useCurrency';
import { theme } from '../theme';

/**
 * `/rules` — the game's manual and its deck reference in one page.
 *
 * The cards are not a hand-written list: the page builds the real 110-card
 * deck with the engine's own `buildDeck()` and groups it, so the counts and
 * the faces shown here cannot drift from what is actually dealt. Identical
 * copies collapse to one card with a ×N chip; "Show every copy" expands them
 * back out to all 110.
 *
 * Rule text is the project's `game_rules/` FAQ condensed per card group, with
 * an "in this app" note wherever this implementation makes a choice the paper
 * rules leave open (the response timers, the auto-pay fallback).
 */

/* ── Card presentation ───────────────────────────────────────────────────── */

interface CardsProps {
  entries: DeckEntry[];
  expanded: boolean;
}

/**
 * A row of cards. The container sets `--card-w` (the sizing contract in
 * cards.css: a placement sets exactly one of --card-w / --card-h) and lets
 * the cards wrap.
 */
function CardRow({ entries, expanded }: CardsProps) {
  return (
    <div className="rules-cards">
      {entries.map((entry) => {
        const shown = expanded ? entry.cards : entry.cards.slice(0, 1);
        return shown.map((card, i) => (
          <div className="rules-card" key={card.id}>
            <PlayingCard
              card={card}
              activeColor={
                card.kind === 'property_wild' && card.colors.length > 0
                  ? card.colors[0]
                  : undefined
              }
              data-testid={`rules-card-${entry.key}${expanded ? `-${i}` : ''}`}
            />
            {!expanded && entry.cards.length > 1 && (
              <span className="rules-card__count">&times;{entry.cards.length}</span>
            )}
          </div>
        ));
      })}
    </div>
  );
}

/* ── Page chrome ─────────────────────────────────────────────────────────── */

function Section({
  id,
  title,
  count,
  lead,
  children,
}: {
  id: string;
  title: string;
  count?: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rules-section" id={id}>
      <h2 className="rules-section__title">
        {title}
        {count && <span className="rules-section__count">{count}</span>}
      </h2>
      {lead && <p className="rules-section__lead">{lead}</p>}
      {children}
    </section>
  );
}

/** A ✓ / ✕ pair — what a card group lets you do, and what it does not. */
function Legality({ yes, no }: { yes: ReactNode[]; no: ReactNode[] }) {
  return (
    <div className="rules-legality">
      <ul className="rules-legality__list rules-legality__list--yes">
        {yes.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      <ul className="rules-legality__list rules-legality__list--no">
        {no.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function AppNote({ children }: { children: ReactNode }) {
  return (
    <p className="rules-appnote">
      <strong>In this app:</strong> {children}
    </p>
  );
}

/** One action card: its copies on the left, everything it does on the right. */
function ActionEntry({
  entry,
  expanded,
  title,
  what,
  yes,
  no,
}: {
  entry: DeckEntry | undefined;
  expanded: boolean;
  title: string;
  what: ReactNode;
  yes: ReactNode[];
  no: ReactNode[];
}) {
  const { formatMoney } = useCurrency();
  if (!entry) return null;
  const card = entry.cards[0];
  return (
    <article className="rules-entry" data-testid={`rules-entry-${entry.key}`}>
      <div className="rules-entry__cards">
        <CardRow entries={[entry]} expanded={expanded} />
      </div>
      <div className="rules-entry__body">
        <h3 className="rules-entry__title">
          {title}
          <span className="rules-entry__tally">
            {entry.cards.length} in deck &middot; banks as {formatMoney(card.value)}
          </span>
        </h3>
        <p className="rules-entry__what">{what}</p>
        <Legality yes={yes} no={no} />
      </div>
    </article>
  );
}

/* ── Static content ──────────────────────────────────────────────────────── */

const SET_ORDER: PropertyColor[] = [
  'brown',
  'light_blue',
  'pink',
  'orange',
  'red',
  'yellow',
  'green',
  'dark_blue',
  'railroad',
  'utility',
];

const NAV = [
  { id: 'how-to-play', label: 'How to play' },
  { id: 'a-turn', label: 'A turn, step by step' },
  { id: 'paying', label: 'Paying up' },
  { id: 'properties', label: 'Property cards' },
  { id: 'wildcards', label: 'Property wildcards' },
  { id: 'money', label: 'Money cards' },
  { id: 'rent', label: 'Rent cards' },
  { id: 'actions', label: 'Action cards' },
  { id: 'quick-start', label: 'Quick Start Rules' },
];

const ACTION_ORDER: ActionType[] = [
  'pass_go',
  'sly_deal',
  'forced_deal',
  'debt_collector',
  'its_my_birthday',
  'double_the_rent',
  'house',
  'hotel',
  'just_say_no',
  'deal_breaker',
];

/* ── Per-action rule text ────────────────────────────────────────────────── */

type Money = (n: number) => string;

interface ActionContent {
  what: (m: Money) => ReactNode;
  yes: (m: Money) => ReactNode[];
  no: (m: Money) => ReactNode[];
}

const ACTION_CONTENT: Record<ActionType, ActionContent> = {
  pass_go: {
    what: () => <>Draw two extra cards from the draw pile straight into your hand.</>,
    yes: () => [
      <>Playing more than one in a turn &mdash; each is one of your {MAX_PLAYS} plays.</>,
      <>Banking it instead, for the money in its corner.</>,
    ],
    no: () => [
      <>Getting extra plays out of it. It buys cards, not turns.</>,
      <>
        Escaping the {HAND_LIMIT}-card hand limit: whatever you draw, you still end the turn at{' '}
        {HAND_LIMIT}.
      </>,
    ],
  },
  sly_deal: {
    what: () => (
      <>Steal one property card &mdash; a real property or a wildcard &mdash; from any one opponent.</>
    ),
    yes: () => [
      <>Taking a two-colour wildcard or a Joker.</>,
      <>Taking a house or hotel that is sitting loose beside a player&apos;s sets.</>,
    ],
    no: () => [
      <>
        Taking anything out of a <strong>complete</strong> set.
      </>,
      <>Taking two cards, or taking from two players.</>,
      <>Going through if the target answers with Just Say No.</>,
    ],
  },
  forced_deal: {
    what: () => <>Swap one of your property cards for one of an opponent&apos;s.</>,
    yes: (m) => [
      <>
        Trading unequal values &mdash; a {m(1)} city for a {m(4)} one is a legal swap.
      </>,
      <>The opponent rearranging the card you gave them, immediately, on your turn.</>,
    ],
    no: () => [
      <>Touching either player&apos;s complete sets.</>,
      <>Taking a card without giving one back. It is a swap, not a steal.</>,
    ],
  },
  debt_collector: {
    what: (m) => <>One opponent of your choice pays you {m(5)}.</>,
    yes: () => [<>Choosing who pays, whatever their board looks like.</>],
    no: () => [
      <>
        Choosing <em>what</em> they pay with &mdash; that is their call.
      </>,
      <>Collecting from more than one player with one card.</>,
      <>Doubling it with Double the Rent. That card only doubles rent.</>,
    ],
  },
  its_my_birthday: {
    what: (m) => <>Every other player pays you {m(2)}.</>,
    yes: () => [<>Collecting from everyone at once, each paying from their own table.</>],
    no: () => [
      <>Being stopped for everyone by one player&apos;s Just Say No &mdash; it only excuses them.</>,
      <>Collecting from a player with nothing on the table.</>,
    ],
  },
  double_the_rent: {
    what: () => <>Play it with a rent card and the bill doubles.</>,
    yes: () => [
      <>Playing two of them on one rent card, for four times the rent.</>,
      <>Being cancelled on its own by Just Say No &mdash; the original rent is still owed.</>,
    ],
    no: () => [
      <>Being played on its own, or after the rent has been charged.</>,
      <>Doubling Debt Collector or It&apos;s My Birthday.</>,
      <>
        Coming free: each copy costs one of your {MAX_PLAYS} plays, so rent plus two doubles is a
        whole turn.
      </>,
    ],
  },
  house: {
    what: (m) => (
      <>Add it to one of your complete sets; rent for that set rises by {m(HOUSE_RENT_BONUS)}.</>
    ),
    yes: () => [
      <>Paying with it later, at the money in its corner.</>,
      <>
        Sitting loose beside your sets if the set under it is broken up &mdash; it waits for your
        next complete set.
      </>,
    ],
    no: () => [
      <>Going on an incomplete set.</>,
      <>Going on a railroad or utility set (Karnataka, Uttar Pradesh).</>,
      <>Being stolen off a complete set by Sly Deal or Forced Deal.</>,
    ],
  },
  hotel: {
    what: (m) => (
      <>
        Add it to a complete set that already has a house; rent rises by another{' '}
        {m(HOTEL_RENT_BONUS)}.
      </>
    ),
    yes: (m) => [
      <>
        Stacking with the house for {m(HOUSE_RENT_BONUS + HOTEL_RENT_BONUS)} of extra rent on that
        set.
      </>,
    ],
    no: () => [
      <>Going down before a house. House first, always.</>,
      <>Going on a railroad or utility set.</>,
    ],
  },
  just_say_no: {
    what: () => (
      <>Cancels an action card played against you, and can itself be cancelled by another one.</>
    ),
    yes: () => [
      <>Playing it on someone else&apos;s turn &mdash; it costs none of your {MAX_PLAYS} plays.</>,
      <>Answering a Just Say No with a Just Say No, as many times as the table has cards for.</>,
      <>Cancelling a Deal Breaker, a rent, a birthday, a steal &mdash; anything aimed at you.</>,
    ],
    no: () => [
      <>Starting anything. It is purely a reply.</>,
      <>Being kept after use: like every action, it goes to the discard pile.</>,
      <>Saving anyone but you when an action hits the whole table.</>,
    ],
  },
  deal_breaker: {
    what: () => (
      <>Take an entire complete set from an opponent &mdash; houses and hotels included.</>
    ),
    yes: () => [
      <>Taking the buildings on that set along with it.</>,
      <>Taking a set held together by wildcards, Jokers and all.</>,
    ],
    no: () => [
      <>Taking anything less than a whole complete set.</>,
      <>
        Being taken back if it is wasted: play it when nobody has a complete set and it is simply
        discarded, and the play is spent.
      </>,
      <>Going through against a Just Say No.</>,
    ],
  },
};

export function RulesPage() {
  const { formatMoney } = useCurrency();
  const [expanded, setExpanded] = useState(false);

  // The deck itself is the source of truth for every count on this page.
  const { cards: deck, groups } = useMemo(() => buildDeckReference(), []);

  const entriesOfKind = (kind: Card['kind']): DeckEntry[] =>
    [...groups.values()].filter((e) => e.cards[0].kind === kind);

  const countOfKind = (kind: Card['kind']): number =>
    deck.filter((c) => c.kind === kind).length;

  const propertyEntriesFor = (color: PropertyColor): DeckEntry[] =>
    PROPERTY_SET_DEFS[color].names
      .map((name) => groups.get(`property-${color}-${name}`))
      .filter((e): e is DeckEntry => e !== undefined);

  /** Copies across a list of entries — the "N cards" a sub-group is worth. */
  const tally = (entries: DeckEntry[]): number =>
    entries.reduce((n, e) => n + e.cards.length, 0);

  const wildEntries = entriesOfKind('property_wild');
  const isJoker = (entry: DeckEntry): boolean => {
    const card = entry.cards[0];
    return card.kind === 'property_wild' && card.colors.length === 0;
  };
  const duoWilds = wildEntries.filter((e) => !isJoker(e));
  const jokerWilds = wildEntries.filter(isJoker);
  const moneyEntries = entriesOfKind('money').sort(
    (a, b) => a.cards[0].value - b.cards[0].value,
  );
  const rentEntries = entriesOfKind('rent');
  const dualRents = rentEntries.filter((e) => e.key !== 'rent-wild');
  const wildRent = groups.get('rent-wild');
  const ruleEntry = groups.get('rule');
  const action = (a: ActionType) => groups.get(`action-${a}`);

  const bankTotal = deck
    .filter((c) => c.kind === 'money')
    .reduce((sum, c) => sum + c.value, 0);

  const LEDGER: Array<{ label: string; count: number; href: string }> = [
    { label: 'Property', count: countOfKind('property'), href: '#properties' },
    { label: 'Wildcards', count: countOfKind('property_wild'), href: '#wildcards' },
    { label: 'Action', count: countOfKind('action'), href: '#actions' },
    { label: 'Rent', count: countOfKind('rent'), href: '#rent' },
    { label: 'Money', count: countOfKind('money'), href: '#money' },
    { label: 'Quick Start', count: countOfKind('rule'), href: '#quick-start' },
  ];

  return (
    <div className="rules-page">
      <header className="rules-header">
        <div className="rules-header__top">
          <Link to="/" className="rules-header__back">
            &larr; Back to lobby
          </Link>
          <label className="rules-header__toggle">
            <input
              type="checkbox"
              checked={expanded}
              onChange={(e) => setExpanded(e.target.checked)}
              data-testid="rules-expand-toggle"
            />
            <span>Show every copy ({deck.length} cards)</span>
          </label>
        </div>
        <h1 className="rules-header__title">Rules &amp; card reference</h1>
        <p className="rules-header__lead">
          Every card in the {deck.length}-card deck, grouped by type, with what it does and
          what you can and cannot do with it. Identical copies are stacked into one card with
          a &times;N chip &mdash; flip the switch above to lay all {deck.length} out.
        </p>
        <div className="rules-ledger">
          {LEDGER.map((row) => (
            <a className="rules-ledger__chip" href={row.href} key={row.label}>
              <span className="rules-ledger__count">{row.count}</span>
              <span className="rules-ledger__label">{row.label}</span>
            </a>
          ))}
        </div>
      </header>

      <nav className="rules-nav" aria-label="Sections">
        {NAV.map((item) => (
          <a className="rules-nav__link" href={`#${item.id}`} key={item.id}>
            {item.label}
          </a>
        ))}
      </nav>

      <main className="rules-main">
        <Section
          id="how-to-play"
          title="How to play"
          lead={
            <>
              Be the first to lay <strong>{WIN_SETS} complete property sets</strong> face up in
              front of you. Every property card tells you how many of its colour make a set
              &mdash; two for Maharashtra, four for Karnataka.
            </>
          }
        >
          <div className="rules-grid">
            <div className="rules-note">
              <h3>Setup</h3>
              <p>
                Take the {countOfKind('rule')} Quick Start Rules cards out of the deck, shuffle,
                deal 5 cards to each player, and put the rest face down as the draw pile. 2&ndash;5
                players.
              </p>
            </div>
            <div className="rules-note">
              <h3>Three places to play</h3>
              <p>
                <strong>Bank</strong> &mdash; money and action cards, face up, as cash.{' '}
                <strong>Property</strong> &mdash; property cards and wildcards, face up, in sets.{' '}
                <strong>Discard</strong> &mdash; action cards you are using for their effect.
              </p>
            </div>
            <div className="rules-note">
              <h3>Winning</h3>
              <p>
                The moment {WIN_SETS} of your sets are complete at the same time, you win. Sets can
                be any colours &mdash; including {WIN_SETS} sets of colours you built with
                wildcards.
              </p>
            </div>
            <div className="rules-note">
              <h3>When the deck runs out</h3>
              <p>Shuffle the discard pile face down; that is the new draw pile.</p>
            </div>
          </div>
        </Section>

        <Section id="a-turn" title="A turn, step by step">
          <ol className="rules-steps">
            <li>
              <strong>Draw 2 cards.</strong> If you started your turn with an empty hand, draw 5
              instead.
            </li>
            <li>
              <strong>Play up to {MAX_PLAYS} cards.</strong> Any card laid on the table is one
              play &mdash; money into your bank, property in front of you, an action into the
              discard pile. You never have to use all {MAX_PLAYS}.
            </li>
            <li>
              <strong>Rearrange freely.</strong> On your own turn you can move wildcards and
              properties between sets as often as you like; it costs no play.
            </li>
            <li>
              <strong>End with at most {HAND_LIMIT} cards.</strong> Discard the excess face up.
            </li>
          </ol>
          <Legality
            yes={[
              <>Playing a card into your bank, your properties, or the discard pile all count the same: one play.</>,
              <>Playing <strong>Just Say No</strong> on someone else&apos;s turn &mdash; it never uses a play.</>,
              <>Rearranging your own board as many times as you want during your turn.</>,
            ]}
            no={[
              <>Taking a card back off the table: a card laid is a card played.</>,
              <>Touching, counting or looking through an opponent&apos;s bank or property cards.</>,
              <>Rearranging your board on someone else&apos;s turn &mdash; the one exception is a property handed to you by a Forced Deal.</>,
            ]}
          />
          <AppNote>
            the server keeps the clock: 60 seconds to take your turn, 20 to answer with Just Say
            No, 30 to choose payment or a target. Let a payment timer run out and the cheapest legal
            combination is paid for you, bank first; let any other interrupt expire and the play is
            forfeited.
          </AppNote>
        </Section>

        <Section
          id="paying"
          title="Paying up"
          lead={
            <>
              Rent, Debt Collector and It&apos;s My Birthday all end the same way: someone owes you
              money and <em>they</em> choose what to hand over.
            </>
          }
        >
          <Legality
            yes={[
              <>Paying with any mix of banked cards, properties, houses and hotels on your table.</>,
              <>Paying with property &mdash; it goes straight into the other player&apos;s property section, never their bank.</>,
              <>Paying nothing at all if you have nothing on the table worth money.</>,
              <>Breaking up a complete set to pay, if that is what you want to give away.</>,
            ]}
            no={[
              <>Paying from your hand. Only cards already on the table are money.</>,
              <>Getting change. Overpay and the difference stays with your opponent.</>,
              <>Paying with a multicolour wildcard (the Joker) &mdash; it is worth nothing.</>,
              <>Using an action card someone paid you with: in your bank it is just cash.</>,
            ]}
          />
          <AppNote>
            if you owe more than everything you own, you hand over what you have and the debt ends
            there. A house or hotel knocked loose from a broken set waits beside your sets until you
            complete another one.
          </AppNote>
        </Section>

        <Section
          id="properties"
          title="Property cards"
          count={`${countOfKind('property')} cards · 10 sets`}
          lead={
            <>
              Ten states, one card per city. The number of cards in the set is fixed by the set
              itself, and rent climbs as you collect them.
            </>
          }
        >
          <Legality
            yes={[
              <>Laying property face up in front of you &mdash; one play per card.</>,
              <>Holding more than one set of the same colour (a second set is started with wildcards).</>,
              <>Handing property over as payment, and taking property as payment.</>,
            ]}
            no={[
              <>Putting a property card in your bank. Property is never money.</>,
              <>Having more cards in a set than the set needs &mdash; the extras start a new set.</>,
              <>Losing a card out of a <em>complete</em> set to Sly Deal or Forced Deal. Only a Deal Breaker takes those.</>,
            ]}
          />
          <div className="rules-sets">
            {SET_ORDER.map((color) => {
              const def = PROPERTY_SET_DEFS[color];
              return (
                <article className="rules-set" key={color} data-testid={`rules-set-${color}`}>
                  <header className="rules-set__head">
                    <span
                      className="rules-set__swatch"
                      style={{ background: theme.propertyColors[color] }}
                      aria-hidden
                    />
                    <h3 className="rules-set__title">{def.state}</h3>
                    <span className="rules-set__meta">
                      {SET_SIZES[color]} cards to complete &middot; banks as{' '}
                      {formatMoney(def.value)} each
                    </span>
                  </header>
                  <div className="rules-set__rent">
                    {RENT_TABLE[color].map((amount, i) => (
                      <span className="rules-set__rent-step" key={i}>
                        <span className="rules-set__rent-n">{i + 1}</span>
                        {formatMoney(amount)}
                      </span>
                    ))}
                  </div>
                  <CardRow entries={propertyEntriesFor(color)} expanded={expanded} />
                </article>
              );
            })}
          </div>
        </Section>

        <Section
          id="wildcards"
          title="Property wildcards"
          count={`${countOfKind('property_wild')} cards`}
          lead={
            <>
              A wildcard counts as a property of one of the colours printed on it.{' '}
              {tally(duoWilds)} of them show two colours; {tally(jokerWilds)} are Jokers that join
              any set at all.
            </>
          }
        >
          <h3 className="rules-subtitle">Two-colour wildcards &mdash; {tally(duoWilds)} cards</h3>
          <CardRow entries={duoWilds} expanded={expanded} />
          <Legality
            yes={[
              <>Laying one down as either of its colours, even a colour you own nothing of yet &mdash; it starts that set.</>,
              <>Flipping it to its other colour on your turn, as often as you like, for free.</>,
              <>Banking it or paying with it at the value printed on it.</>,
              <>Being stolen: a wildcard is a property card like any other.</>,
            ]}
            no={[
              <>Flipping it during someone else&apos;s turn.</>,
              <>Counting as two colours at once, or filling a set of a colour it does not show.</>,
            ]}
          />

          <h3 className="rules-subtitle">
            The Joker (multicolour) &mdash; {tally(jokerWilds)} cards
          </h3>
          <CardRow entries={jokerWilds} expanded={expanded} />
          <Legality
            yes={[
              <>Joining any set of any colour, and moving between them on your turn.</>,
              <>Being taken by Sly Deal or Forced Deal, or with the set by a Deal Breaker.</>,
            ]}
            no={[
              <>Banking it or paying with it &mdash; it is worth {formatMoney(0)}.</>,
              <>Being charged rent for on its own: rent needs at least one real property of that colour beside it.</>,
            ]}
          />
          <AppNote>
            a flip that would break a complete set or strand a house is armed first and confirmed
            second, so it never happens by accident.
          </AppNote>
        </Section>

        <Section
          id="money"
          title="Money cards"
          count={`${countOfKind('money')} cards · ${formatMoney(bankTotal)} total`}
          lead={
            <>
              Money does one thing: it sits in your bank and pays your debts. Playing a money card
              into your bank costs one of your {MAX_PLAYS} plays.
            </>
          }
        >
          <CardRow entries={moneyEntries} expanded={expanded} />
          <Legality
            yes={[
              <>Banking action and rent cards as cash instead of using them &mdash; the corner value is what they are worth.</>,
              <>Paying with any combination of banked cards.</>,
            ]}
            no={[
              <>Taking money back out of your bank into your hand.</>,
              <>Charging rent on your bank, or having it taken by Sly Deal or Deal Breaker &mdash; only debts reach it.</>,
            ]}
          />
        </Section>

        <Section
          id="rent"
          title="Rent cards"
          count={`${countOfKind('rent')} cards`}
          lead={
            <>
              A rent card is played into the discard pile and charges rent for one colour you
              already own. Rent is read off that set&apos;s ladder for how many cards are in it,
              plus {formatMoney(HOUSE_RENT_BONUS)} for a house and {formatMoney(HOTEL_RENT_BONUS)}{' '}
              for a hotel.
            </>
          }
        >
          <h3 className="rules-subtitle">
            Two-colour rent &mdash; {tally(dualRents)} cards
          </h3>
          <p className="rules-body">
            Charges <strong>every other player</strong> rent in one of the two colours shown. You
            must own property of the colour you pick.
          </p>
          <CardRow entries={dualRents} expanded={expanded} />

          <h3 className="rules-subtitle">
            Wild rent &mdash; {wildRent?.cards.length ?? 0} cards
          </h3>
          <p className="rules-body">
            Any colour you own, but only <strong>one player of your choice</strong> pays. Worth{' '}
            {formatMoney(wildRent?.cards[0].value ?? 0)} in the bank, which is often the better use
            of it in a two-player game.
          </p>
          {wildRent && <CardRow entries={[wildRent]} expanded={expanded} />}

          <Legality
            yes={[
              <>Charging rent for a set of one card &mdash; you do not need a complete set.</>,
              <>Stacking Double the Rent on top, before anyone pays.</>,
              <>Banking a rent card instead of playing it.</>,
            ]}
            no={[
              <>Charging two colours with one card. Pick one.</>,
              <>Playing a rent card for a colour you own no property of.</>,
              <>Collecting from everyone with a wild rent card &mdash; that one is single-target.</>,
            ]}
          />
        </Section>

        <Section
          id="actions"
          title="Action cards"
          count={`${countOfKind('action')} cards`}
          lead={
            <>
              Every action card has two lives: play it into the discard pile for its effect, or
              bank it for the money in its corner. Either way it costs one play.
            </>
          }
        >
          <div className="rules-entries">
            {ACTION_ORDER.map((type) => {
              const content = ACTION_CONTENT[type];
              return (
                <ActionEntry
                  key={type}
                  entry={action(type)}
                  expanded={expanded}
                  title={theme.actionNames[type] ?? type}
                  what={content.what(formatMoney)}
                  yes={content.yes(formatMoney)}
                  no={content.no(formatMoney)}
                />
              );
            })}
          </div>
        </Section>

        <Section
          id="quick-start"
          title="Quick Start Rules cards"
          count={`${countOfKind('rule')} cards`}
          lead={
            <>
              These four are printed in the deck but never played. They come out before the shuffle
              and sit aside for the whole game &mdash; they are counted here only because they are
              part of the {deck.length}.
            </>
          }
        >
          {ruleEntry && <CardRow entries={[ruleEntry]} expanded={expanded} />}
        </Section>
      </main>
    </div>
  );
}
