# Bracket Wheel Travel Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a country wins a match on the Bracket Wheel, animate its flag gliding inward along the connector line/arc to the next round's junction, instead of that round simply lighting up in its final state.

**Architecture:** Two new pure (DOM-free) helpers in `js/bracket-wheel.js` — `travelPath()` (builds the SVG path a marker travels along, reusing the same geometry as the existing connector lines) and `collectTravelMarkers()` (walks the laid-out tree and returns one marker descriptor per team that just advanced, keyed off the existing `child.advanced` flag). `renderBracketWheel()` then consumes these to build a new SVG layer of SMIL-animated flag markers, skipped entirely under `prefers-reduced-motion`.

**Tech Stack:** Vanilla JS (ES modules), SVG + native SMIL animation (`<animateMotion>`, `<animate>`, `<animateTransform>`), `node --test` for unit tests.

## Global Constraints

- No live polling — animation replays only when the Wheel tab is opened/switched to (same trigger as the existing draw-in animation). [Spec: Decisions]
- Travel markers are a duplicate mini flag badge that pops in, glides along the connector path, and fades out at the junction — not a generic glow/pulse. [Spec: Decisions]
- Every `child → parent` edge where `child.advanced === true` gets a marker for `child.team`. No changes to `app.js`. [Spec: Decisions]
- Under `prefers-reduced-motion: reduce`, travel markers are not built at all (final lit-up state only). [Spec: Decisions]
- All changes localized to `js/bracket-wheel.js` and `css/styles.css`. [Spec: Architecture]

---

### Task 1: `travelPath()` geometry helper

**Files:**
- Modify: `js/bracket-wheel.js` (insert after the existing `linePath()` function, before `drawnPath()`)
- Test: `tests/bracket-wheel.test.js`

**Interfaces:**
- Consumes: nothing new — uses the module-private `xy(angleDeg, rFrac)`, `linePath(x1,y1,x2,y2)`, and `CENTER` already defined in `js/bracket-wheel.js`.
- Produces: `export function travelPath(childAngle, childR, parentAngle, parentR, parentRound): string` — an SVG path `d` string from the child's polar position to the parent's, used by Task 2 and Task 3.

- [ ] **Step 1: Write the failing tests**

Add to `tests/bracket-wheel.test.js` (new `import` alongside the existing one, and three new `test()` blocks):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBracketStructure, inOrderLeaves, travelPath, collectTravelMarkers } from '../js/bracket-wheel.js';

// ... existing tests stay unchanged ...

test('travelPath: straight spoke to the Final center', () => {
  const d = travelPath(90, 0.22, 0, 0, 'final');
  assert.equal(d, 'M595.0 500.0 L500.0 500.0');
});

test('travelPath: radial segment when child/parent share an angle', () => {
  const d = travelPath(0, 1.0, 0, 0.72, 'r32');
  assert.equal(d, 'M500.0 68.0 L500.0 189.0 L500.0 189.0 L500.0 189.0');
});

test('travelPath: radial segment plus arc sweep when angles differ', () => {
  const d = travelPath(10, 0.72, 30, 0.54, 'r16');
  assert.equal(
    d,
    'M554.0 193.7 L540.5 270.3 L556.4 273.6 L572.1 278.1 L587.4 283.7 L602.3 290.3 L616.6 298.0'
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `travelPath is not a function` (or similar import error), since `travelPath` doesn't exist yet.

- [ ] **Step 3: Implement `travelPath()`**

In `js/bracket-wheel.js`, insert this new function immediately after the existing `linePath()` function (right before `function drawnPath(...)`):

```js
// Path from a child's polar position to its parent's — a radial segment at
// the child's angle out/in to the parent's radius, then an arc at the
// parent's radius over to the parent's angle (the Final is a straight spoke
// to the center instead). Mirrors the geometry the connector lines already
// draw; used to animate a flag "traveling" as a team advances a round.
export function travelPath(childAngle, childR, parentAngle, parentR, parentRound) {
  const [cx, cy] = xy(childAngle, childR);
  if (parentRound === 'final') {
    return linePath(cx, cy, CENTER, CENTER);
  }
  const [ax, ay] = xy(childAngle, parentR);
  let d = linePath(cx, cy, ax, ay) + ' ';
  const steps = Math.max(2, Math.ceil(Math.abs(parentAngle - childAngle) / 4));
  for (let i = 1; i <= steps; i++) {
    const ang = childAngle + ((parentAngle - childAngle) * i) / steps;
    const [x, y] = xy(ang, parentR);
    d += 'L' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
  }
  return d.trim();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests including the three new `travelPath` tests.

- [ ] **Step 5: Commit**

```bash
git add js/bracket-wheel.js tests/bracket-wheel.test.js
git commit -m "feat: add travelPath geometry helper for bracket wheel"
```

---

### Task 2: `collectTravelMarkers()` tree walker

**Files:**
- Modify: `js/bracket-wheel.js` (insert after `layout()`, before `arcPath()`)
- Test: `tests/bracket-wheel.test.js`

**Interfaces:**
- Consumes: `travelPath()` from Task 1; the module-private `DRAW_DELAY` map already defined in `js/bracket-wheel.js`. Expects a tree that has already been laid out (every node carries `_angle`/`_r`, as assigned by the existing `layout()` function) and decorated with `advanced`/`team` (as produced by `app.js`'s `buildBracketTree()`).
- Produces: `export function collectTravelMarkers(tree): Array<{ team: object, delay: number, d: string }>` — one entry per `child → parent` edge where `child.advanced === true`, consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Add to `tests/bracket-wheel.test.js`:

```js
test('collectTravelMarkers: one marker for the advanced child', () => {
  const tree = {
    round: 'r32', _angle: 0, _r: 0.72,
    children: [
      { round: 'team', _angle: 0, _r: 1.0, advanced: true, team: { flag: '🇫🇷', code: 'FRA', label: 'France' }, children: [] },
      { round: 'team', _angle: 10, _r: 1.0, advanced: false, team: { flag: '🇸🇪', code: 'SWE', label: 'Sweden' }, children: [] },
    ],
  };
  const markers = collectTravelMarkers(tree);
  assert.deepEqual(markers, [{
    team: { flag: '🇫🇷', code: 'FRA', label: 'France' },
    delay: 0.70,
    d: 'M500.0 68.0 L500.0 189.0 L500.0 189.0 L500.0 189.0',
  }]);
});

test('collectTravelMarkers: no markers when nothing advanced', () => {
  const tree = {
    round: 'r32', _angle: 0, _r: 0.72,
    children: [
      { round: 'team', _angle: 0, _r: 1.0, advanced: false, team: { flag: '🇫🇷', code: 'FRA', label: 'France' }, children: [] },
      { round: 'team', _angle: 10, _r: 1.0, advanced: false, team: { flag: '🇸🇪', code: 'SWE', label: 'Sweden' }, children: [] },
    ],
  };
  assert.deepEqual(collectTravelMarkers(tree), []);
});

test('collectTravelMarkers: recurses into nested rounds, parent-before-child order', () => {
  const tree = {
    round: 'r16', _angle: 0, _r: 0.54,
    children: [
      {
        round: 'r32', _angle: 0, _r: 0.72, advanced: true, team: { flag: '🇫🇷', code: 'FRA', label: 'France' },
        children: [
          { round: 'team', _angle: 0, _r: 1.0, advanced: true, team: { flag: '🇫🇷', code: 'FRA', label: 'France' }, children: [] },
          { round: 'team', _angle: 10, _r: 1.0, advanced: false, team: { flag: '🇸🇪', code: 'SWE', label: 'Sweden' }, children: [] },
        ],
      },
      {
        round: 'r32', _angle: 90, _r: 0.72, advanced: false, team: { flag: '🇧🇷', code: 'BRA', label: 'Brazil' },
        children: [
          { round: 'team', _angle: 80, _r: 1.0, advanced: false, team: { flag: '🇯🇵', code: 'JPN', label: 'Japan' }, children: [] },
          { round: 'team', _angle: 100, _r: 1.0, advanced: true, team: { flag: '🇧🇷', code: 'BRA', label: 'Brazil' }, children: [] },
        ],
      },
    ],
  };
  const markers = collectTravelMarkers(tree);
  assert.deepEqual(markers.map((m) => m.team.code), ['FRA', 'FRA', 'BRA']);
  assert.deepEqual(markers.map((m) => m.delay), [1.00, 0.70, 0.70]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `collectTravelMarkers is not a function`.

- [ ] **Step 3: Implement `collectTravelMarkers()`**

In `js/bracket-wheel.js`, insert this new function immediately after `layout()` (right before `function arcPath(...)`):

```js
/**
 * Walk a laid-out tree (after `layout()` has assigned `_angle`/`_r`) and
 * collect one travel-marker descriptor per child that just advanced — i.e.
 * the team that won at `child` is the same team that won at its parent `n`
 * (see `advanced` on the decorated tree from app.js's `buildBracketTree()`).
 */
export function collectTravelMarkers(tree) {
  const markers = [];
  (function walk(n) {
    if (!n.children || n.children.length === 0) return;
    const delay = DRAW_DELAY[n.round] ?? 0.7;
    n.children.forEach((c) => {
      if (c.advanced && c.team) {
        markers.push({
          team: c.team,
          delay,
          d: travelPath(c._angle, c._r, n._angle, n._r, n.round),
        });
      }
      walk(c);
    });
  })(tree);
  return markers;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests including the three new `collectTravelMarkers` tests.

- [ ] **Step 5: Commit**

```bash
git add js/bracket-wheel.js tests/bracket-wheel.test.js
git commit -m "feat: add collectTravelMarkers tree walker for bracket wheel"
```

---

### Task 3: Wire travel markers into `renderBracketWheel()` + styling

**Files:**
- Modify: `js/bracket-wheel.js:131-237` (the `renderBracketWheel()` function)
- Modify: `css/styles.css` (append new rules after the existing `.wheel-flag` block, before the `/* Centre trophy / champion */` section)

**Interfaces:**
- Consumes: `collectTravelMarkers(tree)` from Task 2; the existing `el(name, attrs)` SVG-element helper already defined in `js/bracket-wheel.js`.
- Produces: no new exports — this task wires the existing pure helpers into the rendered SVG output. Manually verified in-browser (this codebase has no DOM-level test harness; `renderBracketWheel()`'s own DOM output is likewise only verified manually per the original Bracket Wheel design doc).

- [ ] **Step 1: Add the travel-marker layer to `renderBracketWheel()`**

In `js/bracket-wheel.js`, find this block (the end of the outer-ring badges loop, immediately before the trophy comment):

```js
    outer.appendChild(badge);
    gBadges.appendChild(outer);
  });

  // Trophy (or crowned champion) at the centre.
```

Replace it with (inserting the new travel-marker layer between the badges loop and the trophy section):

```js
    outer.appendChild(badge);
    gBadges.appendChild(outer);
  });

  // Travel markers — flag glides from its current node to the next one for
  // every team that just advanced (skipped entirely under reduced motion).
  const gTravel = el('g');
  const reduceMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    collectTravelMarkers(tree).forEach((m) => {
      const g = el('g', { class: 'wheel-travel-badge', opacity: '0' });
      g.appendChild(el('circle', { r: 16, class: 'wheel-travel-bg' }));
      const flag = el('text', { class: 'wheel-travel-flag', x: 0, y: 1 });
      flag.textContent = m.team.flag || '🏳️';
      g.appendChild(flag);
      g.appendChild(el('animateMotion', {
        path: m.d, begin: `${m.delay}s`, dur: '0.55s', rotate: '0', fill: 'freeze',
      }));
      g.appendChild(el('animate', {
        attributeName: 'opacity', values: '0;1;1;0', keyTimes: '0;0.12;0.82;1',
        begin: `${m.delay}s`, dur: '0.55s', fill: 'freeze',
      }));
      g.appendChild(el('animateTransform', {
        attributeName: 'transform', type: 'scale',
        values: '0.3;1.15;1;1;0.85', keyTimes: '0;0.12;0.3;0.82;1',
        begin: `${m.delay}s`, dur: '0.55s', fill: 'freeze',
      }));
      gTravel.appendChild(g);
    });
  }

  // Trophy (or crowned champion) at the centre.
```

Then find:

```js
  svg.appendChild(gLines);
  svg.appendChild(gDots);
  svg.appendChild(gBadges);
  svg.appendChild(gTrophy);
  container.appendChild(svg);
```

Replace it with:

```js
  svg.appendChild(gLines);
  svg.appendChild(gDots);
  svg.appendChild(gBadges);
  svg.appendChild(gTravel);
  svg.appendChild(gTrophy);
  container.appendChild(svg);
```

- [ ] **Step 2: Run the existing unit tests to confirm nothing broke**

Run: `npm test`
Expected: PASS — all tests (Tasks 1-2's new tests plus the original `buildBracketStructure`/`inOrderLeaves` tests). This step doesn't exercise the new DOM code (no DOM in `node --test`), it just guards against syntax errors in the edited function.

- [ ] **Step 3: Add marker styling to `css/styles.css`**

Find this block:

```css
.wheel-flag {
  font-size: 30px;
  text-anchor: middle;
  dominant-baseline: central;
}

/* Centre trophy / champion */
```

Replace it with:

```css
.wheel-flag {
  font-size: 30px;
  text-anchor: middle;
  dominant-baseline: central;
}

/* Travel markers — flag glides from child to parent position when a
   country advances (see collectTravelMarkers() in bracket-wheel.js) */
.wheel-travel-bg {
  fill: var(--accent);
  filter: drop-shadow(0 0 6px var(--accent-glow));
}
.wheel-travel-flag {
  font-size: 18px;
  text-anchor: middle;
  dominant-baseline: central;
}

/* Centre trophy / champion */
```

- [ ] **Step 4: Manually verify in the browser**

Run: `python3 -m http.server 8080` from the repo root, then open `http://localhost:8080/#/wheel`.

Expected:
- The wheel draws in as before (badges pop in, lines draw inward, trophy reveals).
- For every round that's already decided, a small accent-colored flag badge visibly glides along the lit connector from the outer position to the inner junction, arriving roughly as that round's line finishes drawing, then fades out.
- No stray flag badges are left sitting at the top-left corner of the SVG (the `opacity: '0'` static attribute should keep markers hidden until their animation's `begin` time).
- Open DevTools → Rendering → "Emulate CSS media feature `prefers-reduced-motion`" → set to `reduce`, reload the tab (switch away and back to Wheel). Expected: badges/lines/trophy appear instantly in their final state with no animation, and no travel markers appear at any point.

- [ ] **Step 5: Commit**

```bash
git add js/bracket-wheel.js css/styles.css
git commit -m "feat: animate country flags traveling along the bracket wheel on advance"
```
