import type { KeyboardEvent, MouseEvent, RefObject } from 'react';
import type { PropertySet } from '@monopoly-deal/shared';
import { initialsFromName } from '../../components/PlayerAvatar';
import { Icon } from '../kit';
import { useSecondsLeft } from '../live/useSecondsLeft';
import type { Seat, TableActions, TargetKind } from '../model';
import { completeCount, isComplete } from '../model';
import { Glance, seatSummary, setKey } from '../tableGlance';
import type { Rect } from './layout';
import { BankTile, HandBacks, TbSet } from './SetTiles';
import { vars } from './style';

/** What is being aimed at a rival while their seat has the camera. */
export type RivalAim = 'sly_deal' | 'deal_breaker' | 'debt_collector' | 'rent_player' | 'forced_deal';
/** Aims that pick a card or set on the rival's table (the others pick the rival). */
const picksCards = (aim: RivalAim | undefined) => aim === 'sly_deal' || aim === 'deal_breaker' || aim === 'forced_deal';
/** What an aimed action may take from a set. */
export const isPickable = (aim: RivalAim | undefined, s: PropertySet) => (aim === 'sly_deal' || aim === 'forced_deal' ? !isComplete(s) : aim === 'deal_breaker' ? isComplete(s) : false);

interface RivalNearProps {
  seat: Seat;
  /** Final size of the panel, world px — fixed so the tiles do not reflow while the seat is still growing into it. */
  size: { w: number; h: number };
  /** Card width the panel's layout was fitted for (see focusLayout). */
  cardW: number;
  bodyRef: RefObject<HTMLDivElement | null>;
  /** Which ends of the scrolling body have more past them (see useScrollMore). */
  more: 'up' | 'down' | 'both' | undefined;
  /** The action aimed at this seat while it has the camera. */
  aim?: RivalAim;
  onTarget: TableActions['target'];
  onOpenBank(e: MouseEvent<HTMLButtonElement>): void;
}
/** A rival's seat with the camera on it: the same laid-out sets and bank tile as yours, in their colours. */
function RivalNear({ seat, size, cardW: w, bodyRef, more, aim, onTarget, onOpenBank }: RivalNearProps) {
  const picking = picksCards(aim);
  // Same rule as the far-view Glance panel: only a genuine, currently-running grace window counts.
  const graceSecs = useSecondsLeft(seat.connected ? undefined : seat.graceMs);
  return (
    <div className="tb-zone__near" style={{ width: size.w - 12, height: size.h - 12 }}>
      <header className="tb-zone__head">
        <span className="tb-av">{initialsFromName(seat.name)}</span>
        <span className="tb-zone__name">
          <b>{seat.name}</b>
          {graceSecs !== null && <small className="tb-zone__grace">Disconnected · {graceSecs}s to reconnect</small>}
        </span>
        <HandBacks n={seat.handCount} id={seat.id} />
      </header>
      <div className="tb-zone__body" ref={bodyRef} data-more={more}>
        <div className="tb-zone__sets" data-testid="opponent-spotlight-sets">
          <BankTile
            cards={seat.bank}
            w={w}
            seatId={seat.id}
            owner={`${seat.name}’s`}
            testId={`bank-drop-${seat.id}`}
            onOpen={onOpenBank}
          />
          {seat.sets.length === 0 && <span className="tb-empty">nothing laid yet</span>}
          {seat.sets.map((s) => {
            const ok = isPickable(aim, s);
            // Deal Breaker takes a whole set, so the whole tile is the button; the other picks name one card.
            const whole = aim === 'deal_breaker' && ok;
            return (
              <TbSet
                key={s.id}
                set={s}
                w={w}
                peek={setKey(seat.id, s.id)}
                spread={(aim === 'sly_deal' || aim === 'forced_deal') && ok}
                hot={whole}
                dim={picking && !ok}
                mark={picking ? () => (ok && !whole ? 'pick' : ok ? undefined : 'dim') : undefined}
                onPick={whole ? () => onTarget({ rivalId: seat.id, setId: s.id }) : undefined}
                testId={whole ? `deal-breaker-set-${s.id}` : undefined}
                onCard={picking && ok && !whole ? (c) => onTarget({ rivalId: seat.id, cardId: c.id }) : undefined}
                cardTestId={(c) => `steal-card-${c.id}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface RivalSeatProps {
  seat: Seat;
  /** The seat's usual spot on the felt (see seatZones). */
  zone: Rect;
  /** Set while the seat has the camera: where it grows to, the card width inside, and whether its rows scroll (see focusLayout). */
  near?: { rect: Rect; cardW: number; scroll: boolean; bodyRef: RefObject<HTMLDivElement | null>; more: 'up' | 'down' | 'both' | undefined };
  /** Some seat has the camera, so the far seats are not the rivals' tabs. */
  zoomed: boolean;
  turn: boolean;
  waiting: boolean;
  /** The target choice under way, for the glance panel's test id. */
  pick?: TargetKind;
  aim?: RivalAim;
  onTarget: TableActions['target'];
  onOpen(): void;
  onOpenBank(e: MouseEvent<HTMLButtonElement>): void;
}
/** A rival's seat plate on the felt: the glance panel far, the laid-out panel with the camera on it. */
export function RivalSeat({ seat: r, zone: z, near, zoomed: zoomedOnSeat, turn, waiting, pick, aim, onTarget, onOpen, onOpenBank }: RivalSeatProps) {
  const d = completeCount(r.sets);
  const rect = near ? near.rect : z;
  return (
    <section
      className="tb-zone"
      data-seat={r.id}
      style={vars({ left: rect.x, top: rect.y, width: rect.w, height: rect.h, '--seat': r.color, '--seat-ink': r.ink })}
      data-turn={turn}
      data-away={!r.connected}
      data-danger={d >= 2}
      data-waiting={waiting}
      data-focus={!!near}
      data-lod={near ? 'near' : 'far'}
      data-scroll={near?.scroll}
      data-player-id={r.id}
      // The focused seat is the spotlight; while one is, the rivals are the switcher's tabs, not seats.
      data-testid={near ? 'opponent-spotlight' : zoomedOnSeat ? undefined : `opponent-peer-${r.id}`}
      onClick={onOpen}
      {...(near
        ? {}
        : {
            // Far, the seat is one control: the glance panel inside is only a picture of it.
            role: 'button',
            tabIndex: 0,
            'aria-label': `${seatSummary(r)}. Zoom in`,
            onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              onOpen();
            },
          })}
    >
      <Glance seat={r} testId={pick === 'debt_collector' ? `debt-collector-player-${r.id}` : pick === 'rent_player' ? `rent-player-${r.id}` : undefined} />
      {near && <RivalNear seat={r} size={rect} cardW={near.cardW} bodyRef={near.bodyRef} more={near.more} aim={aim} onTarget={onTarget} onOpenBank={onOpenBank} />}
      {near && d >= 2 && <span className="tb-zone__warn">1 SET FROM WINNING</span>}
    </section>
  );
}

interface SeatSwitcherProps {
  rivals: Seat[];
  /** The rival whose seat has the camera. */
  focusId: string;
  waitingOn: Set<string>;
  onPick(id: string): void;
  onClose(): void;
}
/** Under a seat with the camera: every rival as a tab, to swing the camera straight to another. */
export function SeatSwitcher({ rivals, focusId, waitingOn, onPick, onClose }: SeatSwitcherProps) {
  return (
    <nav className="tb-seats" aria-label="Rivals">
      <button type="button" className="tb-seats__close" onClick={onClose} aria-label="Back to the whole table">
        <Icon name="x" />
      </button>
      <div className="tb-seats__tabs">
        {rivals.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={r.id === focusId}
            data-danger={completeCount(r.sets) >= 2}
            data-waiting={waitingOn.has(r.id)}
            data-away={!r.connected}
            data-testid={`opponent-peer-${r.id}`}
            style={vars({ '--seat': r.color })}
            onClick={() => onPick(r.id)}
          >
            <i aria-hidden />
            <span>{r.name}</span>
            {!r.connected && <small className="tb-seats__away">away</small>}
          </button>
        ))}
      </div>
    </nav>
  );
}
