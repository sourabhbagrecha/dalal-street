import type { RefObject } from 'react';
import type { Card, PropertyColor } from '@monopoly-deal/shared';
import type { TableGame } from '../model';
import { buildColors, cardName, stateName, zonesFor } from '../model';
import type { useCardDrag } from '../useCardDrag';
import { money, vars } from './style';

// What letting go would do, in words.
function predict(g: TableGame, card: Card, zone: string | null, color?: string): string | null {
  if (!g.canAct) return null;
  if (zone === 'bank') return zonesFor(card).includes('bank') ? `Bank ${money(card.value)}` : 'Can’t bank this';
  if (zone === 'build') {
    if (!zonesFor(card).includes('build')) return 'Not a property';
    // A plain property builds its own colour wherever it lands; a wild takes the set it is dropped on, if it can be that colour.
    const options = buildColors(card, g.me.sets);
    if (card.kind === 'property_wild' && options.length === 0) return 'Needs a set to join';
    const c = card.kind === 'property' ? options[0] : color ? (options.includes(color as PropertyColor) ? (color as PropertyColor) : undefined) : options[0];
    return c ? `Build ${stateName(c)}` : 'Can’t be that colour';
  }
  if (zone === 'play') return zonesFor(card).includes('play') ? `Play ${cardName(card)}` : 'Can’t play this';
  if (zone === 'auto') {
    if (card.kind === 'money') return `Bank ${money(card.value)}`;
    if (card.kind === 'property') return `Build ${stateName(card.color)}`;
    if (card.kind === 'property_wild') {
      const options = buildColors(card, g.me.sets);
      return options.length === 0 ? 'Needs a set to join' : options.length === 1 ? `Build ${stateName(options[0]!)}` : 'Build — pick a colour';
    }
    if (card.kind === 'action' && card.action === 'just_say_no') return `Bank ${money(card.value)}`;
    return `Play ${cardName(card)}`;
  }
  return null;
}

/** The prediction tag rides above the finger but stays inside the table's frame, so it never clips at the screen edge. */
function tagLeft(x: number, tag: string, frame: HTMLElement | null): number {
  const o = frame?.getBoundingClientRect();
  if (!o) return x;
  const half = Math.ceil(tag.length * 9.6 + 36) / 2 + 8;
  return Math.min(Math.max(x, o.left + half), o.right - half);
}

interface DragTagProps {
  g: TableGame;
  drag: ReturnType<typeof useCardDrag>['drag'];
  /** The hand card being dragged. */
  dragCard: Card | undefined;
  /** The table's frame, which the tag stays inside. */
  frameRef: RefObject<HTMLDivElement | null>;
}
/** Over a dragged card: what letting go here would do. */
export function DragTag({ g, drag, dragCard, frameRef }: DragTagProps) {
  const discarding = g.prompt?.kind === 'discard' ? g.prompt : null;
  const tag =
    drag && dragCard
      ? discarding
        ? drag.zone === 'play'
          ? discarding.sel.includes(dragCard.id)
            ? 'Keep it'
            : 'Discard it'
          : null
        : predict(g, dragCard, drag.zone, drag.color)
      : null;
  if (!tag || !drag) return null;
  return (
    <div className="tb-tag" style={vars({ left: tagLeft(drag.x, tag, frameRef.current), top: Math.max(drag.y - 108, 8) })} data-bad={/Can’t|Not a/.test(tag)}>
      {tag}
    </div>
  );
}
