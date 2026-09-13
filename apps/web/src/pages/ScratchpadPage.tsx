import { useState, type CSSProperties } from 'react';
import type { PropertyColor, PropertySet } from '@monopoly-deal/shared';
import { PROPERTY_SET_DEFS } from '@monopoly-deal/shared';
import { CashPile } from '../components/CashPile';
import { PropertySetView } from '../components/PropertySetView';
import { initialsFromName } from '../components/PlayerAvatar';
import { theme } from '../theme';
import { MOCK_OPPONENTS, bankTotal, type MockOpponent } from './scratchpad/mockOpponents';
import '../styles/scratchpad.css';

/**
 * Focused design lab for one problem: your properties panel and an
 * opponent's properties panel currently share identical chrome, so a
 * screenshot (or a quick glance mid-game) can't tell whose board is whose.
 * Each variant below is the same real board content — CashPile,
 * PropertySetView, PlayingCard — wrapped in a different amount of identity
 * chrome. Nothing here is wired to the live store or network.
 */

const VARIANTS = [
  { id: 'baseline', name: 'Baseline (today)', summary: 'No identity chrome — both panels use the same cream card. This is the problem, kept here for comparison.' },
  { id: 'nameplate', name: 'A · Nameplate header', summary: 'A header bar names the owner on every panel: gold "YOUR PROPERTIES" for you, an ink bar with avatar + name for anyone else.' },
  { id: 'frame', name: 'B · Gold frame', summary: 'Your panel gets a gold border and a warm background wash; an opponent panel stays neutral ink-on-cream with a small name pill.' },
  { id: 'tab', name: 'C · Identity tab', summary: 'A vertical tab clipped to the panel’s edge carries the identity — gold "YOU", or the opponent’s initials — leaving the board chrome untouched.' },
  { id: 'holistic', name: 'D · Colour thread + sticky', summary: 'Identity is a colour, not just a label: the same seat colour already used on the table rim (theme.opponentColor / theme.selfColor) threads down into each panel’s rail and header, so the rim above and the panel below read as one seat. The header stays pinned while its panel scrolls, so the colour never disappears mid-glance. Yours is gold — the app’s existing "mine" colour, already on Set Secured — never confusable with any opponent’s hue.' },
] as const;
type Variant = typeof VARIANTS[number]['id'];

function property(id: string, color: PropertyColor, index: number) {
  const def = PROPERTY_SET_DEFS[color];
  return { id, kind: 'property' as const, color, value: def.value, name: def.names[index]! };
}

const YOU: MockOpponent = {
  id: 'you',
  name: 'You',
  color: '#f2c14e',
  handCount: 5,
  connected: true,
  bank: [{ id: 'you-b1', kind: 'money', amount: 2, value: 2 }, { id: 'you-b2', kind: 'money', amount: 4, value: 4 }],
  sets: [
    { id: 'you-orange', color: 'orange', cards: [property('you-guwahati', 'orange', 0), property('you-dibrugarh', 'orange', 1)] },
    { id: 'you-lblue', color: 'light_blue', cards: [property('you-kochi', 'light_blue', 0), property('you-munnar', 'light_blue', 1), property('you-alappuzha', 'light_blue', 2)] },
  ] satisfies PropertySet[],
};

function Nameplate({ isYou, name, connected }: { isYou: boolean; name: string; connected: boolean }) {
  return (
    <header className={`pd-nameplate${isYou ? ' pd-nameplate--you' : ''}`}>
      <span className="pd-nameplate__avatar">{isYou ? '★' : initialsFromName(name)}</span>
      <span className="pd-nameplate__text">
        <b>{isYou ? 'Your properties' : `${name}’s properties`}</b>
        {!isYou && <small>{connected ? 'at the table' : 'disconnected · waiting'}</small>}
      </span>
    </header>
  );
}

function Pill({ isYou, name }: { isYou: boolean; name: string }) {
  return (
    <span className={`pd-pill${isYou ? ' pd-pill--you' : ''}`}>
      <i>{isYou ? '★' : initialsFromName(name)}</i>
      {isYou ? 'You' : name}
    </span>
  );
}

function Tab({ isYou, name }: { isYou: boolean; name: string }) {
  return <span className={`pd-tab${isYou ? ' pd-tab--you' : ''}`}>{isYou ? 'YOU' : initialsFromName(name)}</span>;
}

/** Variant D's header — reads var(--seat), set by the panel wrapper, so the
 *  same colour painting the rail also paints the avatar and rule beneath it. */
function SeatHeader({ isYou, name, connected }: { isYou: boolean; name: string; connected: boolean }) {
  return (
    <header className={`pd-seat-header${isYou ? ' pd-seat-header--you' : ''}`}>
      <span className="pd-seat-header__avatar">{isYou ? '★' : initialsFromName(name)}</span>
      <span className="pd-seat-header__text">
        <b>{isYou ? 'Your properties' : `${name}’s properties`}</b>
        {!isYou && <small>{connected ? 'at the table' : 'disconnected · waiting'}</small>}
      </span>
    </header>
  );
}

/** Mock of the real table rim (OpponentSpotlight's seat row) so variant D can
 *  show the colour actually being the same one up top, not just asserted in
 *  copy. theme.opponentColor(index) / theme.selfColor are the real seat
 *  colours the live rim already paints — this just borrows them. */
function RimMock({ opponents, activeId }: { opponents: MockOpponent[]; activeId: string }) {
  return (
    <div className="pd-rim-mock" aria-hidden>
      {opponents.map((o, i) => (
        <div className="pd-rim-mock__seat" key={o.id}>
          <span
            className={`pd-rim-mock__dot${o.id === activeId ? ' pd-rim-mock__dot--active' : ''}`}
            style={{ '--seat-color': theme.opponentColor(i) } as CSSProperties}
          >
            {initialsFromName(o.name)}
          </span>
          <small>{o.name}</small>
        </div>
      ))}
      <div className="pd-rim-mock__seat">
        <span className="pd-rim-mock__dot" style={{ '--seat-color': 'var(--gold)' } as CSSProperties}>
          ★
        </span>
        <small>You</small>
      </div>
    </div>
  );
}

function Board({ player }: { player: MockOpponent }) {
  return (
    <>
      <CashPile cards={player.bank} ariaLabel={`${player.id === 'you' ? 'Your' : `${player.name}'s`} bank`} testId={`bank-${player.id}`} />
      {player.sets.length === 0 ? (
        <p className="pd-empty">No property sets yet</p>
      ) : (
        player.sets.map((set) => <PropertySetView key={set.id} set={set} canDrag={false} />)
      )}
    </>
  );
}

function Panel({ player, variant, seatColor }: { player: MockOpponent; variant: Variant; seatColor?: string }) {
  const isYou = player.id === 'you';
  const style = variant === 'holistic' ? ({ '--seat': isYou ? 'var(--gold)' : seatColor } as CSSProperties) : undefined;
  const panel = (
    <div className={`pd-panel pd-panel--${variant}${isYou ? ' pd-panel--you' : ''}`} style={style}>
      {variant === 'nameplate' && <Nameplate isYou={isYou} name={player.name} connected={player.connected} />}
      {variant === 'frame' && <Pill isYou={isYou} name={player.name} />}
      {variant === 'holistic' && <SeatHeader isYou={isYou} name={player.name} connected={player.connected} />}
      <div className="pd-panel__content">
        <Board player={player} />
      </div>
    </div>
  );
  // The tab pokes out past the panel's left edge, which .pd-panel's own
  // overflow: hidden (there for the card corners) would otherwise clip — so
  // it renders as a sibling in an unclipped wrapper instead of a child.
  if (variant !== 'tab') return panel;
  return (
    <div className="pd-panel-wrap">
      <Tab isYou={isYou} name={player.name} />
      {panel}
    </div>
  );
}

export function ScratchpadPage() {
  const [variant, setVariant] = useState<Variant>('baseline');
  const [opponentId, setOpponentId] = useState(MOCK_OPPONENTS[1]!.id);
  const opponent = MOCK_OPPONENTS.find((o) => o.id === opponentId)!;
  const opponentIndex = MOCK_OPPONENTS.findIndex((o) => o.id === opponentId);
  const config = VARIANTS.find((v) => v.id === variant)!;

  return (
    <main className="pd-page">
      <header className="pd-header">
        <span className="pd-eyebrow">DESIGN LAB</span>
        <h1>Whose board is this?</h1>
        <p>Your properties panel and an opponent’s look the same — same cream card, same border, no owner cue. These four variants test how much identity chrome it takes to fix that at a glance.</p>
        <a className="pd-back" href="/demo">Back to the live game →</a>
      </header>

      <nav className="pd-switcher" aria-label="Design variants">
        {VARIANTS.map((v) => (
          <button key={v.id} aria-pressed={variant === v.id} onClick={() => setVariant(v.id)}>
            {v.name}
          </button>
        ))}
      </nav>
      <p className="pd-summary">{config.summary}</p>

      <label className="pd-opponent-picker">
        Compare against
        <select value={opponentId} onChange={(e) => setOpponentId(e.target.value)}>
          {MOCK_OPPONENTS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · {o.sets.length === 0 ? 'empty board' : `${o.sets.length} set${o.sets.length === 1 ? '' : 's'}`}
              {!o.connected ? ' · disconnected' : ''}
            </option>
          ))}
        </select>
        <span>bank ₹{bankTotal(opponent)}Cr</span>
      </label>

      {variant === 'holistic' && <RimMock opponents={MOCK_OPPONENTS} activeId={opponentId} />}

      <div className="pd-stage">
        <Panel player={opponent} variant={variant} seatColor={theme.opponentColor(opponentIndex)} />
        <Panel player={YOU} variant={variant} />
      </div>
    </main>
  );
}
