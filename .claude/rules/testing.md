---
paths:
  - "verification/**"
  - "**/*.spec.ts"
  - "**/*.test.ts"
---

## Tests

- While fixing, rerun only the failing spec; run `verify` + `e2e` + `e2e:net` once at the end.
- One table per test: start with `openDemo(page, fixture)` (`/demo?fixture=`), never `goto('/demo')` then swap. The demo suite runs 4 workers in parallel, so tests must share nothing.
- Page loads are the cost; in-page checks are nearly free. Put every check one table can answer into one test (a prompt's back-out → its next choice), and sweep widths/viewports inside the page (resize), not one test per value.
- Don't duplicate across specs: one spec owns each flow. No "cover everything" scripted-game spec.
- WebKit runs only card geometry (`card-aspect-ratio`). Tag engine-independent tests `@css-audit`.
- Throbbing CTAs (`tb-throb`, infinite) never read as stable: click with `force: true`.
