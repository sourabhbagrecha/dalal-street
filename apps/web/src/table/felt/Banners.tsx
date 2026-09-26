import type { Card, PropertySet } from '@monopoly-deal/shared';
import { Cd } from '../kit';
import type { Prompt, TableActions, TargetKind } from '../model';
import { cardName, targetLabel } from '../model';
import { colorOf, money, vars } from './style';
import { isJsn } from './useHandDrag';

/** What sits over the top of the camera: the target banner, the hand-limit banner and the Just Say No alert. */

/** The old prompt each target choice replaces, kept as its test id on the banner that now asks it. */
const TARGET_TESTID: Record<TargetKind, string> = {
  sly_deal: 'steal-target-prompt',
  deal_breaker: 'deal-breaker-prompt',
  debt_collector: 'debt-collector-prompt',
  rent: 'rent-color-prompt',
  rent_player: 'rent-player-prompt',
  forced_deal: 'forced-deal-prompt',
  building: 'building-prompt',
};
type TargetPrompt = Extract<Prompt, { kind: 'target' }>;

/** What the banner asks. */
function targetTitle(t: TargetPrompt): string {
  switch (t.action) {
    case 'debt_collector':
      return `Pick who pays ${money(t.amount ?? 5)}`;
    case 'rent_player':
      return t.amount ? `Pick who pays the ${money(t.amount)} rent` : targetLabel.rent_player;
    case 'forced_deal':
      return t.step === 'own' ? 'Pick your property to give' : 'Pick a property to swap for';
    case 'building':
      return `Place a ${t.building === 'hotel' ? 'Hotel' : 'House'} on a complete set`;
    default:
      return targetLabel[t.action];
  }
}

/** The line under it: where to look and what to tap. */
function targetHint(t: TargetPrompt, focusName?: string, brief = false): string {
  if (t.action === 'rent') return 'tap a set · the ₹ under it is what it charges';
  if (t.action === 'building') return 'your table · tap a set that glows';
  if (t.action === 'forced_deal' && t.step === 'own') return 'your table · a complete set can’t be traded';
  if (focusName) return `${focusName}'s table · switch rival below`;
  return brief ? 'tap a rival' : 'the whole table · tap the rival you want to play against';
}

/** The target choice under way: what it asks, and where to look. */
export function TargetBanner({ targeting, sets, focusName }: { targeting: TargetPrompt; sets: PropertySet[]; focusName?: string }) {
  /** Forced Deal, rival step: your property that goes across, with the colour of the set it leaves. */
  const giveCard = (() => {
    if (!targeting.give) return null;
    for (const s of sets) {
      const c = s.cards.find((x) => x.id === targeting.give);
      if (c) return { card: c, color: s.color };
    }
    return null;
  })();
  return (
    <div className="tb-banner" data-testid={TARGET_TESTID[targeting.action]} data-action={targeting.action}>
      <b>{targetTitle(targeting)}</b>
      <span>
        {giveCard && (
          <>
            Swap your <i className="tb-banner__dot" style={vars({ '--c': colorOf(giveCard.color) })} aria-hidden />
            <em>{cardName(giveCard.card)}</em> for…{' '}
          </>
        )}
        {targetHint(targeting, focusName, !!giveCard)}
      </span>
    </div>
  );
}

/** Hand limit: how many are marked, and the way back to playing when there is one. */
export function DiscardBanner({ discarding, onResume }: { discarding: Extract<Prompt, { kind: 'discard' }>; onResume(): void }) {
  return (
    <div className="tb-banner tb-banner--row" data-testid="hand-limit-prompt" data-ready={discarding.sel.length >= discarding.excess}>
      <div>
        <b>
          Discard {Math.min(discarding.sel.length, discarding.excess)} of {discarding.excess}
        </b>
        <span>Tap cards, or drag them to the pile</span>
      </div>
      {discarding.canResume && (
        <button type="button" data-testid="resume-play-btn" onClick={onResume}>
          Play instead
        </button>
      )}
    </div>
  );
}

/** A play aimed at you that a Just Say No could stop: the contested card, the threat, and one button per Just Say No in hand. */
export function JsnAlert({ jsnAsk, hand, actions }: { jsnAsk: Extract<Prompt, { kind: 'jsn' }>; hand: Card[]; actions: TableActions }) {
  /** Just Say No cards in your hand, for the alert's buttons. */
  const jsnCards = hand.filter(isJsn);
  return (
    <div className="tb-alert" data-testid={`jsn-prompt${jsnAsk.payerId ? `-${jsnAsk.payerId}` : ''}`} role="alert">
      <span className="tb-alert__face">
        <Cd card={jsnAsk.card} w={52} />
      </span>
      <div className="tb-alert__body">
        <b>{jsnAsk.label}</b>
        <span>{jsnAsk.threat}.</span>
        <div className="tb-alert__acts">
          {jsnCards.map((c) => (
            <button key={c.id} type="button" className="tb-alert__no" data-testid={`jsn-play-${c.id}`} onClick={() => actions.jsn(c.id)} aria-label="Play Just Say No">
              <Cd card={c} w={22} />
              <b>NO!</b>
            </button>
          ))}
          <button type="button" className="tb-alert__let" data-testid={`jsn-decline-btn${jsnAsk.payerId ? `-${jsnAsk.payerId}` : ''}`} onClick={actions.allow}>
            Let it go
          </button>
        </div>
      </div>
    </div>
  );
}
