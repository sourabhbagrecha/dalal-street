import type { PropertySet } from '@monopoly-deal/shared';
import { Cd, Countdown } from '../kit';
import type { Prompt, Seat, TableActions, TargetKind } from '../model';
import { cardName, targetLabel } from '../model';
import { colorOf, money, vars } from './style';

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

/** A steal with nothing to take: what the banner says instead of asking. */
const EMPTY: Partial<Record<TargetKind, { title: string; card: string }>> = {
  sly_deal: { title: 'No property to take', card: 'Sly Deal' },
  forced_deal: { title: 'No property to swap', card: 'Forced Deal' },
  deal_breaker: { title: 'No player has a complete set', card: 'Deal Breaker' },
};

/** A demand aimed at one player (Debt Collector, a single-target rent): pick them, then press the round button to play it. */
const isDemand = (t: TargetPrompt) => t.action === 'debt_collector' || t.action === 'rent_player';

/** What the viewer has lined up and not yet played, as the banner names it: the card or set, and whose it is. */
export interface ArmedLabel {
  what: string;
  who: string;
  /** Forced Deal: the property of yours that goes across. */
  give?: string;
}

/** The word on the round button that plays a lined-up choice. */
export const confirmWord = (t: TargetPrompt): string =>
  t.action === 'debt_collector' || t.action === 'deal_breaker' ? 'TAKE' : t.action === 'rent_player' ? 'CHARGE' : t.action === 'sly_deal' ? 'STEAL' : 'SWAP';

/** Where the viewer is in a choice that ends on the round button: the step they are on, how many there are, and its name. */
function stepOf(t: TargetPrompt, lined: boolean): { n: number; of: number; label: string } | null {
  if (t.empty) return null;
  switch (t.action) {
    case 'debt_collector':
    case 'rent_player':
      return { n: lined ? 2 : 1, of: 2, label: lined ? 'Confirm' : 'Pick a rival' };
    case 'sly_deal':
      return { n: lined ? 2 : 1, of: 2, label: lined ? 'Confirm' : 'Pick a card' };
    case 'deal_breaker':
      return { n: lined ? 2 : 1, of: 2, label: lined ? 'Confirm' : 'Pick a set' };
    case 'forced_deal':
      return t.step === 'own' ? { n: 1, of: 3, label: 'Your property' } : { n: lined ? 3 : 2, of: 3, label: lined ? 'Confirm' : 'Their property' };
    default:
      return null;
  }
}

/** What the banner asks. */
function targetTitle(t: TargetPrompt, focusName?: string, armed?: ArmedLabel): string {
  const empty = t.empty && EMPTY[t.action];
  if (empty) return empty.title;
  // Something is lined up: the question is now whether to go through with it.
  if (armed) {
    if (t.action === 'sly_deal') return `Steal ${armed.what} from ${armed.who}?`;
    if (t.action === 'deal_breaker') return `Take ${armed.who}’s ${armed.what} set?`;
    if (t.action === 'forced_deal') return `Swap ${armed.give ?? 'yours'} for ${armed.what}?`;
  }
  if (focusName && isDemand(t)) return `${t.action === 'debt_collector' ? 'Collect' : 'Charge'} ${money(t.amount ?? (t.action === 'debt_collector' ? 5 : 0))} from ${focusName}?`;
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
function targetHint(t: TargetPrompt, focusName?: string, lined = false, armed?: ArmedLabel): string {
  const empty = t.empty && EMPTY[t.action];
  if (empty) return `nothing to take · ${empty.card} goes to the discard pile`;
  if (armed) return `${t.action === 'forced_deal' ? `with ${armed.who} · ` : ''}not played yet · press ${confirmWord(t)} to confirm, or pick another`;
  if (t.action === 'rent') return 'tap a set · the ₹ under it is what it charges';
  if (t.action === 'building') return 'your table · tap a set that glows';
  if (t.action === 'forced_deal') return t.step === 'own' ? 'tap the property you will give · complete sets can’t be traded' : 'tap the property you want in exchange';
  if (t.action === 'sly_deal') return 'tap the card you want · complete sets are safe';
  if (t.action === 'deal_breaker') return 'tap the complete set you want · it comes with its buildings';
  if (focusName && isDemand(t)) return `not played yet · press ${confirmWord(t)} to confirm, or switch rival below`;
  if (focusName) return `${focusName}'s table · switch rival below`;
  return lined ? 'tap a rival' : 'the whole table · tap the rival you want to play against';
}

/** The target choice under way: what it asks, and where to look. */
export function TargetBanner({ targeting, sets, focusName, armed }: { targeting: TargetPrompt; sets: PropertySet[]; focusName?: string; armed?: ArmedLabel }) {
  /** Forced Deal, rival step: your property that goes across, with the colour of the set it leaves. */
  const giveCard = (() => {
    if (!targeting.give) return null;
    for (const s of sets) {
      const c = s.cards.find((x) => x.id === targeting.give);
      if (c) return { card: c, color: s.color };
    }
    return null;
  })();
  const step = stepOf(targeting, !!armed || (!!focusName && isDemand(targeting)));
  return (
    <div className="tb-banner" data-testid={TARGET_TESTID[targeting.action]} data-action={targeting.action} data-step={step?.n} data-final={step && step.n === step.of ? true : undefined}>
      {step && (
        <i className="tb-banner__step" aria-label={`Step ${step.n} of ${step.of}`}>
          {Array.from({ length: step.of }, (_, i) => (
            <u key={i} data-on={i < step.n} />
          ))}
          {step.label}
        </i>
      )}
      <b>{targetTitle(targeting, focusName, armed)}</b>
      <span>
        {giveCard && !armed && (
          <>
            Swap your <i className="tb-banner__dot" style={vars({ '--c': colorOf(giveCard.color) })} aria-hidden />
            <em>{cardName(giveCard.card)}</em> for…{' '}
          </>
        )}
        {targetHint(targeting, focusName, !!giveCard, armed)}
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

/**
 * A play aimed at you that a Just Say No could stop: the contested card, who is behind it and what they are doing. No
 * buttons on it — the round button under the hand answers (it plays a Just Say No you hold, else lets it go) — except
 * that a holder, whose round button plays the card, keeps a "Let it go" here.
 */
export function JsnAlert({
  jsnAsk,
  from,
  hasJsn,
  actions,
  secs,
  maxSecs,
}: {
  jsnAsk: Extract<Prompt, { kind: 'jsn' }>;
  /** The rival named on it, for their seat colour. */
  from: Seat | undefined;
  hasJsn: boolean;
  actions: TableActions;
  /** The window's own clock, as a bar along the bottom edge. */
  secs: number | null;
  maxSecs: number;
}) {
  return (
    <div
      className="tb-alert"
      data-testid={`jsn-prompt${jsnAsk.payerId ? `-${jsnAsk.payerId}` : ''}`}
      role="alert"
      style={from ? vars({ '--tb-seat': from.color, '--tb-seat-ink': from.ink }) : undefined}
    >
      <span className="tb-alert__face">
        <Cd card={jsnAsk.card} w={64} />
      </span>
      <div className="tb-alert__body">
        <span className="tb-alert__tag">{jsnAsk.label}</span>
        <span className="tb-alert__who">
          <i aria-hidden>{jsnAsk.who.charAt(0).toUpperCase()}</i>
          <b>{jsnAsk.who}</b>
        </span>
        <span className="tb-alert__what">{jsnAsk.what}.</span>
        {hasJsn && (
          <button type="button" className="tb-alert__let" data-testid={`jsn-decline-btn${jsnAsk.payerId ? `-${jsnAsk.payerId}` : ''}`} onClick={actions.allow}>
            Let it go
          </button>
        )}
      </div>
      <Countdown secs={secs} maxSecs={maxSecs} className="tb-alert__clock" />
    </div>
  );
}
