# UI Loop — game screen mobile responsiveness pass

Source of truth for the self-verifying UI loop. Read this file first, not
conversation memory, when resuming work.

Harness: `node apps/web/scripts/shoot.mjs <iteration-name>` shoots `/local`
(`responsiveMidGame` fixture) at 390x844, 414x896, 768x1024, 1440x900 into
`.screens/<iteration-name>/`. Requires web dev server already running at
127.0.0.1:5173 (do not start it yourself).

## Checklist

- [x] No horizontal scroll at any viewport
- [x] No clipped or cropped text on any card
- [ ] Every card in hand mostly readable at 390x844
- [ ] Property set progress and completion legible without overlap
- [x] Opponent panels compact but show sets, cash, hand count
- [x] All tap targets at least 44x44
- [ ] Hand and primary actions in the lower third
- [ ] Nothing hidden behind safe areas
- [ ] 1440x900 still looks intentional, not a stretched phone layout

## Backlog

(problems found but not yet the "worst" one — pulled from here in later
iterations)

- Very long single-word property names ("Tennessee") still wrap tightly at
  the smallest board-card width even with clean 2-line + ellipsis
  truncation. `shortPropertyName()` in `PlayingCard.tsx` already abbreviates
  "Avenue"/"Place"/"Railroad"/"Company" but has no rule for standalone state
  names — would need a product decision on what to abbreviate them to.
- React "two children with the same key" console warning at 768x1024 and
  1440x900 (not at phone widths) — code-correctness bug, not layout, out of
  scope for this presentation-only loop.
- Safe-area insets (`env(safe-area-inset-*)`) are not used anywhere, and
  `index.html`'s viewport meta tag has no `viewport-fit=cover`. The hand row
  sits only ~9px above the viewport bottom edge at 390x844 (measured via
  `getBoundingClientRect`), which is exactly where a notched-phone home
  indicator would sit. Real bug candidate for "Nothing hidden behind safe
  areas", but headless Chromium always reports `env()` as 0 regardless of
  viewport-fit, so this harness cannot produce a screenshot that proves the
  fix — would need a real device or Playwright WebKit + iOS device
  descriptor to verify. Not picked as an iteration target for that reason
  (can't visually confirm), left here instead of guessing.

## Frozen

(items needing a redesign decision from the user — not fixed in this loop)

## Iteration Log

(one entry per iteration, appended in order)

### Iteration 1 — sub-44px tap targets

- Screens: `.screens/00/` (before), `.screens/01-after/` (after)
- Looked at `.screens/00/390x844.png`: dev bar top (scenario picker + seat
  switcher 1-4), 3 opponent panels (3rd cut at right edge, carousel), turn
  status strip, your properties + bank panels, hand of 7 cards fanned at
  bottom with END TURN button.
- Ran `apps/web/scripts/responsive-audit.mjs` for objective data instead of
  guessing from the screenshot alone. It flagged 5 interactive elements under
  44x44 CSS px at 390x844 (`.dev-controls__seat` circles at 26x26 x4,
  `.side-panel__fab` chat/feed toggle at 99x32) — the seat-switch buttons
  stayed sub-44 even at 768/1440 (32x32). No horizontal page overflow at any
  viewport (that checklist item already passes, confirmed by both the audit
  and the screenshots).
- Picked this as the worst problem: it's the only *objectively measured*
  violation (not a visual judgment call), it's a literal checklist item, and
  small circular seat buttons / the feed toggle are real interactive controls
  a thumb has to hit reliably on a 390px phone.
  - Initially misread the hand-of-cards row as vertically clipped at the
    bottom edge from the screenshot alone. Checked real DOM
    (`getBoundingClientRect`) before acting: `.hand-fan` bottom = 835px inside
    an 844px viewport, 9px of margin. Not clipped — just tightly fitted, and
    what looked like a cut card was the fan's intentional horizontal overlap.
    Logging this so the same misread isn't repeated: judge clipping from
    measured box positions, not from screenshot silhouette alone.
- Fix: bumped `.dev-controls__seat` from 32px (26px in the ≤700px media
  query) to a uniform 44x44, and gave `.side-panel__fab` `min-height: 44px`
  with rebalanced padding + `justify-content: center`. One file
  (`apps/web/src/styles.css`), no JSX/logic touched.
- Re-shot into `01-after` and reran the audit: 0 sub-44px targets at all four
  viewports, `horizontal overflow: false` unchanged at all four. Visually
  confirmed both 390x844 and 1440x900 screenshots — dev bar wraps cleanly,
  desktop layout unaffected.
- Verdict: worked. Ticked "All tap targets at least 44x44".
- Commit scope note: `apps/web/src/styles.css` had pre-existing uncommitted
  changes at session start (unrelated `SidePanel.tsx` work-in-progress, plus
  an earlier property-card CSS pass from this same working tree) already
  mixed into the file. Committed only the two `.dev-controls__seat` hunks
  (clean against HEAD) via a hand-staged blob; the `.side-panel__fab` fix
  stays applied in the working tree (screenshots reflect it) but uncommitted,
  since it's nested inside that pre-existing, not-yet-committed feature block
  and can't be isolated the same way without also committing someone else's
  in-progress work.
- Regression check (step 8): re-ran the audit across all 4 viewports above —
  no new sub-44 targets, no new horizontal overflow. No previously-ticked
  item exists yet to regress.
- Aside (not fixed, out of scope — presentation-only loop): the audit surfaced
  a React "two children with the same key" console warning at 768x1024 and
  1440x900 (not at phone widths). That's a code-correctness bug, not a layout
  issue, so it's not a checklist item here — noting it so it isn't lost, but
  not chasing it in this loop.
- Also ticked "No horizontal scroll at any viewport" this iteration: it was
  already true (confirmed by `responsive-audit.mjs`'s `docWidth === winWidth`
  at all 4 viewports across iterations 00, 01-after, 02) and visually
  re-confirmed in the 390x844 and 1440x900 screenshots — held with no fix
  needed, so ticking it rather than leaving it dangling.

### Iteration 2 — duplicate/conflicting property-card CSS breaking text mid-word

- Screens: `.screens/02/` (before), `.screens/02-after/` (after); also two
  targeted element screenshots (`prop_card_zoom.png` /
  `prop_card_zoom_after.png`) of `.property-set-view` via Playwright's
  `locator().screenshot()`, since a blind crop tool wasn't reliable for
  pinpointing a specific region.
- Looked at `.screens/02/390x844.png` again (same scene as iteration 1's
  after-shot, tap-target fix holds). This time inspected the "YOUR
  PROPERTIES" panel closely: property name text was genuinely broken —
  "TENNESSEE" rendered as "TENNE" on one line and "SSEE…" on a second,
  mid-word, with an ellipsis stuck in the middle of the word. That's
  different from ordinary truncation; it read as a rendering bug, not a
  design choice.
- Traced it to two entire, independent, ~280-line CSS blocks in
  `apps/web/src/styles.css` both defining the same selectors
  (`.playing-card__property-header`, `__value-badge`, `__property-title`,
  `__property-body`, `__rent-*`, plus lg/board/sm size overrides) — a
  leftover from the property-card redesign being touched by two different
  edits without either removing the other's version. CSS cascade merges the
  two per-property, not per-block, so the rendered title ended up with
  `display:-webkit-box; -webkit-line-clamp:2` from the first block combined
  with `word-break: break-word` (an aggressive, break-anywhere legacy value)
  from the second, later block. That specific combination is what produced
  the mid-word double-break-then-ellipsis.
- Picked this over the opponent-panel edge-crop (3rd/4th opponent partially
  off-screen, `.opponent-rail` `overflow-x: auto`) — that one's an
  intentional horizontal carousel with real content behind it, not a
  rendering bug, and lower priority than text that's actively garbled on the
  player's own property board.
- Fix: deleted the entire first (older, less on-brand — no ink border/hard
  shadow on the value badge, unlike the rest of this app's chip styling)
  duplicate block wholesale, keeping the second block that matches the
  established bordered/shadowed chip look. Then replaced the surviving
  block's `word-break: break-word` with `word-break: normal; overflow-wrap:
  break-word;` plus a proper `-webkit-line-clamp: 2` + `text-overflow:
  ellipsis` truncation, so long names wrap at word boundaries first and only
  break mid-word (with a single trailing ellipsis, not a mid-word one) as a
  last resort. One file, no JSX/logic touched.
- Verified zero duplicate selectors remain (`grep -c` on each base selector
  plus its lg/board/sm overrides — every one now appears exactly once as a
  base rule with the expected size-variant overrides, nothing more).
- Re-shot into `02-after` and re-zoomed the property panel: "TENNESSEE" now
  renders as a clean two-line wrap with a single ellipsis, no more
  double-broken text. Visually confirmed at both 390x844 and 1440x900 — no
  regressions to the panel layout, dots progress indicator, or card
  proportions at either size.
- Verdict: worked. Ticked "No clipped or cropped text on any card". Very
  long single-word property names (e.g. "Tennessee") still don't fit
  cleanly on one line at the smallest board-card width even after the fix —
  that's a real space constraint, not a bug, and abbreviating long property
  names (the existing `shortPropertyName()` helper already does this for
  "Avenue"→"Ave." etc., but not for standalone state names) would need a
  product decision on abbreviation rules. Logged to Backlog rather than
  guessing at abbreviations mid-loop.
- Regression check (step 8): re-shot all 4 viewports, confirmed hand-size
  (`--lg`) and board-size property cards both render correctly, no new
  horizontal overflow, previously-ticked tap-target fix still holds (seat
  buttons still 44x44 in the `02-after` screenshots).

### Iteration 3 — opponent panels needed horizontal scroll to see 2 of 3

- Screens: `.screens/03/` (before), `.screens/03-after/` (after).
- Looked at `.screens/03/390x844.png`: identical scene to iterations 1-2
  (both prior fixes hold). Considered the safe-area-inset checklist item
  (hand row sits ~9px from the viewport bottom, no `env(safe-area-inset-*)`
  anywhere in the CSS, no `viewport-fit=cover` in `index.html`) but ruled it
  out as this iteration's target: headless Chromium always reports
  `env(safe-area-inset-*)` as 0 no matter what, so there's no screenshot
  this harness can take that would prove the fix worked either way, and the
  rules say never tick without visual confirmation. Logged it to Backlog
  instead of guessing blind.
- Picked opponent-panel crowding instead: at 390x844 the `.opponent-rail`
  mobile CSS (`grid-auto-flow: column; grid-auto-columns: minmax(148px,
  1fr); overflow-x: auto`) needed 3 x 148px = 444px for 3 opponents in a
  390px-wide row, so only ~2.3 opponent panels were visible and the 3rd was
  cut mid-card with no scroll-affordance hint. That's a direct violation of
  "Opponent panels compact but show sets, cash, hand count" — the 3rd
  opponent's sets/cash weren't visible without scrolling, which matters for
  real decisions (who's close to a set, who to target with rent).
- Fix: replaced the horizontal-scroll carousel with a non-scrolling
  `repeat(3, minmax(0, 1fr))` grid (same pattern the existing 900px tablet
  breakpoint already used successfully) and shrank the header row (avatar
  26px, name 13px, hand-count chip padding/font) so 3 equal columns fit
  inside ~118-126px each at 390-414px width. `.opponent-card__sets` already
  had `flex-wrap: wrap`, so a 2-set opponent (Priya: Purple + Light Blue)
  now wraps to two stacked rows instead of needing horizontal room — grid
  rows just grow taller, which is a fine, expected trade-off (all 3 panels
  stretch to equal height, no overlap, no clipping).
- Re-shot into `03-after`: all 3 opponents fully visible at 390x844, no
  scroll needed. Bonus: names got slightly more room too ("Pri…" instead of
  "Pr…" at 390px; "Priya" fully spelled at 414px).
- Verdict: worked. Ticked "Opponent panels compact but show sets, cash, hand
  count". Removed the now-resolved Backlog entries for opponent-panel
  scroll-affordance and hard name truncation (both fixed as a side effect).
- Regression check (step 8): reran `responsive-audit.mjs` — 0 sub-44px
  targets and no horizontal overflow at all 4 viewports, unchanged from
  iteration 2. Visually confirmed 390x844, 414x896, 768x1024 (identical to
  before — the 900px breakpoint already had the correct non-scrolling grid,
  untouched by this edit), and 1440x900 (identical to before, edit was
  scoped to the `max-width: 700px` media query only). Both previously-ticked
  items (tap targets, no clipped card text) still hold.
