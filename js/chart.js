/**
 * chart.js — Reusable midnight SVG line-chart renderer for World Cup 2026 tracker.
 *
 * Exports one function:
 *   renderChart(svg, { series, qualifiers, view, animate })
 *
 * Visual style is LOCKED (not configurable) — see STYLE / THEME constants below.
 * Per-chart hover state is local to each svg call, so 12 charts on one page work correctly.
 */

/* ------------------------------------------------------------------ */
/* Locked visual style                                                  */
/* ------------------------------------------------------------------ */
// Only live style knobs: thickness, glowI, flagSize, speed.
const STYLE = {
  thickness: 3,
  glowI:     8,         // feGaussianBlur stdDeviation = glowI / 3
  flagSize:  17,
  speed:     0.5,       // draw-on duration = 1.1 / speed seconds
};

const THEME = {
  bg:   '#0d1018',
  sub:  '#8b93a7',
};

/* ------------------------------------------------------------------ */
/* Geometry constants (match the playground exactly)                    */
/* ------------------------------------------------------------------ */
const W   = 640;
const H   = 320;
const PAD = { l: 42, r: 78, t: 26, b: 34 };
const plot = {
  x0: PAD.l,
  x1: W - PAD.r,
  y0: PAD.t,
  y1: H - PAD.b,
};

/** x pixel for data-index i out of n total points */
function xFor(i, n) {
  return plot.x0 + (plot.x1 - plot.x0) * (i / (n - 1));
}

/**
 * Build a smooth SVG path `d` string using catmull-rom → cubic bezier interpolation.
 */
function pathD(pts) {
  if (pts.length === 0) return '';
  // smooth: catmull-rom → bezier
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/* ------------------------------------------------------------------ */
/* SVG element helper                                                   */
/* ------------------------------------------------------------------ */
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

/* ------------------------------------------------------------------ */
/* Main export                                                          */
/* ------------------------------------------------------------------ */

/**
 * Render (or re-render) a group-stage progression chart into `svg`.
 *
 * @param {SVGElement} svg         - Target <svg> element (viewBox="0 0 640 320").
 * @param {object}     opts
 * @param {Array}      opts.series     - [{code, name, flag, color, points:[0..3], rank:[1..3]}]
 * @param {string[]}   opts.qualifiers - Team codes that are top-2 (advancing).
 * @param {'points'|'rank'} opts.view  - Which view to render.
 * @param {boolean}    opts.animate    - Play draw-on entrance animation on first draw.
 */
export function renderChart(svg, { series, qualifiers, view, animate }) {
  // Build per-team pixel coords for this view.
  // In points view, also returns maxP so it can be reused for the cutoff line.
  function buildSeriesCoords() {
    if (view === 'points') {
      const n = 4; // MD0..MD3
      const allVals = series.flatMap(s => s.points);
      const maxP = Math.max(1, ...allVals); // guard against 0
      const yFor = p => plot.y1 - (plot.y1 - plot.y0) * (p / maxP);
      return {
        coordSeries: series.map(s => ({
          s,
          pts: s.points.map((p, i) => ({ x: xFor(i, n), y: yFor(p) })),
        })),
        maxP,
      };
    } else {
      // rank view: MD1..MD3 (3 points)
      const n = 3;
      const yFor = r => plot.y0 + (plot.y1 - plot.y0) * ((r - 1) / 3); // rank 1 at top
      return {
        coordSeries: series.map(s => ({
          s,
          pts: s.rank.map((r, i) => ({ x: xFor(i, n), y: yFor(r) })),
        })),
        maxP: null,
      };
    }
  }

  /**
   * Inner draw function — called on first render and on every hover change.
   * `hoveredCode` is null (no hover) or a team code string.
   * `isFirstDraw` controls whether the draw-on animation fires.
   */
  function draw(hoveredCode, isFirstDraw) {
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    /* --- glow filter --- */
    {
      const defs = el('defs', {});
      const f = el('filter', { id: 'glow', x: '-30%', y: '-30%', width: '160%', height: '160%' });
      f.appendChild(el('feGaussianBlur', { stdDeviation: STYLE.glowI / 3, result: 'b' }));
      const m = el('feMerge', {});
      m.appendChild(el('feMergeNode', { in: 'b' }));
      m.appendChild(el('feMergeNode', { in: 'SourceGraphic' }));
      f.appendChild(m);
      defs.appendChild(f);
      svg.appendChild(defs);
    }

    const { coordSeries, maxP } = buildSeriesCoords();
    const n = view === 'points' ? 4 : 3;

    /* --- x-axis labels (no gridlines) --- */
    const labels = view === 'points'
      ? ['MD0', 'MD1', 'MD2', 'MD3']
      : ['MD1', 'MD2', 'MD3'];
    labels.forEach((lab, i) => {
      const tx = el('text', {
        x: xFor(i, n),
        y: H - 12,
        fill: THEME.sub,
        'font-size': 11,
        'text-anchor': 'middle',
        'font-family': 'system-ui',
      });
      tx.textContent = lab;
      svg.appendChild(tx);
    });

    /* --- y-axis hint --- */
    const yhint = el('text', {
      x: 14,
      y: plot.y0 - 10,
      fill: THEME.sub,
      'font-size': 10,
      'font-family': 'system-ui',
    });
    yhint.textContent = view === 'points' ? 'PTS' : '1st';
    svg.appendChild(yhint);
    if (view === 'rank') {
      const yb = el('text', {
        x: 14,
        y: plot.y1 + 2,
        fill: THEME.sub,
        'font-size': 10,
        'font-family': 'system-ui',
      });
      yb.textContent = '4th';
      svg.appendChild(yb);
    }

    /* --- qualification cutoff line --- */
    if (view === 'rank') {
      // dashed line between rank 2 and 3
      const yCut = plot.y0 + (plot.y1 - plot.y0) * (1.5 / 3);
      svg.appendChild(el('line', {
        x1: plot.x0, y1: yCut, x2: plot.x1, y2: yCut,
        stroke: THEME.sub,
        'stroke-width': 1.2,
        'stroke-dasharray': '5 5',
        opacity: 0.6,
      }));
      const ct = el('text', {
        x: plot.x1,
        y: yCut - 6,
        fill: THEME.sub,
        'font-size': 9.5,
        'text-anchor': 'end',
        'font-family': 'system-ui',
      });
      ct.textContent = '▲ qualify';
      svg.appendChild(ct);
    } else {
      // points view: dashed line at 2nd-placed team's FINAL points value
      const finals = series.map(s => s.points[s.points.length - 1]).sort((a, b) => b - a);
      const cut = finals[1] ?? 0;
      if (cut > 0) {
        const yCut = plot.y1 - (plot.y1 - plot.y0) * (cut / maxP);
        svg.appendChild(el('line', {
          x1: plot.x0, y1: yCut, x2: plot.x1, y2: yCut,
          stroke: THEME.sub,
          'stroke-width': 1.2,
          'stroke-dasharray': '5 5',
          opacity: 0.5,
        }));
        const ct = el('text', {
          x: plot.x1,
          y: yCut - 6,
          fill: THEME.sub,
          'font-size': 9.5,
          'text-anchor': 'end',
          'font-family': 'system-ui',
        });
        ct.textContent = 'qualify cutoff';
        svg.appendChild(ct);
      }
    }

    /* --- lines, markers, labels, hover hit paths --- */
    coordSeries.forEach(({ s, pts }) => {
      const col = s.color; // de-collided color already on series item
      const isQual = qualifiers.includes(s.code);

      // Opacity logic (mirrors playground exactly):
      // qual emphasis: non-qualifiers at 0.32
      // hover: hovered team at 1.0, others at min(qual-opacity, 0.15)
      let opacity = 1;
      if (!isQual) opacity = 0.32;
      if (hoveredCode && hoveredCode !== s.code) opacity = Math.min(opacity, 0.15);
      if (hoveredCode === s.code) opacity = 1;

      const d = pathD(pts);

      /* line path */
      const path = el('path', {
        d,
        fill: 'none',
        stroke: col,
        'stroke-width': STYLE.thickness,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        opacity,
        filter: 'url(#glow)',
      });
      path.style.transition = 'opacity .2s';
      svg.appendChild(path);

      /* draw-on animation (first draw only) */
      if (isFirstDraw && animate) {
        const len = path.getTotalLength();
        path.style.strokeDasharray = len;
        path.style.strokeDashoffset = len;
        path.style.transition = 'none';
        // Use double-rAF to ensure the initial offset is painted before transitioning
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            path.style.transition = `stroke-dashoffset ${1.1 / STYLE.speed}s ease`;
            path.style.strokeDashoffset = 0;
          });
        });
      }

      /* flag emoji markers at each data point */
      pts.forEach(p => {
        const fx = el('text', {
          x: p.x,
          y: p.y + 4,
          'font-size': STYLE.flagSize,
          'text-anchor': 'middle',
          opacity,
          filter: 'url(#glow)',
        });
        fx.textContent = s.flag;
        svg.appendChild(fx);
      });

      /* end-of-line label: "{flag} {CODE}" */
      {
        const last = pts[pts.length - 1];
        const tx = el('text', {
          x: last.x + 10,
          y: last.y + 4,
          fill: col,
          'font-size': 12,
          'font-weight': 700,
          'font-family': 'system-ui',
          opacity,
        });
        tx.textContent = `${s.flag} ${s.code}`;
        svg.appendChild(tx);
      }

      /* invisible fat hover hit path */
      const hit = el('path', {
        d,
        fill: 'none',
        stroke: 'transparent',
        'stroke-width': 16,
        'pointer-events': 'stroke',
        style: 'cursor:pointer',
      });
      hit.addEventListener('mouseenter', () => draw(s.code, false));
      hit.addEventListener('mouseleave', () => draw(null, false));
      svg.appendChild(hit);
    });
  }

  // Initial render (entrance animation if requested)
  draw(null, true);
}
