# Mobile UI pass — final report

Target device: **iPhone 15 Pro**. Two viewports were used throughout, because both are real:

| Viewport | What it is |
| --- | --- |
| 393 × 852 | the full screen |
| 393 × 659 | the same screen with Safari's chrome — the tighter, more common case, and the one every number below was tuned against |

Also checked: 393 × 852 (tall), 852 × 393 (landscape), 320 × 568 (SE-class), and the desktop board at 1280 × 720 to confirm nothing regressed there.

Everything was iterated against the running dev client with a headless Chromium at a real iPhone 15 Pro device profile (touch events, not mouse), driving `/demo` across the engine fixtures.

---

## 1. The headline change: bank merged into properties

**Before.** `.game-board__panels` split the board into properties + a bank column. On a 393px screen the bank took ~24% of the width to show a stack of money cards whose only decision-relevant fact is their sum, and the properties — the thing a player actually reads and drops onto — got what was left.

**After.** Below the phone breakpoint `BankPanel` renders a different component entirely:

- a **total-only pill** floating over the bottom-right of the properties panel — `BANK ₹9Cr (3)`;
- **tap or hold** it to open a **bottom sheet** with the notes themselves, a running total, and a close button;
- the properties panel gets the **full board width**, and its sets now lay out **two per row** instead of one.

The pill is still the bank's drop zone. It carries the same `data-drop-zone="bank"` and `data-testid="bank-drop"` the panel does, so the existing touch-drag polyfill drops onto it with no special-casing — verified end to end: long-press a money card in hand, drag to the pill, release, bank goes ₹9Cr → ₹13Cr. While a drag is in flight the pill grows to a 56px target and takes the dashed drop-zone cue.

Wide boards are untouched: the money column is exactly as it was.

Files: `apps/web/src/components/BankPanel.tsx`, `apps/web/src/hooks/useIsPhoneBoard.ts` (new), `apps/web/src/styles.css`.

## 2. Everything else that was wrong at 393px

### Horizontal overflow
The document scrolled sideways to 604px. Gone — every checked viewport now reports `scrollWidth === clientWidth`, with no element extending past either edge.

### The hand was being cut off, twice
- **Sideways.** The fan lays a crowded row out to exactly fill its box *plus* a 16px bleed per side, then tilts the outer cards up to 13° — which throws their top corner (where the value badge is) another ~24px out. On a phone that is a whole value corner lost off both edges, every time the hand is more than half full. The bleed drops to 2px and the splay halves below 420px of fan width, plus an 18px gutter for the residual tilt.
- **Downwards.** The two-row fan's box was a fixed `2 × card + gap` tall — taller than the track the phone board gives it — so the bottom row, the one nearest the thumb, hung 39px below the board and was clipped. The fan now fills its track and scales the cards to what fits. It still bleeds *upward* over the panels on purpose; those pixels are board background, not cards.

Result at 393 × 659 with a 7-card hand: every card lies within x ∈ [25, 368], y ∈ [420, 650].

### The table centre was a pile-up
END TURN and the plays pill overflowed a centred flex row straight over both piles, and the absolutely-positioned timer sat on top of the draw pile. It is now an explicit `draw | status | discard` grid; the timer moved into the status stack (in the DOM too, so the phone layout can put it beside the plays pill instead of spending a 32px band on a 20px chip — on a wide board it is still absolutely positioned in the table's corner, unchanged). Pile labels went from hanging off the pile's bottom edge to sitting in flow, because the centre is `overflow: hidden` and they were the first thing it cut.

### Opponent rail
Three seats share 393px, so each card is ~120px. Names truncated to `Play…`, and the `Disconnected` badge overlapped the hand count. Now: the badge is a red dot on the avatar (its text stays for screen readers), the name gets its row, and the set bars shrank so two sit side by side instead of stacking into height the card does not have.

Also fixed: the phone rules for those set bars targeted `.property-mini-bar__segment` / `__track` / `__count` / `__label` — **none of which exist** in `PropertyMiniBar`, which renders `__dots` / `__dot` / `__badge`. That whole block had been dead since it was written. Replaced with rules that match the markup.

### Prompts
A centred dialog is a desktop shape; at 393px it covered the entire board, so you answered it with no sight of the table it was about. Prompts are now sheets: **bottom** by default (thumb reach — they carry their own choices, so covering the hand costs nothing), **top** for the hand-limit discard, whose answer *is* a tap on the hand. `PromptShell` takes a `placement` prop. Its hint also stopped saying "drag … then drop on discard pile" as the only route, since tapping is the mobile one, and the raw list of selected card ids is hidden on phones.

### Touch targets
Every interactive control outside the dev bar is now ≥44px on its constrained axis: prompt buttons and choices, inspect-modal tabs and close, the feed FAB, the bank pill. Automated sweep at each viewport reports zero undersized targets.

## 3. Landscape

A phone held sideways is 852 × 393 — wide enough to clear every width breakpoint, short enough that the desktop board had nowhere to put the hand. It was badly broken: rail crushed to slivers, centre collapsed, hand off the bottom, and the feed drawer parked open over half the table.

- The 1100 / 900 / 700px queries now also fire on `(max-height: 520px) and (orientation: landscape)`, and `useIsCompactHand` / `useIsPhoneBoard` match.
- `SidePanel` read `window.innerWidth <= 700` **once at mount** and never again, so rotating opened-drawer-into-landscape left it stranded. It now tracks the breakpoint and re-collapses whenever the layout becomes a phone one.
- A landscape block retunes the vertical budgets: opponent cards turn their three stacked bands into one line (width is the plentiful axis here), the set grid goes back to a single row, and every board track is floored at what its contents need.

## 4. Small phones

A separate guard for SE-class screens (`≤700px` wide **and** `≤620px` tall, portrait) trims the board tracks, and below 360px the opponent avatar shrinks to give the name back some width. Checked at 320 × 568: nothing clipped.

---

## Verification

- `pnpm verify` — **passes** (workspace typecheck, lint, engine vitest, redaction, server integration, 500-game headless sim, 100-game networked sim).
- `pnpm --filter @monopoly-deal/web typecheck` / `lint` — clean.
- Playwright `e2e`: 17 passed, 1 failed — `wildflip › flipping a board wildcard that breaks a set takes two taps`. **Pre-existing and flaky, not caused by this work**: the same suite on a stashed, clean tree fails *two* wildflip specs, and the failing spec passes when run alone.
- Playwright `e2e-net`: 9 passed, 1 failed — `wildflip › a board flip reaches the opponent projection`. Same story; it fails on `no two-colour wildcard reached a hand in MAX_TURNS turns`, i.e. it depends on the server's CSPRNG shuffle dealing it a particular card. Unrelated to layout.
- Touch drag verified end to end on the new pill (hand → bank pill → total updates), and on the properties panel to confirm the shared path still works.

## Not done / worth knowing

- **The payment prompt prints a raw enum**: `debt_collector to Player 1 — selected ₹0Cr`. Visible on every device, not a mobile bug, so I left it — but it is the one piece of user-facing text on that sheet that reads like a log line.
- **Long city names still clip on board cards** (`Dibrugar`, `Alappuzl`). Same on desktop at board size; it is a card-design question, not a layout one.
- **Landscape is workable, not lovely.** The board is a portrait shape and 393px of height is genuinely tight; the hand cards end up around 69 × 96 there. If landscape matters, the honest fix is a different arrangement (rail as a left column), not more trimming.
- The hand-count pill (`HAND 4/7`) is `display: none` everywhere in the existing stylesheet. That looked deliberate, so I left it — but on a phone it is the only place the discard-down-to-7 risk would be visible at a glance.

## Files changed

```
apps/web/src/components/BankPanel.tsx      pill + sheet for phones; wide board unchanged
apps/web/src/components/GameCenter.tsx     timer moved into the status stack
apps/web/src/components/GamePrompts.tsx    PromptShell `placement`; discard hint reworded
apps/web/src/components/HandFan.tsx        phone bleed + splay
apps/web/src/components/SidePanel.tsx      drawer tracks the breakpoint instead of mount-time width
apps/web/src/hooks/useIsPhoneBoard.ts      new — the phone breakpoint as a hook
apps/web/src/hooks/useIsCompactHand.ts     query widened to short landscape
apps/web/src/styles.css                    phone block, landscape block, small-phone guards
```
