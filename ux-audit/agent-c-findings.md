# UX Audit — Agent C (Measurable Quality Pass)

**Scope:** `/local` pass-and-play route, 390×844 @2x mobile viewport (iPhone-class, notch phone), Chromium via standalone Playwright scripts (no MCP browser tools used, per instructions).

**Flow tested:** first load (real freshly-dealt game) → forced the `standardMidGame` dev fixture to get a realistic mid-game state (2 complete property sets, ₹6Cr bank, 4-card hand, 3 opponents with banks/hands) → played a property card → played a dual-color rent card (triggers a real rent-collection payment round) → switched seat to the paying opponent to view their Just-Say-No and Payment prompts → loaded the `payBreaksCompletedSet` fixture for a richer payment modal (money + a complete set with a house, "Breaks set" warning). 8 distinct screen states were captured and audited via `page.evaluate` (tap targets, text legibility/contrast, overflow, overlaps, touch semantics, console/network, DOM size, responsiveness, rAF jank).

Screenshots referenced below live in `ux-audit/screenshots/`, prefix `c-`.

**Ruled out (checked, not real bugs, so not listed as findings):** page-level horizontal scroll (`scrollWidth === innerWidth === 390` on every one of the 8 states — no page ever grew past the viewport); the hand-fan cards' own 38–41% mutual bounding-box overlap (by design — `HandFan.tsx` documents `MIN_OVERLAP`/`MAX_OVERLAP` 0.22–0.55 for the fanned-hand look); a contrast check that flagged the Just Say No card's "NO!" glyph at a 1:1 ratio — traced to the DOM background-color walker landing on an ancestor panel color that the SVG shield artwork visually occludes; verified in `c-diag-jsn-card-zoom.png` that the text is clearly legible (dark blue on the gold shield), so this was a false positive from the automated contrast walker and is excluded; `env(safe-area-inset-*)` is used in the CSS and `--card-scale` container-query card sizing works as documented — no clipped card faces were observed at 390px. Tap-to-DOM-change responsiveness measured 22–37ms (well under the ~100ms perceptible-lag threshold) and a 1.2s rAF sample taken during the rent-card play animation showed 0 dropped frames (avg 16.65ms/frame, max 17.7ms) — no jank.

---

### [severity: major] Payment/rent prompts mislabel the payee as "You" when a different player is viewing

**What:** In the payment prompt shown to the *payer*, the payee (the person owed money) is rendered as "You" even when the current viewer is not that payee. Reproduced twice, independently:
- Natural gameplay: played `r1` (a red/yellow dual rent card) as p1, switched local seat to p2 (the payer). Prompt read **"You — pay ₹2Cr"** / **"rent to You — selected ₹0Cr"** (`c-06-p2-payment-prompt.png`). The payee here is p1, not the viewer p2.
- Fixture `payBreaksCompletedSet` (hardcoded `payerId:'p2', payeeId:'p1'`), viewed as p2: prompt read **"You — pay ₹5Cr"** / **"rent to You — selected ₹0Cr"** (`c-07-payment-modal-breaks-set.png`).
- Confirmed the underlying data is correct (the payee's actual board — 0 hand/0 bank/no sets — renders correctly in the opponent spotlight header above the prompt), so only the *name string* is wrong, not the amounts or targets.

**Root cause (read in source):** `apps/web/src/derivations.ts`, `playerById()`:
```ts
if (playerId === state.viewerId) return state.you;
return state.players.find((p) => p.id === playerId) ?? state.you;
```
When the lookup for the requested id fails to find a match in `state.players`, it silently falls back to `state.you` (the viewer's own record) instead of returning nothing. Every caller — `nameFor()` and `playerDisplayName()` — then treats that mis-substituted record as the viewer, printing "You". This fallback is a general anti-pattern, not exclusive to the dev seat-switcher: `CLAUDE.md` documents a 60s disconnect-reconnect grace window, so any transient state where a player's id briefly doesn't resolve in `state.players` (e.g. during a reconnect race) would trip the same silent mislabeling in real networked play.

**Why it hurts:** In a game about tracking who owes whom money, telling the payer they owe money "to You" is actively misleading and undermines trust in every subsequent money prompt.

**Screenshot:** `c-06-p2-payment-prompt.png`, `c-07-payment-modal-breaks-set.png`

**Repro:** On `/local`, open the Table Feed drawer, switch "Your seat" to any seat other than the one that triggered a pending rent/payment, and view the resulting Payment/Just-Say-No prompt naming the actual payee.

---

### [severity: major] No protection against accidental double-tap-zoom during the core tap-to-play gesture

**What:** `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">` — no `maximum-scale` or `user-scalable=no`. Computed `touch-action` is `auto` on `html`, `body`, and `.playing-card` alike (not `manipulation` or `none`). The app's own tap-to-play interaction model (`useDragCard.ts`) explicitly requires re-tapping the *same* card to cancel a hold: HandFan's own hint text reads "Tap a highlighted zone to play it, or tap the card again to cancel." That is precisely the gesture (two taps on the same point in quick succession) that mobile Safari/Chrome interpret as double-tap-to-zoom when nothing suppresses it.

**Why it hurts:** A player quickly selecting then reconsidering a card (a very common action) risks triggering the browser's native pinch-zoom instead, which would visually break the fixed-layout board (cards, drop zones, and the 60s turn timer are all sized for a 1x viewport) and require a manual zoom-reset to keep playing — a real, previously-flagged-as-hazard interaction, not a cosmetic nit.

**Repro:** On a real touch device (or emulated touch), double-tap a hand card quickly.

---

### [severity: major] The majority of card-face text renders below any legible size on a phone-width hand

**What:** On the realistic mid-game screen (`c-01-initial-midgame.png`), of 179 visible text nodes scanned, **123 (69%)** compute a font-size under the 11px floor. The 20 smallest, with actual rendered text:

| font-size | text | element |
|---|---|---|
| 2.08px | "DUES · PAY NOW" | `.playing-card__af-dc-tag-label` |
| 2.56px | "ONE RIVAL OF YOUR CHOICE PAYS YOU" | `.playing-card__af-rulebox` |
| 2.56px | "₹5CR" | `.playing-card__af-rulebox` |
| 3.59px ×18 | "1 CARD" / "2 CARDS" / "FULL SET · 3 CARDS" (repeated per property row) | `.playing-card__pcard-row-label` |
| 3.88px | "TEA SET · BRAHMAPUTRA" | `.playing-card__pcard-tagline` |

These aren't decorative — they're the rent-table rows and rule text a player needs to read to make a play decision. At 2–4px the glyphs are sub-pixel-rendered noise, not readable text, even accounting for `deviceScaleFactor: 2`.

**Why it hurts:** This directly contradicts the purpose of the text (rent amounts, set-completion counts, action-card rules) — a player cannot make an informed play without zooming in, which the app doesn't protect against zoom-breaking the layout (see previous finding) and which the pinch-to-zoom-disabled convention in most card-game UIs would otherwise block anyway.

**Screenshot:** `c-01-initial-midgame.png`

**Repro:** Load `/local`, force the `standardMidGame` fixture, inspect any hand or discard-pile card's rent table / rule text at default (unfocused) fan scale.

---

### [severity: major] Low-contrast text recurring on every board screen

**What:** Contrast ratio measured against the resolved solid-color background (excluding any element with an image/gradient layer, which was intentionally not flagged — see false-positive note above). All fail the applicable WCAG AA threshold (4.5:1 for body text, 3:1 for ≥18px bold — none of these qualify for the relaxed threshold):

| Element | Text | fg / bg | Ratio | Threshold |
|---|---|---|---|---|
| `.opponent-card__avatar` | "MA" (Marcus's initials) | `rgb(255,246,226)` on `rgb(242,210,46)` | **1.39:1** | 4.5:1 |
| `.opponent-card__avatar` | "YU" (Yusuf's initials) | `rgb(255,246,226)` on `rgb(31,168,90)` | **2.87:1** | 4.5:1 |
| `.cash-pile__total` | "₹6Cr" bank-total pill | `rgb(255,255,255)` on `rgb(133,187,101)` | **2.26:1** | 4.5:1 |
| `.playing-card__value-badge--corner` | "₹1Cr" card corner badge | `rgb(255,255,255)` on `rgb(199,154,11)` | **2.61:1** | 4.5:1 |

The avatar-initial and cash-total instances reproduced identically across every state audited (A, D, E, F, G, H) since those elements are always on screen.

**Why it hurts:** The opponent-avatar contrast (1.39:1) is severe enough that Marcus's initials are close to invisible against the yellow chip — a player can't identify opponents by avatar at a glance. The bank-total badge is the number every player checks constantly to gauge how close an opponent is to affording a payment; 2.26:1 is roughly half the required ratio.

**Screenshot:** `c-01-initial-midgame.png`

---

### [severity: major] The persistent "FEED" button permanently covers part of the 3rd/4th opponent's info panel

**What:** On every board state audited (A, D, E — the FAB re-collapses back to this position after each panel close), the fixed-position Table Feed FAB (`.side-panel__fab`, "FEED" pill) occupies `x:277–382, y:8–52` (105×44 CSS px). It sits directly on top of the fourth player's opponent card (`[data-testid="opponent-card-p4"]`, `x:261–382, y:7–100`, 121×94 CSS px) — the FAB alone covers 41% of that panel's area, specifically the top band where the avatar, name, and hand-count normally render. Visually, only a thin sliver of the opponent's avatar circle peeks out to the left of the pill; the player's name and hand-count are fully hidden (`c-01-initial-midgame.png`, `c-00-fresh-game-first-load.png`).

**Why it hurts:** In a 3-opponent game (the common case, 4 players total), a core piece of information — how many cards the 4th player is holding — is permanently obscured behind a chrome element with no indication anything is missing.

**Screenshot:** `c-01-initial-midgame.png` (top-right)

**Repro:** Load `/local` with any 4-player fixture at 390px width — no interaction needed, visible immediately.

---

### [severity: minor] Currency-unit toggle buttons are far under the 44px minimum

**What:** `[data-testid="currency-INR"]` ("₹ Cr") measures **35.5×16px**; `[data-testid="currency-USD"]` ("$ M") measures **34.1×16px** — both real `<button>` elements in the Table Feed drawer, not decorative.

**Why it hurts:** A 16px-tall target is roughly a third of the 44px accessibility minimum; on a touch device this is a near-guaranteed mis-tap, especially next to the "GAME LOG" label it sits beside.

**Screenshot:** `c-02-sidepanel-open.png`

**Repro:** Open the Table Feed drawer (☰ FEED button) → the currency toggle sits top-right of the log panel.

---

### [severity: minor] Opponent "peer" quick-inspect chips are under the 44px minimum

**What:** During a pending interaction, `[data-testid="opponent-peer-p3"]` / `-p4"]` (real `<button>`s, `OpponentSpotlight.tsx`) measure **50.7×34px** (width passes, height fails). This is the only way to quickly check another idle opponent's hand/bank count while a prompt is active.

**Screenshot:** `c-05-p2-view-prompt.png`, `c-06-p2-payment-prompt.png` (top-left avatar chips)

---

### [severity: minor] Table Feed chat input is 3px under the 44px minimum

**What:** `[data-testid="chat-input"]` measures 237.8×**41px**. Close, but fails the strict 44px floor; combined with the adjacent 44px-tall Send button it's a minor inconsistency rather than a practical tap-miss risk.

**Screenshot:** `c-02-sidepanel-open.png`

---

### [severity: minor] City name truncates mid-word without an ellipsis on the property card face

**What:** The property card titled "Bhubaneswar" clips its city-title text: `scrollWidth: 123px` vs. `clientWidth: 107px` on `.playing-card__pcard-city-title`, with `text-overflow` not set to `ellipsis` on the clipping ancestor. Visually the card reads "BHUBANE" with a hard cut, no `…`.

**Screenshot:** `c-01-initial-midgame.png` (bottom hand card, Odisha "Chakra Set")

**Repro:** Force the `standardMidGame` fixture and look at the "Bhubaneswar" property card in p1's hand — any city name whose rendered width exceeds ~107px at the current card scale will do the same.

---

### [severity: minor] Several near-miss contrast failures on primary UI chrome

**What:** All measured against solid backgrounds, all just under the 4.5:1 threshold:
- `button.end-turn-btn` "END TURN" — `rgb(255,246,226)` on `rgb(196,85,47)` — **4.17:1** (the primary end-of-turn CTA every player taps once a turn).
- Pass Go card face "PASS" / "GO" — cream on green — **3.78:1**.
- `.playing-card__rent-state--b` "Tamil Nadu" (rent card state label) — olive-gold on cream — **3.23:1**.

**Why it hurts:** Individually borderline and still readable at these sizes/weights, but they cluster just under AA across the most-used controls, suggesting the palette's default text/background pairing generally runs a bit light rather than one isolated bug.

---

### [severity: minor] React "duplicate key" console error observed during the session

**What:** One console error was captured across the full flow:
```
Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. 1
```
The offending key value is `1`. This surfaced during/after the forced dev-fixture switch sequence (`oneSetFromWinning` → `standardMidGame`) used to set up the realistic mid-game state; it was not isolated to a specific component in this pass.

**Why it hurts:** A live duplicate-key warning means React's reconciliation for some list can silently drop or duplicate a rendered child — a latent correctness bug regardless of whether this exact trigger (rapid dev-fixture switching) is user-reachable.

**No failed network requests were observed in the same session** (0 requests ≥400 status, 0 `requestfailed` events).

---

### [severity: nit] Dev-only "Your seat" buttons are 40×40, under the 44px floor

**What:** `.dev-controls__seat` buttons (1–4 seat switcher) measure 40×40px. Below the strict minimum, but this panel is explicitly commented in source as dev-only chrome (`SidePanel.tsx`: "Dev-only chrome (scenario picker, seat switcher) for /demo and /local"), so it is not player-facing production UI. Listed for completeness only.

**Screenshot:** `c-02-sidepanel-open.png`
