import type { Beat } from '../model';

/**
 * Whether the beat now on stage is an attack that just landed on `meId`: a property stolen (Sly Deal, the taken
 * half of a Forced Deal), a whole set raided (Deal Breaker), or money/cards actually handed over for a rent,
 * debt or birthday charge. Used to nudge the reaction picker open right when the feeling is freshest, instead of
 * leaving the player to go dig for it (see reactions/Reactions.tsx).
 *
 * 'levy' names payers still owing nothing yet — the charge is only "felt" once cards move — so a levy only counts
 * here when its own `takes` already carries `meId` (a payment settled in the same batch, or a payer with nothing
 * to give). The far more common case, a payment resolved a moment later, shows up as its own `pay` beat instead:
 * that one counts whenever `meId` is the one handing cards over.
 */
export function hitsMe(beat: Beat | null, meId: string): boolean {
  if (!beat) return false;
  switch (beat.kind) {
    case 'levy':
      return beat.takes.some((t) => t.from === meId);
    case 'pay':
      return beat.by === meId;
    case 'loot':
    case 'raid':
      return beat.from === meId;
    default:
      return false;
  }
}
