# World Cup 2026 Group-Stage Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live Vercel-hosted website that tracks each team's progress through its World Cup 2026 group via jersey-colored progression charts (Points & Rank views), plus a date-by-date fixtures list with flags and UK kickoff times, self-updating via a scheduled Claude routine.

**Architecture:** Static site, no framework, no Chart.js. `fixtures.json` is the single source of truth; pure ES-module engines compute colors and standings in the browser; a dependency-free SVG renderer (ported from `visual-playground.html`) draws the charts. A scheduled Claude routine web-fetches results and redeploys.

**Tech Stack:** Vanilla HTML/CSS/ES modules. `node --test` (built-in, zero deps) for the pure logic modules. Vercel static hosting. Flag emoji + jersey-color hex map for visuals.

---

## File Structure

```
world-cup-2026-tracker/
├── index.html              # shell: tabs (Groups | Fixtures), Midnight theme, Points/Rank toggle
├── css/styles.css          # Midnight theme, layout, grid of 12
├── js/
│   ├── colors.js           # jersey color map + same-group HSL de-collision  (PURE, tested)
│   ├── standings.js        # points + live rank + FIFA tiebreakers           (PURE, tested)
│   ├── chart.js            # SVG line renderer (ported from playground)       (DOM)
│   └── app.js              # tabs, group grid + expand, toggle, fixtures list (DOM)
├── data/
│   ├── groups.json         # 12 groups → teams (code, name, flag, color)
│   └── fixtures.json       # 104 matches (source of truth)
├── tests/
│   ├── colors.test.js
│   └── standings.test.js
├── scripts/
│   └── update.md           # runbook the scheduled routine follows
├── visual-playground.html  # existing visual reference (already committed)
└── vercel.json             # static config
```

`colors.js` and `standings.js` are pure (data in → data out), importable in both
the browser and Node — that is what makes them unit-testable with `node --test`.
`chart.js`/`app.js` touch the DOM and are verified visually.

---

### Task 1: Project scaffold + Midnight shell

**Files:**
- Create: `index.html`, `css/styles.css`, `vercel.json`, `package.json`

- [ ] **Step 1: Create `package.json`** (only to enable ES modules + the test script; no dependencies)

```json
{
  "name": "world-cup-2026-tracker",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Create `vercel.json`** (static, no build)

```json
{ "cleanUrls": true, "trailingSlash": false }
```

- [ ] **Step 3: Create `index.html`** — shell with two tabs and the Points/Rank toggle

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>World Cup 2026 — Group Tracker</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <header class="topbar">
    <h1>World Cup 2026 · Group Tracker</h1>
    <nav class="tabs">
      <button class="tab active" data-tab="groups">Groups</button>
      <button class="tab" data-tab="fixtures">Fixtures</button>
    </nav>
  </header>

  <section id="groups-view">
    <div class="viewbar">
      <div class="seg" id="viewseg">
        <button data-view="points" class="active">Points</button>
        <button data-view="rank">Rank</button>
      </div>
      <span class="updated" id="updated"></span>
    </div>
    <div class="group-grid" id="group-grid"></div>
  </section>

  <section id="fixtures-view" hidden>
    <div class="fixtures-list" id="fixtures-list"></div>
  </section>

  <div class="modal" id="modal" hidden>
    <div class="modal-card" id="modal-card"></div>
  </div>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `css/styles.css`** — Midnight theme tokens + layout (grid of 12, tabs, segmented toggle, modal). Reuse the Midnight palette from the playground (`--bg:#0d1018`, gridless charts, `--accent:#4ade80`).

```css
:root{ --bg:#0d1018; --panel:#11141c; --line:#1f2433; --text:#e8ebf2; --muted:#8b93a7; --accent:#4ade80; }
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:18px 28px;border-bottom:1px solid var(--line);flex-wrap:wrap;gap:12px}
.topbar h1{font-size:18px;margin:0;letter-spacing:-.2px}
.tabs,.seg{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:3px}
.tab,.seg button{border:none;background:transparent;color:var(--muted);font-size:13px;font-weight:600;padding:7px 18px;border-radius:8px;cursor:pointer}
.tab.active,.seg button.active{background:var(--accent);color:#06210f}
.viewbar{display:flex;align-items:center;gap:16px;padding:18px 28px}
.updated{color:var(--muted);font-size:12px}
.group-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;padding:0 28px 40px}
.group-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px 10px;cursor:pointer;transition:.12s}
.group-card:hover{border-color:#33405a}
.group-card .gc-title{font-size:13px;font-weight:700;letter-spacing:.4px;margin-bottom:4px}
.fixtures-list{padding:8px 28px 60px;max-width:760px;margin:0 auto}
.fx-date{font-size:13px;font-weight:700;color:var(--accent);margin:22px 0 8px}
.fx-row{display:grid;grid-template-columns:64px 1fr auto 1fr;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;margin-bottom:6px;background:var(--panel)}
.fx-row .time{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
.fx-row .home{text-align:right}.fx-row .score{font-weight:700;font-variant-numeric:tabular-nums;min-width:46px;text-align:center}
.fx-row .flag{font-size:18px}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.66);display:flex;align-items:center;justify-content:center;padding:24px;z-index:10}
.modal-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:22px;width:min(760px,96vw)}
```

- [ ] **Step 5: Commit**

```bash
git add index.html css/styles.css vercel.json package.json
git commit -m "feat: scaffold static shell with Midnight theme, tabs, toggle"
```

---

### Task 2: Source real tournament data → `groups.json` + `fixtures.json`

The 2026 draw, venues, and kickoff times are post knowledge-cutoff — fetch them
live. This task produces validated data files; later tasks consume them.

**Files:**
- Create: `data/groups.json`, `data/fixtures.json`

- [ ] **Step 1: Fetch the authoritative group draw and full match schedule.** Use WebSearch + WebFetch against official sources (FIFA, or a reputable outlet) to get: the 12 groups A–L with their 4 teams each; every group-stage match's date, venue, and **local kickoff time**; and which matchday (1/2/3) each match is.

- [ ] **Step 2: Convert every kickoff to UK time** (BST, UTC+1 for the June–July window) and store as an ISO string with `+01:00`.

- [ ] **Step 3: Assign a jersey-color hex + flag emoji per nation.** Seed map (extend to all 48 during this step):

```
ARG #75AADB  BRA #FFD400  FRA #1A2A6C  ENG #FFFFFF  ESP #C60B1E  POR #C60B1E
GER #1A1A1A  NED #FF6A13  BEL #C8102E  ITA #1B458F  CRO #FF0000  URU #5BC2E7
MEX #006847  USA #1B3A8F  CAN #FF0000  JPN #0B1F66  KOR #C8102E  AUS #FFCD00
MAR #C1272D  SEN #00853F  SUI #FF0000  POL #DC143C  ...complete remaining nations
```

- [ ] **Step 4: Write `data/groups.json`** in this exact shape (one entry per group A–L):

```json
{
  "A": [
    { "code": "MEX", "name": "Mexico", "flag": "🇲🇽", "color": "#006847" }
  ]
}
```

- [ ] **Step 5: Write `data/fixtures.json`** as an array, each match in this exact shape (all 104; group-stage matches carry `group` + `matchday`):

```json
[
  {
    "id": "M01", "stage": "group", "group": "A", "matchday": 1,
    "dateUK": "2026-06-11", "kickoffUK": "2026-06-11T23:00:00+01:00",
    "venue": "Estadio Azteca, Mexico City",
    "home": "MEX", "away": "XXX",
    "status": "scheduled", "score": { "home": null, "away": null }
  }
]
```

- [ ] **Step 6: Validate** — confirm 12 groups × 4 teams = 48; each group has exactly 6 group-stage matches (3 matchdays × 2); every `home`/`away` code exists in `groups.json`. Fix mismatches.

- [ ] **Step 7: Commit**

```bash
git add data/groups.json data/fixtures.json
git commit -m "data: WC2026 group draw + fixtures in UK time with jersey colors"
```

---

### Task 3: `colors.js` — jersey colors + same-group de-collision (TDD)

**Files:**
- Create: `js/colors.js`
- Test: `tests/colors.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveColors } from '../js/colors.js';

test('keeps distinct colors unchanged', () => {
  const teams = [
    { code:'BRA', color:'#FFD400' },
    { code:'ARG', color:'#75AADB' },
  ];
  const out = resolveColors(teams);
  assert.equal(out.BRA, '#FFD400');
  assert.equal(out.ARG, '#75AADB');
});

test('shifts a same-group duplicate color apart', () => {
  const teams = [
    { code:'ESP', color:'#C60B1E' },
    { code:'POR', color:'#C60B1E' },
  ];
  const out = resolveColors(teams);
  assert.equal(out.ESP, '#C60B1E');          // first keeps exact jersey color
  assert.notEqual(out.POR.toLowerCase(), '#c60b1e'); // second is shifted
});

test('cross-call duplicates are independent (only within-group clashes shift)', () => {
  // colors may freely repeat across different groups — each group resolved alone
  const g1 = resolveColors([{ code:'A', color:'#FF0000' }]);
  const g2 = resolveColors([{ code:'B', color:'#FF0000' }]);
  assert.equal(g1.A, '#FF0000');
  assert.equal(g2.B, '#FF0000');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/colors.test.js`
Expected: FAIL — cannot find module `../js/colors.js`.

- [ ] **Step 3: Write `js/colors.js`** (ported from the playground's `resolveColors`/HSL helpers, now an ES module)

```js
export function hexToHsl(hex){
  let r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b); let h,s,l=(max+min)/2;
  if(max===min){h=s=0;} else {const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h/=6;}
  return [h*360,s*100,l*100];
}
export function hslToHex(h,s,l){
  h/=360;s/=100;l/=100; let r,g,b;
  if(s===0){r=g=b=l;} else {
    const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
    const q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
    r=hue2rgb(p,q,h+1/3);g=hue2rgb(p,q,h);b=hue2rgb(p,q,h-1/3);
  }
  const to=x=>('0'+Math.round(x*255).toString(16)).slice(-2);
  return '#'+to(r)+to(g)+to(b);
}
// teams: [{code, color}] within ONE group → { code: displayColor }
export function resolveColors(teams){
  const seen={}, out={};
  for(const t of teams){
    const key=t.color.toLowerCase();
    if(seen[key]===undefined){ seen[key]=0; out[t.code]=t.color; }
    else {
      seen[key]++;
      const [h,s,l]=hexToHsl(t.color);
      const dir = seen[key]%2===1 ? 1 : -1, step=Math.ceil(seen[key]/2);
      const nl=Math.max(20,Math.min(80,l+dir*step*18)), nh=(h+dir*step*10+360)%360;
      out[t.code]=hslToHex(nh,s,nl);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/colors.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add js/colors.js tests/colors.test.js
git commit -m "feat: jersey color resolver with same-group de-collision (tested)"
```

---

### Task 4: `standings.js` — points, rank, FIFA tiebreakers (TDD)

**Files:**
- Create: `js/standings.js`
- Test: `tests/standings.test.js`

`computeGroup(teams, matches)` returns, per team: cumulative `points` array
`[0,MD1,MD2,MD3]`, `rank` array `[MD1,MD2,MD3]` (1=top), and final `qualified`
boolean (top 2). Only `status:"finished"` matches count; unplayed matchdays
carry the previous cumulative value forward.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeGroup } from '../js/standings.js';

const teams = [{code:'BRA'},{code:'ESP'},{code:'POR'},{code:'ARG'}];
const F = (md,h,a,hs,as_) => ({matchday:md,home:h,away:a,status:'finished',score:{home:hs,away:as_}});
// MD1: POR 1-0 ARG, BRA 2-0 ESP | MD2: POR 3-1 BRA, ESP 2-0 ARG | MD3: BRA 1-1 ARG, ESP 2-1 POR
const matches = [
  F(1,'POR','ARG',1,0), F(1,'BRA','ESP',2,0),
  F(2,'POR','BRA',3,1), F(2,'ESP','ARG',2,0),
  F(3,'BRA','ARG',1,1), F(3,'ESP','POR',2,1),
];

test('cumulative points accumulate per matchday', () => {
  const g = computeGroup(teams, matches);
  assert.deepEqual(g.BRA.points, [0,3,3,4]); // W, L, D
  assert.deepEqual(g.POR.points, [0,3,6,6]); // W, W, L
  assert.deepEqual(g.ESP.points, [0,0,3,6]); // L, W, W
  assert.deepEqual(g.ARG.points, [0,0,0,1]); // L, L, D
});

test('rank uses points then goal difference then goals scored', () => {
  const g = computeGroup(teams, matches);
  // Final pts: POR6, ESP6, BRA4, ARG1. POR vs ESP tie on pts → GD decides.
  assert.equal(g.ARG.rank.at(-1), 4);
  assert.equal(g.BRA.rank.at(-1), 3);
  assert.ok([1,2].includes(g.POR.rank.at(-1)));
  assert.ok([1,2].includes(g.ESP.rank.at(-1)));
});

test('top two are flagged qualified', () => {
  const g = computeGroup(teams, matches);
  const q = Object.entries(g).filter(([,v])=>v.qualified).map(([k])=>k).sort();
  assert.deepEqual(q, ['ESP','POR']);
});

test('unplayed matchdays carry points forward', () => {
  const g = computeGroup(teams, matches.filter(m=>m.matchday===1));
  assert.deepEqual(g.BRA.points, [0,3,3,3]); // only MD1 played
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/standings.test.js`
Expected: FAIL — cannot find module `../js/standings.js`.

- [ ] **Step 3: Write `js/standings.js`**

```js
// teams: [{code}], matches: [{matchday,home,away,status,score:{home,away}}]
export function computeGroup(teams, matches){
  const codes = teams.map(t=>t.code);
  const blank = () => ({ pts:0, gf:0, ga:0, played:0 });
  // running table after each matchday (1..3)
  const perMD = {};
  const acc = Object.fromEntries(codes.map(c=>[c, blank()]));
  const cumPoints = Object.fromEntries(codes.map(c=>[c, [0]]));

  for(let md=1; md<=3; md++){
    for(const m of matches){
      if(m.matchday!==md || m.status!=='finished') continue;
      const {home,away,score}=m;
      acc[home].gf+=score.home; acc[home].ga+=score.away; acc[home].played++;
      acc[away].gf+=score.away; acc[away].ga+=score.home; acc[away].played++;
      if(score.home>score.away){ acc[home].pts+=3; }
      else if(score.home<score.away){ acc[away].pts+=3; }
      else { acc[home].pts+=1; acc[away].pts+=1; }
    }
    for(const c of codes) cumPoints[c].push(acc[c].pts);
    perMD[md] = rankTable(codes, acc, matches, md);
  }

  const out = {};
  for(const c of codes){
    out[c] = {
      points: cumPoints[c],                       // [0,MD1,MD2,MD3]
      rank: [perMD[1][c], perMD[2][c], perMD[3][c]],
      qualified: perMD[3][c] <= 2,
    };
  }
  return out;
}

function gd(s){ return s.gf - s.ga; }
// Returns { code: rank(1..n) } using points → GD → goals scored → head-to-head
function rankTable(codes, acc, matches, md){
  const sorted = [...codes].sort((a,b)=>{
    if(acc[b].pts!==acc[a].pts) return acc[b].pts-acc[a].pts;
    if(gd(acc[b])!==gd(acc[a])) return gd(acc[b])-gd(acc[a]);
    if(acc[b].gf!==acc[a].gf) return acc[b].gf-acc[a].gf;
    return headToHead(a,b,matches,md);          // 1 win, -1 loss, 0 none
  });
  const rank={}; sorted.forEach((c,i)=>rank[c]=i+1); return rank;
}
function headToHead(a,b,matches,md){
  for(const m of matches){
    if(m.matchday>md || m.status!=='finished') continue;
    const pair = (m.home===a&&m.away===b)||(m.home===b&&m.away===a);
    if(!pair) continue;
    const aGoals = m.home===a?m.score.home:m.score.away;
    const bGoals = m.home===b?m.score.home:m.score.away;
    if(aGoals>bGoals) return -1; if(aGoals<bGoals) return 1;
  }
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/standings.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add js/standings.js tests/standings.test.js
git commit -m "feat: group standings engine (points, rank, tiebreakers) tested"
```

---

### Task 5: `chart.js` — SVG renderer (Midnight look, ported from playground)

**Files:**
- Create: `js/chart.js`

Port the SVG renderer from `visual-playground.html` (already in the repo) and
hard-lock the approved Midnight visual direction. The exported function (exact
signature consumed by Task 6's `app.js`):

```
renderChart(svgEl, { letter, series, colors, qualifiers, view, animate })
  series : [{ code, name, flag, color, points:[0,MD1,MD2,MD3], rank:[MD1,MD2,MD3] }]
  view   : 'points' | 'rank'   // chooses which array to scale into x,y inside the renderer
```

The renderer scales `points` (4 pts, x over MD0–3) or `rank` (3 pts, x over
MD1–3, y inverted so rank 1 sits at top) into SVG coordinates itself — the
caller passes raw arrays, not pixel coordinates.

- [ ] **Step 1: Create `js/chart.js`** exporting `renderChart`. Carry over verbatim from the playground: the geometry constants (`W,H,PAD,plot`), `xFor`, `pathD` (use **smooth** curve), the glow `<filter>` (intensity 16), flag-chip markers (**font-size 17** — the +30% size), flag+code end labels, qualification emphasis (brighten top-2, dim others, dashed cutoff), hover spotlight, and the **draw-on** animation at **0.5×** speed. Lock these as constants rather than state:

```js
const STYLE = { theme:'midnight', curve:'smooth', thickness:3, glow:true, glowI:16,
                markers:'flag', flagSize:17, endLabel:'flag', qual:true, hover:true,
                grid:false, anim:'draw', speed:0.5 };
const THEME = { bg:'#0d1018', text:'#e8ebf2', sub:'#8b93a7' };
```

Build `renderChart(svg, {series, colors, qualifiers, view, animate})` by lifting
the playground's `render()` body, replacing every `state.*` read with the
corresponding `STYLE.*`/`THEME.*` constant. Replace the demo `pointsSeries()`/
`rankSeries()` with an internal scaler that maps each team's `series[i].points`
(when `view==='points'`) or `series[i].rank` (when `view==='rank'`) into `{x,y}`
using the playground's `xFor` and the points/rank y-scales. Import `hexToHsl`/
`hslToHex` from `./colors.js` (do not duplicate); keep `pathD` local.

- [ ] **Step 2: Manual verify** — temporarily wire a demo group in a scratch HTML and confirm: smooth glowing lines, 17px flag chips, dashed cutoff, draw-on at 0.5×, hover fade. (This is exercised for real in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add js/chart.js
git commit -m "feat: midnight SVG chart renderer ported from playground"
```

---

### Task 6: `app.js` — data load, group grid, Points/Rank toggle, expand

**Files:**
- Create: `js/app.js`

- [ ] **Step 1: Create `js/app.js`** — load data, build the standings/colors, render the grid of 12, wire the toggle and tabs.

```js
import { resolveColors } from './colors.js';
import { computeGroup } from './standings.js';
import { renderChart } from './chart.js';

let DATA = { groups:{}, fixtures:[] };
let view = 'points';

async function boot(){
  const [groups, fixtures] = await Promise.all([
    fetch('data/groups.json').then(r=>r.json()),
    fetch('data/fixtures.json').then(r=>r.json()),
  ]);
  DATA = { groups, fixtures };
  renderGroups(true);
  renderFixtures();
  wireTabs(); wireToggle();
  showUpdated();
}

function groupModel(letter){
  const teams = DATA.groups[letter];
  const matches = DATA.fixtures.filter(m=>m.stage==='group' && m.group===letter);
  const colors = resolveColors(teams);
  const standings = computeGroup(teams, matches);
  const qualifiers = Object.entries(standings).filter(([,v])=>v.qualified).map(([k])=>k);
  // build series: attach team meta + raw point/rank arrays for the renderer to scale
  const series = teams.map(t=>({
    code:t.code, name:t.name, flag:t.flag, color:colors[t.code],
    points: standings[t.code].points, rank: standings[t.code].rank,
  }));
  return { letter, series, colors, qualifiers };
}

function renderGroups(animate){
  const grid = document.getElementById('group-grid'); grid.innerHTML='';
  for(const letter of Object.keys(DATA.groups).sort()){
    const m = groupModel(letter);
    const card = document.createElement('div'); card.className='group-card';
    card.innerHTML = `<div class="gc-title">GROUP ${letter}</div><svg viewBox="0 0 640 320"></svg>`;
    renderChart(card.querySelector('svg'), { ...m, view, animate });
    card.onclick = () => openModal(letter);
    grid.appendChild(card);
  }
}

function openModal(letter){
  const m = groupModel(letter);
  const card = document.getElementById('modal-card');
  card.innerHTML = `<div class="gc-title">GROUP ${letter}</div><svg viewBox="0 0 640 320"></svg>`;
  renderChart(card.querySelector('svg'), { ...m, view, animate:true });
  document.getElementById('modal').hidden = false;
}
document.getElementById('modal').onclick = e => { if(e.target.id==='modal') e.currentTarget.hidden=true; };

function wireToggle(){
  document.querySelectorAll('#viewseg button').forEach(b=>{
    b.onclick = () => {
      view = b.dataset.view;
      document.querySelectorAll('#viewseg button').forEach(x=>x.classList.toggle('active',x===b));
      renderGroups(true);
    };
  });
}
function wireTabs(){
  document.querySelectorAll('.tab').forEach(t=>{
    t.onclick = () => {
      document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===t));
      document.getElementById('groups-view').hidden = t.dataset.tab!=='groups';
      document.getElementById('fixtures-view').hidden = t.dataset.tab!=='fixtures';
    };
  });
}
function showUpdated(){
  const done = DATA.fixtures.filter(f=>f.status==='finished').length;
  document.getElementById('updated').textContent = `${done}/${DATA.fixtures.length} matches played`;
}

boot();
```

- [ ] **Step 2: Run locally and verify the grid** — `python3 -m http.server 8000`, open `http://localhost:8000`. Confirm 12 group cards render, the Points/Rank toggle flips all charts with draw-on animation, and clicking a card opens the expanded modal.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: app shell — group grid, points/rank toggle, expand modal"
```

---

### Task 7: Fixtures tab — date-by-date list with flags + UK times

**Files:**
- Modify: `js/app.js` (add `renderFixtures`)

- [ ] **Step 1: Add `renderFixtures()` to `js/app.js`** — group matches by `dateUK`, render each with both flags, UK kickoff time, and score when finished.

```js
function flagOf(code){ for(const g of Object.values(DATA.groups)){ const t=g.find(x=>x.code===code); if(t) return t.flag; } return '🏳️'; }
function ukTime(iso){ return new Date(iso).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}); }

function renderFixtures(){
  const wrap = document.getElementById('fixtures-list'); wrap.innerHTML='';
  const byDate = {};
  for(const f of DATA.fixtures){ (byDate[f.dateUK] ??= []).push(f); }
  for(const date of Object.keys(byDate).sort()){
    const h = document.createElement('div'); h.className='fx-date';
    h.textContent = new Date(date).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/London'});
    wrap.appendChild(h);
    for(const f of byDate[date].sort((a,b)=>a.kickoffUK.localeCompare(b.kickoffUK))){
      const played = f.status==='finished';
      const score = played ? `${f.score.home}–${f.score.away}` : ukTime(f.kickoffUK);
      const row = document.createElement('div'); row.className='fx-row';
      row.innerHTML =
        `<span class="time">${played?ukTime(f.kickoffUK):'KO'}</span>`+
        `<span class="home">${f.home} <span class="flag">${flagOf(f.home)}</span></span>`+
        `<span class="score">${score}</span>`+
        `<span class="away"><span class="flag">${flagOf(f.away)}</span> ${f.away}</span>`;
      wrap.appendChild(row);
    }
  }
}
```

- [ ] **Step 2: Verify** — open the Fixtures tab; confirm dates are in order, both flags show on every row, times are UK (`Europe/London`), and a finished match shows the score instead of KO time.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: fixtures tab — date-by-date, flags, UK kickoff times"
```

---

### Task 8: Deploy to Vercel

**Files:** none (uses existing `vercel.json`)

- [ ] **Step 1: Deploy** — run the `vercel:deploy` skill (or `vercel` CLI) from the project root. It's a static site, no build step.

- [ ] **Step 2: Verify the live URL** — both tabs work, charts render, data loads over HTTPS.

- [ ] **Step 3: Commit any config Vercel adds** (e.g. project link), keeping `.vercel/` gitignored.

```bash
git add -A && git commit -m "chore: vercel deploy config"
```

---

### Task 9: Update routine — runbook + schedule

**Files:**
- Create: `scripts/update.md`

- [ ] **Step 1: Create `scripts/update.md`** — the exact procedure the routine follows:

```markdown
# Update procedure (run by the scheduled routine / on demand)

1. Read `data/fixtures.json`. Compute `eligible` = matches where
   `now >= kickoffUK + 3h` AND `status === "scheduled"`.
2. If none eligible, exit (nothing to do).
3. For each eligible match, web-fetch the final score from a reputable source.
4. Patch the record in place: set `status:"finished"` and
   `score:{home:<int>, away:<int>}`. Do not touch other fields.
5. Save `data/fixtures.json`, commit ("data: results through <date>"),
   and redeploy to Vercel (vercel:deploy).
6. Report which matches were updated.
```

- [ ] **Step 2: Dry-run** — hand-set one past match to `scheduled`, run the procedure manually, confirm it fetches and patches only that record, then redeploys.

- [ ] **Step 3: Schedule it** — use the `/schedule` skill to register a routine that runs this runbook on a cadence derived from the fixture kickoff times (frequent enough that every match is picked up within ~3h of kickoff during the group stage, June 11–27 2026).

- [ ] **Step 4: Commit**

```bash
git add scripts/update.md
git commit -m "feat: result-update runbook + scheduled routine (kickoff + 3h)"
```

---

## Self-Review

**Spec coverage:**
- Two tabs (Groups grid of 12 + expand; Fixtures) → Tasks 1, 6, 7 ✓
- Points/Rank toggle (cumulative + bump chart) → Tasks 4, 6 ✓
- Jersey colors + same-group de-collision → Task 3 ✓
- Locked Midnight visual direction incl. +30% flag chips → Task 5 ✓
- Standings with FIFA tiebreakers → Task 4 ✓
- Fixtures: flags both nations + UK times → Task 7 ✓
- Self-updating, kickoff + 3h trigger → Task 9 ✓
- Deployed live on Vercel → Task 8 ✓
- Data sourced live (post-cutoff) → Task 2 ✓

**Placeholder scan:** Pure-logic modules (Tasks 3, 4) and all wiring (Tasks 1, 6, 7, 9) contain complete code. Task 2 (data) and Task 5 (port) reference live-fetched data and the existing playground file respectively — both are concrete, existing sources, not placeholders.

**Type consistency:** `resolveColors(teams)→{code:hex}` used identically in Tasks 3/6. `computeGroup(teams,matches)→{code:{points[],rank[],qualified}}` defined in Task 4, consumed in Task 6. `renderChart(svg,{series/seriesPoints,view,colors,qualifiers,animate})` — note Task 6 passes `{...m, view, animate}` where `m` carries `series`, `colors`, `qualifiers`; Task 5 must read `series` (with `.points`/`.rank` per team) and scale it. Aligned.
