---
paths:
  - "apps/web/src/styles/cards.css"
  - "apps/web/src/components/card/**"
  - "verification/**/card-aspect-ratio*"
---

## Card sizing invariant (non-negotiable)

Every `.playing-card`: strict 5:7 aspect ratio AND no clipped face content, both at once. Mechanism in `apps/web/src/styles/cards.css`: `contain: size` (ratio backstop) + `--card-scale` container-query scaling with per-card `--card-ref` derived from `--rent-rows`. Never remove either half; never revert to one flat worst-case `--card-ref` (known regression: shrinks common cards). Any new face element must route vertical px through `calc(px * var(--card-scale))`. Worst case to test: 4-row rent table (two stacked on a wildcard). Verify with `card-aspect-ratio.spec.ts` **including its `webkit` project** — Chromium clips silently, WebKit grows the box; Chromium-only runs prove nothing.
