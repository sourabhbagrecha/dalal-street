# Networked Multiplayer UX Audit — Agent B

Two real players (Alice = host, Bob = joiner), both on a 390×844 mobile viewport
(deviceScaleFactor 2, isMobile, hasTouch), against the live dev server
(web `127.0.0.1:5173`, API `127.0.0.1:8787`). Driven with standalone Playwright
scripts (no MCP browser tools), using the app's own `window.__MD_TEST__` test
hook purely to *read* each player's own (already-redacted) client state — never
to bypass the UI or peek at hidden information. All screenshots referenced live
in `ux-audit/screenshots/`, prefixed `b-`.

Room used for most of the session: `RAV8E5`.

---

### [severity: blocker] Turn can get stuck refusing to end for an extended period after a Debt Collector payment that followed an expired Birthday payment

**What:** Alice played "It's My Birthday" and its payment window was deliberately
left to expire (testing auto-pay). On Alice's *very next* action-card play —
Debt Collector against Bob — Bob paid (partially, using all his assets, which
the engine correctly allows). Immediately afterward, Alice's own "END TURN" tap
started being rejected by the server with the exact toast **"Cannot end turn
with pending interactions."** This repeated on every subsequent turn-detection
poll for the rest of the automated session (33 consecutive rejections logged
over ~18 seconds, then the game was left in that state through the entire
disconnect/reconnect phase that followed — screenshots taken 0s, 15s, 35s and
63s after that point all still show Alice as the current player with an active
"END TURN" button and a ticking timer, i.e. her turn never actually advanced
during that whole window). Her hand and board were completely frozen — no play,
no bank, no discard, nothing changed round over round while this persisted.

**Why it hurts:** This is a hard stop for a real player: the "END TURN" button
is there, looks enabled, and does nothing except pop a cryptic rejection toast
that never goes away no matter how many times you tap it — no explanation of
*what* is still pending, because nothing pending is visibly rendered on screen.
Per `packages/engine/src/dispatch.ts`, both the player-initiated `END_TURN`
(line ~1188, `handleEndTurn`) **and** the server's own scheduler-driven
`FORCE_END_TURN` failsafe (line ~1504, `handleForceEndTurn`) refuse to proceed
while `pendingStack` holds anything other than `double_rent_pending` (or, for
force-end, anything other than the acting player's own `hand_limit_discard`).
If some other pending entry is left dangling on the stack after a payment
resolves, *neither* the player nor the documented 60s turn failsafe can recover
the game — this is precisely the shape of a game-breaking stuck state. The turn
did eventually move on (a `turn force-ended` / `auto-discarded` event shows up
much later in the log), but only after a delay far longer than the documented
60s turn cap would predict from when the debt collector payment resolved,
suggesting whatever was stuck took its own separate ~30s-class timeout to clear
rather than being cleaned up immediately when the payment completed.

**Screenshot:** `b-37-predisconnect-alice-view-bob-about-to-vanish.png`,
`b-39-disconnect-t0-alice-view.png` (both show Alice still "mid-turn" — active
END TURN button, ticking timer — long after her debt-collector play should have
fully resolved); raw rejection evidence in the run log (`"Alice: rejection
toast visible after action: Cannot end turn with pending interactions"`,
repeated).

**Repro:**
1. Two-player game. Get a payment prompt to fully expire once (e.g. play
   It's My Birthday and let the 30s payment window run out so auto-pay kicks
   in).
2. On the very next turn where the same player has an action card that opens
   a *single*-target payment (Debt Collector, or by the same code path Sly
   Deal / Forced Deal / Deal Breaker), play it and let the opponent pay
   normally (respond promptly this time, don't let it expire again).
3. Try "END TURN" — watch it get rejected with "Cannot end turn with pending
   interactions" and stay rejected on every subsequent attempt.
4. Recommend engineers dump `state.pendingStack` server-side right after step 2
   completes to see exactly what's left on it; the two most likely culprits are
   the payment-round auto-resolve path (`autoResolveExpiredPending` /
   `handleAutoResolvePending` in `apps/server/src/room.ts` /
   `packages/engine/src/dispatch.ts`) leaving a stale entry behind, or a race
   between the SELECT_PAYMENT ack and the next PLAY_CARD.

---

### [severity: blocker] No way back into an in-progress game once the tab/session is lost

**What:** Closed Bob's page outright (simulating a killed/backgrounded mobile
tab) mid-game, then opened a brand-new page, typed the same display name
("Bob") and the same room code, and tapped Join — the only reconnection
affordance the lobby UI offers. Result: an immediate, unambiguous rejection —
**"Game already started."** There is no other path back in anywhere in the UI.

**Why it hurts:** Session identity (`playerToken`) lives only in
`sessionStorage` (`apps/web/src/store/networkAdapter.ts`), which is scoped to
the exact browser tab. Any real-world event that loses that tab — the phone's
OS reclaiming a backgrounded tab (extremely common on mobile Safari/Chrome),
force-closing the app, an accidental tab close, a crash — permanently locks
that player out of the game they were in the middle of, with the "grace
period" being pure theater from the player's perspective: the server tracks
and even *sends the client* a 60-second `disconnectGraceMs` countdown (see
below) as if reconnection is expected to work, but the join endpoint
(`apps/server/src/routes.ts` → `Room.join()`) unconditionally returns
`409 game_started` once `room.status !== 'lobby'`, regardless of whether the
name matches an existing disconnected seat. For a party game explicitly
designed around phone play, this is one of the single most common failure
modes a real session will hit, and it ends the game for that player with no
recovery.

**Screenshot:** `b-44-reconnect-bob-fresh-home.png` (fresh Bob, name + code
filled in) → `b-45-reconnect-bob-after-join-attempt.png` (red "Game already
started" error, no alternative offered) → `b-46-reconnect-alice-view-after-bob-rejoin-attempt-paired.png`
(Alice's screen shows nothing at all — no signal that Bob even tried).

**Repro:** Start a 2-player game → close one player's tab/page entirely →
open a fresh tab, same display name, same room code → tap Join.

---

### [severity: major] Playing a single-target charge card (Debt Collector, Sly Deal, Forced Deal, Deal Breaker) leaves the actor with zero feedback that anything is happening

**What:** After Alice played Debt Collector and picked Bob as the target, her
own screen looked completely idle and fully interactive — active "END TURN"
button, ticking turn timer, "2 of 3" plays remaining, her whole hand rendered
normally — with absolutely nothing indicating she was waiting on Bob's
Just-Say-No/payment decision. Compare this directly against the *other*
payment code path in the same app: when Bob played It's My Birthday a few
turns earlier, Alice's screen (as the payer, symmetric case) — and more
importantly the *actor's* screen for that flow — showed an explicit
**"Waiting on other players / Alice selecting payment of ₹2Cr…"** panel. Two
structurally similar "I charged someone, now I wait" moments, and only one of
them tells the actor that's what's happening.

**Why it hurts:** This is exactly the kind of "did my tap even register?"
moment the audit is meant to catch. A player who just spent a card and picked
a target, then sees their own board looking totally normal/idle, has no way to
tell the difference between "the game is waiting on my opponent" and "nothing
happened, maybe I should try again" — inviting a confused re-tap or a
"is this broken?" reaction. It's also just inconsistent: the app clearly *has*
a "waiting on other players" pattern (`PaymentRoundStatus` in
`GamePrompts.tsx`), it's simply never wired up for the plain
`payment`/`just_say_no` pending path used by Debt Collector and the steal
actions (`pendingForLocal` in `GamePrompts.tsx` only renders a prompt to the
exact `payerId`/`respondentId`/`actorId` match — the person who *isn't* any of
those, i.e. the person who just took the action, gets nothing).

**Screenshot:** `b-28-actor-r5-actor-view-during-payment-nojsn-paired.png`
(birthday/payment_round case — HAS the waiting banner) vs.
`b-32-alice-r6-actor-view-after-debt_collector.png` and
`b-35-actor-r6-actor-view-during-payment-nojsn-paired.png` (debt collector
case — completely bare board, no waiting indicator at all, same session, same
two players).

**Repro:** Play Debt Collector (or Sly Deal / Forced Deal / Deal Breaker)
against an opponent and watch your own screen while they decide how to
respond.

---

### [severity: major] Payment auto-resolution on timeout is completely silent

**What:** Let a payment window run its full 30 seconds with no response from
the payer (Alice, owing Bob ₹2Cr for a Birthday). After the timer hit zero,
the prompt disappeared and the bank totals updated on both sides (Bob's bank
went from ₹1Cr/1 card to ₹3Cr/2 cards; Alice's dropped from ₹7Cr/3 to ₹5Cr/2)
— server-side auto-pay-cheapest clearly ran correctly. But **neither player
got any toast, banner, sound, or highlight calling out that this just
happened.** The only trace anywhere in the UI is a quietly-updated bank number
and one buried line in the table feed drawer — which is collapsed by default
on phone and has to be manually opened to find.

**Why it hurts:** The 30-second payment window is presented as a real decision
(which cards to pay with, whether a set gets broken) — auto-pay picks
*something* on your behalf when you don't respond, but a player who stepped
away for a few seconds, or who was looking at the board instead of the
countdown, has no way to know their assets just moved without hunting through
the log afterward. Given auto-pay can pick from property sets (see the "Breaks
set" warning shown in the manual prompt), silently losing part of a set this
way with zero acknowledgement is a genuinely bad surprise to discover several
turns later.

**Screenshot:** `b-27-target-r5-payment-prompt-nojsn-round.png` (prompt with
0:29 on the clock, nothing selected) → `b-29-target-r5-payment-EXPIRED-autopay-direct.png`
/ `b-30-actor-r5-view-after-payment-expired-direct-paired.png` (30+ seconds
later — prompt just gone, bank totals silently changed, no notification
anywhere on either screen).

**Repro:** Trigger any rent/birthday/debt-collector payment and simply do not
respond for 30+ seconds.

---

### [severity: major] The 60-second disconnect grace period has no visible countdown anywhere

**What:** The server computes and sends a `disconnectGraceMs` value per
disconnected player in every projection (`packages/shared/src/clientState.ts`,
populated by `apps/server/src/scheduler.ts:computeClientDeadlines`), exactly
the same way it does for the turn timer (`turnMs`) and pending-interaction
timer (`pendingMs`) — both of which **do** get rendered as a live countdown
ring + `mm:ss` text (`GameCenter.tsx`, `OpponentSpotlight.tsx`,
`useCountdown`/`formatCountdown`). But there is no component anywhere in
`apps/web/src` that reads `disconnectGraceMs` — grepping the whole client for
that field turns up only its type definition. The remaining player sees a
static "disconnected" label/dot and nothing else for the entire 60-second
window.

**Why it hurts:** Every other timing-sensitive moment in this game (turn,
payment, Just Say No) gets a prominent, ticking, unmissable countdown — the
one exception is arguably the moment a player most wants to know "how long do
I wait here," since it determines whether it's worth waiting for a friend to
come back vs. giving up on the game. Watching the actual live screenshots
(`b-39` at t≈0s through `b-42` at t≈63s), the *only* thing that changes for
Alice across that entire minute is the ordinary turn timer ticking down (which
has nothing to do with the disconnect) — there's no separate signal telling
her "Bob has N seconds left to come back."

**Screenshot:** `b-39-disconnect-t0-alice-view.png` through
`b-42-disconnect-t63s-past-grace-alice-view.png` — compare against
`b-08`/`b-09` where the turn timer ring+text is clearly visible and updating.

**Repro:** Close one player's tab mid-game and watch the other player's screen
for the full 60 seconds — nothing counts down the grace window itself.

---

### [severity: minor] "X reconnected" is logged on a player's very first-ever connection

**What:** The very first line Alice and Bob each see in the table feed, at the
moment the game starts (before either has ever disconnected), reads **"Bob
reconnected"** / **"Alice reconnected."**

**Why it hurts:** Reads as a bug/glitch to a new player ("wait, did I already
lose connection?") for something that hasn't happened yet. Root cause:
`Room.connectSse()` in `apps/server/src/room.ts` computes
`wasDisconnected = !seat.connected`, and a freshly-created seat starts with
`connected: false` (see `addSeat()`), so the very first SSE connection also
satisfies `wasDisconnected === true` and fires the same
`PLAYER_CONNECTION_CHANGED` event that a real reconnect does. The event text
itself, in `packages/engine/src/dispatch.ts`, is an unconditional
`` `${playerId} ${connected ? 'reconnected' : 'disconnected'}` `` with no way
to distinguish "first connection" from "actual reconnect."

**Screenshot:** `b-13-bob-t1-table-feed-open.png` — first two log lines are
"Bob reconnected" / "Alice reconnected," timestamped the same minute as "Game
started with 2 players."

**Repro:** Start any 2-player game and open the table feed immediately.

---

### [severity: minor] The "FEED" badge number is a lifetime total, not an unread count — but reads exactly like one

**What:** The pill in the top-right of the board reads "FEED" next to a large
number (2 → 39 → 46 → 52 across the session) that only ever grows. It looks
exactly like a standard unread-count badge, but per `SidePanel.tsx` it's
simply `entries.length` — the total number of log entries since the game
began, shown regardless of whether the feed has ever been opened. A separate,
genuine "new activity" signal already exists (a small red dot on the pill), so
the big number adds nothing but a constantly-climbing figure that increasingly
looks alarming ("52 unread things?!") the longer the game runs.

**Why it hurts:** Misleading affordance — the number pattern-matches to
"unread," training players to expect it to reset when they open the panel
(it doesn't), which erodes trust in an otherwise clear little indicator.

**Screenshot:** Compare `b-13-bob-t1-table-feed-open.png` (FEED 2, minutes
into the game) against `b-46-reconnect-alice-view-after-bob-rejoin-attempt-paired.png`
(FEED 52, same short session) — the panel was opened and closed multiple times
in between and the number never reset.

**Repro:** Play for a few turns, open the table feed once, close it, keep
playing — the number keeps climbing regardless.

---

### [severity: minor] Hand-limit discard prompt doesn't say *why* you're being asked to discard

**What:** The forced-discard prompt reads "Discard 2 cards / Tap cards to
select, or drag them onto the discard pile" — clear on *how*, silent on *why*.
It never mentions the 7-card hand limit that triggered it.

**Why it hurts:** A first-time player who hasn't memorized the rules gets
interrupted mid-flow with no stated reason, which reads as arbitrary rather
than a known rule ("you have more than 7 cards, discard down to 7").

**Screenshot:** `b-21-bob-t4-hand-limit-discard-prompt.png`.

**Repro:** End a turn with more than 7 cards in hand.

---

### [severity: minor] Home/lobby screen wastes roughly the top 40% of a phone viewport on empty space

**What:** On a 390×844 viewport, the "Monopoly Deal" title and the
name/create/join card don't start until well past the vertical midpoint — the
entire upper portion of the screen is empty dotted background before any
content appears.

**Why it hurts:** For a game whose primary audience per this session's own
viewport choice is mobile, the very first screen anyone sees under-uses the
one thing mobile has the least of: vertical space. It reads as if it were
built desktop-first and the phone layout just centers the same card lower
than expected, rather than composing for the phone viewport specifically.
Related: there's no "copy room code" affordance next to the code — the joiner
has to be told the code out-of-band and type it in by hand.

**Screenshot:** `b-01-home-alice-empty.png`, `b-03-lobby-alice-waiting-alone.png`,
`b-07-lobby-alice-both-joined-paired.png`.

**Repro:** Load `/` on a 390×844 viewport.

---

### [severity: nit] "Status: lobby" shows a raw internal status string to the player

**What:** The lobby screen literally prints `Status: lobby` (and would print
`Status: playing` etc.) rather than player-facing copy like "Waiting for
players."

**Screenshot:** `b-03-lobby-alice-waiting-alone.png` / `b-07-lobby-alice-both-joined-paired.png`.

**Repro:** Create a room and look just under the room code.

---

### [severity: nit] Disconnected-state prominence is inconsistent between the two opponent views

**What:** In the compact opponent-rail card (shown while it's *your* turn),
the only sign a rival disconnected is a small colored dot on their avatar —
easy to miss at a glance. In the full-screen opponent-spotlight (shown while
it's *their* turn), the same state gets an explicit "· disconnected" text
label next to the hand count. Same underlying fact, very different visibility
depending on which view you happen to be looking at.

**Screenshot:** `b-39-disconnect-t0-alice-view.png` (tiny dot, opponent rail)
vs. `b-42-disconnect-t63s-past-grace-alice-view.png` ("7 in hand ·
disconnected" text, opponent spotlight).

**Repro:** Disconnect one player and observe both of the other player's board
states (their own turn vs. the disconnected player's turn).

---

### [severity: nit] Log detail level is inconsistent between money and property plays

**What:** Banking a money card logs generically by value ("Alice banked a
card worth ₹1Cr"), while playing a property names the actual color/set
("Bob placed property on green"). Not wrong, just a small inconsistency in
how specific the play-by-play gets depending on card type.

**Screenshot:** `b-13-bob-t1-table-feed-open.png`.

**Repro:** Bank a money card, then play a property card, and compare their
log lines.

---

### [severity: nit] Just Say No could not be exercised in this session

**What:** Across roughly 7 real turns and two chargeable action plays (Its My
Birthday, Debt Collector), a Just Say No card never landed in the target's
hand at the moment they were charged, so the Just Say No prompt (and its 20s
countdown/expiry) was never actually observed live. This isn't a finding
against the app — it's a coverage gap in this audit run worth flagging so it
isn't mistaken for "JSN was checked and found fine." Given the payment-timer
UI and expiry mechanics are shared code (`useCountdown`, `PromptShell`,
`AUTO_RESOLVE_PENDING`) with the payment prompt that *was* verified working,
risk here is likely low, but it remains unverified.

---

## Session summary of what worked well (context, not findings)

For balance: turn ownership was unambiguous throughout (a big "END TURN"
button vs. a full-screen "X's turn" spotlight with a live countdown ring),
tap-to-play card selection clearly highlighted legal drop zones, the
hand-limit discard flow itself (once triggered) was easy to use, payment
selection correctly warns before letting a card break a completed set, and
the reject-toast pattern for illegal drops gave immediate feedback. The core
"whose turn / what can I do right now" loop is solid — the problems above are
concentrated in edge cases (interrupted payments, lost connections, back-to-
back interrupt chains) rather than the main play loop.
