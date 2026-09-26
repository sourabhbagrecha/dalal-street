import { useSearchParams } from 'react-router-dom';
import { isScene, useMockGame, useScene } from './scratchpad/mockGame';
import { TableScreen } from '../table/TableScreen';

/**
 * Layout lab (mobile only): the table running on a shared mock game (scratchpad/mockGame.ts).
 * ?beat=1 makes the first thing that happens to you a Sly Deal you can Just Say No (2 = rent).
 * ?rivals=1..4 seats that many rivals.
 * ?mine=1..12 piles that many sets on your seat.
 * ?scene=<name> lays a canned prompt over the table (SCENES in mockGame.ts): forced_own, forced_rival, building, rent,
 * rent_player, debt_collector, discard, pay_break, jsn_multi, wait, flip, confirm_wasted, confirm_bank_action,
 * confirm_building_choice, confirm_rent_double, confirm_flip.
 */
export function ScratchpadPage() {
  const [params] = useSearchParams();
  const beat = Number(params.get('beat') ?? 0) || 0;
  const rivals = Math.min(4, Math.max(1, Number(params.get('rivals') ?? 4) || 4));
  const mine = Math.min(12, Math.max(0, Number(params.get('mine') ?? 0) || 0));
  const scene = params.get('scene');
  const g = useScene(useMockGame(beat, rivals, mine), isScene(scene) ? scene : null);
  return <TableScreen g={g} />;
}
