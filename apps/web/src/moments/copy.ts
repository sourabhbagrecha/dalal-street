/**
 * Viewer-relative wording for callouts and notices. See the brief's copy
 * table — every sentence here is a direct transcription of it. No player
 * ids, colour slugs, or action slugs may ever reach rendered text: names
 * come from `nameFor`, card names from `cardTitle`, set names from
 * `theme.propertyNames`, money from the supplied `formatMoney`.
 */
import type { ClientGameState } from '@monopoly-deal/shared';
import { cardTitle, nameFor } from '../derivations';
import { theme } from '../theme';
import type { CalloutCopyFor, Moment, NoticeCopyFor, Perspective, Tone } from './types';

export function perspectiveFor(moment: Moment, viewerId: string): Perspective {
  if (moment.kind !== 'payment' && moment.targetIds.includes(viewerId)) return 'victim';
  if (moment.kind === 'payment' && moment.targetIds.includes(viewerId)) return 'beneficiary';
  if (viewerId === moment.actorId) return 'actor';
  return 'spectator';
}

const HEADLINES: Record<Moment['kind'], string> = {
  sly_deal: 'SLY DEAL!',
  forced_deal: 'FORCED DEAL!',
  deal_breaker: 'DEAL BREAKER!',
  debt_collector: 'DEBT COLLECTOR!',
  birthday: "IT'S MY BIRTHDAY!",
  rent: 'RENT DUE!',
  payment: 'PAID',
  just_say_no: 'JUST SAY NO!',
  action_cancelled: 'CANCELLED',
  set_broken: 'SET BROKEN',
};

/** Sentence-initial possessive: "Your" for the viewer, "Marcus's" otherwise. */
function ownerLead(name: string, isViewer: boolean): string {
  return isViewer ? 'Your' : `${name}'s`;
}

function contestedActionLabel(type: string | undefined): string {
  if (!type) return 'play';
  if (type === 'rent') return 'Rent';
  return theme.actionNames[type] ?? 'play';
}

function cardNameFor(moment: Moment): string {
  const card = moment.cards[0];
  return card ? cardTitle(card) : 'property';
}

function givenCardNameFor(moment: Moment): string {
  return moment.givenCard ? cardTitle(moment.givenCard) : 'a property';
}

function colorLabel(moment: Moment): string | undefined {
  return moment.color ? theme.propertyNames[moment.color] : undefined;
}

function detailFor(
  moment: Moment,
  state: ClientGameState,
  perspective: Perspective,
  formatMoney: (n: number) => string,
): string {
  const actorName = nameFor(state, moment.actorId);
  const targetName = moment.targetIds[0] ? nameFor(state, moment.targetIds[0]) : 'them';
  const isViewerActor = perspective === 'actor';
  const isViewerTarget = perspective === 'victim' || perspective === 'beneficiary';

  switch (moment.kind) {
    case 'sly_deal': {
      const card = cardNameFor(moment);
      if (perspective === 'victim') return `${actorName} took your ${card}`;
      if (perspective === 'actor') return `You took ${targetName}'s ${card}`;
      return `${actorName} took ${card} from ${targetName}`;
    }
    case 'forced_deal': {
      const card = cardNameFor(moment);
      const given = givenCardNameFor(moment);
      if (perspective === 'victim') return `${actorName} swapped their ${given} for your ${card}`;
      if (perspective === 'actor') return `You swapped ${given} for ${targetName}'s ${card}`;
      return `${actorName} swapped ${given} for ${targetName}'s ${card}`;
    }
    case 'deal_breaker': {
      const color = colorLabel(moment);
      const setPhrase = color ? `whole ${color} set` : 'whole set';
      if (perspective === 'victim') return `${actorName} took your ${setPhrase}`;
      if (perspective === 'actor') return `You took ${targetName}'s ${setPhrase}`;
      return `${actorName} took ${targetName}'s ${setPhrase}`;
    }
    case 'debt_collector': {
      const money = formatMoney(moment.amount ?? 5);
      if (perspective === 'victim') return `${actorName} demands ${money} from you`;
      if (perspective === 'actor') return `You demand ${money} from ${targetName}`;
      return `${actorName} demands ${money} from ${targetName}`;
    }
    case 'birthday': {
      const money = formatMoney(moment.amount ?? 2);
      if (perspective === 'victim') return `${actorName} wants ${money} from you`;
      if (perspective === 'actor') return `Everyone owes you ${money}`;
      return `Everyone owes ${actorName} ${money}`;
    }
    case 'rent': {
      const money = formatMoney(moment.amount ?? 0);
      const color = colorLabel(moment);
      const forColor = color ? ` for ${color}` : '';
      if (perspective === 'victim') return `${actorName} charges you ${money} rent${forColor}`;
      if (perspective === 'actor') return `You charge ${targetName} ${money} rent${forColor}`;
      return `${actorName} charges ${targetName} ${money} rent${forColor}`;
    }
    case 'payment': {
      const money = formatMoney(moment.amount ?? 0);
      if (perspective === 'actor') return `You paid ${money} to ${targetName}`;
      if (perspective === 'beneficiary') return `${actorName} paid you ${money}`;
      return `${actorName} paid ${targetName} ${money}`;
    }
    case 'just_say_no': {
      const actionLabel = contestedActionLabel(moment.contestedType);
      const isCounter = (moment.chain ?? 1) >= 2;
      if (isCounter) {
        return isViewerActor ? 'You say NO right back!' : `${actorName} says NO right back!`;
      }
      if (perspective === 'victim') return `${actorName} says NO to your ${actionLabel}`;
      if (perspective === 'actor') return `You say NO to ${targetName}'s ${actionLabel}`;
      return `${actorName} says NO to ${targetName}'s ${actionLabel}`;
    }
    case 'action_cancelled': {
      const actionLabel = contestedActionLabel(moment.contestedType);
      return `${ownerLead(targetName, isViewerTarget)} ${actionLabel} was cancelled by ${actorName}'s Just Say No`;
    }
    case 'set_broken': {
      const color = colorLabel(moment);
      const setPhrase = color ? `${color} set` : 'set';
      return `${ownerLead(targetName, isViewerTarget)} ${setPhrase} is no longer complete`;
    }
    default:
      return '';
  }
}

function toneFor(moment: Moment, perspective: Perspective): Tone {
  if (moment.kind === 'action_cancelled' || moment.kind === 'set_broken') return 'warning';
  switch (perspective) {
    case 'victim':
      return 'danger';
    case 'actor':
    case 'beneficiary':
      return 'success';
    case 'spectator':
    default:
      return 'neutral';
  }
}

export const calloutCopyFor: CalloutCopyFor = (moment, state, formatMoney) => {
  const perspective = perspectiveFor(moment, state.viewerId);
  return {
    headline: HEADLINES[moment.kind],
    detail: detailFor(moment, state, perspective, formatMoney),
    tone: toneFor(moment, perspective),
    perspective,
  };
};

export const noticeCopyFor: NoticeCopyFor = (moment, state, formatMoney) => {
  const perspective = perspectiveFor(moment, state.viewerId);
  return {
    text: detailFor(moment, state, perspective, formatMoney),
    tone: toneFor(moment, perspective),
  };
};
