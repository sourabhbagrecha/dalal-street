import type { KeyboardEvent, MouseEvent } from 'react';
import type { Card, PropertySet } from '@monopoly-deal/shared';
import { CashPile } from '../../components/CashPile';
import { CardBack, Icon, SetStack } from '../kit';
import { isComplete, setSize, stateName } from '../model';
import { bankKey, setCode } from '../tableGlance';
import { stepFor } from './layout';
import { colorOf, vars } from './style';

/** The pieces a seat is laid out from: its hand backs, its set-count stars, and one tile per set plus the bank. */

export function HandBacks({ n, id }: { n: number; id: string }) {
  const shown = Math.min(n, 7);
  return (
    <span className="tb-backs" data-hand={id} aria-label={`${n} cards in hand`}>
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} style={vars({ '--o': i - (shown - 1) / 2 })}>
          <CardBack w={34} />
        </span>
      ))}
      <b>{n}</b>
    </span>
  );
}

interface TbSetProps {
  set: PropertySet;
  w: number;
  spread?: boolean;
  zone?: boolean;
  hot?: boolean;
  dim?: boolean;
  mark?: (c: Card) => 'pick' | 'dim' | 'hit' | 'tap' | 'sel' | undefined;
  onCard?: (c: Card) => void;
  /** Test id for a card `mark` calls pickable. */
  cardTestId?: (c: Card) => string | undefined;
  /** Makes the whole tile one tap (a rent colour, a building's set, a Deal Breaker's set). */
  onPick?: () => void;
  /** What the tap does, in a chip on the tile ("+₹3 rent"). */
  chip?: string;
  /** What the set would charge as rent ("₹4Cr"). Takes the place of the card count under the name, so it is never clipped or stacked over a neighbour. */
  rent?: string;
  testId?: string;
  /** Hold-to-magnify key (see usePeek). */
  peek?: string;
}
export function TbSet({ set, w, spread, zone, hot, dim, mark, onCard, cardTestId, onPick, chip, rent, testId, peek }: TbSetProps) {
  const n = set.cards.length;
  return (
    <div
      className="tb-set"
      style={vars({ '--c': colorOf(set.color) })}
      data-complete={isComplete(set)}
      data-hot={hot}
      data-dim={dim}
      data-pick={onPick ? true : undefined}
      data-zone={zone ? 'build' : undefined}
      data-color={zone ? set.color : undefined}
      data-peek={peek}
      data-testid={testId}
      {...(onPick
        ? {
            role: 'button',
            tabIndex: 0,
            onClick: (e: MouseEvent<HTMLDivElement>) => {
              e.stopPropagation();
              onPick();
            },
            onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              onPick();
            },
          }
        : {})}
    >
      {chip && <span className="tb-set__chip">{chip}</span>}
      <SetStack set={set} w={w} step={spread ? w + 8 : stepFor(w)} mark={mark} onCard={onCard} cardTestId={cardTestId} />
      <span className="tb-set__lab">
        <b>
          <span className="tb-set__full">{stateName(set.color)}</span>
          <span className="tb-set__code">{setCode(set.color)}</span>
        </b>
        {rent ? (
          <i className="tb-set__rent">{rent}</i>
        ) : (
          <i>
            {isComplete(set) && <Icon name="crown" className="tb-set__lab-crown" />}
            {n}/{setSize(set.color)}
          </i>
        )}
      </span>
      {isComplete(set) && (
        <span className="tb-set__crown">
          <Icon name="crown" />
        </span>
      )}
    </div>
  );
}

interface BankTileProps {
  cards: Card[];
  w: number;
  seatId: string;
  /** "Your" / "Marcus’s" — for the pile's accessible name. */
  owner: string;
  hot?: boolean;
  dim?: boolean;
  /** Makes it a drop target for dragged cards. */
  drop?: boolean;
  testId?: string;
  /** Cards put down on it that the server has not confirmed yet: parked on the stage, and counted in the label. */
  extra?: number;
  onOpen(e: MouseEvent<HTMLButtonElement>): void;
}
/** The bank is one more tile in a seat's row — same footprint and label as a set. */
export function BankTile({ cards, w, seatId, owner, hot, dim, drop, testId, extra = 0, onOpen }: BankTileProps) {
  return (
    <div
      className="tb-set tb-bank"
      style={vars({ '--c': 'var(--money-green, #2e9d5c)', '--card-w': `${w}px` })}
      data-zone={drop ? 'bank' : undefined}
      data-testid={drop ? testId : undefined}
      data-peek={bankKey(seatId)}
      data-hot={hot}
      data-dim={dim}
      onClick={(e) => e.stopPropagation()}
    >
      {cards.length === 0 ? (
        <span className="tb-bank__ghost" style={{ width: w, height: (w * 7) / 5 }} aria-label={`${owner} bank, empty`}>
          {drop ? '+' : ''}
        </span>
      ) : (
        <CashPile cards={cards} ariaLabel={`${owner} bank`} testId={drop ? undefined : testId} onOpen={onOpen} />
      )}
      <span className="tb-set__lab">
        <b>Bank</b>
        <i>{cards.length + extra === 0 ? 'empty' : `${cards.length + extra} card${cards.length + extra === 1 ? '' : 's'}`}</i>
      </span>
    </div>
  );
}
