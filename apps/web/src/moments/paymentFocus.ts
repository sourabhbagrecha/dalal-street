/**
 * "The viewer is picking cards to pay with" — the one moment where table
 * moments must get out of the way. The payment prompt already says who is
 * charging what and why, and the viewer needs to see every bank and property
 * card in it; a callout ticket or notice pill on top of it is both redundant
 * and in the way. Callouts and notices step aside while this holds.
 */
import type { ClientGameState } from '@monopoly-deal/shared';
import type { MomentKind } from './types';

/** Moments that put a payment demand on their targets — exactly what the payment prompt restates. */
export const PAYMENT_DEMAND_KINDS = new Set<MomentKind>(['rent', 'birthday', 'debt_collector']);

/**
 * True while the viewer's own payment prompt is on screen: a single `payment`
 * pending, or a `payment_round` entry in its `payment` phase with the viewer
 * as payer. Mirrors which prompts `GamePrompts` renders; the Just Say No
 * window ahead of a payment is deliberately excluded (no cards to pick there).
 */
export function viewerIsChoosingPayment(state: ClientGameState): boolean {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (!top) return false;
  if (top.kind === 'payment') return top.payerId === state.viewerId;
  if (top.kind === 'payment_round') {
    return top.entries.some((e) => e.phase === 'payment' && e.payerId === state.viewerId);
  }
  return false;
}
