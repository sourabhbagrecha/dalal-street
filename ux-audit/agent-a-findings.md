# UX Audit — Entry Experience & Responsiveness

Scope: Home ("/"), networked lobby, Card Gallery ("/cards"), responsive sweep of "/" and "/local", reload-mid-game on "/local". All screenshots prefixed `a-` in `ux-audit/screenshots/`. Tested with standalone Playwright scripts against the already-running dev server (127.0.0.1:5173 / 8787), mobile viewports, `deviceScaleFactor: 2`.

---

### [severity: blocker] Reloading mid-game on /local silently destroys the entire game

**What:** Started a local pass-and-play game, played it forward (clicked "End turn," turn passed to "Priya's turn" with a full spotlight view), then reloaded the page. On reload the app does not restore the in-progress game at all — it boots straight back into the default `standardMidGame` fixture from scratch: hands reset to 5 cards each, "DRAW · 84" counter resets, turn returns to the local player, all with zero warning, confirmation dialog, or "resume game?" prompt.

**Why it hurts:** This is explicitly the failure mode a "pass & play" feature needs to survive — a phone rotating, an accidental pull-to-refresh, a browser back/forward swipe, or someone tapping the address bar mid-session will erase 20+ minutes of a shared game with friends and nobody will know why until it's too late. There's no telltale ("progress lost," "start new game?") — the player is just quietly dropped into an unrelated fresh board and has to figure out what happened.

**Screenshot:** `a-reload2-before.png` (opponent-turn spotlight state right before reload) vs `a-reload2-after.png` (post-reload — back to turn 1, "No properties," 5 cards each).

**Repro:** Go to `/local` → click "End turn" → reload the page → observe the board has reset to the initial fixture instead of resuming the mid-game state.

---

### [severity: major] Third opponent panel is overlapped/hidden by the "FEED" button at every common portrait phone width

**What:** In the top opponent-status row on `/local`, the third opponent's card (avatar, name, hand count, "No properties" line) is partially covered by the "☰ FEED •2" pill button that sits on top of it. This happens identically at 320×568, 390×844, and 414×896 — the FEED pill is positioned over the third panel rather than beside it with its own space. At 320px it's worst: the third opponent's name is entirely unreadable, hidden directly under the pill.

**Why it hurts:** Opponent hand-size and property status is core, always-on HUD information in Monopoly Deal (you need it to plan rent/steal targets). Losing it for one of up to four opponents on the two most common iPhone widths (375–414px covers the large majority of phones in use) is a real functional gap, not just cosmetic — and there's no other place in the UI that surfaces that opponent's stats to compensate (the FEED drawer shows dev/log/chat content, not opponent status).

**Screenshot:** `a-sweep-local-320x568.png` (worst — third opponent's name fully hidden), `a-sweep-local-390x844.png`, `a-sweep-local-414x896.png`.

**Repro:** Open `/local` at any of those viewport widths — the rightmost opponent card sits underneath the FEED pill in the top row.

---

### [severity: major] No copy-to-clipboard for the room code in the networked lobby

**What:** After creating a room, the room code is shown as plain inline text: "Room code: 2FK766." There is no copy icon/button anywhere near it, and tapping directly on the code text does nothing (no copy, no toast, no visual feedback of any kind).

**Why it hurts:** Sharing the room code with friends is the entire point of this screen — it's the one piece of information a host needs to hand off, typically by pasting into a text/chat app. Forcing manual text-selection of a 6-character code on mobile (fiddly long-press, drag handles, "Copy" from the OS context menu) is a real point of friction for what should be a one-tap action in "great mobile game UX."

**Screenshot:** `a-lobby-created-1player.png`, `a-lobby-tap-roomcode.png` (tapping the code produces no change).

**Repro:** Create a room on `/` → look at/tap the "Room code: XXXXXX" text — no copy affordance exists.

---

### [severity: major] Landscape "Table Feed" drawer is a hard, unmasked split over the game board, not a proper overlay

**What:** In landscape (844×390) mid-game, opening the FEED drawer doesn't overlay the board with a dim/scrim backdrop — it just occupies the right ~45% of the screen with a razor-sharp vertical edge that slices straight through whatever was underneath: opponent panels are cut off mid-card, the draw pile and Discard zone are cut in half, and the hand-card fan is sliced clean through the middle of a card. The same "peek strip" problem (leaving a bare sliver of the game visible, elements cut mid-word) also happens in portrait.

**Why it hurts:** This reads as a layout bug rather than an intentional drawer — a properly designed side-drawer either covers the full screen with a scrim (clearly modal) or reserves genuine layout space for both regions. The current halfway state looks broken and undermines confidence in the whole build's polish, and it's happening in exactly the scenario the audit brief predicted would be a disaster zone.

**Screenshot:** `a-feed-drawer-844x390-landscape.png` (board content sliced mid-card behind the drawer), `a-feed-drawer-390x844.png` (portrait version of the same peek-strip problem).

**Repro:** Open `/local` in landscape (844×390) → tap the FEED pill → observe the drawer cutting straight through cards/panels with no backdrop dimming the game side.

---

### [severity: major] Developer/test tooling (scenario picker, seed, seat switcher) is exposed inside the player-facing "Table Feed" panel on /local

**What:** Opening the FEED drawer on `/local` — the same panel that hosts the legitimate player-facing "Game Log" and "Table Chat" — also shows a "SCENARIO" dropdown ("Standard Mid Game") and a "YOUR SEAT" 1–4 picker with a "Keys 1–4" hint. The Game Log's very first line also prints the RNG seed verbatim: "Game started with 4 players (seed 42)."

**Why it hurts:** `/local` is presented to players as the real pass-and-play mode, not a dev harness — seeing fixture/scenario names and a seed number is confusing internal-engineering language leaking into the player experience, and a scenario switcher sitting next to Start/gameplay controls invites a player to accidentally reset the board mid-session. It also sits oddly against the project's stated stance that seeds should stay hidden — printing it straight into a log a real player can open blurs that line even if this is a local (single-device), not networked, context.

**Screenshot:** `a-feed-drawer-390x844.png` — "SCENARIO / Standard Mid Game" and "YOUR SEAT / Keys 1–4" visible above "GAME LOG," whose first entry reads "Game started with 4 players (seed 42)."

**Repro:** `/local` → open FEED drawer → see Scenario/Seat dev controls stacked directly above the player-facing Game Log/Table Chat.

---

### [severity: minor] "Room not found" error doesn't clear when the join code is edited

**What:** Submitting an invalid 6-character room code ("ZZZZZZ") correctly shows a red "Room not found" message. But if the user then edits the join-code field down to something else (e.g., deletes back to "ZZZ"), the stale "Room not found" error stays on screen, now appearing to describe a code that was never submitted.

**Why it hurts:** Error messages that don't track the input they refer to actively mislead — the player may think their new, still-being-typed code is also wrong, or may not realize the message is stale at all.

**Screenshot:** `a-home-short-code.png` (code field shows "ZZZ," a code that's never been submitted, while "Room not found" from the earlier "ZZZZZZ" attempt is still displayed).

**Repro:** On `/`, enter a name, type a full 6-char room code that doesn't exist, tap Join → see "Room not found" → edit the code field to a different, shorter value → the error text remains unchanged.

---

### [severity: minor] Grammar: "Start game (1 players)"

**What:** With one player in the room, the (disabled) start button reads "Start game (1 players)" instead of "1 player."

**Why it hurts:** Small, but it's the kind of copy sloppiness that undercuts an otherwise polished-looking screen — easy fix, visible to every host who creates a room before a second player joins.

**Screenshot:** `a-lobby-created-1player.png`.

**Repro:** Create a room and look at the disabled Start button before a second player joins.

---

### [severity: minor] Lobby exposes a raw internal status string ("Status: lobby")

**What:** The lobby screen literally prints "Status: lobby" as player-facing copy, straight from what looks like an internal room-status enum.

**Why it hurts:** Reads as an unfinished/debug label rather than game UI. Something like "Waiting for players…" would both look more finished and better communicate what's actually happening (and would set up a nice place for a "waiting" animation — see next finding).

**Screenshot:** `a-lobby-created-1player.png`.

**Repro:** Create a room, look directly under "Room code."

---

### [severity: minor] The "waiting for players" state has no liveliness — reads as inert rather than actively waiting

**What:** After creating a room with only the host present, the lobby just shows the host's name in a static list and a grayed-out Start button. There's no spinner, pulsing dot, "waiting for more players…" copy, or any other sign that the app is actively listening for someone to join — it's visually indistinguishable from a frozen or broken screen.

**Why it hurts:** This is the exact moment a host is staring at their phone waiting to share a code with friends; a totally static screen invites doubt about whether anything is happening at all, which is a bad feeling to leave a first-time host with.

**Screenshot:** `a-lobby-created-1player.png`.

**Repro:** Create a room and just look at the seat list before a second player joins — nothing animates or updates.

---

### [severity: nit] Home page has enormous, unstructured dead space above and below the form

**What:** At 390×844 the entire "Monopoly Deal" title + form card occupies roughly the middle 40% of the screen; there's ~230px of flat, empty (dotted-texture) space above the title and another ~300px below the card, with nothing placed there — no logo, hero art, tagline, or version/footer info.

**Why it hurts:** This is the very first thing a new player sees. A flat title plus a form floating in a sea of empty space reads as an unfinished placeholder screen rather than a considered landing page for a game — there's real opportunity here for a hero card illustration, a short tagline, or simply better vertical rhythm (larger form, more breathing room used deliberately rather than left blank).

**Screenshot:** `a-home-390-first.png`.

**Repro:** Load `/` at any portrait phone width.

---

### [severity: nit] Inconsistent input placeholder casing on the same screen

**What:** The "Your name" placeholder is sentence case, but the room-code input's placeholder is "ROOM CODE," all caps — both are inputs in the same form on the same screen.

**Why it hurts:** A small but real consistency slip; the audit brief specifically flags inconsistent casing as worth catching, and a careful designer wouldn't mix conventions within one card.

**Screenshot:** `a-home-390-first.png`.

**Repro:** Compare the two placeholders on `/`.

---

### [severity: nit] Display name field truncates at 24 characters with zero feedback

**What:** Typing a 40-character name into "Display name" silently stops accepting characters after 24 (the field's `maxLength`) — no character counter, no shake/flash, no hint text explaining the limit.

**Why it hurts:** A player who types a longer name/nickname will just see their later keystrokes silently vanish with no explanation, which reads as the input being broken rather than limited.

**Screenshot:** `a-home-long-name.png`.

**Repro:** On `/`, type more than 24 characters into "Display name."

---

### [severity: nit] Header wraps into a ragged two-line/two-line layout at 320px width

**What:** At 320×568 (e.g., iPhone SE), "Monopoly Deal" wraps onto two lines and the "Pass & play (local)" link also wraps onto two lines, producing a jagged block where neither piece of text lines up cleanly with the other.

**Why it hurts:** Small-phone users aren't a fringe case, and the header is the very first thing they see — a title that breaks mid-word-ish and a link stacked awkwardly beside it reads as untested at this width.

**Screenshot:** `a-sweep-home-320x568.png`.

**Repro:** Load `/` at 320×568.

---

### [severity: nit] Card Gallery route (/cards) is horizontally clipped and unreachable past the first ~1.3 columns on mobile widths

**What:** `/cards` renders a fixed `grid-template-columns: repeat(4, 300px)` (1292px of content) inside a page where `html`/`body` have `overflow-x: hidden`. At 390px viewport width this means roughly 900px of the grid — 2.7 of the 4 columns — is simply clipped off-screen with no way to reach it: there's no horizontal scrollbar, and dragging/swiping on the page does nothing but select text (confirmed: `document.body.scrollWidth` = 1292 vs `clientWidth` = 390, and a manual touch-drag produced a text-selection highlight instead of any scroll).

**Why it hurts:** This is a dev-only, unlinked reference route (not reachable from any in-app link), so it doesn't affect real players, but as audited: three-quarters of the reference sheet is inaccessible on a phone-width viewport, which defeats its own purpose as a mobile card-readability reference.

**Screenshot:** `a-gallery-390-top.png` (only column 1 + a sliver of column 2 visible), `a-gallery-390-after-drag.png` (a drag gesture only text-selects, doesn't scroll).

**Repro:** Load `/cards` at 390px width → try to scroll or swipe horizontally → the remaining 2–3 columns of cards are never reachable.

---

### [severity: nit] System/canned chat message uses the same player-avatar treatment as a real player

**What:** The lobby's Table Chat starts with a canned line, "Say hello to everyone at the table," rendered with a two-letter avatar bubble "SY" — the exact same visual treatment (initials-in-a-circle) used for real players' chat messages.

**Why it hurts:** At a glance it looks like a player named something starting with "Sy—" sent a real message, which is a small but avoidable moment of confusion; a system/prompt message would typically read as clearly non-player (italic, no avatar, muted color, or a distinct icon).

**Screenshot:** `a-lobby-created-1player.png` (Table Chat section, "SY" avatar).

**Repro:** Create a room and look at the pre-seeded Table Chat message.

---

## Summary of findings by severity

- Blocker: 1
- Major: 4
- Minor: 4
- Nit: 6

**Total: 15 findings**
