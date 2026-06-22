import { resolveColors } from './colors.js';
import { computeGroup } from './standings.js';
import { renderChart } from './chart.js';

let DATA = { groups:{}, fixtures:[] };
let FANTASY = { setPieces: {}, injuries: [] };
let view = 'points';
let strengthMetric = 'positions';
let fixtureStatus = 'today';
let activeFilters = {
  stage: 'ALL',
  group: [],
  country: [],
  date: 'ALL'
};

async function boot(){
  const [groups, fixtures, fantasy] = await Promise.all([
    fetch('data/groups.json').then(r=>r.json()),
    fetch('data/fixtures.json').then(r=>r.json()),
    fetch('data/fantasy.json').then(r=>r.json()),
  ]);
  DATA = { groups, fixtures };
  FANTASY = fantasy;
  renderGroups(true);
  initFilters();
  applyFilters();
  renderStrength('positions');
  renderFantasyHub();
  renderKnockouts();
  wireTabs(); wireToggle(); wireStrengthToggle(); wireFixtureToggle(); wireFantasySearch(); wireKnockoutToggle();
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

  card.innerHTML = `
    <button class="modal-close" id="modal-close-btn" aria-label="Close modal">&times;</button>
    <div class="gc-title">GROUP ${letter}</div>
    <svg viewBox="0 0 640 320"></svg>
    ${tableHtml}
  `;
  renderChart(card.querySelector('svg'), { ...m, view, animate:true });
  
  document.getElementById('modal-close-btn').onclick = () => {
    document.getElementById('modal').hidden = true;
  };
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
      document.getElementById('fantasy-view').hidden  = t.dataset.tab!=='fantasy';
      document.getElementById('knockout-view').hidden = t.dataset.tab!=='knockout';
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

function setupCustomMultiSelect(containerId, onChange){
  const container = document.getElementById(containerId);
  const trigger = container.querySelector('.custom-select-trigger');
  const options = container.querySelector('.custom-select-options');

  trigger.onclick = (e) => {
    e.stopPropagation();
    // Close other custom selects first
    document.querySelectorAll('.custom-select-options').forEach(el => {
      if (el !== options) el.classList.remove('open');
    });
    // Toggle this one
    if (!trigger.disabled) {
      options.classList.toggle('open');
    }
  };

  container.onclick = (e) => {
    e.stopPropagation(); // Prevent closing when clicking inside options menu
  };

  options.onchange = () => {
    const checked = Array.from(options.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    onChange(checked);
  };
}

function findTeamByCode(code){
  for(const groupTeams of Object.values(DATA.groups)){
    const t = groupTeams.find(x => x.code === code);
    if(t) return t;
  }
  return null;
}

function updateGroupTriggerLabel(selectedGroups){
  const trigger = document.getElementById('group-select-trigger');
  if (selectedGroups.length === 0) {
    trigger.textContent = 'All Groups';
  } else if (selectedGroups.length === 1) {
    trigger.textContent = `Group ${selectedGroups[0]}`;
  } else if (selectedGroups.length === 2) {
    trigger.textContent = `Groups ${selectedGroups.join(', ')}`;
  } else {
    trigger.textContent = `${selectedGroups.length} Groups selected`;
  }
}

function updateCountryTriggerLabel(selectedCountries){
  const trigger = document.getElementById('country-select-trigger');
  if (selectedCountries.length === 0) {
    trigger.textContent = 'All Countries';
  } else if (selectedCountries.length === 1) {
    const team = findTeamByCode(selectedCountries[0]);
    trigger.textContent = team ? `${team.flag} ${team.name}` : selectedCountries[0];
  } else if (selectedCountries.length === 2) {
    trigger.textContent = selectedCountries.join(', ');
  } else {
    trigger.textContent = `${selectedCountries.length} Countries selected`;
  }
}

function initFilters(){
  // Populate group checkboxes
  const groupOptions = document.getElementById('group-select-options');
  groupOptions.innerHTML = '';
  const letters = 'ABCDEFGHIJKL'.split('');
  for(const l of letters){
    const label = document.createElement('label');
    label.className = 'custom-option';
    label.innerHTML = `
      <input type="checkbox" value="${l}">
      <span>Group ${l}</span>
    `;
    groupOptions.appendChild(label);
  }

  // Populate country checkboxes
  const allTeams = [];
  for(const teams of Object.values(DATA.groups)){
    allTeams.push(...teams);
  }
  allTeams.sort((a,b)=>a.name.localeCompare(b.name));
  const countryOptions = document.getElementById('country-select-options');
  countryOptions.innerHTML = '';
  for(const team of allTeams){
    const label = document.createElement('label');
    label.className = 'custom-option';
    label.innerHTML = `
      <input type="checkbox" value="${team.code}">
      <span>${team.flag} ${team.name}</span>
    `;
    countryOptions.appendChild(label);
  }

  // Populate date filter
  const uniqueDates = [...new Set(DATA.fixtures.map(f=>f.dateUK))].sort();
  const dateSelect = document.getElementById('filter-date');
  dateSelect.innerHTML = '<option value="ALL">All Dates</option>';
  for(const date of uniqueDates){
    const opt = document.createElement('option');
    opt.value = date;
    opt.textContent = new Date(date).toLocaleDateString('en-GB',{
      weekday:'short',day:'numeric',month:'short',timeZone:'Europe/London'
    });
    dateSelect.appendChild(opt);
  }

  // Bind change events for standard inputs
  const stageSelect = document.getElementById('filter-stage');
  const dateSelectEl = document.getElementById('filter-date');
  
  const handleStageOrDateChange = () => {
    activeFilters.stage = stageSelect.value;
    activeFilters.date = dateSelectEl.value;

    const groupTrigger = document.getElementById('group-select-trigger');
    const groupOptionsEl = document.getElementById('group-select-options');

    // Disable group filter if stage is not group-related
    const isGroupStageSelected = activeFilters.stage === 'ALL' || 
                                 activeFilters.stage === 'group' || 
                                 activeFilters.stage.startsWith('group-');
    
    if (!isGroupStageSelected) {
      groupTrigger.disabled = true;
      groupTrigger.classList.add('disabled');
      groupOptionsEl.classList.remove('open');
    } else {
      groupTrigger.disabled = false;
      groupTrigger.classList.remove('disabled');
    }

    applyFilters();
  };

  stageSelect.onchange = handleStageOrDateChange;
  dateSelectEl.onchange = handleStageOrDateChange;

  // Bind custom selects
  setupCustomMultiSelect('group-select-container', (selectedGroups) => {
    activeFilters.group = selectedGroups;
    updateGroupTriggerLabel(selectedGroups);
    applyFilters();
  });

  setupCustomMultiSelect('country-select-container', (selectedCountries) => {
    activeFilters.country = selectedCountries;
    updateCountryTriggerLabel(selectedCountries);
    applyFilters();
  });

  // Global document click to close options when tapping outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-options').forEach(el => el.classList.remove('open'));
  });

  // Reset button
  document.getElementById('btn-reset-filters').onclick = resetFilters;
}

function resetFilters(){
  document.getElementById('filter-stage').value = 'ALL';
  
  // Uncheck group checkboxes
  const groupOptions = document.getElementById('group-select-options');
  groupOptions.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  const groupTrigger = document.getElementById('group-select-trigger');
  groupTrigger.disabled = false;
  groupTrigger.classList.remove('disabled');
  updateGroupTriggerLabel([]);

  // Uncheck country checkboxes
  const countryOptions = document.getElementById('country-select-options');
  countryOptions.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  updateCountryTriggerLabel([]);

  document.getElementById('filter-date').value = 'ALL';
  
  activeFilters = {
    stage: 'ALL',
    group: [],
    country: [],
    date: 'ALL'
  };

  document.querySelectorAll('.custom-select-options').forEach(el => el.classList.remove('open'));
  
  applyFilters();
}

function applyFilters(){
  let filtered = DATA.fixtures.filter(f => {
    // 0. Status filter (All / Upcoming / Results)
    if (fixtureStatus !== 'ALL') {
      if (fixtureStatus === 'today') {
        const todayUK = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
        if (f.dateUK !== todayUK) return false;
      }
      if (fixtureStatus === 'upcoming' && f.status !== 'scheduled') return false;
      if (fixtureStatus === 'results' && f.status !== 'finished') return false;
    }

    // 1. Stage filter
    if (activeFilters.stage !== 'ALL') {
      if (activeFilters.stage === 'group') {
        if (f.stage !== 'group') return false;
      } else if (activeFilters.stage === 'group-md1') {
        if (f.stage !== 'group' || f.matchday !== 1) return false;
      } else if (activeFilters.stage === 'group-md2') {
        if (f.stage !== 'group' || f.matchday !== 2) return false;
      } else if (activeFilters.stage === 'group-md3') {
        if (f.stage !== 'group' || f.matchday !== 3) return false;
      } else {
        const matchStage = f.stage ? f.stage.toLowerCase() : '';
        const selectedStage = activeFilters.stage.toLowerCase();
        if (matchStage !== selectedStage) return false;
      }
    }

    // 2. Group filter (only if enabled and selected)
    const groupTrigger = document.getElementById('group-select-trigger');
    if (!groupTrigger.disabled && activeFilters.group && activeFilters.group.length > 0) {
      if (!activeFilters.group.includes(f.group)) return false;
    }

    // 3. Country filter (only if selected)
    if (activeFilters.country && activeFilters.country.length > 0) {
      if (!activeFilters.country.includes(f.home) && !activeFilters.country.includes(f.away)) return false;
    }

    // 4. Date filter
    if (activeFilters.date !== 'ALL') {
      if (f.dateUK !== activeFilters.date) return false;
    }

    return true;
  });

  renderFixtures(filtered);
}

function wireFixtureToggle(){
  document.querySelectorAll('#fixtureseg button').forEach(b=>{
    b.onclick = () => {
      fixtureStatus = b.dataset.status;
      document.querySelectorAll('#fixtureseg button').forEach(x=>x.classList.toggle('active',x===b));
      applyFilters();
    };
  });
}

function renderFixtures(fixturesToRender = DATA.fixtures){
  const wrap = document.getElementById('fixtures-list'); wrap.innerHTML='';
  
  // Update count indicator
  const countEl = document.getElementById('fixtures-count');
  if (countEl) {
    if (fixturesToRender.length === DATA.fixtures.length) {
      countEl.textContent = `Showing all ${DATA.fixtures.length} matches`;
    } else {
      countEl.textContent = `Showing ${fixturesToRender.length} of ${DATA.fixtures.length} matches`;
    }
  }

  if (fixturesToRender.length === 0) {
    wrap.innerHTML = `
      <div class="no-fixtures">
        <div class="no-fixtures-title">No matching fixtures found</div>
        <div class="no-fixtures-desc">Try adjusting your filters or resetting them to see the full schedule.</div>
        <button class="btn-clear-filters" id="btn-clear-filters-empty">Reset Filters</button>
      </div>
    `;
    document.getElementById('btn-clear-filters-empty').onclick = resetFilters;
    return;
  }

  const byDate = {};
  for(const f of fixturesToRender){ (byDate[f.dateUK] ??= []).push(f); }
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

function renderFantasyHub(setpieceFilter = '') {
  // Render set-pieces
  const setpiecesList = document.getElementById('setpiece-list');
  setpiecesList.innerHTML = '';
  
  const allTeams = [];
  for (const groupTeams of Object.values(DATA.groups)) {
    allTeams.push(...groupTeams);
  }
  allTeams.sort((a, b) => a.name.localeCompare(b.name));

  const filteredTeams = allTeams.filter(t => {
    const sp = FANTASY.setPieces[t.code] || { penalties: 'N/A', freeKicks: 'N/A', corners: 'N/A' };
    const query = setpieceFilter.toLowerCase();
    return t.name.toLowerCase().includes(query) || 
           t.code.toLowerCase().includes(query) || 
           sp.penalties.toLowerCase().includes(query) || 
           sp.freeKicks.toLowerCase().includes(query) || 
           sp.corners.toLowerCase().includes(query);
  });

  filteredTeams.forEach(t => {
    const sp = FANTASY.setPieces[t.code] || { penalties: 'N/A', freeKicks: 'N/A', corners: 'N/A' };
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="team-cell" style="font-weight: 700;">
          <span class="team-flag">${t.flag}</span>
          <span class="team-name">${t.name}</span>
          <span class="team-code" style="color: var(--muted); font-size: 11px;">(${t.code})</span>
        </div>
      </td>
      <td>${sp.penalties}</td>
      <td>${sp.freeKicks}</td>
      <td>${sp.corners}</td>
    `;
    setpiecesList.appendChild(tr);
  });
}

function getSortedGroupTeams(letter) {
  const teams = DATA.groups[letter];
  const matches = DATA.fixtures.filter(m => m.stage === 'group' && m.group === letter);
  const standings = computeGroup(teams, matches);
  return [...teams].map(t => {
    const s = standings[t.code];
    return {
      ...t,
      pts: s.points.at(-1),
      rank: s.rank.at(-1),
      stats: s.stats
    };
  }).sort((a, b) => a.rank - b.rank);
}

function getThirdPlaceStandings() {
  const letters = 'ABCDEFGHIJKL'.split('');
  const thirds = letters.map(l => {
    const sorted = getSortedGroupTeams(l);
    const team = sorted[2]; // 3rd place team (index 2)
    return {
      group: l,
      code: team.code,
      name: team.name,
      flag: team.flag,
      fifaRank: team.fifaRank,
      fifaPoints: team.fifaPoints,
      stats: team.stats,
      pts: team.pts
    };
  });

  thirds.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.stats.gd !== a.stats.gd) return b.stats.gd - a.stats.gd;
    if (b.stats.gf !== a.stats.gf) return b.stats.gf - a.stats.gf;
    return a.fifaRank - b.fifaRank;
  });

  return thirds;
}

function solveThirdPlaceMatchups(qualifiedGroups) {
  const winners = [
    { key: 'E', options: ['A', 'B', 'C', 'D', 'F'] },
    { key: 'I', options: ['C', 'D', 'F', 'G', 'H'] },
    { key: 'A', options: ['C', 'E', 'F', 'H', 'I'] },
    { key: 'L', options: ['E', 'H', 'I', 'J', 'K'] },
    { key: 'D', options: ['B', 'E', 'F', 'I', 'J'] },
    { key: 'G', options: ['A', 'E', 'H', 'I', 'J'] },
    { key: 'B', options: ['E', 'F', 'G', 'I', 'J'] },
    { key: 'K', options: ['D', 'E', 'I', 'J', 'L'] },
  ];

  const assignments = {};
  const used = new Set();

  function solve(idx) {
    if (idx === winners.length) return true;
    const w = winners[idx];
    for (const g of qualifiedGroups) {
      if (!used.has(g) && w.options.includes(g) && w.key !== g) {
        used.add(g);
        assignments[w.key] = g;
        if (solve(idx + 1)) return true;
        used.delete(g);
        delete assignments[w.key];
      }
    }
    return false;
  }

  if (solve(0)) {
    return assignments;
  }
  
  const fallback = {};
  const usedFallback = new Set();
  for (const w of winners) {
    for (const g of qualifiedGroups) {
      if (!usedFallback.has(g) && w.options.includes(g) && w.key !== g) {
        usedFallback.add(g);
        fallback[w.key] = g;
        break;
      }
    }
  }
  return fallback;
}

function getTeamBySlot(slot, assignments) {
  const rankNum = parseInt(slot[0]);
  let groupLetter = slot[1];
  
  if (rankNum === 3) {
    groupLetter = assignments[groupLetter];
    if (!groupLetter) return { label: `3rd Group ${slot[1]}`, flag: '🏳️', code: slot, dummy: true, fifaPoints: 0 };
  }

  const sorted = getSortedGroupTeams(groupLetter);
  const team = sorted[rankNum - 1];
  if (!team) {
    return { label: `Group ${slot[1]} R${rankNum}`, flag: '🏳️', code: slot, dummy: true, fifaPoints: 0 };
  }
  return {
    label: team.name,
    flag: team.flag,
    code: team.code,
    dummy: false,
    fifaPoints: team.fifaPoints
  };
}

function getMatchWinner(matchId, homeTeam, awayTeam) {
  const f = DATA.fixtures.find(m => m.id === matchId);
  if (f && f.status === 'finished') {
    if (f.score.home > f.score.away) return homeTeam;
    if (f.score.home < f.score.away) return awayTeam;
    return homeTeam.fifaPoints >= awayTeam.fifaPoints ? homeTeam : awayTeam;
  }

  const homePoints = homeTeam.dummy ? 0 : (homeTeam.fifaPoints || 0);
  const awayPoints = awayTeam.dummy ? 0 : (awayTeam.fifaPoints || 0);
  return homePoints >= awayPoints ? homeTeam : awayTeam;
}

function getMatchDetails(matchId, projectedHome, projectedAway) {
  const f = DATA.fixtures.find(m => m.id === matchId);
  if (f) {
    const homeTeamInfo = findTeamByCode(f.home) || { name: f.home, flag: flagOf(f.home), code: f.home, fifaPoints: 0 };
    const awayTeamInfo = findTeamByCode(f.away) || { name: f.away, flag: flagOf(f.away), code: f.away, fifaPoints: 0 };
    return {
      id: f.id,
      home: { label: homeTeamInfo.name, flag: homeTeamInfo.flag, code: homeTeamInfo.code, dummy: false, fifaPoints: homeTeamInfo.fifaPoints },
      away: { label: awayTeamInfo.name, flag: awayTeamInfo.flag, code: awayTeamInfo.code, dummy: false, fifaPoints: awayTeamInfo.fifaPoints },
      status: f.status,
      score: f.score,
      venue: f.venue,
      dateUK: f.dateUK,
      kickoffUK: f.kickoffUK
    };
  }
  
  return {
    id: matchId,
    home: projectedHome,
    away: projectedAway,
    status: 'scheduled',
    score: { home: null, away: null },
    venue: '',
    dateUK: '',
    kickoffUK: ''
  };
}

let knockoutView = 'bracket';

function renderKnockouts() {
  const thirds = getThirdPlaceStandings();
  const qualifiedThirds = thirds.slice(0, 8);
  const qualifiedGroups = qualifiedThirds.map(t => t.group).sort();
  const assignments = solveThirdPlaceMatchups(qualifiedGroups);

  const tableBody = document.getElementById('third-place-table-body');
  tableBody.innerHTML = '';
  thirds.forEach((t, idx) => {
    const isQualifying = idx < 8;
    const sign = t.stats.gd > 0 ? '+' : '';
    const tr = document.createElement('tr');
    if (isQualifying) {
      tr.className = 'third-place-row-qualified';
    }
    tr.innerHTML = `
      <td class="col-num col-bold">${idx + 1}</td>
      <td style="font-weight: 700; text-align: center;">Group ${t.group}</td>
      <td>
        <div class="team-cell">
          <span class="team-flag">${t.flag}</span>
          <span class="team-name">${t.name}</span>
          <span class="team-code" style="color: var(--muted); font-size: 11px;">(${t.code})</span>
        </div>
      </td>
      <td class="col-num">${t.stats.played}</td>
      <td class="col-num">${t.stats.w}</td>
      <td class="col-num">${t.stats.d}</td>
      <td class="col-num">${t.stats.l}</td>
      <td class="col-num">${t.stats.gf}</td>
      <td class="col-num">${t.stats.ga}</td>
      <td class="col-num">${sign}${t.stats.gd}</td>
      <td class="col-num col-bold">${t.pts}</td>
      <td>
        <span class="status-pill ${isQualifying ? 'qualifying' : 'eliminated'}">
          ${isQualifying ? 'Qualifying' : 'Eliminated'}
        </span>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  const r32MatchesData = [
    { id: 'M73', name: 'Match 73', homeSlot: '2A', awaySlot: '2B' },
    { id: 'M74', name: 'Match 74', homeSlot: '1E', awaySlot: '3E' },
    { id: 'M75', name: 'Match 75', homeSlot: '1F', awaySlot: '2C' },
    { id: 'M76', name: 'Match 76', homeSlot: '1C', awaySlot: '2F' },
    { id: 'M77', name: 'Match 77', homeSlot: '1I', awaySlot: '3I' },
    { id: 'M78', name: 'Match 78', homeSlot: '2E', awaySlot: '2I' },
    { id: 'M79', name: 'Match 79', homeSlot: '1A', awaySlot: '3A' },
    { id: 'M80', name: 'Match 80', homeSlot: '1L', awaySlot: '3L' },
    { id: 'M81', name: 'Match 81', homeSlot: '1D', awaySlot: '3D' },
    { id: 'M82', name: 'Match 82', homeSlot: '1G', awaySlot: '3G' },
    { id: 'M83', name: 'Match 83', homeSlot: '2K', awaySlot: '2L' },
    { id: 'M84', name: 'Match 84', homeSlot: '1H', awaySlot: '2J' },
    { id: 'M85', name: 'Match 85', homeSlot: '1B', awaySlot: '3B' },
    { id: 'M86', name: 'Match 86', homeSlot: '1J', awaySlot: '2H' },
    { id: 'M87', name: 'Match 87', homeSlot: '1K', awaySlot: '3K' },
    { id: 'M88', name: 'Match 88', homeSlot: '2D', awaySlot: '2G' }
  ].map(m => {
    const homeProj = getTeamBySlot(m.homeSlot, assignments);
    const awayProj = getTeamBySlot(m.awaySlot, assignments);
    return getMatchDetails(m.id, homeProj, awayProj);
  });

  const r16Pairings = [
    { id: 'M89', name: 'Match 89', homeM: 'M74', awayM: 'M77' },
    { id: 'M90', name: 'Match 90', homeM: 'M73', awayM: 'M75' },
    { id: 'M91', name: 'Match 91', homeM: 'M76', awayM: 'M78' },
    { id: 'M92', name: 'Match 92', homeM: 'M79', awayM: 'M80' },
    { id: 'M93', name: 'Match 93', homeM: 'M83', awayM: 'M84' },
    { id: 'M94', name: 'Match 94', homeM: 'M81', awayM: 'M82' },
    { id: 'M95', name: 'Match 95', homeM: 'M86', awayM: 'M88' },
    { id: 'M96', name: 'Match 96', homeM: 'M85', awayM: 'M87' }
  ];
  const r16MatchesData = r16Pairings.map(p => {
    const homeR32 = r32MatchesData.find(x => x.id === p.homeM);
    const awayR32 = r32MatchesData.find(x => x.id === p.awayM);
    const homeProj = getMatchWinner(homeR32.id, homeR32.home, homeR32.away);
    const awayProj = getMatchWinner(awayR32.id, awayR32.home, awayR32.away);
    return getMatchDetails(p.id, homeProj, awayProj);
  });

  const qfPairings = [
    { id: 'M97', name: 'Match 97', homeM: 'M89', awayM: 'M90' },
    { id: 'M98', name: 'Match 98', homeM: 'M93', awayM: 'M94' },
    { id: 'M99', name: 'Match 99', homeM: 'M91', awayM: 'M92' },
    { id: 'M100', name: 'Match 100', homeM: 'M95', awayM: 'M96' }
  ];
  const qfMatchesData = qfPairings.map(p => {
    const homeR16 = r16MatchesData.find(x => x.id === p.homeM);
    const awayR16 = r16MatchesData.find(x => x.id === p.awayM);
    const homeProj = getMatchWinner(homeR16.id, homeR16.home, homeR16.away);
    const awayProj = getMatchWinner(awayR16.id, awayR16.home, awayR16.away);
    return getMatchDetails(p.id, homeProj, awayProj);
  });

  const sfPairings = [
    { id: 'M101', name: 'Match 101', homeM: 'M97', awayM: 'M98' },
    { id: 'M102', name: 'Match 102', homeM: 'M99', awayM: 'M100' }
  ];
  const sfMatchesData = sfPairings.map(p => {
    const homeQF = qfMatchesData.find(x => x.id === p.homeM);
    const awayQF = qfMatchesData.find(x => x.id === p.awayM);
    const homeProj = getMatchWinner(homeQF.id, homeQF.home, homeQF.away);
    const awayProj = getMatchWinner(awayQF.id, awayQF.home, awayQF.away);
    return getMatchDetails(p.id, homeProj, awayProj);
  });

  const sf1 = sfMatchesData.find(x => x.id === 'M101');
  const sf2 = sfMatchesData.find(x => x.id === 'M102');
  
  const finalHomeProj = getMatchWinner(sf1.id, sf1.home, sf1.away);
  const finalAwayProj = getMatchWinner(sf2.id, sf2.home, sf2.away);
  const finalMatchData = getMatchDetails('M104', finalHomeProj, finalAwayProj);

  const getMatchLoser = (matchId, home, away) => {
    const winner = getMatchWinner(matchId, home, away);
    return winner.code === home.code ? away : home;
  };
  const thirdHomeProj = getMatchLoser(sf1.id, sf1.home, sf1.away);
  const thirdAwayProj = getMatchLoser(sf2.id, sf2.home, sf2.away);
  const thirdMatchData = getMatchDetails('M103', thirdHomeProj, thirdAwayProj);

  const container = document.getElementById('knockout-bracket-container');
  container.innerHTML = '';

  const renderMatchCardHTML = (m) => {
    const played = m.status === 'finished';
    const homeScore = played ? m.score.home : '';
    const awayScore = played ? m.score.away : '';
    const homeWinner = played && m.score.home > m.score.away;
    const awayWinner = played && m.score.away > m.score.home;
    const detailsLabel = played ? `${m.score.home}–${m.score.away}` : (m.kickoffUK ? ukTime(m.kickoffUK) : 'Proj');

    return `
      <div class="bracket-match">
        <div class="bracket-match-header">
          <span>${m.id}</span>
          <span style="font-size: 9px; font-weight: 600;">${m.venue || ''}</span>
        </div>
        <div class="bracket-match-teams">
          <div class="bracket-match-team ${m.home.dummy ? 'dummy' : ''} ${homeWinner ? 'winner' : ''}">
            <span class="flag">${m.home.flag}</span>
            <span>${m.home.label}</span>
            <span class="code">${m.home.code}</span>
            ${played ? `<span class="score">${homeScore}</span>` : ''}
          </div>
          <div class="bracket-match-team ${m.away.dummy ? 'dummy' : ''} ${awayWinner ? 'winner' : ''}">
            <span class="flag">${m.away.flag}</span>
            <span>${m.away.label}</span>
            <span class="code">${m.away.code}</span>
            ${played ? `<span class="score">${awayScore}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  };

  const columns = [
    { title: 'Round of 32', matches: r32MatchesData },
    { title: 'Round of 16', matches: r16MatchesData },
    { title: 'Quarter-finals', matches: qfMatchesData },
    { title: 'Semi-finals', matches: sfMatchesData },
    { title: 'Final & 3rd Place', matches: [finalMatchData, thirdMatchData] }
  ];

  columns.forEach(col => {
    const colDiv = document.createElement('div');
    colDiv.className = 'bracket-column';
    colDiv.innerHTML = `<div class="bracket-column-title">${col.title}</div>`;
    col.matches.forEach(m => {
      colDiv.innerHTML += renderMatchCardHTML(m);
    });
    container.appendChild(colDiv);
  });

  const countCaption = document.getElementById('knockout-caption');
  if (knockoutView === 'bracket') {
    countCaption.textContent = 'Dynamic World Cup 2026 bracket pathway projection';
  } else {
    const currentFinishedCount = DATA.fixtures.filter(m => m.stage === 'group' && m.status === 'finished').length;
    countCaption.textContent = `${currentFinishedCount}/72 group stage matches finished`;
  }
}

function wireKnockoutToggle() {
  document.querySelectorAll('#knockoutseg button').forEach(b => {
    b.onclick = () => {
      knockoutView = b.dataset.view;
      document.querySelectorAll('#knockoutseg button').forEach(x => x.classList.toggle('active', x === b));
      document.getElementById('knockout-bracket-container').style.display = knockoutView === 'bracket' ? 'flex' : 'none';
      document.getElementById('knockout-third-place-container').hidden = knockoutView !== 'third-place';
      renderKnockouts();
    };
  });
}

function wireFantasySearch() {
  const setpieceSearch = document.getElementById('setpiece-search');
  setpieceSearch.oninput = () => {
    renderFantasyHub(setpieceSearch.value);
  };
}

boot();
