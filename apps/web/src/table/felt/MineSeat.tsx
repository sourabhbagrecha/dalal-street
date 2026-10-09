import type { MouseEvent, RefObject } from 'react';
import type { Card } from '@monopoly-deal/shared';
import type { TableGame } from '../model';
import { buildColors, flipColors, isComplete } from '../model';
import { setKey } from '../tableGlance';
import { ME_ZONE } from './layout';
import type { Rect } from './layout';
import { BankTile, TbSet } from './SetTiles';
import { money, vars } from './style';

interface MineSeatProps {
  g: TableGame;
  /** Where the seat sits and how big it is (mineLayout with the camera on it, farMineLayout otherwise). */
  rect: Rect;
  /** Card width its tiles were fitted for. */
  cardW: number;
  /** The camera is on your seat. */
  near: boolean;
  /** Its tiles run past the panel and scroll inside it. */
  scroll: boolean;
  bodyRef: RefObject<HTMLDivElement | null>;
  /** Which ends of the scrolling body have more past them (see useScrollMore). */
  more: 'up' | 'down' | 'both' | undefined;
  /** The hand card being dragged. */
  dragCard: Card | undefined;
  /** Where the dragged card may land. */
  hotZones: Set<string>;
  /** The wild picked in one of your sets, to flip. */
  selBoard: string | null;
  /** A wild in one of your sets tapped: pick it to flip, or put it back. */
  onPickBoard(id: string): void;
  onOpenBank(e: MouseEvent<HTMLButtonElement>): void;
  onClick(): void;
}
/** Your own seat: your bank and your sets as tiles, the drop target for everything you build or bank. */
export function MineSeat({ g, rect: mz, cardW: mineW, near: mineNear, scroll, bodyRef, more, dragCard, hotZones, selBoard, onPickBoard, onOpenBank, onClick }: MineSeatProps) {
  const p = g.prompt;
  const targeting = p?.kind === 'target' ? p : null;
  const focusColors = dragCard ? buildColors(dragCard, g.me.sets) : [];
  const bankHot = !!dragCard && hotZones.has('bank');
  const rentPick = targeting?.action === 'rent';
  const buildPick = targeting?.action === 'building';
  return (
    <section
      className="tb-mine"
      data-testid="self-stage"
      data-seat={g.me.id}
      style={vars({ left: mz.x, top: mz.y, width: mz.w, height: mz.h })}
      data-zone="auto"
      data-hot={!!dragCard && g.canAct}
      data-focus={mineNear}
      data-grown={mz.h > ME_ZONE.h}
      data-scroll={mineNear && scroll}
      onClick={onClick}
    >
      <header className="tb-mine__head" data-testid="table-seat-self">
        <span className="tb-av tb-av--me">★</span>
        <b>{g.me.name}</b>
        <span className="tb-mine__rent">rent shown under each set</span>
      </header>
      <div className="tb-mine__body" ref={bodyRef} data-more={more}>
        <div className="tb-mine__sets" data-testid="properties-drop">
          <BankTile
            cards={g.me.bank}
            w={mineW}
            seatId={g.me.id}
            owner={g.spectating ? `${g.me.name}’s` : 'Your'}
            drop
            testId="bank-drop"
            hot={bankHot}
            dim={(!!dragCard && !bankHot) || rentPick || buildPick}
            extra={g.sent.filter((o) => o.zone === 'bank').length}
            onOpen={onOpenBank}
          />
          {g.me.sets.map((s) => {
            const rentAmt = rentPick ? targeting.colors?.find((c) => c.color === s.color)?.amount : undefined;
            const rentOk = rentAmt !== undefined;
            const buildOk = buildPick && !!targeting.eligibleSets?.includes(s.id);
            const dropHot = !!dragCard && hotZones.has('build') && focusColors.includes(s.color) && !isComplete(s);
            const flipOk = mineNear && g.canRearrange && !p && !dragCard;
            const flips = (c: Card) => flipOk && c.kind === 'property_wild' && flipColors(c, g.me.sets).some((x) => x !== s.color);
            return (
              <TbSet
                key={s.id}
                set={s}
                w={mineW}
                peek={setKey(g.me.id, s.id)}
                zone
                hot={dropHot || buildOk}
                dim={(!!dragCard && hotZones.has('build') && !focusColors.includes(s.color)) || (rentPick && !rentOk) || (buildPick && !buildOk)}
                onPick={rentOk ? () => g.actions.target({ color: s.color }) : buildOk ? () => g.actions.target({ setId: s.id }) : undefined}
                chip={buildOk ? `+${money(targeting.building === 'hotel' ? 4 : 3)} rent` : undefined}
                rent={rentOk ? money(rentAmt) : undefined}
                testId={rentOk ? `rent-color-${s.color}` : buildOk ? `building-set-${s.id}` : undefined}
                mark={
                  p?.kind === 'jsn'
                    ? (c) => (c.id === p.at?.id ? 'hit' : undefined)
                    : (c) => (flips(c) ? (selBoard === c.id ? 'sel' : 'tap') : undefined)
                }
                onCard={flipOk ? (c) => onPickBoard(c.id) : undefined}
                cardTestId={(c) => `board-card-${c.id}`}
              />
            );
          })}
          {g.me.sets.length === 0 && <span className="tb-empty">{g.spectating ? 'nothing laid yet' : 'throw a property here'}</span>}
        </div>
      </div>
    </section>
  );
}
