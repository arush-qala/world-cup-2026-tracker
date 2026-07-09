// Radial knockout bracket ("Bracket Wheel").
//
// Two layers, cleanly separated:
//   1. buildBracketStructure() — the static binary tree of match IDs / leaf slots.
//      Pure, no DOM, no app state → unit-testable.
//   2. renderBracketWheel(tree, opts) — polar layout + SVG drawing + sequential
//      draw-in animation. `tree` is the structure decorated with live team data
//      by the caller (app.js buildBracketTree()).

const SVGNS = 'http://www.w3.org/2000/svg';

// R32 matches → their two group slots (home, away).
const R32_SLOTS = {
  M73: ['2A', '2B'], M74: ['1E', '3E'], M75: ['1F', '2C'], M76: ['1C', '2F'],
  M77: ['1I', '3I'], M78: ['2E', '2I'], M79: ['1A', '3A'], M80: ['1L', '3L'],
  M81: ['1D', '3D'], M82: ['1G', '3G'], M83: ['2K', '2L'], M84: ['1H', '2J'],
  M85: ['1B', '3B'], M86: ['1J', '2H'], M87: ['1K', '3K'], M88: ['2D', '2G'],
};

// Match → its two feeder matches.
const PAIRINGS = {
  M89: ['M74', 'M77'], M90: ['M73', 'M75'], M91: ['M76', 'M78'], M92: ['M79', 'M80'],
  M93: ['M83', 'M84'], M94: ['M81', 'M82'], M95: ['M86', 'M88'], M96: ['M85', 'M87'],
  M97: ['M89', 'M90'], M98: ['M93', 'M94'], M99: ['M91', 'M92'], M100: ['M95', 'M96'],
  M101: ['M97', 'M98'], M102: ['M99', 'M100'],
  M104: ['M101', 'M102'],
};

const ROUND_OF = {
  M104: 'final',
  M101: 'sf', M102: 'sf',
  M97: 'qf', M98: 'qf', M99: 'qf', M100: 'qf',
  M89: 'r16', M90: 'r16', M91: 'r16', M92: 'r16',
  M93: 'r16', M94: 'r16', M95: 'r16', M96: 'r16',
};

/**
 * Build the static knockout tree rooted at the Final (M104). Leaf nodes carry a
 * group `slot` (e.g. "1E"); internal nodes carry a match `id` and `round`.
 * Children are ordered, so an in-order walk yields the outer-ring sequence.
 */
export function buildBracketStructure() {
  const node = (id) => {
    if (R32_SLOTS[id]) {
      return {
        id,
        round: 'r32',
        children: R32_SLOTS[id].map((slot) => ({ id: slot, slot, round: 'team', children: [] })),
      };
    }
    return { id, round: ROUND_OF[id], children: PAIRINGS[id].map(node) };
  };
  return node('M104');
}

/** In-order list of leaf nodes (drives the outer-ring order). */
export function inOrderLeaves(tree) {
  const out = [];
  (function walk(n) {
    if (!n.children || n.children.length === 0) out.push(n);
    else n.children.forEach(walk);
  })(tree);
  return out;
}

// ── Geometry ────────────────────────────────────────────────────────────────
const CENTER = 500;
const MAX_R = 432;
const RADIUS_BY_ROUND = { team: 1.0, r32: 0.72, r16: 0.54, qf: 0.37, sf: 0.22, final: 0 };
// Animation timing: draw rings inward, round by round.
const DRAW_DELAY = { r32: 0.70, r16: 1.00, qf: 1.30, sf: 1.60, final: 1.90 };

// angle 0° = top, increasing clockwise.
function xy(angleDeg, rFrac) {
  const rad = (angleDeg * Math.PI) / 180;
  const r = MAX_R * rFrac;
  return [CENTER + r * Math.sin(rad), CENTER - r * Math.cos(rad)];
}

function el(name, attrs = {}) {
  const node = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** Assign `_angle` (in-order leaves spread over 360°) and `_r` to every node. */
function layout(tree) {
  const leaves = inOrderLeaves(tree);
  const step = 360 / leaves.length;
  leaves.forEach((lf, i) => { lf._angle = i * step; });

  (function assign(n) {
    n._r = RADIUS_BY_ROUND[n.round];
    if (!n.children || n.children.length === 0) return n._angle;
    const angles = n.children.map(assign);
    n._angle = angles.reduce((a, b) => a + b, 0) / angles.length;
    return n._angle;
  })(tree);

  return leaves;
}

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
      if (c.advanced) {
        markers.push({
          team: c.team,
          delay,
          d: travelPath(c._angle, c._r, n._angle, n._r, n.round),
          parentAngle: n._angle,
          parentR: n._r,
        });
      }
      walk(c);
    });
  })(tree);
  return markers;
}

// Sample an arc (centered on the canvas) into a polyline path — avoids SVG
// elliptical-arc flag ambiguity and guarantees correct curvature.
function arcPath(a1, a2, rFrac) {
  const lo = Math.min(a1, a2);
  const hi = Math.max(a1, a2);
  const steps = Math.max(2, Math.ceil((hi - lo) / 4));
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const [x, y] = xy(lo + ((hi - lo) * i) / steps, rFrac);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
  }
  return d.trim();
}

function linePath(x1, y1, x2, y2) {
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

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

function drawnPath(d, active, delay) {
  const p = el('path', { d, 'pathLength': '1', class: 'wheel-line' + (active ? ' active' : '') });
  p.style.setProperty('--d', delay + 's');
  return p;
}

/**
 * Render the decorated tree into `container` as an animated radial SVG.
 * Re-rendering replays the draw-in animation.
 */
export function renderBracketWheel(tree, { container, caption } = {}) {
  if (!container) return;
  container.innerHTML = '';

  const svg = el('svg', {
    viewBox: '0 0 1000 1000',
    class: 'wheel-svg',
    role: 'img',
    'aria-label': 'World Cup 2026 knockout bracket wheel',
  });

  // Definitions for grid pattern and filters
  const defs = el('defs');
  const pattern = el('pattern', {
    id: 'hologram-grid',
    width: '40',
    height: '40',
    patternUnits: 'userSpaceOnUse'
  });
  const gridPath = el('path', {
    d: 'M 40 0 L 0 0 0 40',
    fill: 'none',
    stroke: 'var(--line)',
    'stroke-width': '0.5',
    opacity: '0.15'
  });
  pattern.appendChild(gridPath);
  defs.appendChild(pattern);
  svg.appendChild(defs);

  // Hologram grid background (rendered behind lines)
  const gridBg = el('rect', {
    width: '1000',
    height: '1000',
    fill: 'url(#hologram-grid)',
    class: 'hologram-grid-bg'
  });
  svg.appendChild(gridBg);

  // Ambient floating background particles
  const gParticles = el('g', { class: 'wheel-particles' });
  for (let i = 0; i < 40; i++) {
    const pAngle = Math.random() * 360;
    const pR = 0.15 + Math.random() * 0.85;
    const [px, py] = xy(pAngle, pR);
    const part = el('circle', {
      cx: px.toFixed(1),
      cy: py.toFixed(1),
      r: (0.8 + Math.random() * 1.6).toFixed(1),
      class: 'ambient-particle'
    });
    part.style.setProperty('--pd', (Math.random() * 6).toFixed(2) + 's');
    part.style.setProperty('--pax', (Math.random() * 24 - 12).toFixed(1) + 'px');
    part.style.setProperty('--pay', (Math.random() * 24 - 12).toFixed(1) + 'px');
    gParticles.appendChild(part);
  }
  svg.appendChild(gParticles);

  // Sonar sweep scanner line
  const sonarSweep = el('line', {
    x1: CENTER,
    y1: CENTER,
    x2: CENTER,
    y2: CENTER - MAX_R,
    class: 'sonar-sweep-line'
  });
  svg.appendChild(sonarSweep);

  // Background orbit rings (for hologram/radar blueprint layout)
  const gOrbits = el('g', { class: 'wheel-orbits' });
  const radii = [311, 233.3, 159.8, 95];
  radii.forEach((r, idx) => {
    const orb = el('circle', { cx: CENTER, cy: CENTER, r: r, class: 'wheel-orbit-ring' });
    orb.style.setProperty('--d', (0.3 * idx).toFixed(2) + 's');
    gOrbits.appendChild(orb);
  });
  svg.appendChild(gOrbits);

  const gLines = el('g');
  const gDots = el('g');
  const gBadges = el('g');

  layout(tree);

  const eliminatedCodes = new Set(
    inOrderLeaves(tree)
      .filter(lf => lf.eliminated && lf.team && lf.team.code)
      .map(lf => lf.team.code)
  );

  const hud = document.getElementById('wheel-hud');
  const updateHUD = (titleText, bodyHTML) => {
    if (hud) {
      hud.querySelector('.hud-header').textContent = titleText;
      hud.querySelector('.hud-body').innerHTML = bodyHTML;
      hud.style.opacity = '1';
    }
  };
  const clearHUD = () => {
    if (hud) {
      hud.querySelector('.hud-header').textContent = 'SYSTEM ACTIVE';
      hud.querySelector('.hud-body').innerHTML = 'Hover over a team flag or node to query tournament telemetry...';
      hud.style.opacity = '0.7';
    }
  };

  const getMatchHoverInfo = (n) => {
    const match = n.match;
    if (!match) return null;
    const homeLabel = match.home ? `${match.home.flag} ${match.home.code}` : 'TBD';
    const awayLabel = match.away ? `${match.away.flag} ${match.away.code}` : 'TBD';
    const scoreStr = match.status === 'finished' 
      ? `${match.score.home} - ${match.score.away}` 
      : 'VS';
    const roundLabel = n.round === 'final' ? 'FINAL' : n.round.toUpperCase();
    
    let statusText = match.status.toUpperCase();
    let statusColor = 'var(--muted)';
    if (match.status === 'finished') {
      statusColor = 'var(--accent)';
    } else if (match.status === 'live') {
      statusColor = '#ef4444';
    }

    return {
      title: `MATCH ${match.id.replace('M', '')} (${roundLabel})`,
      body: `<div style="font-size: 13px; font-weight: 700; margin: 4px 0; color: var(--text);">${homeLabel} ${scoreStr} ${awayLabel}</div>`
          + `STATUS: <strong style="color: ${statusColor}">${statusText}</strong><br>`
          + (match.winner ? `WINNER: <strong>${match.winner.flag} ${match.winner.label}</strong>` : 'DECISION PENDING')
    };
  };

  function wireHover(element, code, hoverInfo) {
    element.style.cursor = 'pointer';
    const onEnter = () => {
      svg.classList.add('hover-mode');
      svg.querySelectorAll(`[data-team-code="${code}"]`).forEach(el => el.classList.add('highlight'));
      if (hoverInfo) {
        updateHUD(hoverInfo.title, hoverInfo.body);
      }
    };
    const onLeave = () => {
      svg.classList.remove('hover-mode');
      svg.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
      clearHUD();
    };
    element.addEventListener('mouseenter', onEnter);
    element.addEventListener('mouseleave', onLeave);
    element.addEventListener('touchstart', onEnter, { passive: true });
    element.addEventListener('touchend', onLeave, { passive: true });
  }

  // Connectors + junction dots (every internal node).
  (function walk(n) {
    if (!n.children || n.children.length === 0) return;
    const delay = ((n._angle / 360) * 2.2).toFixed(2);
    const [c1, c2] = n.children;

    if (n.round === 'final') {
      // Centre: straight spokes from each semi-final node to the trophy.
      n.children.forEach((c) => {
        const [cx, cy] = xy(c._angle, c._r);
        const teamCode = c.team && !c.team.dummy ? c.team.code : null;
        const p = drawnPath(linePath(cx, cy, CENTER, CENTER), c.advanced, delay);
        if (teamCode) {
          p.setAttribute('data-team-code', teamCode);
          wireHover(p, teamCode, getMatchHoverInfo(c));
        }
        gLines.appendChild(p);
      });
    } else {
      // Concentric arc at the parent radius spanning the two children…
      const teamCode = n.team && !n.team.dummy ? n.team.code : null;
      const pArc = drawnPath(arcPath(c1._angle, c2._angle, n._r), n.decided, delay);
      if (teamCode) {
        pArc.setAttribute('data-team-code', teamCode);
        wireHover(pArc, teamCode, getMatchHoverInfo(n));
      }
      gLines.appendChild(pArc);
      
      // …plus a radial spoke out to each child.
      n.children.forEach((c) => {
        const [ax, ay] = xy(c._angle, n._r);
        const [cx, cy] = xy(c._angle, c._r);
        const childTeamCode = c.team && !c.team.dummy ? c.team.code : null;
        const childDelay = ((c._angle / 360) * 2.2).toFixed(2);
        const pSpoke = drawnPath(linePath(ax, ay, cx, cy), c.advanced, childDelay);
        if (childTeamCode) {
          pSpoke.setAttribute('data-team-code', childTeamCode);
          wireHover(pSpoke, childTeamCode, getMatchHoverInfo(c));
        }
        gLines.appendChild(pSpoke);
      });
    }

    // Junction dot at the node itself.
    const [nx, ny] = xy(n._angle, n._r);
    const dot = el('circle', {
      cx: nx, cy: ny, r: n.round === 'r32' ? 4.5 : 4,
      class: 'wheel-dot' + (n.advanced ? ' active' : ''),
    });
    dot.style.setProperty('--d', delay + 's');
    const nodeTeamCode = n.team && !n.team.dummy ? n.team.code : null;
    if (nodeTeamCode) {
      dot.setAttribute('data-team-code', nodeTeamCode);
      wireHover(dot, nodeTeamCode, getMatchHoverInfo(n));
    }
    gDots.appendChild(dot);

    n.children.forEach(walk);
  })(tree);

  // Outer-ring flag badges.
  const leaves = inOrderLeaves(tree);
  leaves.forEach((lf, i) => {
    const [x, y] = xy(lf._angle, lf._r);
    const team = lf.team || { flag: '🏳️', label: 'TBD', code: '?', dummy: true };

    const outer = el('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` });
    const badge = el('g', {
      class: 'wheel-badge'
        + (lf.eliminated ? ' eliminated' : '')
        + (lf.advanced && !lf.eliminated ? ' advanced' : '')
        + (team.dummy ? ' dummy' : ''),
    });
    const badgeDelay = ((lf._angle / 360) * 2.2).toFixed(2);
    badge.style.setProperty('--d', badgeDelay + 's');
    
    const hoverInfo = team.dummy ? null : {
      title: `${team.flag} ${team.label}`,
      body: `CODE: <strong>${team.code}</strong><br>`
          + `STATUS: <strong style="color: ${lf.eliminated ? '#ef4444' : 'var(--accent)'}">${lf.eliminated ? 'ELIMINATED' : 'ACTIVE'}</strong><br>`
          + `SEED SLOT: <strong>${lf.id}</strong>`
    };

    if (!team.dummy) {
      badge.setAttribute('data-team-code', team.code);
      wireHover(badge, team.code, hoverInfo);
    }

    const title = el('title');
    title.textContent = team.dummy ? team.label : `${team.label} (${team.code})`;
    badge.appendChild(title);
    badge.appendChild(el('circle', { r: 34, class: 'wheel-badge-bg' }));
    const flag = el('text', { class: 'wheel-flag', x: 0, y: 1 });
    flag.textContent = team.flag || '🏳️';
    badge.appendChild(flag);

    outer.appendChild(badge);
    gBadges.appendChild(outer);
  });

  // Travel markers — flag glides from its current node to the next one for
  // every team that just advanced.
  const gTravel = el('g');
  const reduceMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  collectTravelMarkers(tree).forEach((m) => {
    if (reduceMotion) {
      const [px, py] = xy(m.parentAngle, m.parentR);
      const g = el('g', {
        class: 'wheel-travel-badge',
        transform: `translate(${px.toFixed(1)} ${py.toFixed(1)})`,
      });
      g.appendChild(el('circle', { r: 22, class: 'wheel-travel-bg' }));
      const flag = el('text', { class: 'wheel-travel-flag', x: 0, y: 1 });
      flag.textContent = (m.team && m.team.flag) || '🏳️';
      g.appendChild(flag);
      gTravel.appendChild(g);
    } else {
      const g = el('g', { class: 'wheel-travel-badge', opacity: '0' });
      g.appendChild(el('circle', { r: 22, class: 'wheel-travel-bg' }));
      const flag = el('text', { class: 'wheel-travel-flag', x: 0, y: 1 });
      flag.textContent = (m.team && m.team.flag) || '🏳️';
      g.appendChild(flag);
      
      const travelDelay = (2.4 + (m.delay - 0.7) * 0.8).toFixed(2);
      g.appendChild(el('animateMotion', {
        path: m.d, begin: `${travelDelay}s`, dur: '0.55s', rotate: '0', fill: 'freeze',
      }));
      g.appendChild(el('animate', {
        attributeName: 'opacity', values: '0;1;1', keyTimes: '0;0.2;1',
        begin: `${travelDelay}s`, dur: '0.55s', fill: 'freeze',
      }));
      g.appendChild(el('animateTransform', {
        attributeName: 'transform', type: 'scale',
        values: '0.3;1.15;1', keyTimes: '0;0.4;1',
        begin: `${travelDelay}s`, dur: '0.55s', fill: 'freeze',
      }));
      gTravel.appendChild(g);
    }
  });

  // Trophy (or crowned champion) at the centre.
  const champ = tree.team && tree.decided ? tree.team : null;
  const gTrophy = el('g', { class: 'wheel-trophy' });
  gTrophy.style.setProperty('--d', '2.2s');
  if (champ) {
    const ring = el('circle', { cx: CENTER, cy: CENTER, r: 65, class: 'wheel-champ-ring' });
    gTrophy.appendChild(ring);
  }
  const trophy = el('text', { class: 'wheel-trophy-icon', x: CENTER, y: champ ? CENTER - 14 : CENTER });
  trophy.textContent = '🏆';
  gTrophy.appendChild(trophy);
  if (champ) {
    const cf = el('text', { class: 'wheel-champ-flag', x: CENTER, y: CENTER + 38 });
    cf.textContent = champ.flag;
    gTrophy.appendChild(cf);
  }

  svg.appendChild(gLines);
  svg.appendChild(gDots);
  svg.appendChild(gBadges);
  svg.appendChild(gTravel);
  svg.appendChild(gTrophy);
  container.appendChild(svg);
  // Chromium does not auto-start the SMIL document timeline for an SVG built
  // via createElementNS + appendChild. setCurrentTime(0) kick-starts it, but
  // must run after layout/paint — a single requestAnimationFrame fires before
  // first paint, so two nested frames are required. Do NOT simplify to one
  // rAF or remove this; it silently breaks travel-marker playback with no
  // automated test to catch the regression (verify manually in a browser).
  // Verified working in Chromium; not yet smoke-tested in Firefox/Safari —
  // if travel markers don't animate there, this is the first place to check.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (svg.setCurrentTime) svg.setCurrentTime(0);
    });
  });

  if (caption) {
    caption.textContent = champ
      ? `Champions: ${champ.label} 🏆`
      : 'Live projected bracket — winners light up as results come in';
  }
}
