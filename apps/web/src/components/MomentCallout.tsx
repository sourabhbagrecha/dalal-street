import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Card, ClientGameState } from '@monopoly-deal/shared';
import { avatarNameFor } from '../derivations';
import { useCurrency } from '../hooks/useCurrency';
import { calloutCopyFor } from '../moments/copy';
import { momentStore, useMomentState } from '../moments/store';
import type { Moment } from '../moments/types';
import { useVictimShake } from '../moments/useVictimShake';
import { PlayingCard } from './card/PlayingCard';
import { PlayerAvatar } from './PlayerAvatar';

const BASE_DURATION_MS = 3200;
const VICTIM_DANGER_DURATION_MS = 4200;
const BACKLOG_DURATION_MS = 2200;
const BACKLOG_THRESHOLD = 3;
const FANNED_CARDS_MAX = 3;
const COALESCED_KINDS = new Set<Moment['kind']>(['birthday', 'rent']);

/**
 * `birthday`/`rent` coalesce to one callout per actor per batch (see the
 * store's `ingest`), but each underlying moment still only names its own
 * payer. Every moment derived together shares one `at` timestamp (see
 * `deriveMoments`), so that's the correlation key back to the rest of the
 * batch for the "up to 3 target avatars" the brief asks for.
 */
function displayTargetIds(moment: Moment, allMoments: readonly Moment[]): string[] {
  if (!COALESCED_KINDS.has(moment.kind)) return moment.targetIds;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of allMoments) {
    if (m.kind !== moment.kind || m.actorId !== moment.actorId || m.at !== moment.at) continue;
    for (const id of m.targetIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= FANNED_CARDS_MAX) return out;
    }
  }
  return out.length > 0 ? out : moment.targetIds;
}

function CalloutFace({ moment }: { moment: Moment }) {
  if (!moment.faceCard) return null;
  return <PlayingCard card={moment.faceCard} className="moment-callout__face" />;
}

const LOOT_MAX = 6;
const LOOT_SHOWN_WHEN_OVERFLOW = 5;

/**
 * "What did I lose?" — a strip of the real cards a moment moved, under the
 * detail line. Replaces the old fan-behind/fan card-slot treatments, which
 * were too subtle to read in any screenshot (see PLAN-UI-R4 item 2).
 */
function CalloutLoot({ moment }: { moment: Moment }) {
  if (moment.kind === 'forced_deal') {
    const taken = moment.cards[0];
    const given = moment.givenCard;
    if (!taken && !given) return null;
    return (
      <div className="moment-callout__loot">
        {taken && <PlayingCard card={taken} className="moment-callout__loot-card" />}
        <span className="moment-callout__loot-swap" aria-hidden>
          ⇄
        </span>
        {given && <PlayingCard card={given} className="moment-callout__loot-card" />}
      </div>
    );
  }

  if (moment.cards.length === 0) return null;
  const overflow = moment.cards.length > LOOT_MAX;
  const shown: Card[] = overflow ? moment.cards.slice(0, LOOT_SHOWN_WHEN_OVERFLOW) : moment.cards.slice(0, LOOT_MAX);
  return (
    <div className="moment-callout__loot">
      {shown.map((card) => (
        <PlayingCard key={card.id} card={card} className="moment-callout__loot-card" />
      ))}
      {overflow && <span className="moment-callout__loot-more">+{moment.cards.length - shown.length}</span>}
    </div>
  );
}

export function MomentCallout({ clientState }: { clientState: ClientGameState }) {
  const { formatMoney } = useCurrency();
  const { moments, calloutQueue } = useMomentState();
  const headId = calloutQueue[0];
  const moment = useMemo(() => moments.find((m) => m.id === headId) ?? null, [moments, headId]);
  const copy = moment ? calloutCopyFor(moment, clientState, formatMoney) : null;

  useEffect(() => {
    if (!moment) return;
    const queueLength = momentStore.getState().calloutQueue.length;
    const c = calloutCopyFor(moment, clientState, formatMoney);
    const duration =
      queueLength >= BACKLOG_THRESHOLD
        ? BACKLOG_DURATION_MS
        : c.tone === 'danger' && c.perspective === 'victim'
          ? VICTIM_DANGER_DURATION_MS
          : BASE_DURATION_MS;
    const t = window.setTimeout(() => {
      momentStore.markWitnessed(moment.id, clientState.viewerId);
      momentStore.advanceCallout();
    }, duration);
    return () => window.clearTimeout(t);
    // Deliberately keyed on the moment id alone: the display time is fixed the
    // instant a callout becomes the head of the queue, not recomputed as the
    // queue grows/shrinks or the viewer's client state changes underneath it.
  }, [moment?.id]);

  useVictimShake(Boolean(moment && copy?.perspective === 'victim'));

  if (!moment || !copy) return null;

  const actorName = avatarNameFor(clientState, moment.actorId);
  const targetIds = displayTargetIds(moment, moments);
  const isVictimRole = moment.kind !== 'payment';
  const viewerId = clientState.viewerId;

  // Portalled to document.body (PLAN-UI-R5 item A): html/body/.app/.app__layout
  // all set `overflow: hidden` (styles.css), which clips a position:fixed
  // descendant to that ancestor's box even with no transformed ancestor in the
  // chain — not the plan's board-shake-transform hypothesis, but the same
  // fix. Portal escapes the clip entirely; test ids/data attributes unchanged.
  return createPortal(
    <>
      <div
        key={moment.id}
        className="moment-callout"
        data-testid="moment-callout"
        data-kind={moment.kind}
        data-tone={copy.tone}
        data-perspective={copy.perspective}
        role="status"
        aria-live={copy.perspective === 'victim' ? 'assertive' : 'polite'}
      >
        <div className="moment-callout__card">
          <CalloutFace moment={moment} />
        </div>
        <div className="moment-callout__body">
          <div className="moment-callout__headline">{copy.headline}</div>
          <div className="moment-callout__players">
            <PlayerAvatar
              name={actorName}
              className="moment-callout__avatar"
              data-self={moment.actorId === viewerId ? 'true' : undefined}
            />
            <span className="moment-callout__arrow" aria-hidden>
              ➜
            </span>
            {targetIds.map((id) => (
              <PlayerAvatar
                key={id}
                name={avatarNameFor(clientState, id)}
                className="moment-callout__avatar"
                data-role={isVictimRole ? 'victim' : undefined}
                data-self={id === viewerId ? 'true' : undefined}
              />
            ))}
          </div>
          <div className="moment-callout__detail">{copy.detail}</div>
          <CalloutLoot moment={moment} />
        </div>
      </div>
      {copy.perspective === 'victim' && (
        <div className="moment-vignette" data-tone={copy.tone} aria-hidden />
      )}
    </>,
    document.body,
  );
}
