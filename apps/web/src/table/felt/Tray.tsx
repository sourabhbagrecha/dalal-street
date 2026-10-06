import type { RefObject } from 'react';
import { JsnShield } from '../../components/card/parts/JsnShield';
import { Cd, Countdown, Icon, Ring } from '../kit';
import type { handLayout } from '../handLayout';
import type { Prompt, Seat, TableGame } from '../model';
import { cardName, isComplete, payAssets, paySum, stateName } from '../model';
import type { useCardDrag } from '../useCardDrag';
import type { BoardPick, Pill } from './pills';
import { money, vars } from './style';
import { isJsn } from './useHandDrag';

type Drag = ReturnType<typeof useCardDrag>;
/** A choice lined up in the steal picker: the round button plays it. */
type Pending = { label: string; sub?: string; onClick(): void };
type Cta = { label: string; sub?: string; tone?: string; onClick?: () => void; disabled?: boolean; testId?: string; /** Shows the window's clock as a ring around the button. */ ring?: boolean };

// ── end-turn / primary button ──
function ctaFor(g: TableGame, focusSeat: Seat | undefined, selSum: number, pending?: Pending): Cta {
  const p = g.prompt;
  const targeting = p?.kind === 'target' ? p : null;
  let cta: Cta = { label: 'END', sub: 'TURN', onClick: g.actions.endTurn, testId: 'end-turn-btn' };
  if (p?.kind === 'pay') {
    // Under 5s the server is about to auto-pay (cheapest first, bank first) whatever is picked or not — the
    // button says so instead of the running total, so it doesn't read as a payment the player chose.
    const autoIn = g.secs !== null && g.secs <= 5 ? g.secs : null;
    cta = { label: autoIn !== null ? 'AUTO' : 'PAY', sub: autoIn !== null ? `${autoIn}…` : money(selSum), tone: 'green', onClick: g.actions.payConfirm, disabled: !p.valid, testId: 'confirm-payment-btn' };
  }
  else if (p?.kind === 'jsn') {
    // Holding one: the button plays it. Otherwise it is the plain "let it go", which the server also does when the window runs out.
    cta = g.hasJsn
      ? { label: 'NO!', sub: 'JUST SAY', tone: 'red', onClick: () => g.actions.jsn(), testId: 'jsn-play-btn', ring: true }
      : { label: 'Let it\ngo!', onClick: g.actions.allow, testId: `jsn-decline-btn${p.payerId ? `-${p.payerId}` : ''}`, ring: true };
  }
  else if (targeting && pending) cta = { label: pending.label, sub: pending.sub, tone: 'green', onClick: pending.onClick, testId: 'confirm-pick-btn' };
  else if (targeting?.action === 'debt_collector' && focusSeat) cta = { label: 'TAKE', sub: money(targeting.amount ?? 5), tone: 'green', onClick: () => g.actions.target({ rivalId: focusSeat.id }) };
  else if (targeting?.action === 'rent_player' && focusSeat) cta = { label: 'CHARGE', sub: money(targeting.amount ?? 0), tone: 'green', onClick: () => g.actions.target({ rivalId: focusSeat.id }) };
  else if (targeting) cta = g.actions.cancel ? { label: 'BACK', tone: 'ghost', onClick: g.actions.cancel } : { label: '···', disabled: true };
  else if (p?.kind === 'discard') cta = p.sel.length >= p.excess ? { label: 'DISCARD', sub: `${p.excess}`, tone: 'red', onClick: g.actions.discardConfirm, testId: 'confirm-discard-btn' } : { label: `−${p.excess - p.sel.length}`, disabled: true };
  else if (g.wait) cta = { label: '···', disabled: true };
  else if (g.phase === 'draw') cta = { label: 'DRAW', sub: '+2', tone: 'gold', onClick: g.actions.draw, testId: 'draw-btn' };
  else if (g.phase === 'rivals') cta = { label: '···', disabled: true };
  else if (g.plays === 0) cta = { ...cta, tone: 'gold' };
  // Sent and waiting on the server: the button says so, and cannot be pressed again.
  if (g.sending) cta = { ...cta, sub: 'SENDING', onClick: undefined, disabled: true };
  return cta;
}

/**
 * Paying a debt: your bank and properties as tiles to pick, what they add up to, and an auto-pick. While the demand
 * still waits on your answer, a Just Say No from your hand can stop it instead.
 */
function PayPanel({ g, p, selSum }: { g: TableGame; p: Extract<Prompt, { kind: 'pay' }>; selSum: number }) {
  /** Cards in your sets that are part of a complete set: paying with one breaks the set. */
  const lockedIds = new Set(g.me.sets.filter(isComplete).flatMap((s) => s.cards.map((c) => c.id)));
  const jsn = p.jsn ? g.hand.find(isJsn) : undefined;
  return (
    <div className="tb-pay" data-testid="payment-prompt" role="dialog" aria-label={`Pay ${money(p.amount)}`}>
      <div className="tb-pay__head">
        <b>Pay {money(p.amount)}</b>
        <span>
          to {g.rivals.find((r) => r.id === p.toId)?.name ?? 'them'} · {p.reason}
        </span>
        {jsn && (
          <button type="button" className="tb-pay__no" data-testid={`jsn-play-${jsn.id}`} onClick={() => g.actions.jsn(jsn.id)} aria-label="Play Just Say No">
            <span className="tb-alert__shield" aria-hidden>
              <JsnShield className="tb-alert__shield-svg" />
              <i>NO!</i>
            </span>
            <b>Just Say No</b>
          </button>
        )}
      </div>
      <Countdown secs={g.secs} maxSecs={g.maxSecs} className="tb-pay__clock" />
      <div className="tb-pay__cards">
        {payAssets(g).map((c) => {
          const breaks = lockedIds.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              data-testid={`payment-card-${c.id}`}
              data-pay={c.id}
              data-on={p.sel.includes(c.id)}
              data-breaks={breaks ? true : undefined}
              onClick={() => g.actions.paySel(c.id)}
              aria-pressed={p.sel.includes(c.id)}
              aria-label={breaks ? `${cardName(c)}, breaks a set` : cardName(c)}
            >
              <Cd card={c} w={62} />
              {breaks && <em className="tb-pay__breaks">Breaks a set</em>}
              {p.sel.includes(c.id) && (
                <span>
                  <Icon name="check" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="tb-pay__foot">
        <button type="button" className="tb-pay__auto" onClick={g.actions.payAuto}>
          Auto-pick
        </button>
        <span className="tb-pay__sum" data-ok={p.valid}>
          {money(selSum)} of {money(p.amount)}
        </span>
      </div>
    </div>
  );
}

interface TrayProps {
  g: TableGame;
  trayRef: RefObject<HTMLDivElement | null>;
  /** Where each hand card sits (see handLayout). */
  fan: ReturnType<typeof handLayout>;
  pills: Pill[];
  boardPick: BoardPick | null;
  /** The hand card you tapped. */
  sel: string | null;
  drag: Drag['drag'];
  bind: Drag['bind'];
  /** The rival whose seat has the camera, for the button that aims at them. */
  focusSeat: Seat | undefined;
  /** A choice lined up and waiting on the round button. */
  pending?: Pending;
}
/** The tray under the table: the pills for a tapped card, your hand fanned out (or the payment), and the primary button. */
export function Tray({ g, trayRef, fan, pills, boardPick, sel, drag, bind, focusSeat, pending }: TrayProps) {
  const hand = g.hand;
  const p = g.prompt;
  const discarding = p?.kind === 'discard' ? p : null;
  const selSum = p?.kind === 'pay' ? paySum(g, p.sel) : 0;
  const cta = ctaFor(g, focusSeat, selSum, pending);
  /** A demand is lined up on a rival and only this button plays it: it calls for the press. */
  const confirming = (p?.kind === 'target' && ((p.action === 'debt_collector' || p.action === 'rent_player') && !!focusSeat || !!pending)) && !g.sending;
  // The tapped hand card stands taller than the tray; the pills for it sit above the card, not over it.
  const picked = sel && !boardPick ? hand.findIndex((c) => c.id === sel) : -1;
  return (
    <footer
      className="tb-tray"
      data-pay={p?.kind === 'pay' ? true : undefined}
      data-testid="hand-fan"
      ref={trayRef}
      style={fan.trayH && p?.kind !== 'pay' ? vars({ '--tray-h': `${fan.trayH}px` }) : undefined}
    >
      {pills.length > 0 && (
        <div className="tb-pills" data-many={pills.length > 3} style={picked >= 0 ? vars({ '--rise': `${Math.round(fan.rise(picked))}px` }) : undefined}>
          {boardPick && pills.length > 3 && (
            <span className="tb-pills__hint">
              Flip to…{isComplete(boardPick.set) && <small> breaks your {stateName(boardPick.set.color)} set</small>}
            </span>
          )}
          <div className="tb-pills__row">
            {pills.map((pl) => (
              <button key={pl.key} type="button" data-gold={pl.gold} data-testid={pl.testId} disabled={pl.disabled} aria-disabled={pl.disabled} onClick={pl.act}>
                {pl.dot && <i style={vars({ '--c': pl.dot })} aria-hidden />}
                <b>{pl.label}</b>
                {pl.sub && <small>{pl.sub}</small>}
              </button>
            ))}
          </div>
        </div>
      )}
      {p?.kind === 'pay' ? (
        <PayPanel g={g} p={p} selSum={selSum} />
      ) : (
        hand.map((c, i) => {
          const at = fan.place(i);
          return (
            <div
              key={c.id}
              className="tb-card"
              data-cid={c.id}
              data-sel={sel === c.id}
              data-lifted={drag?.cardId === c.id}
              data-legal={g.canAct}
              data-glow={p?.kind === 'jsn' && isJsn(c)}
              data-discard={p?.kind === 'discard'}
              data-picked={discarding?.sel.includes(c.id) ? true : undefined}
              data-testid={`hand-card-${c.id}`}
              data-card-id={c.id}
              style={vars({ '--i': i, '--x': `${at.x}px`, '--y': `${at.y}px`, '--r': `${at.r}deg`, '--hw': `${fan.w}px` })}
              {...bind(c.id)}
              aria-label={cardName(c)}
            >
              <Cd card={c} w={fan.w} />
              {discarding?.sel.includes(c.id) && (
                <span className="tb-card__check" aria-hidden>
                  <Icon name="check" />
                </span>
              )}
            </div>
          );
        })
      )}
      <button type="button" className="tb-cta" aria-label={cta.label.includes('\n') ? cta.label.replace('\n', ' ') : undefined} data-sending={g.sending ? true : undefined} data-confirm={confirming ? true : undefined} data-tone={cta.tone} data-len={cta.label.length > 6 ? 'long' : cta.label.length > 4 ? 'mid' : undefined} disabled={cta.disabled} onClick={cta.onClick} data-testid={cta.testId}>
        {cta.ring && g.secs !== null && <Ring value={g.maxSecs > 0 ? g.secs / g.maxSecs : 0} size={80} stroke={5} color="#f2c14e" track="transparent" className="tb-cta__ring" />}
        <b>{cta.label}</b>
        {cta.sub && <small>{cta.sub}</small>}
      </button>
    </footer>
  );
}
