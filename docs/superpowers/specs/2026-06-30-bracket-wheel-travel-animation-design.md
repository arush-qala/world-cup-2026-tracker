# Bracket Wheel — Country-Advances Travel Animation

**Date:** 2026-06-30
**Status:** Approved

## Goal

When a country wins a match and advances to the next round, show that movement
explicitly on the Bracket Wheel: a small flag marker glides inward along the
connector line/arc from its current position to the next round's junction,
instead of the round simply lighting up in its final state.

## Decisions

- **Trigger:** replays whenever the Wheel tab is opened/switched to (same
  trigger as today's existing draw-in animation). No live polling is added —
  this is not a "while you watch" live update.
- **Visual:** a duplicate mini flag badge (smaller than the outer-ring badges)
  travels along the exact path the connector line draws, pops in with a scale
  bounce, glows with the accent color while moving, and fades out as it
  reaches the junction dot.
- **Scope:** every `child → parent` edge in the tree where `child.advanced` is
  `true` gets a travel marker for `child.team`. This flag already exists on
  the decorated tree built by `app.js`'s `buildBracketTree()` — it means "the
  team that won at `child` is the same team that won at `parent`," i.e.
  exactly the country that just moved forward. No changes to `app.js` are
  needed.
- **Reduced motion:** when `prefers-reduced-motion: reduce` is set, travel
  markers are not built at all (mirrors the existing draw-in behavior of
  showing only the final lit-up state).

## Architecture

All changes are localized to `js/bracket-wheel.js` (rendering) and
`css/styles.css` (marker styling/keyframes). No changes to `app.js`,
`index.html`, or the data layer.

### `js/bracket-wheel.js`

- New helper `travelPath(child, parent)`: returns an SVG path `d` string from
  `child`'s `(angle, radius)` position to `parent`'s position — a radial
  segment outward/inward at `child`'s angle, then an arc at `parent`'s radius
  from `child`'s angle to `parent`'s angle (mirrors the existing
  `arcPath`/`linePath` construction used for the connector lines, but as one
  continuous directional path starting at the child). For the Final
  (`parent.round === 'final'`), it's a straight line from the SF node to
  center, matching the existing spoke-to-trophy line.
- In `renderBracketWheel()`, after building `gLines`/`gDots`/`gBadges`, walk
  the tree once more (same traversal shape as the existing connector-drawing
  walk) and, for each child with `child.advanced === true` (and motion not
  reduced), append a travel marker `<g>` to a new `gTravel` layer:
  - `<animateMotion path="..." begin="{delay}s" dur="0.55s" rotate="0"/>`
    using the same per-round `delay` (`DRAW_DELAY[parent.round]`) the
    connector line uses, so the flag rides the line as it draws.
  - A nested `<g class="wheel-travel-badge">` containing a small circle +
    flag `<text>` (reusing `child.team.flag`), with an `<animate>` on
    opacity (`0;1;1;0` over the same duration) and an `<animateTransform>`
    scale pulse (`0.3;1.15;1;1;0.85` or similar) for the pop-in/settle feel.
  - `gTravel` is appended after `gBadges` and before `gTrophy`, so markers
    render on top of static elements while traveling.
- `prefers-reduced-motion` check: `window.matchMedia('(prefers-reduced-motion: reduce)').matches`
  — when true, skip building `gTravel` entirely (empty/omitted group).

### `css/styles.css`

- `.wheel-travel-badge`: circle background in `--accent`, flag text sized
  smaller than `.wheel-flag` (~20px), drop-shadow glow filter using
  `--accent`.
- No new keyframes strictly required if pop/fade is driven by SMIL
  (`<animate>`/`<animateTransform>`) inline attributes rather than CSS
  classes — keeps timing tightly coupled to the per-marker `begin`/`dur`
  values computed in JS, avoiding a combinatorial explosion of CSS animation
  delays.

## Testing

- Manual/visual: open the Wheel tab and confirm flags visibly glide along
  each lit connector as the wheel draws in, arriving at the junction roughly
  as the line finishes drawing and the dot lights up.
- Confirm `prefers-reduced-motion: reduce` (browser/OS setting or DevTools
  emulation) shows the final state with no traveling markers.
- Existing `tests/bracket-wheel.test.js` (pure `buildBracketStructure`/
  `inOrderLeaves` tests) continues to pass unchanged — this feature doesn't
  touch tree-building logic.

## Out of scope (YAGNI)

- Live polling / mid-session animation triggering (explicitly declined).
- Comet-trail / multi-marker trailing effects.
- Animating eliminated teams fading out (existing `.eliminated` dimming
  already covers this).
