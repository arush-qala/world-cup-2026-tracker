# Bracket Wheel — Radial Knockout Visualization

**Date:** 2026-06-30
**Status:** Approved

## Goal

Add a new top-level tab, **Bracket Wheel**, that renders the World Cup 2026 knockout
bracket as a radial wheel (32 teams around the outer ring converging through R32 → R16
→ QF → SF to a Final + trophy at the center), with a sequential draw-in animation. It
reflects the *live projected bracket* (real finished results + FIFA-points projections),
matching the existing Knockouts tab's data.

Reference: the classic circular World Cup bracket graphic (32 flags in a ring, lines
converging to the trophy).

## Decisions

- **Placement:** new top-level tab (not a sub-view of Knockouts).
- **Flags:** emoji flags, reusing existing team data (consistent with the rest of the app).
- **Data:** live projected bracket via the existing knockout data model.
- **Animation:** sequential draw-in (flags pop in → connectors draw inward stage-by-stage
  → trophy reveals with a glow), replays on each tab entry. Respects
  `prefers-reduced-motion`.

## Architecture

### `js/bracket-wheel.js` (new module)
Pure presentation: layout math, SVG construction, and animation. Exposes:

```
renderBracketWheel(tree, { container, caption })
```

- Walks the tree to assign each node a polar position: leaf angle from in-order index
  (0–31) → angle; each parent at the midpoint angle of its children at a smaller radius.
- Six radius bands: outer ring (32 flag badges) → R32 / R16 / QF / SF joint rings →
  center (Final + 🏆).
- Connectors = polar bracket elbow: a concentric arc at the parent radius spanning the
  two children, plus radial spokes to each child.
- No knowledge of app internals beyond the `tree` it receives — independently testable.

### `js/app.js` (additions)
- `buildBracketTree()`: reconstructs the binary knockout tree (Final → 2×SF → 4×QF →
  8×R16 → 16×R32 → 32 leaf teams) reusing existing helpers (`getThirdPlaceStandings`,
  `solveThirdPlaceMatchups`, `getTeamBySlot`, `getMatchWinner`, `getMatchDetails`). Each
  node carries: `id`, `round`, `team` (`{label, code, flag, dummy}`), `decided` flag,
  and `children`.
- Imports `renderBracketWheel` and calls it from a `renderWheel()` entry point.
- Tab wiring in the four existing touchpoints: `switchTab()` hide-toggle, `validTabs` in
  `handleRouting()`, the tab-activation block (trigger `renderWheel()` so the animation
  replays), and initial render on load.

### `index.html`
- New `<button class="tab" data-tab="wheel">Bracket Wheel</button>` in the nav.
- New `<section id="wheel-view" hidden>` with a viewbar caption and an SVG host container.

### `css/styles.css` (appended)
- `.wheel-*` classes for the SVG host, flag badges, connector lines, trophy, caption.
- Keyframes for badge pop-in, line draw (`stroke-dashoffset`), and trophy glow.
- All colors via existing CSS vars (`--bg`, `--panel`, `--line`, `--muted`, `--accent`,
  `--text`) so it adapts to every theme.

## Data binding & states

- **Decided node** (real result in): winner badge gets an `--accent` ring; the losing
  feeder dims.
- **Undecided slot:** neutral 🏳️ placeholder badge using the projection label/code.
- Rebuilds on the same data triggers as `renderKnockouts()`.

## Layout / math

- SVG `viewBox="0 0 1000 1000"`, center `(500,500)`, max render width ~720px,
  `preserveAspectRatio="xMidYMid meet"` for responsive scaling.
- Leaf in-order sequence (drives outer-ring order), derived from the tree, matches the
  existing R32 feed order (M74, M77, M73, M75, … per `getKnockoutRoundMatchesData`).
- Radii (approx, fractions of 500): leaves 0.92, R32 joints 0.72, R16 0.54, QF 0.38,
  SF 0.22, center 0.

## Testing

- Unit test (`tests/bracket-wheel.test.js`, `node --test`): `buildBracketTree()` produces
  32 leaves, correct depth per round, and the expected in-order leaf sequence. Pure
  function, no DOM.
- Visual/animation verified in the browser.

## Out of scope (YAGNI)

- Flag images / SVG flags (emoji only).
- Interactivity beyond what the existing bracket offers (no click-to-edit predictions).
- Zoom/pan controls.
