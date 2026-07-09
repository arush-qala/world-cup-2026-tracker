/**
 * chart.js — Upgraded SVG line-chart renderer for World Cup 2026 tracker.
 *
 * Exports one function:
 *   renderChart(svg, { series, qualifiers, view, animate, maxPlayedMD })
 */

const STYLE = {
  thickness: 3,
  glowI:     4,
  flagSize:  17,
  speed:     0.5,
};

const THEME = {
  bg:   'var(--bg)',
  sub:  'var(--muted)',
};

const W   = 640;
const H   = 320;
const PAD = { l: 42, r: 78, t: 26, b: 34 };
const plot = {
  x0: PAD.l,
  x1: W - PAD.r,
  y0: PAD.t,
  y1: H - PAD.b,
};

const DODGE = 9;

function applyDodge(coordSeries, n) {
  for (let i = 0; i < n; i++) {
    const groups = {};
    coordSeries.forEach((cs, idx) => {
      if (cs.pts[i] === undefined) return;
      const key = Math.round(cs.pts[i].y);
      (groups[key] ??= []).push(idx);
    });
    for (const key in groups) {
      const members = groups[key];
      if (members.length < 2) continue;
      members.sort((a, b) => (coordSeries[a].s.code < coordSeries[b].s.code ? -1 : 1));
      const baseY = coordSeries[members[0]].pts[i].y;
      members.forEach((idx, k) => {
        coordSeries[idx].pts[i].y = baseY + (k - (members.length - 1) / 2) * DODGE;
      });
    }
  }
}

function xFor(i, n) {
  return plot.x0 + (plot.x1 - plot.x0) * (i / (n - 1));
}

function pathD(pts) {
  if (pts.length === 0) return '';
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

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

export function renderChart(svg, { series, qualifiers, view, animate, maxPlayedMD }) {
  const limit = maxPlayedMD !== undefined ? maxPlayedMD : 3;
  const n = view === 'points' ? 4 : 3;

  function buildSeriesCoords() {
    if (view === 'points') {
      const allVals = series.flatMap(s => s.points);
      const maxP = Math.max(1, ...allVals);
      const yFor = p => plot.y1 - (plot.y1 - plot.y0) * (p / maxP);
      const coordSeries = series.map(s => {
        const slicedPoints = s.points.slice(0, limit + 1);
        return {
          s,
          pts: slicedPoints.map((p, i) => ({ x: xFor(i, n), y: yFor(p) })),
        };
      });
      applyDodge(coordSeries, n);
      return { coordSeries, maxP };
    } else {
      const yFor = r => plot.y0 + (plot.y1 - plot.y0) * ((r - 1) / 3);
      const coordSeries = series.map(s => {
        const slicedRank = s.rank.slice(0, limit);
        return {
          s,
          pts: slicedRank.map((r, i) => ({ x: xFor(i, n), y: yFor(r) })),
        };
      });
      applyDodge(coordSeries, n);
      return { coordSeries, maxP: null };
    }
  }

  const { coordSeries, maxP } = buildSeriesCoords();

  // Create persistent HTML tooltip element
  let tooltip = document.getElementById('chart-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'chart-tooltip';
    tooltip.style.position = 'fixed';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.zIndex = '9999';
    tooltip.style.padding = '10px 14px';
    tooltip.style.borderRadius = '12px';
    tooltip.style.fontFamily = "'Plus Jakarta Sans', sans-serif";
    tooltip.style.fontSize = '12px';
    tooltip.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.06)';
    tooltip.style.border = '1px solid var(--line)';
    tooltip.style.background = 'color-mix(in srgb, var(--panel) 88%, transparent)';
    tooltip.style.backdropFilter = 'blur(12px)';
    tooltip.style.webkitBackdropFilter = 'blur(12px)';
    tooltip.style.color = 'var(--text)';
    tooltip.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
    tooltip.style.opacity = '0';
    document.body.appendChild(tooltip);
  }

  function draw(hoveredCode, isFirstDraw, activePoint = null) {
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    /* --- glow filter --- */
    {
      const defs = el('defs', {});
      const f = el('filter', { 
        id: 'glow', 
        filterUnits: 'userSpaceOnUse',
        x: '-20%', y: '-20%', width: '140%', height: '140%' 
      });
      f.appendChild(el('feGaussianBlur', { stdDeviation: STYLE.glowI / 3, result: 'b' }));
      const m = el('feMerge', {});
      m.appendChild(el('feMergeNode', { in: 'b' }));
      m.appendChild(el('feMergeNode', { in: 'SourceGraphic' }));
      f.appendChild(m);
      defs.appendChild(f);
      svg.appendChild(defs);
    }

    /* --- Gridlines (Dotted) --- */
    // Horizontal gridlines
    const gridRows = 4;
    for (let i = 0; i < gridRows; i++) {
      const y = plot.y0 + (plot.y1 - plot.y0) * (i / (gridRows - 1));
      svg.appendChild(el('line', {
        x1: plot.x0, y1: y, x2: plot.x1, y2: y,
        stroke: 'var(--line)',
        'stroke-width': 1,
        'stroke-dasharray': '3 5',
        opacity: 0.4,
      }));
    }

    // Vertical gridlines for each Matchday
    for (let i = 0; i < n; i++) {
      const x = xFor(i, n);
      svg.appendChild(el('line', {
        x1: x, y1: plot.y0, x2: x, y2: plot.y1,
        stroke: 'var(--line)',
        'stroke-width': 1,
        'stroke-dasharray': '3 5',
        opacity: 0.4,
      }));
    }

    /* --- x-axis labels --- */
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
        'font-weight': '600',
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
      'font-weight': '700',
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
        'font-weight': '700',
      });
      yb.textContent = '4th';
      svg.appendChild(yb);
    }

    /* --- qualification cutoff line --- */
    if (view === 'rank') {
      const yCut = plot.y0 + (plot.y1 - plot.y0) * (1.5 / 3);
      svg.appendChild(el('line', {
        x1: plot.x0, y1: yCut, x2: plot.x1, y2: yCut,
        stroke: 'var(--accent)',
        'stroke-width': 1.2,
        'stroke-dasharray': '4 4',
        opacity: 0.5,
      }));
      const ct = el('text', {
        x: plot.x1,
        y: yCut - 6,
        fill: 'var(--accent)',
        'font-size': 9.5,
        'text-anchor': 'end',
        'font-family': 'system-ui',
        'font-weight': '700',
      });
      ct.textContent = '▲ qualify';
      svg.appendChild(ct);
    } else {
      const finals = series.map(s => s.points[s.points.length - 1]).sort((a, b) => b - a);
      const cut = finals[1] ?? 0;
      if (cut > 0) {
        const yCut = plot.y1 - (plot.y1 - plot.y0) * (cut / maxP);
        svg.appendChild(el('line', {
          x1: plot.x0, y1: yCut, x2: plot.x1, y2: yCut,
          stroke: 'var(--accent)',
          'stroke-width': 1.2,
          'stroke-dasharray': '4 4',
          opacity: 0.5,
        }));
        const ct = el('text', {
          x: plot.x1,
          y: yCut - 6,
          fill: 'var(--accent)',
          'font-size': 9.5,
          'text-anchor': 'end',
          'font-family': 'system-ui',
          'font-weight': '700',
        });
        ct.textContent = 'qualify cutoff';
        svg.appendChild(ct);
      }
    }

    /* --- Active matchday vertical guide line --- */
    if (activePoint) {
      svg.appendChild(el('line', {
        x1: activePoint.x, y1: plot.y0, x2: activePoint.x, y2: plot.y1,
        stroke: 'var(--accent)',
        'stroke-width': 1.5,
        opacity: 0.7,
      }));
    }

    /* --- lines, markers, labels --- */
    coordSeries.forEach(({ s, pts }) => {
      const col = s.color;
      const isQual = qualifiers.includes(s.code);

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

      /* draw-on animation */
      if (isFirstDraw && animate && pts.length > 1) {
        const len = path.getTotalLength();
        path.style.strokeDasharray = len;
        path.style.strokeDashoffset = len;
        path.style.transition = 'none';
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            path.style.transition = `stroke-dashoffset ${1.1 / STYLE.speed}s ease`;
            path.style.strokeDashoffset = 0;
          });
        });
      }

      /* flag emoji markers */
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

      /* end-of-line label */
      if (pts.length > 0) {
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
    });

    /* --- Hover Snapped Highlight Circle --- */
    if (activePoint && activePoint.seriesColor) {
      svg.appendChild(el('circle', {
        cx: activePoint.x,
        cy: activePoint.y,
        r: 6.5,
        fill: activePoint.seriesColor,
        stroke: 'var(--panel)',
        'stroke-width': 2,
        filter: 'url(#glow)',
      }));
    }
  }

  // Mouse interactivity handlers
  function handleMouseMove(e) {
    const rect = svg.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * W;
    const mouseY = ((e.clientY - rect.top) / rect.height) * H;

    // Nearest Matchday Column
    const pct = (mouseX - plot.x0) / (plot.x1 - plot.x0);
    let colIdx = Math.round(pct * (n - 1));
    colIdx = Math.max(0, Math.min(n - 1, colIdx));

    // Nearest Line (Series) at that Matchday Column
    let closestSeries = null;
    let minDy = Infinity;
    let closestPt = null;

    coordSeries.forEach(cs => {
      const pt = cs.pts[colIdx];
      if (!pt) return;
      const dy = Math.abs(mouseY - pt.y);
      if (dy < minDy) {
        minDy = dy;
        closestSeries = cs;
        closestPt = pt;
      }
    });

    if (closestSeries && closestPt) {
      const activePoint = {
        x: closestPt.x,
        y: closestPt.y,
        seriesColor: closestSeries.s.color
      };

      // Redraw SVG with highlighting
      draw(closestSeries.s.code, false, activePoint);

      // Update Tooltip details
      const mdLabel = view === 'points' ? `MD${colIdx}` : `MD${colIdx + 1}`;
      const statLabel = view === 'points' 
        ? `Points: <strong>${closestSeries.s.points[colIdx]}</strong>`
        : `Rank: <strong>${closestSeries.s.rank[colIdx]}</strong>`;

      tooltip.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; margin-bottom: 4px;">
          <span>${closestSeries.s.flag}</span>
          <span>${closestSeries.s.name}</span>
          <span style="color: ${closestSeries.s.color}; font-size: 10px; font-weight: 800;">(${closestSeries.s.code})</span>
        </div>
        <div style="display: flex; gap: 12px; color: var(--muted); font-size: 11px;">
          <span>${mdLabel}</span>
          <span>${statLabel}</span>
        </div>
      `;

      tooltip.style.left = `${e.clientX + 16}px`;
      tooltip.style.top = `${e.clientY - 20}px`;
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'scale(1)';
    }
  }

  function handleMouseLeave() {
    draw(null, false);
    tooltip.style.opacity = '0';
    tooltip.style.transform = 'scale(0.95)';
  }

  svg.addEventListener('mousemove', handleMouseMove);
  svg.addEventListener('mouseleave', handleMouseLeave);
  svg.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches[0]) {
      handleMouseMove(e.touches[0]);
    }
  }, { passive: true });
  svg.addEventListener('touchend', handleMouseLeave);

  // Initial draw
  draw(null, true);
}
