import { resolveColors } from './colors.js';
import { computeGroup } from './standings.js';
import { renderChart } from './chart.js';

let DATA = { groups:{}, fixtures:[] };
let view = 'points';
let strengthMetric = 'positions';

async function boot(){
  const [groups, fixtures] = await Promise.all([
    fetch('data/groups.json').then(r=>r.json()),
    fetch('data/fixtures.json').then(r=>r.json()),
  ]);
  DATA = { groups, fixtures };
  renderGroups(true);
  renderFixtures();
  renderStrength('positions');
  wireTabs(); wireToggle(); wireStrengthToggle();
  showUpdated();
}

function groupModel(letter){
  const teams = DATA.groups[letter];
  const matches = DATA.fixtures.filter(m=>m.stage==='group' && m.group===letter);
  const colors = resolveColors(teams);
  const standings = computeGroup(teams, matches);
  const qualifiers = Object.entries(standings).filter(([,v])=>v.qualified).map(([k])=>k);
  const series = teams.map(t=>({
    code:t.code, name:t.name, flag:t.flag, color:colors[t.code],
    points: standings[t.code].points, rank: standings[t.code].rank,
    stats: standings[t.code].stats,
  }));
  const finishedMatches = matches.filter(m=>m.status==='finished');
  const maxPlayedMD = finishedMatches.reduce((max, m) => Math.max(max, m.matchday), 0);
  return { letter, series, colors, qualifiers, maxPlayedMD };
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
  
  // Sort by final rank
  const sortedSeries = [...m.series].sort((a,b) => a.rank.at(-1) - b.rank.at(-1));
  const tableRows = sortedSeries.map(s => {
    const st = s.stats;
    const sign = st.gd > 0 ? '+' : '';
    return `
      <tr>
        <td class="col-num col-bold">${s.rank.at(-1)}</td>
        <td>
          <div class="team-cell">
            <span class="team-flag">${s.flag}</span>
            <span class="team-name">${s.name}</span>
            <span class="team-code" style="color:${s.color}; font-weight:700; font-size:11px;">(${s.code})</span>
          </div>
        </td>
        <td class="col-num">${st.played}</td>
        <td class="col-num">${st.w}</td>
        <td class="col-num">${st.d}</td>
        <td class="col-num">${st.l}</td>
        <td class="col-num">${st.gf}</td>
        <td class="col-num">${st.ga}</td>
        <td class="col-num">${sign}${st.gd}</td>
        <td class="col-num col-bold">${st.pts}</td>
      </tr>
    `;
  }).join('');

  const tableHtml = `
    <table class="modal-table">
      <thead>
        <tr>
          <th style="width: 40px; text-align: center;">Pos</th>
          <th>Team</th>
          <th style="text-align: center;">P</th>
          <th style="text-align: center;">W</th>
          <th style="text-align: center;">D</th>
          <th style="text-align: center;">L</th>
          <th style="text-align: center;">GF</th>
          <th style="text-align: center;">GA</th>
          <th style="text-align: center;">GD</th>
          <th style="text-align: center;">Pts</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;

  card.innerHTML = `<div class="gc-title">GROUP ${letter}</div><svg viewBox="0 0 640 320"></svg>${tableHtml}`;
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
      document.getElementById('groups-view').hidden   = t.dataset.tab!=='groups';
      document.getElementById('fixtures-view').hidden = t.dataset.tab!=='fixtures';
      document.getElementById('strength-view').hidden = t.dataset.tab!=='strength';
    };
  });
}

function renderStrength(metric){
  const list = document.getElementById('strength-list'); list.innerHTML='';
  // Build group sums
  const rows = Object.entries(DATA.groups).map(([letter, teams])=>{
    const sum = teams.reduce((acc,t)=> acc + (metric==='positions' ? t.fifaRank : t.fifaPoints), 0);
    return { letter, sum, teams };
  });
  // Sort descending (highest sum at top)
  rows.sort((a,b)=>b.sum - a.sum);
  const sums = rows.map(r=>r.sum);
  const minS = Math.min(...sums), maxS = Math.max(...sums);
  // Caption
  const caption = document.getElementById('strength-caption');
  caption.textContent = metric==='positions'
    ? 'Sum of FIFA ranking positions — higher = weaker group'
    : 'Sum of FIFA ranking points — higher = stronger group';
  rows.forEach((row, idx)=>{
    const frac = maxS===minS ? 1 : 0.18 + 0.82*((row.sum - minS)/(maxS - minS));
    // Badge
    let badge = '';
    if(idx===0) badge = metric==='positions' ? '🍃 Weakest' : '🔥 Group of Death';
    else if(idx===rows.length-1) badge = metric==='positions' ? '🔥 Group of Death' : '🍃 Weakest';
    // Sort teams: best first (lowest fifaRank / highest fifaPoints)
    const sorted = [...row.teams].sort((a,b)=>
      metric==='positions' ? a.fifaRank - b.fifaRank : b.fifaPoints - a.fifaPoints
    );
    const teamsHtml = sorted.map(t=>{
      const val = metric==='positions'
        ? `#${t.fifaRank}`
        : `${Math.round(t.fifaPoints)}`;
      return `<span class="str-chip"><span class="str-flag">${t.flag}</span><span class="str-code">${t.code}</span><span class="str-val">${val}</span></span>`;
    }).join('');
    const badgeHtml = badge ? `<span class="str-badge">${badge}</span>` : '';
    const sumDisplay = metric==='positions' ? row.sum : Math.round(row.sum);
    const el = document.createElement('div'); el.className='str-row';
    el.innerHTML =
      `<div class="str-head"><span class="str-rank">${idx+1}</span><span class="str-title">GROUP ${row.letter}</span>${badgeHtml}<span class="str-sum">${sumDisplay}</span></div>`+
      `<div class="str-bar-wrap"><div class="str-bar-fill" style="width:${(frac*100).toFixed(1)}%"></div></div>`+
      `<div class="str-teams">${teamsHtml}</div>`;
    list.appendChild(el);
  });
}

function wireStrengthToggle(){
  document.querySelectorAll('#strengthseg button').forEach(b=>{
    b.onclick = () => {
      strengthMetric = b.dataset.metric;
      document.querySelectorAll('#strengthseg button').forEach(x=>x.classList.toggle('active',x===b));
      renderStrength(strengthMetric);
    };
  });
}
function showUpdated(){
  const done = DATA.fixtures.filter(f=>f.status==='finished').length;
  document.getElementById('updated').textContent = `${done}/${DATA.fixtures.length} matches played`;
}

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

boot();
