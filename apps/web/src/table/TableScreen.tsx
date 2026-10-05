import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { MAX_PLAYS } from '@monopoly-deal/shared';
import { Victory, useBox, useFx, useScrollMore } from './kit';
import { Confirms } from './Confirms';
import { handLayout } from './handLayout';
import type { TableGame } from './model';
import { zonesFor } from './model';
import type { GameRecap } from './recap';
import { ChatBubbles } from './chrome/ChatBubbles';
import { ChromeOverlays } from './chrome/ChromeOverlays';
import { Reactions } from './reactions/Reactions';
import { StageLayer, useStage } from './stage/StageLayer';
import { DragGhost } from './useCardDrag';
import { Loupe, bankKey, usePeek } from './tableGlance';
import { DiscardBanner, JsnAlert, TargetBanner } from './felt/Banners';
import { Centre } from './felt/Centre';
import { DragTag } from './felt/DragTag';
import { Hud } from './felt/Hud';
import { BANNER_H, CENTRE, JSN_H, ME_ZONE, PUCK_ROOM, SWITCH_H, WORLD, camera, farMineLayout, focusLayout, deckRect, mineLayout, seatZones, spanning } from './felt/layout';
import { MineSeat } from './felt/MineSeat';
import { boardPickOf, pillsFor } from './felt/pills';
import { RivalSeat, SeatSwitcher, isPickable } from './felt/RivalSeat';
import type { RivalAim } from './felt/RivalSeat';
import { RotatePrompt } from './felt/RotatePrompt';
import { colorOf, vars } from './felt/style';
import { StealPicker } from './felt/StealPicker';
import { Tray } from './felt/Tray';
import { autoCam, useCamera } from './felt/useCamera';
import { useHandDrag } from './felt/useHandDrag';
import type { LetGo } from './felt/useHandDrag';
import { useStageSync } from './felt/useStageSync';
import { WildAsk } from './felt/WildAsk';
import { useTabAttention } from './live/useTabAttention';
import { useWakeLock } from './live/useWakeLock';
import '../styles/table.css';

/**
 * Concept 4 — The Table. The whole game is one felt table you look at through a
 * camera. Rivals sit around it with their hands fanned face-down, sets laid out
 * in front of them and their money as chip stacks, so wealth and threat read at
 * a glance. Tap any seat and the camera swoops in until their cards are big
 * enough to read; the camera also follows the game by itself (deck when you
 * draw, the rival who is acting, you when you are on the hook). You do not aim
 * a card at a zone — you throw it on the table and the game does the obvious
 * thing, telling you what before you let go.
 *
 * Reading rivals: far seats show a glance panel, hold anything for the Loupe
 * (see tableGlance.tsx), tap a seat and the camera zooms in while the seat grows
 * into the same laid-out panel you get for yourself.
 *
 * The parts live in felt/: layout.ts is the world geometry and camera math, the hooks run the camera (useCamera),
 * the hand (useHandDrag) and the stage (useStageSync), and each region of the screen is its own component.
 */

/** What the fx stamp used to say about these; the stage acts them out on the table instead (a finished set stamps its own SET COMPLETE!). */
const STAGED_FX = new Set(['steal', 'stolen', 'collect', 'jsn', 'pay', 'set', 'win']);

interface TableScreenProps {
  g: TableGame;
  /** Extra HUD buttons, right of the built-in ones. */
  hudRight?: ReactNode;
  /** Drawn inside the table's frame, above everything (sheets, dialogs). */
  children?: ReactNode;
  /** The victory card's whole-game stats, once `g.won` — see `table/recap.ts`. Null/absent shows the card without them. */
  recap?: GameRecap | null;
  /**
   * `g.won` held until the winning play's own animation has finished (`table/live/winReveal.ts`) — the top
   * bar and the victory card both wait on this instead of the raw `g.won`, so neither spoils the win while
   * the last card is still landing on stage.
   */
  revealedWinnerId: string | null;
}

/** The whole game screen: HUD, the camera on the felt, the hand tray and the stage that acts out what just happened. */
export function TableScreen({ g, hudRight, children, recap, revealedWinnerId }: TableScreenProps) {
  const p = g.prompt;
  const targeting = p?.kind === 'target' ? p : null;
  const discarding = p?.kind === 'discard' ? p : null;
  const jsnAsk = p?.kind === 'jsn' ? p : null;
  /** A Sly Deal with something to take is picked on its own screen (StealPicker), not by swooping the camera round the felt. */
  const stealing = targeting?.action === 'sly_deal' && !targeting.empty;
  const zones = seatZones(g.rivals);
  /** The picks that aim at one of your own sets, so the camera stays on you. */
  const ownPick = targeting?.action === 'rent' || targeting?.action === 'building' || (targeting?.action === 'forced_deal' && targeting.step === 'own');
  /** Who the viewer is waiting on ("Priya is choosing who pays…"): their seat pulses. The line only carries names, so match them as whole words. */
  const waitingOn = new Set(g.wait ? g.rivals.filter((r) => new RegExp(`(^|[^\\p{L}\\p{N}])${r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(g.wait!)).map((r) => r.id) : []);

  // Seated at a live table: keep the screen on so a slow rival's turn (or a human's) doesn't auto-lock the phone
  // and drop the connection. Released once someone has won — nothing left to wait on.
  useWakeLock(!g.won);
  // A demand aimed at the viewer outranks a plain "your turn": Just Say No and payment windows have their own
  // short clocks (20s/30s) and are worth glancing back for even mid-turn-taking elsewhere; a bare turn is the
  // fallback signal. Nothing once the game is over — there's no table to come back to.
  useTabAttention(g.won ? null : p?.kind === 'pay' || p?.kind === 'jsn' ? 'targeted' : g.phase !== 'rivals' ? 'turn' : null);
  const fx = useFx(g);
  const [camRef, vp] = useBox<HTMLDivElement>({ w: 393, h: 470 });
  const [tableRef, table] = useBox<HTMLDivElement>({ w: 393, h: 852 });
  const [trayRef, tray] = useBox<HTMLDivElement>();
  const { cam, setManual, holdCam, wide, toggleWide } = useCamera(g, stealing ? 'table' : autoCam(g, ownPick, waitingOn));
  const stage = useStage(tableRef);
  /** Where the finger let go of the last dragged card, so its flight starts from there. */
  const letGo = useRef<LetGo | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  /** A wild in one of your sets, picked to flip. */
  const [selBoard, setSelBoard] = useState<string | null>(null);
  const [wildAsk, setWildAsk] = useState<string | null>(null);
  const { peek, bind: peekBind, close: closePeek, pin: pinPeek, open: openPeek } = usePeek(camRef);

  useEffect(() => {
    setSel(null);
    setWildAsk(null);
  }, [g.hand.length, p?.kind, g.canAct]);
  useEffect(closePeek, [cam, closePeek]);
  useEffect(() => setSelBoard(null), [cam, g.canRearrange, p?.kind]);
  // A picked card (in the hand, or a wild on your table) is put back down by a press anywhere else, and that press
  // still does whatever it was pressed for. The hand, the pills and your flippable wilds answer for themselves.
  const putDownAt = useRef(-1);
  useEffect(() => {
    if (!sel && !selBoard) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element).closest?.('.tb-card, .tb-pills, .gl-stack__c[role="button"]')) return;
      putDownAt.current = e.timeStamp;
      setSel(null);
      setSelBoard(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [sel, selBoard]);
  // The bundle can't fan out inside a camera-scaled world, so its tap opens the loupe on the notes.
  const openBank = (seatId: string) => (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    pinPeek(bankKey(seatId), r.top + r.height / 2);
  };
  // A tap on a seat swoops the camera onto it, and the seat grows into its laid-out panel. Taps on the seat that already
  // has the camera belong to what is inside it.
  const openSeat = (id: string) => {
    if (cam === id) return;
    closePeek();
    setManual(id);
  };
  // A tap on bare table (felt, deck, discard, the margin) anywhere but your own zone zooms out to see everyone.
  // Seats, your zone, buttons and the loupe answer for themselves; a tap that only dismissed the loupe or put a picked
  // card down stays a dismissal.
  const dismissed = useRef(false);
  const zoomOut = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button, .tb-mine, .tb-zone, .tb-loupe, .tb-banner')) return;
    // A scene holding the camera (a payment, a raid…) moves on now instead of running out its full hold — the same
    // bare-table tap that would otherwise zoom out. Cheap to call with nothing playing: `skipScene` is then a no-op.
    g.skipScene();
    if (cam === 'table' || dismissed.current || p?.kind === 'pay') return;
    setManual('table');
  };
  const zoomedOnSeat = cam !== 'table' && cam !== 'me' && cam !== 'centre' && cam !== 'deal';
  const focusSeat = zoomedOnSeat ? g.rivals.find((r) => r.id === cam) : undefined;
  // What sits over the top of the camera (the target / discard banner, the Just Say No alert) and so is kept clear.
  const topInset = jsnAsk ? JSN_H : targeting || discarding ? BANNER_H : 0;
  // A seat with the camera fills the screen minus the banner above it (while aiming) and the switcher below.
  const inset = { top: topInset, bottom: SWITCH_H };
  // Any other view only needs to clear the banner; there is no switcher there.
  const tableInset = topInset && !focusSeat ? { top: topInset + (cam === 'me' ? PUCK_ROOM : 0), bottom: 0 } : undefined;
  const seatView = { w: vp.w, h: vp.h - inset.top - inset.bottom };
  const aim: RivalAim | undefined = focusSeat && targeting && !ownPick ? (targeting.action as RivalAim) : undefined;
  const focus = focusSeat ? focusLayout(focusSeat, zones[focusSeat.id]!, seatView, (s) => (aim === 'sly_deal' || aim === 'forced_deal') && isPickable(aim, s)) : undefined;
  const mine = mineLayout(g.me.sets, { w: vp.w, h: vp.h - (topInset ? topInset + PUCK_ROOM : 0) });
  const far = farMineLayout(g.me.sets, g.me.bank.length, vp);

  const { drag, bind, dropCard } = useHandDrag({ g, discarding, jsnAsk, letGo, setSel, setSelBoard, setWildAsk, setManual, openPeek, closePeek });
  /** The wild the colour sheet is about; gone from the hand (played, discarded) closes the sheet. */
  const wildAskCard = wildAsk ? g.hand.find((c) => c.id === wildAsk) : undefined;
  const dragCard = drag ? g.hand.find((c) => c.id === drag.cardId) : undefined;
  const selCard = sel ? g.hand.find((c) => c.id === sel) : undefined;
  const hotZones = new Set(dragCard && g.canAct ? zonesFor(dragCard) : []);
  const playHot = !!dragCard && (hotZones.has('play') || !!discarding);

  // Carrying a playable card, the camera keeps the discard pile in frame along with your seat, so both drop targets are on screen.
  const cm = camera(cam, vp, spanning({ x: 0, y: 0, ...WORLD }, far.rect), focus?.rect ?? (cam === 'me' ? (playHot ? spanning(mine.rect, CENTRE) : mine.rect) : cam === 'deal' ? spanning(far.rect, spanning(deckRect(g.rivals.length), CENTRE)) : undefined), focus ? inset : tableInset);

  useStageSync(g, stage, tableRef, letGo, holdCam);

  const boardPick = boardPickOf(g, selBoard);
  const pills = pillsFor({ g, boardPick, selCard, dropCard, setSelBoard });

  // With the camera on it your seat is the panel above; otherwise it sits in its usual spot, its tiles fitted to that.
  const mineNear = cam === 'me';
  const [mineBodyRef, mineMore] = useScrollMore<HTMLDivElement>(mineNear && mine.scroll);
  const [rivalBodyRef, rivalMore] = useScrollMore<HTMLDivElement>(!!focus?.scroll, focusSeat?.id);
  const puck = (focus && focusSeat?.id === g.turn ? focus.rect : zones[g.turn]) ?? ME_ZONE;
  const turnSeat = g.rivals.find((r) => r.id === g.turn) ?? g.me;

  // The discard is all about the hand: it is dealt out big so every card is easy to read and pick.
  const fan = handLayout(g.hand.length, tray.w, table.h, p?.kind === 'discard');

  return (
    <div className="gl">
      <div className="gl__stage">
        <div className="gl__phone">
    <div className="tb" ref={tableRef} data-mode={p?.kind ?? g.phase} data-sending={g.sending ?? undefined} aria-busy={g.sending ? true : undefined}>
      {/* ── HUD ── */}
      <Hud
        g={g}
        wide={wide}
        onWide={toggleWide}
        right={hudRight}
        revealedWinnerId={revealedWinnerId}
      />

      {/* ── The camera ── */}
      <main
        ref={camRef}
        className="tb-cam"
        data-cam={zoomedOnSeat ? 'seat' : cam}
        {...peekBind}
        onPointerDown={(e) => {
          dismissed.current = !!peek || e.timeStamp === putDownAt.current;
          peekBind.onPointerDown(e);
        }}
        onClick={zoomOut}
      >
        <div className="tb-world" style={vars({ width: WORLD.w, height: WORLD.h, '--s': cm.s, transform: `translate(${cm.tx}px, ${cm.ty}px) scale(${cm.s})` })}>
          <div className="tb-felt" />
          {/* ── the seat plates ── */}
          {g.rivals.map((r) => (
            <RivalSeat
              key={r.id}
              seat={r}
              zone={zones[r.id]!}
              near={cam === r.id && focus ? { ...focus, bodyRef: rivalBodyRef, more: rivalMore } : undefined}
              zoomed={zoomedOnSeat}
              turn={g.turn === r.id}
              waiting={waitingOn.has(r.id)}
              pick={targeting?.action}
              aim={aim}
              onTarget={g.actions.target}
              onOpen={() => openSeat(r.id)}
              onOpenBank={openBank(r.id)}
            />
          ))}

          <Centre g={g} playHot={playHot} discarding={!!discarding} />

          <MineSeat
            g={g}
            rect={mineNear ? mine.rect : far.rect}
            cardW={mineNear ? mine.cardW : far.cardW}
            near={mineNear}
            scroll={mine.scroll}
            bodyRef={mineBodyRef}
            more={mineMore}
            dragCard={dragCard}
            hotZones={hotZones}
            selBoard={selBoard}
            onPickBoard={(id) => {
              setSel(null);
              setSelBoard((cur) => (cur === id ? null : id));
            }}
            onOpenBank={openBank(g.me.id)}
            onClick={() => cam !== 'me' && setManual('me')}
          />

          <span className="tb-turn" style={vars({ left: puck.x + puck.w / 2, top: puck.y, '--seat': turnSeat.color, '--seat-ink': turnSeat.ink })} aria-hidden>
            {Array.from({ length: MAX_PLAYS }, (_, n) => (
              <i key={n} data-spent={n >= g.plays} />
            ))}
          </span>
        </div>

        {/* target / prompt banners live above the camera */}
        {stealing && <StealPicker rivals={g.rivals} onSteal={(rivalId, cardId) => g.actions.target({ rivalId, cardId })} />}
        {targeting && <TargetBanner targeting={targeting} sets={g.me.sets} focusName={focusSeat?.name} />}
        {discarding && <DiscardBanner discarding={discarding} onResume={g.actions.resumePlay} />}
        {focusSeat && <SeatSwitcher rivals={g.rivals} focusId={focusSeat.id} waitingOn={waitingOn} onPick={setManual} onClose={() => setManual('table')} />}
        {fx && !(STAGED_FX.has(fx.kind) && !stage.reduced) && (
          <div key={fx.id} className="tb-fx" data-kind={fx.kind} style={vars({ '--c': fx.color ? colorOf(fx.color) : '#f2c14e' })}>
            {fx.text}
          </div>
        )}
        {peek && (
          <Loupe
            g={g}
            peek={peek}
            width={vp.w}
            onClose={closePeek}
          />
        )}
        <DragTag g={g} drag={drag} dragCard={dragCard} frameRef={tableRef} />
        <RotatePrompt />
      </main>

      {/* ── Tray: hand, or the payment ── */}
      <Tray g={g} trayRef={trayRef} fan={fan} pills={pills} boardPick={boardPick} sel={sel} drag={drag} bind={bind} focusSeat={focusSeat} />
      <DragGhost drag={drag} card={dragCard} w={90} />

      {wildAskCard && <WildAsk g={g} card={wildAskCard} onClose={() => setWildAsk(null)} />}

      {jsnAsk && <JsnAlert jsnAsk={jsnAsk} from={g.rivals.find((r) => r.id === jsnAsk.fromId)} hasJsn={g.hasJsn} actions={g.actions} secs={g.secs} maxSecs={g.maxSecs} />}

      {/* While a rival's seat has the camera, the switcher's close button sits bottom-left too: give the reaction dock room above it. */}
      <Reactions root={tableRef} trayH={tray.h} rivals={g.rivals} beat={g.beat} busy={pills.length > 0 || !!drag || stealing || !!peek} liftBy={focusSeat ? SWITCH_H : 0} />
      <ChatBubbles root={tableRef} />
      <ChromeOverlays />
      <Confirms confirm={g.confirm} />
      {children}
      <Victory g={g} recap={recap} revealedWinnerId={revealedWinnerId} />
      <StageLayer stage={stage} />
    </div>
        </div>
      </div>
    </div>
  );
}
