import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { PROPERTY_SET_DEFS, type Card, type PropertyColor } from '@monopoly-deal/shared';
import { PlayingCard } from '../components/card/PlayingCard';
import { cardTitle } from '../derivations';
import { MOCK_OPPONENTS, bankTotal, type MockOpponent } from './scratchpad/mockOpponents';
import '../styles/scratchpad.css';

const DIRECTIONS = [
  { id: 'social', name: 'Social club', short: 'Club', icon: '♣', title: 'Good cards. Great company.', description: 'One shared velvet table, a relaxed fan of cards, and warm brass details. Rivals stay close; your next move stays closer.', detail: 'The strongest all-round direction. A clear table hierarchy, visible set progress, and a thumb-friendly hand make the game feel social without losing the strategy.' },
  { id: 'party', name: 'Block party', short: 'Party', icon: '✳', title: 'Small cards. Big energy.', description: 'A sunny tabletop with chunky pieces, playful typography, and a big, satisfying turn banner. Built for game night with friends.', detail: 'The most expressive direction. Your collection becomes a row of colourful game pieces and completing a set gets a proper moment in the spotlight.' },
  { id: 'city', name: 'Pocket city', short: 'City', icon: '⌂', title: 'Build your little empire.', description: 'Properties become neighbourhoods on a tiny city plan. Watch empty plots fill up as your collection gets closer to winning.', detail: 'The most strategic direction. A vertical district list explains what you own, what is missing, and what to build next. Great for new players and collectors.' },
  { id: 'night', name: 'After hours', short: 'Night', icon: '✦', title: 'Your next power move.', description: 'An electric late-night card room. A clean, dark stage, luminous accents, and a straight card rail that is easy to browse.', detail: 'The most focused direction. Less visual competition, larger card browsing, and a compact opponent strip keep attention on the decision in your hand.' },
] as const;
type Direction = typeof DIRECTIONS[number]['id'];
type District = { color: PropertyColor; cards: Card[] };
const property = (id: string, color: PropertyColor, index: number): Card => ({ id, kind: 'property', color, value: PROPERTY_SET_DEFS[color].value, name: PROPERTY_SET_DEFS[color].names[index]! });
const HAND: Card[] = [
  property('sp-surat', 'brown', 1),
  { id: 'sp-rent', kind: 'rent', rentType: 'dual', colors: ['brown', 'light_blue'], value: 1 },
  { id: 'sp-money', kind: 'money', amount: 5, value: 5 },
  property('sp-silchar', 'orange', 2),
  { id: 'sp-wild', kind: 'property_wild', colors: ['railroad', 'utility'], value: 2 },
];
const INITIAL_DISTRICTS: District[] = [
  { color: 'brown', cards: [property('sp-ahmedabad', 'brown', 0)] },
  { color: 'orange', cards: [property('sp-guwahati', 'orange', 0), property('sp-dibrugarh', 'orange', 1)] },
  { color: 'utility', cards: [property('sp-agra', 'utility', 0)] },
];
const INKS: Partial<Record<PropertyColor, string>> = { brown: '#be8054', orange: '#ff8e52', utility: '#65c8bd' };
const complete = (d: District) => d.cards.length >= PROPERTY_SET_DEFS[d.color].names.length;

function Sheet({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog className="lab-sheet" ref={ref} onCancel={close} onClick={(e) => { if (e.target === e.currentTarget) close(); }} aria-label={title}>
    <div className="lab-sheet__body"><header><h2>{title}</h2><button className="lab-icon-button" onClick={close} aria-label="Close dialog">×</button></header>{children}</div>
  </dialog>;
}

function Rivals({ players, inspect, direction }: { players: number; inspect: (p: MockOpponent) => void; direction: Direction }) {
  return <div className="lab-rivals" aria-label="Other players">
    {MOCK_OPPONENTS.slice(0, players - 1).map((p, i) => <button key={p.id} className="lab-rival" onClick={() => inspect(p)} style={{ '--seat-color': ['#e7a094', '#b8b0e6', '#9ccaad', '#e8c576'][i] } as CSSProperties} aria-label={`Inspect ${p.name}, ${p.handCount} cards, bank ₹${bankTotal(p)}Cr`}>
      <span className="lab-rival__portrait"><span>{['P', 'M', 'Y', 'A'][i]}</span><i>{p.handCount}</i></span>
      <span className="lab-rival__name">{p.name}{!p.connected && <small> · away</small>}</span>
      <span className="lab-rival__stats">₹{bankTotal(p)} <span>·</span> {i === 1 || i === 3 ? '1' : '0'}/3 {direction === 'night' ? 'sets' : '★'}</span>
    </button>)}
  </div>;
}

function Collection({ districts, direction, inspect }: { districts: District[]; direction: Direction; inspect: (d: District) => void }) {
  return <div className="lab-districts">{districts.map((d) => <button key={d.color} className={`lab-district ${complete(d) ? 'lab-district--complete' : ''}`} style={{ '--district': INKS[d.color] ?? '#96ace0' } as CSSProperties} onClick={() => inspect(d)} aria-label={`Inspect ${PROPERTY_SET_DEFS[d.color].state}, ${d.cards.length} of ${PROPERTY_SET_DEFS[d.color].names.length} cards`}>
    <span className="lab-district__cards" aria-hidden="true">{d.cards.map((card, i) => <span key={card.id} className="lab-mini-card" style={{ '--stack': i } as CSSProperties}><PlayingCard card={card} /></span>)}{direction === 'city' && <span className="lab-district__plot">+</span>}</span>
    <span className="lab-district__name">{PROPERTY_SET_DEFS[d.color].state}</span>
    <span className="lab-district__progress">{Array.from({ length: PROPERTY_SET_DEFS[d.color].names.length }, (_, i) => <i key={i} data-filled={i < d.cards.length} />)}<b>{complete(d) ? '✓' : `${d.cards.length}/${PROPERTY_SET_DEFS[d.color].names.length}`}</b></span>
    {direction === 'city' && <span className="lab-district__hint">{complete(d) ? 'District complete' : `${PROPERTY_SET_DEFS[d.color].names.length - d.cards.length} more to complete`}</span>}
  </button>)}</div>;
}

/** Scripted design studies, isolated from the live game store and network. */
export function ScratchpadPage() {
  const [direction, setDirection] = useState<Direction>('social');
  const [players, setPlayers] = useState(4);
  const [hand, setHand] = useState(HAND);
  const [districts, setDistricts] = useState(INITIAL_DISTRICTS);
  const [bank, setBank] = useState(6);
  const [plays, setPlays] = useState(3);
  const [waiting, setWaiting] = useState(false);
  const [selected, setSelected] = useState<Card | null>(null);
  const [opponent, setOpponent] = useState<MockOpponent | null>(null);
  const [district, setDistrict] = useState<District | null>(null);
  const [panel, setPanel] = useState<'about' | 'activity' | 'bank' | 'deck' | null>(null);
  const [events, setEvents] = useState(['Priya banked ₹3Cr', 'Marcus completed Maharashtra', 'Your turn · 2 cards drawn']);
  const [notice, setNotice] = useState('');
  const [celebration, setCelebration] = useState(false);
  const config = DIRECTIONS.find((d) => d.id === direction)!;
  const sets = districts.filter(complete).length;
  const rent = PROPERTY_SET_DEFS.brown.rent[Math.min(districts[0]!.cards.length, 2) - 1]!;
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => { setNotice(''); setCelebration(false); }, 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function reset() {
    setHand(HAND); setDistricts(INITIAL_DISTRICTS); setBank(6); setPlays(3); setWaiting(false);
    setNotice(''); setCelebration(false); setEvents(['Priya banked ₹3Cr', 'Marcus completed Maharashtra', 'Your turn · 2 cards drawn']); setPanel(null);
  }
  function record(message: string) { setNotice(message); setEvents((old) => [...old, message]); }
  function play(mode: 'bank' | 'build' | 'rent') {
    if (!selected || waiting || plays < 1 || sets === 3) return;
    if (mode === 'bank') { setBank((n) => n + selected.value); record(`Banked ₹${selected.value}Cr. Nicely secured.`); }
    if (mode === 'build') {
      const color = selected.kind === 'property' ? selected.color : 'utility';
      const old = districts.find((d) => d.color === color);
      const next = { color, cards: [...(old?.cards ?? []), selected] };
      setDistricts((all) => old ? all.map((d) => d.color === color ? next : d) : [...all, next]);
      const finished = complete(next); setCelebration(finished);
      record(finished ? `${PROPERTY_SET_DEFS[color].state} complete! ${sets + 1}/3 sets ★` : `${PROPERTY_SET_DEFS[color].state} is growing!`);
    }
    if (mode === 'rent') record(`Rent requested! Everyone owes ₹${rent}Cr.`);
    setHand((cards) => cards.filter((c) => c.id !== selected.id)); setPlays((n) => n - 1); setSelected(null);
  }

  return <main className={`lab lab--${direction}`}>
    <div className="lab-switcher"><div className="lab-switcher__heading"><span>THE DESIGN LAB <i>4 interactive concepts</i></span><button onClick={() => setPanel('about')} aria-label="About these prototypes">↗</button></div><nav aria-label="Design directions">{DIRECTIONS.map((d, i) => <button key={d.id} aria-pressed={direction === d.id} onClick={() => { setDirection(d.id); setSelected(null); }}><small>0{i + 1}</small><span>{d.short}</span></button>)}</nav></div>
    <div className="lab-game" key={direction}>
      <header className="lab-game__header"><div className="lab-brand"><span>{config.icon}</span><div><b>{config.name}</b><small>MONOPOLY DEAL</small></div></div><button className="lab-icon-button" onClick={() => setPanel('about')} aria-label="Table settings">•••</button></header>
      <Rivals players={players} direction={direction} inspect={setOpponent} />
      <div className="lab-arena"><div className="lab-arena__inscription" aria-hidden="true">{direction === 'social' ? 'THE GOOD HAND CLUB' : direction === 'party' ? 'LET’S MAKE A DEAL!' : direction === 'city' ? 'YOUR CITY STARTS HERE' : 'FORTUNE FAVOURS THE BOLD'}</div><div className="lab-piles"><button className="lab-deck" onClick={() => setPanel('deck')} aria-label="Inspect draw pile"><span>{config.icon}</span><small>DEAL</small></button><button className="lab-discard" onClick={() => setPanel('activity')} aria-label="Inspect last play"><PlayingCard card={{ id: 'sp-discard', kind: 'money', amount: 3, value: 3 }} /></button></div><span className="lab-pile-label">78 in deck <i>·</i> 12 played</span><button className="lab-last-play" onClick={() => setPanel('activity')}><span className="lab-live-dot" />{events[events.length - 2] ?? 'A fresh table. Make your move.'}<span>↗</span></button></div>
      <section className="lab-turn" aria-label="Turn status"><div><span className="lab-eyebrow">{waiting ? 'ACROSS THE TABLE' : sets === 3 ? 'THREE COMPLETE SETS' : 'MAKE YOUR MOVE'}</span><h1>{sets === 3 ? 'You built an empire!' : waiting ? 'Priya’s turn' : direction === 'party' ? 'You’re up!' : direction === 'city' ? 'Time to build.' : 'Your turn.'}<span>{waiting ? '◌' : '✦'}</span></h1></div><div className="lab-turn__moves"><span>{[0, 1, 2].map((i) => <i key={i} data-filled={i < plays} />)}</span><small>{waiting ? 'Take a breather' : `${plays} plays left`}</small></div></section>
      <section className="lab-collection" aria-label="Your collection"><header><h2>{direction === 'city' ? 'Your neighbourhoods' : 'Your collection'} <span>{sets}/3 sets</span></h2><button onClick={() => setPanel('bank')} aria-label={`Inspect your bank, ₹${bank}Cr`}><span>▤</span> ₹{bank}<small>Cr</small></button></header><Collection districts={districts} direction={direction} inspect={setDistrict} /></section>
      <section className="lab-hand" aria-label="Your hand"><header><h2>Your hand <span>{hand.length}</span></h2><span>{waiting ? 'Plan your next move' : 'Tap a card to make a move'}</span></header><div className="lab-hand__cards">{hand.map((card, i) => <button key={card.id} className="lab-hand__card" style={{ '--angle': `${(i - (hand.length - 1) / 2) * 6}deg`, '--lift': `${Math.abs(i - (hand.length - 1) / 2) * 6}px` } as CSSProperties} onClick={() => setSelected(card)} aria-label={`Select ${cardTitle(card)}`}><PlayingCard card={card} /></button>)}{hand.length === 0 && <p>All played. A very good hand.</p>}</div></section>
      <footer className="lab-actions"><button className="lab-icon-button" onClick={() => setPanel('activity')} aria-label="Open table activity">≡</button><p>{sets === 3 ? 'Three sets. One winner.' : waiting ? 'A little planning goes a long way.' : plays === 0 ? 'Nice moves. Pass it on.' : 'Three sets. Endless possibilities.'}</p><button className="lab-end-turn" onClick={() => { if (sets === 3) { reset(); return; } if (waiting) { setWaiting(false); setPlays(3); record('Your turn · sample hand restored'); setHand(HAND.filter((c) => !districts.some((d) => d.cards.some((p) => p.id === c.id)))); } else { setWaiting(true); record('Turn passed to Priya'); } }}>{sets === 3 ? 'Play again ↻' : waiting ? 'Next turn →' : 'End turn →'}</button></footer>
    </div>
    {notice && <div className={`lab-toast ${celebration ? 'lab-toast--celebrate' : ''}`} role="status" key={notice}>{celebration && <span>✦</span>}{notice}</div>}
    {selected && <Sheet title={cardTitle(selected)} close={() => setSelected(null)}><div className="lab-card-preview"><PlayingCard card={selected} /></div><p className="lab-sheet__hint">{waiting ? 'Plan ahead. You can play when it is your turn.' : plays === 0 ? 'All three plays used. End your turn to continue.' : selected.kind === 'property' ? 'Build your collection, or save its value in your bank.' : selected.kind === 'rent' ? 'Try the rent-request interaction for your Gujarat set.' : selected.kind === 'property_wild' ? 'This sample places the wild in Uttar Pradesh.' : 'Money in your bank protects your properties.'}</p><div className="lab-sheet__actions">{(selected.kind === 'property' || selected.kind === 'property_wild') && <button disabled={waiting || plays === 0 || sets === 3} onClick={() => play('build')}>＋ Add to collection</button>}{selected.kind === 'rent' && <button disabled={waiting || plays === 0 || sets === 3} onClick={() => play('rent')}>Request rent · ₹{rent}Cr each</button>}<button disabled={waiting || plays === 0 || sets === 3} onClick={() => play('bank')}>Bank ₹{selected.value}Cr</button></div></Sheet>}
    {opponent && <Sheet title={`${opponent.name}’s table`} close={() => setOpponent(null)}><p>{opponent.handCount} cards in hand · ₹{bankTotal(opponent)}Cr in bank{!opponent.connected && ' · Currently away'}</p><div className="lab-inspect-cards">{opponent.sets.flatMap((s) => s.cards).map((card) => <PlayingCard key={card.id} card={card} />)}</div>{opponent.sets.length === 0 && <p>No properties yet. An empire has to start somewhere.</p>}</Sheet>}
    {district && <Sheet title={PROPERTY_SET_DEFS[district.color].state} close={() => setDistrict(null)}><p>{district.cards.length} of {PROPERTY_SET_DEFS[district.color].names.length} cards · {complete(district) ? 'Complete set ★' : 'Room to grow'}</p><div className="lab-inspect-cards">{district.cards.map((card) => <PlayingCard key={card.id} card={card} />)}</div></Sheet>}
    {panel && <Sheet title={panel === 'about' ? config.name : panel === 'activity' ? 'Around the table' : panel === 'bank' ? 'Your rainy-day fund' : 'The next good hand'} close={() => setPanel(null)}>
      {panel === 'about' && <><span className="lab-prototype-label">INTERACTIVE DESIGN PROTOTYPE</span><h3>{config.title}</h3><p>{config.description}</p><p>{config.detail}</p><label className="lab-player-select">Players at the table<select value={players} onChange={(e) => setPlayers(Number(e.target.value))}>{[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} players</option>)}</select></label><p className="lab-sheet__hint">Scripted sample moves, shared across all four designs. Switch freely to compare the same position. The live game is at /local.</p><div className="lab-sheet__actions"><button onClick={reset}>Reset the sample table ↻</button><a href="/local">Back to the live game →</a></div></>}
      {panel === 'activity' && <ol className="lab-feed">{events.map((event, i) => <li key={`${i}-${event}`}><span>{String(i + 1).padStart(2, '0')}</span>{event}</li>)}</ol>}
      {panel === 'bank' && <><div className="lab-bank-total">₹{bank}<small>Cr</small></div><p>A little security for your next big move. Tap a card in your hand to add its value to your bank.</p><p className="lab-sheet__hint">Banked cards stay in the bank. They cannot be played again as properties or actions.</p></>}
      {panel === 'deck' && <><p>78 cards waiting to change the game.</p><p>Your two cards have already been drawn for this sample turn. Pick a card from your hand to build, bank, or request rent.</p><div className="lab-sheet__actions"><button onClick={() => setPanel(null)}>Let’s play →</button></div></>}
    </Sheet>}
  </main>;
}
