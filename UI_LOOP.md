# UI Loop — game screen mobile responsiveness pass

Source of truth for the self-verifying UI loop. Read this file first, not
conversation memory, when resuming work.

Harness: `node apps/web/scripts/shoot.mjs <iteration-name>` shoots `/local`
(`responsiveMidGame` fixture) at 390x844, 414x896, 768x1024, 1440x900 into
`.screens/<iteration-name>/`. Requires web dev server already running at
127.0.0.1:5173 (do not start it yourself).

## Checklist

- [ ] No horizontal scroll at any viewport
- [ ] No clipped or cropped text on any card
- [ ] Every card in hand mostly readable at 390x844
- [ ] Property set progress and completion legible without overlap
- [ ] Opponent panels compact but show sets, cash, hand count
- [x] All tap targets at least 44x44
- [ ] Hand and primary actions in the lower third
- [ ] Nothing hidden behind safe areas
- [ ] 1440x900 still looks intentional, not a stretched phone layout

## Backlog

(problems found but not yet the "worst" one — pulled from here in later
iterations)

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
