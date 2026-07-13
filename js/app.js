import { polyfillCountryFlagEmojis } from "https://cdn.jsdelivr.net/npm/country-flag-emoji-polyfill@0.1/dist/index.mjs";
polyfillCountryFlagEmojis();

import { resolveColors } from './colors.js';
import { computeGroup } from './standings.js';
import { renderChart } from './chart.js';
import { buildBracketStructure, renderBracketWheel } from './bracket-wheel.js';

let DATA = { groups:{}, fixtures:[] };
let FANTASY = { setPieces: {}, injuries: [] };
let FANTASY_PLAYERS = [];
let fantasyPlayersPageSize = 50;
let fantasyPlayersLimit = 50;
let fantasyPlayersSortField = 'totalPoints';
let fantasyPlayersSortAsc = false;
let view = 'standings';
let strengthMetric = 'group-stage';
let fixtureStatus = 'today';
let activeFilters = {
  stage: 'ALL',
  group: [],
  country: [],
  date: 'ALL'
};
let statsCountryFilter = new Set(); // codes of countries selected on the Goal Analytics filter
let compareMode = false;
let HISTORICAL = null; // past World Cup goals-per-stage data (data/historical-goals.json); null if unavailable

async function boot(){
  const [groups, fixtures, fantasy, fantasyPlayers, historical] = await Promise.all([
    fetch('data/groups.json').then(r=>r.json()),
    fetch(`data/fixtures.json?t=${Date.now()}`).then(r=>r.json()),
    fetch('data/fantasy.json').then(r=>r.json()),
    fetch('data/fantasy_players.json').then(r=>r.json()),
    fetch('data/historical-goals.json').then(r=>r.json()).catch(()=>null),
  ]);
  DATA = { groups, fixtures };
  HISTORICAL = historical;
  FANTASY = fantasy;
  FANTASY_PLAYERS = fantasyPlayers;
  loadPredictions();
  syncKnockoutFixtures();
  renderGroups(true);
  initFilters();
  applyFilters();
  renderStrength(getCurrentStage());
  renderFantasyHub();
  renderKnockouts();
  renderStats();
  initStatsFilter();
  initFantasyPlayersFilters();
  
  const resetBtn = document.getElementById('reset-predictions');
  if (resetBtn) {
    resetBtn.onclick = () => {
      PREDICTIONS = {};
      savePredictions();
      renderPredictions();
    };
  }

  const shareBtn = document.getElementById('share-predictions');
  if (shareBtn) {
    shareBtn.onclick = () => {
      const link = getShareableLink();
      navigator.clipboard.writeText(link).then(() => {
        const originalText = shareBtn.textContent;
        shareBtn.textContent = 'Link Copied! 📋';
        shareBtn.style.color = '#4ade80';
        setTimeout(() => {
          shareBtn.textContent = originalText;
          shareBtn.style.color = '';
        }, 2000);
      });
    };
  }

  wireTabs(); wireToggle(); wireStrengthToggle(); wireFixtureToggle(); wireFantasySearch(); wireKnockoutToggle(); wireFantasyPlayersEvents();
  showUpdated();
  handleRouting();

  if (window.self !== window.top) {
    document.body.classList.add('in-iframe');
    const compareBtn = document.getElementById('btn-toggle-compare');
    if (compareBtn) compareBtn.remove();
  } else {
    initCompareMode();
  }
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
    const completed = isGroupFinished(letter);
    const card = document.createElement('div');
    card.className = `group-card${completed ? ' group-completed' : ''}`;
    
    const completedBadge = completed 
      ? `<span class="group-completed-badge" style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--accent); background: var(--accent-glow); padding: 2px 8px; border-radius: 12px; border: 1px solid var(--accent-border); letter-spacing: 0.5px; white-space: nowrap;">✓ Completed</span>` 
      : '';
    const headerHtml = `
      <div class="gc-title" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span>GROUP ${letter}</span>
        ${completedBadge}
      </div>
    `;

    if (view === 'standings') {
      const sortedSeries = [...m.series].sort((a,b) => a.rank.at(-1) - b.rank.at(-1));
      const tableRows = sortedSeries.map(s => {
        const st = s.stats;
        const sign = st.gd > 0 ? '+' : '';
        const pos = s.rank.at(-1);
        let posClass = 'pos-qualify';
        if (pos === 3) posClass = 'pos-third';
        if (pos === 4) posClass = 'pos-eliminated';
        
        return `
          <tr class="${posClass}">
            <td class="col-num col-bold">${pos}</td>
            <td>
              <div class="team-cell">
                <span class="team-flag">${s.flag}</span>
                <span class="team-name" title="${s.name}">${s.name}</span>
                <span class="team-code" style="color:${s.color};">(${s.code})</span>
              </div>
            </td>
            <td class="col-num">${st.played}</td>
            <td class="col-num col-w">${st.w}</td>
            <td class="col-num col-d">${st.d}</td>
            <td class="col-num col-l">${st.l}</td>
            <td class="col-num col-gf">${st.gf}</td>
            <td class="col-num col-ga">${st.ga}</td>
            <td class="col-num">${sign}${st.gd}</td>
            <td class="col-num col-bold">${st.pts}</td>
          </tr>
        `;
      }).join('');

      card.innerHTML = `
        ${headerHtml}
        <table class="standings-table">
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">Pos</th>
              <th>Team</th>
              <th style="text-align: center; width: 25px;">P</th>
              <th style="text-align: center; width: 25px;" class="col-w">W</th>
              <th style="text-align: center; width: 25px;" class="col-d">D</th>
              <th style="text-align: center; width: 25px;" class="col-l">L</th>
              <th style="text-align: center; width: 25px;" class="col-gf">GF</th>
              <th style="text-align: center; width: 25px;" class="col-ga">GA</th>
              <th style="text-align: center; width: 35px;">GD</th>
              <th style="text-align: center; width: 30px;">Pts</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      `;
    } else {
      card.innerHTML = `${headerHtml}<svg viewBox="0 0 640 320"></svg>`;
      renderChart(card.querySelector('svg'), { ...m, view, animate });
    }
    
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
function switchTab(tabId) {
  const t = document.querySelector(`.tab[data-tab="${tabId}"]`);
  if (!t) return;
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===t));
  t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  
  if (compareMode) {
    return;
  }

  const updateDOM = () => {
    document.getElementById('groups-view').hidden   = tabId!=='groups';
    document.getElementById('fixtures-view').hidden = tabId!=='fixtures';
    document.getElementById('strength-view').hidden = tabId!=='strength';
    document.getElementById('fantasy-view').hidden  = tabId!=='fantasy';
    document.getElementById('fantasy-players-view').hidden = tabId!=='fantasy-players';
    document.getElementById('knockout-view').hidden = tabId!=='knockout';
    
    const predictionsView = document.getElementById('predictions-view');
    if (predictionsView) predictionsView.hidden = tabId!=='predictions';
    
    const wheelView = document.getElementById('wheel-view');
    if (wheelView) wheelView.hidden = tabId!=='wheel';
    const statsView = document.getElementById('stats-view');
    if (statsView) statsView.hidden = tabId!=='stats';
  };

  const postDOMUpdate = () => {
    if (tabId === 'knockout') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          drawBracketLines();
        });
      });
    }
    if (tabId === 'predictions') {
      renderPredictions();
    }
    if (tabId === 'wheel') {
      // Re-render so the draw-in animation replays each time the tab opens.
      requestAnimationFrame(() => renderWheel());
    }
    if (tabId === 'fantasy-players') {
      renderFantasyPlayers();
    }
  };

  if (document.startViewTransition) {
    const transition = document.startViewTransition(() => updateDOM());
    transition.updateCallbackDone.then(() => {
      postDOMUpdate();
    });
  } else {
    updateDOM();
    postDOMUpdate();
  }
}

function handleRouting() {
  let fullHash = window.location.hash.replace('#/', '').replace('#', '');
  const [tabId] = fullHash.split('?');
  const validTabs = ['fixtures', 'strength', 'fantasy-players', 'knockout', 'wheel', 'stats'];
  const defaultTab = 'fixtures';
  
  if (!tabId || !validTabs.includes(tabId)) {
    window.location.hash = '#/' + defaultTab;
    return;
  }
  
  switchTab(tabId);
}

function wireTabs(){
  document.querySelectorAll('.tab').forEach(t=>{
    t.onclick = () => {
      window.location.hash = '#/' + t.dataset.tab;
    };
  });
  window.addEventListener('hashchange', handleRouting);
}



// ── Sync all knockout fixtures into DATA.fixtures so the Fixtures page shows them ──
function syncKnockoutFixtures() {
  // All knockout match IDs across every stage
  const ALL_KO_IDS = [
    // R32
    'M73','M74','M75','M76','M77','M78','M79','M80',
    'M81','M82','M83','M84','M85','M86','M87','M88',
    // R16
    'M89','M90','M91','M92','M93','M94','M95','M96',
    // QF
    'M97','M98','M99','M100',
    // SF
    'M101','M102',
    // Final & 3rd place
    'M103','M104'
  ];

  const STAGE_MAP = {
    M73:'round of 32', M74:'round of 32', M75:'round of 32', M76:'round of 32',
    M77:'round of 32', M78:'round of 32', M79:'round of 32', M80:'round of 32',
    M81:'round of 32', M82:'round of 32', M83:'round of 32', M84:'round of 32',
    M85:'round of 32', M86:'round of 32', M87:'round of 32', M88:'round of 32',
    M89:'round of 16', M90:'round of 16', M91:'round of 16', M92:'round of 16',
    M93:'round of 16', M94:'round of 16', M95:'round of 16', M96:'round of 16',
    M97:'quarter-finals', M98:'quarter-finals', M99:'quarter-finals', M100:'quarter-finals',
    M101:'semi-finals', M102:'semi-finals',
    M103:'third-place match', M104:'final'
  };

  // Get full projected data for all stages
  const allStages = ['r32','r16','qf','sf','final'];
  const allMatches = [];
  try {
    for (const s of allStages) {
      const matches = getKnockoutRoundMatchesData(s);
      allMatches.push(...matches);
    }
  } catch(e) { return; } // guard: group data not yet ready

  for (const km of allMatches) {
    if (!km || !km.id) continue;
    const existing = DATA.fixtures.findIndex(f => f.id === km.id);
    const sched = KNOCKOUT_SCHEDULE[km.id] || {};

    const record = {
      id: km.id,
      stage: STAGE_MAP[km.id] || 'knockout',
      dateUK: km.dateUK || (sched.kickoffUK ? sched.kickoffUK.split('T')[0] : ''),
      kickoffUK: km.kickoffUK || sched.kickoffUK || '',
      venue: km.venue || sched.venue || '',
      home: km.home?.code || km.home?.label || '?',
      away: km.away?.code || km.away?.label || '?',
      status: km.status || 'scheduled',
      score: km.score || { home: null, away: null },
      _homeLabel: km.home?.label,
      _awayLabel: km.away?.label,
      _homeFlag: km.home?.flag,
      _awayFlag: km.away?.flag,
      _dummy: km.home?.dummy || km.away?.dummy
    };

    if (existing >= 0) {
      // Preserve real finished data; only update projection fields if not finished
      if (DATA.fixtures[existing].status !== 'finished') {
        DATA.fixtures[existing] = { ...DATA.fixtures[existing], ...record };
      }
    } else {
      DATA.fixtures.push(record);
    }
  }
}


function getKnockoutRoundMatchesData(metric) {
  const thirds = getThirdPlaceStandings();
  const qualifiedThirds = thirds.slice(0, 8);
  const qualifiedGroups = qualifiedThirds.map(t => t.group).sort();
  const assignments = solveThirdPlaceMatchups(qualifiedGroups);

  // R32
  const r32 = [
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
  if (metric === 'r32') {
    const r32Order = ['M74', 'M77', 'M73', 'M75', 'M83', 'M84', 'M81', 'M82', 'M76', 'M78', 'M79', 'M80', 'M86', 'M88', 'M85', 'M87'];
    return r32Order.map(id => r32.find(x => x.id === id));
  }

  // R16
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
  const r16 = r16Pairings.map(p => {
    const homeR32 = r32.find(x => x.id === p.homeM);
    const awayR32 = r32.find(x => x.id === p.awayM);
    const homeProj = getMatchWinner(homeR32.id, homeR32.home, homeR32.away);
    const awayProj = getMatchWinner(awayR32.id, awayR32.home, awayR32.away);
    return getMatchDetails(p.id, homeProj, awayProj);
  });
  if (metric === 'r16') {
    const r16Order = ['M89', 'M90', 'M93', 'M94', 'M91', 'M92', 'M95', 'M96'];
    return r16Order.map(id => r16.find(x => x.id === id));
  }

  // QF
  const qfPairings = [
    { id: 'M97', name: 'Match 97', homeM: 'M89', awayM: 'M90' },
    { id: 'M98', name: 'Match 98', homeM: 'M93', awayM: 'M94' },
    { id: 'M99', name: 'Match 99', homeM: 'M91', awayM: 'M92' },
    { id: 'M100', name: 'Match 100', homeM: 'M95', awayM: 'M96' }
  ];
  const qf = qfPairings.map(p => {
    const homeR16 = r16.find(x => x.id === p.homeM);
    const awayR16 = r16.find(x => x.id === p.awayM);
    const homeProj = getMatchWinner(homeR16.id, homeR16.home, homeR16.away);
    const awayProj = getMatchWinner(awayR16.id, awayR16.home, awayR16.away);
    return getMatchDetails(p.id, homeProj, awayProj);
  });
  if (metric === 'qf') {
    const qfOrder = ['M97', 'M98', 'M99', 'M100'];
    return qfOrder.map(id => qf.find(x => x.id === id));
  }

  // SF
  const sfPairings = [
    { id: 'M101', name: 'Match 101', homeM: 'M97', awayM: 'M98' },
    { id: 'M102', name: 'Match 102', homeM: 'M99', awayM: 'M100' }
  ];
  const sf = sfPairings.map(p => {
    const homeQF = qf.find(x => x.id === p.homeM);
    const awayQF = qf.find(x => x.id === p.awayM);
    const homeProj = getMatchWinner(homeQF.id, homeQF.home, homeQF.away);
    const awayProj = getMatchWinner(awayQF.id, awayQF.home, awayQF.away);
    return getMatchDetails(p.id, homeProj, awayProj);
  });
  if (metric === 'sf') {
    const sfOrder = ['M101', 'M102'];
    return sfOrder.map(id => sf.find(x => x.id === id));
  }

  // Final & 3rd place
  const sf1 = sf.find(x => x.id === 'M101');
  const sf2 = sf.find(x => x.id === 'M102');
  
  const finalHomeProj = getMatchWinner(sf1.id, sf1.home, sf1.away);
  const finalAwayProj = getMatchWinner(sf2.id, sf2.home, sf2.away);
  const finalMatchData = getMatchDetails('M104', finalHomeProj, finalAwayProj);

  const getMatchLoser = (matchId, home, away) => {
    const f = DATA.fixtures.find(m => m.id === matchId);
    if (f && f.status === 'finished') {
      const winner = getMatchWinner(matchId, home, away);
      return winner.code === home.code ? away : home;
    }
    return {
      label: `Loser Match ${matchId.replace('M', '')}`,
      flag: '🏳️',
      code: `L${matchId.replace('M', '')}`,
      dummy: true,
      fifaPoints: 0
    };
  };
  const thirdHomeProj = getMatchLoser(sf1.id, sf1.home, sf1.away);
  const thirdAwayProj = getMatchLoser(sf2.id, sf2.home, sf2.away);
  const thirdMatchData = getMatchDetails('M103', thirdHomeProj, thirdAwayProj);

  if (metric === 'final') return [finalMatchData, thirdMatchData];

  return [];
}

function renderStrength(metric){
  const list = document.getElementById('strength-list'); list.innerHTML='';
  const caption = document.getElementById('strength-caption');

  if (metric === 'group-stage') {
    caption.textContent = 'Sum of FIFA ranking positions — higher = weaker group';
    
    const rows = Object.entries(DATA.groups).map(([letter, teams])=>{
      const sum = teams.reduce((acc,t)=> acc + (t.fifaRankUpdated || t.fifaRank), 0);
      return { letter, sum, teams };
    });
    
    rows.sort((a,b)=>b.sum - a.sum);
    const sums = rows.map(r=>r.sum);
    const minS = Math.min(...sums), maxS = Math.max(...sums);

    rows.forEach((row, idx)=>{
      const frac = maxS===minS ? 1 : 0.18 + 0.82*((row.sum - minS)/(maxS - minS));
      let badge = '';
      if(idx===0) badge = '🍃 Weakest';
      else if(idx===rows.length-1) badge = '🔥 Group of Death';
      
      const sorted = [...row.teams].sort((a,b)=>
        (a.fifaRankUpdated || a.fifaRank) - (b.fifaRankUpdated || b.fifaRank)
      );
      const teamsHtml = sorted.map(t=>{
        const val = `#${t.fifaRankUpdated || t.fifaRank}`;
        return `<span class="str-chip"><span class="str-flag">${t.flag}</span><span class="str-code">${t.code}</span><span class="str-val">${val}</span></span>`;
      }).join('');
      const badgeHtml = badge ? `<span class="str-badge">${badge}</span>` : '';
      const el = document.createElement('div'); el.className='str-row';
      el.innerHTML =
        `<div class="str-head"><span class="str-rank">${idx+1}</span><span class="str-title">GROUP ${row.letter}</span>${badgeHtml}<span class="str-sum">${row.sum}</span></div>`+
        `<div class="str-bar-wrap"><div class="str-bar-fill" style="width:${(frac*100).toFixed(1)}%"></div></div>`+
        `<div class="str-teams">${teamsHtml}</div>`;
      list.appendChild(el);
    });
  } else {
    const roundNames = {
      'r32': 'Round of 32',
      'r16': 'Round of 16',
      'qf': 'Quarter-finals',
      'sf': 'Semi-finals',
      'final': 'Finals'
    };
    const roundName = roundNames[metric] || 'Knockout Stage';
    caption.textContent = `Strength matchup comparison for the ${roundName} by FIFA Ranking (Positions)`;

    const matches = getKnockoutRoundMatchesData(metric);

    if (matches.length === 0) {
      list.innerHTML = `<div class="no-fixtures"><div class="no-fixtures-title">No fixtures available yet</div><div class="no-fixtures-desc">Knockout rounds will populate as group results are finalised.</div></div>`;
      return;
    }

    matches.forEach(m => {
      const homeReal = !m.home.dummy ? findTeamByCode(m.home.code) : null;
      const awayReal = !m.away.dummy ? findTeamByCode(m.away.code) : null;

      const homeRank = homeReal ? (homeReal.fifaRankUpdated || homeReal.fifaRank) : null;
      const awayRank = awayReal ? (awayReal.fifaRankUpdated || awayReal.fifaRank) : null;

      const homeRankText = homeRank ? `Rank #${homeRank}` : 'n/a';
      const awayRankText = awayRank ? `Rank #${awayRank}` : 'n/a';

      let diffBadge = '';
      if (homeRank && awayRank) {
        const diff = Math.abs(homeRank - awayRank);
        diffBadge = `<span class="str-badge">${diff === 0 ? 'Equal Ranks' : `Diff: ${diff} ranks`}</span>`;
      } else {
        diffBadge = `<span class="str-badge" style="opacity: 0.6;">TBD</span>`;
      }

      const el = document.createElement('div'); el.className = 'str-row';
      el.innerHTML = `
        <div class="str-head">
          <span class="str-rank">${m.id}</span>
          <span class="str-title">${m.home.label} vs ${m.away.label}</span>
          ${diffBadge}
          <span class="str-sum">${m.status === 'finished' ? `${m.score.home} - ${m.score.away}` : roundName}</span>
        </div>
        <div class="str-teams" style="margin-top: 4px;">
          <span class="str-chip" style="${homeRank && awayRank && homeRank < awayRank ? 'border-color: var(--accent);' : ''}">
            <span class="str-flag">${m.home.flag}</span>
            <span class="str-code">${m.home.code}</span>
            <span class="str-val">${homeRankText}</span>
          </span>
          <span style="color: var(--muted); font-size: 11px; align-self: center; font-weight: 600;">VS</span>
          <span class="str-chip" style="${homeRank && awayRank && awayRank < homeRank ? 'border-color: var(--accent);' : ''}">
            <span class="str-flag">${m.away.flag}</span>
            <span class="str-code">${m.away.code}</span>
            <span class="str-val">${awayRankText}</span>
          </span>
        </div>
      `;
      list.appendChild(el);
    });
  }
}

function getCurrentStage() {
  // Returns the metric key for the most advanced active/ongoing stage.
  // Priority: any live match wins; else the most recent stage with ≥1 finished match;
  // else fall back to group-stage.
  const now = Date.now();

  const STAGE_ORDER = [
    { metric: 'final',        stages: ['final', 'third-place match'] },
    { metric: 'sf',           stages: ['semi-finals'] },
    { metric: 'qf',           stages: ['quarter-finals'] },
    { metric: 'r16',          stages: ['round of 16'] },
    { metric: 'r32',          stages: ['round of 32'] },
    { metric: 'group-stage',  stages: ['group'] },
  ];

  // 1. Detect a currently LIVE match (kicked off within last 130 mins, not finished)
  for (const { metric, stages } of STAGE_ORDER) {
    const isLive = DATA.fixtures.some(f => {
      if (!stages.includes(f.stage)) return false;
      if (f.status === 'finished') return false;
      const ko = f.kickoffUK ? new Date(f.kickoffUK).getTime() : null;
      if (!ko) return false;
      const elapsed = now - ko;
      return elapsed > 0 && elapsed < 130 * 60 * 1000;
    });
    if (isLive) return metric;
  }

  // 2. Most advanced stage with at least one scheduled/upcoming fixture
  //    (i.e., the stage we're currently in but between matches)
  for (const { metric, stages } of STAGE_ORDER) {
    const hasScheduled = DATA.fixtures.some(f =>
      stages.includes(f.stage) && f.status === 'scheduled'
    );
    const hasFinished = DATA.fixtures.some(f =>
      stages.includes(f.stage) && f.status === 'finished'
    );
    if (hasScheduled || hasFinished) return metric;
  }

  return 'group-stage';
}

function wireStrengthToggle(){
  const currentMetric = getCurrentStage();
  strengthMetric = currentMetric;

  document.querySelectorAll('#strengthseg button').forEach(b => {
    // Activate the button matching the live stage
    b.classList.toggle('active', b.dataset.metric === currentMetric);
    b.onclick = () => {
      strengthMetric = b.dataset.metric;
      document.querySelectorAll('#strengthseg button').forEach(x => x.classList.toggle('active', x === b));
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
      
      // Auto-focus search input if it exists, and clear search query on open
      if (options.classList.contains('open')) {
        const searchInput = options.querySelector('.dropdown-search-input');
        if (searchInput) {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input'));
          setTimeout(() => searchInput.focus(), 50);
        }
      }
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
  const groupOptions = document.getElementById('group-options-wrapper');
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
  const countryOptions = document.getElementById('country-options-wrapper');
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

  // Search filter functionality for country dropdown
  const countrySearch = document.getElementById('country-search-input');
  if (countrySearch) {
    countrySearch.oninput = () => {
      const query = countrySearch.value.toLowerCase().trim();
      const optionsWrapper = document.getElementById('country-options-wrapper');
      const items = optionsWrapper.querySelectorAll('.custom-option');
      items.forEach(item => {
        const text = item.querySelector('span').textContent.toLowerCase();
        item.style.display = text.includes(query) ? '' : 'none';
      });
    };
  }

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

  // Reset search box query if exists
  const countrySearch = document.getElementById('country-search-input');
  if (countrySearch) {
    countrySearch.value = '';
    countrySearch.dispatchEvent(new Event('input'));
  }

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

  const isResultsView = fixtureStatus === 'results';

  const byDate = {};
  for(const f of fixturesToRender){ (byDate[f.dateUK] ??= []).push(f); }
  const sortedDates = Object.keys(byDate).sort((a,b) => isResultsView ? b.localeCompare(a) : a.localeCompare(b));
  for(const date of sortedDates){
    const h = document.createElement('div'); h.className='fx-date';
    h.textContent = new Date(date).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/London'});
    wrap.appendChild(h);
    const dayFixtures = byDate[date].sort((a,b) => isResultsView ? b.kickoffUK.localeCompare(a.kickoffUK) : a.kickoffUK.localeCompare(b.kickoffUK));
    for(const f of dayFixtures){
      const played = f.status==='finished';
      const isLive = !played && (() => {
        const ko = f.kickoffUK ? new Date(f.kickoffUK).getTime() : null;
        if (!ko) return false;
        const elapsed = Date.now() - ko;
        return elapsed > 0 && elapsed < 130 * 60 * 1000;
      })();
      const score = played ? `${f.score.home}–${f.score.away}` : isLive ? '🟢 LIVE' : ukTime(f.kickoffUK);

      // For knockout projected teams, use stored label+flag if code is a placeholder
      const homeName = f._homeLabel || f.home;
      const awayName = f._awayLabel || f.away;
      const homeFlag = f._homeFlag || (f._dummy ? '' : flagOf(f.home));
      const awayFlag = f._awayFlag || (f._dummy ? '' : flagOf(f.away));
      const homeIsReal = !f._dummy && flagOf(f.home) !== '🏳️';
      const awayIsReal = !f._dummy && flagOf(f.away) !== '🏳️';

      // Stage pill for knockout rounds
      const stageLabels = {
        'round of 32': 'R32', 'round of 16': 'R16',
        'quarter-finals': 'QF', 'semi-finals': 'SF',
        'final': 'Final', 'third-place match': '3rd'
      };
      const stagePill = f.stage !== 'group' && stageLabels[f.stage]
        ? `<span class="fx-stage-pill">${stageLabels[f.stage]}</span>` : '';

      const row = document.createElement('div');
      row.className = `fx-row${isLive ? ' fx-row-live' : ''}`;
      row.innerHTML =
        `<span class="time">${ukTime(f.kickoffUK)}</span>`+
        `<span class="home">${homeName} <span class="flag">${homeFlag}</span></span>`+
        `<span class="score${isLive ? ' score-live' : ''}">${score}</span>`+
        `<span class="away"><span class="flag">${awayFlag}</span> ${awayName}</span>`+
        stagePill;
      wrap.appendChild(row);
    }
  }
}

function getEliminatedTeams() {
  // Returns a Set of team codes that have been knocked out
  const eliminated = new Set();

  // Knockout match IDs (R32 through SF — Final losers get medals, not eliminated for our purposes)
  const knockoutStages = ['round of 32', 'round of 16', 'quarter-finals', 'semi-finals'];

  const knockoutMatches = DATA.fixtures.filter(f =>
    knockoutStages.includes(f.stage) && f.status === 'finished' && f.score
  );

  knockoutMatches.forEach(f => {
    if (f.winner) {
      const loser = f.winner === f.home ? f.away : f.home;
      if (loser) eliminated.add(loser);
    } else {
      const hg = f.score.home ?? 0;
      const ag = f.score.away ?? 0;
      // The loser is eliminated (scores should never be equal in knockout — extra time decides)
      if (hg > ag) eliminated.add(f.away);
      else if (ag > hg) eliminated.add(f.home);
    }
  });

  // Also eliminate teams that didn't qualify from the group stage
  // (only relevant once all group stage matches are finished)
  const groupFinished = Object.keys(DATA.groups).every(letter => {
    const matches = DATA.fixtures.filter(m => m.stage === 'group' && m.group === letter);
    return matches.length === 6 && matches.every(m => m.status === 'finished');
  });

  if (groupFinished) {
    const thirds = getThirdPlaceStandings();
    const qualifiedThirdCodes = new Set(thirds.slice(0, 8).map(t => t.code));

    for (const letter of Object.keys(DATA.groups)) {
      const sorted = getSortedGroupTeams(letter);
      // 4th place is always out
      if (sorted[3]) eliminated.add(sorted[3].code);
      // 3rd place is out if not in the top-8 thirds
      if (sorted[2] && !qualifiedThirdCodes.has(sorted[2].code)) {
        eliminated.add(sorted[2].code);
      }
    }
  }

  return eliminated;
}

// ── Bracket Wheel ─────────────────────────────────────────────────────────────
// Decorate the static knockout structure with live team/winner data so the
// radial wheel can render it. Reuses the same projection helpers as the linear
// bracket, so both views always agree.
function buildBracketTree() {
  // Resolved matchups for every round (teams + status + score), indexed by id.
  const byId = {};
  ['r32', 'r16', 'qf', 'sf'].forEach(metric => {
    getKnockoutRoundMatchesData(metric).forEach(m => { if (m) byId[m.id] = m; });
  });
  const finalData = getKnockoutRoundMatchesData('final')[0]; // [final, 3rd-place]
  if (finalData) byId[finalData.id] = finalData;

  const eliminated = getEliminatedTeams();

  const winnerOf = (m) => {
    if (!m || m.status !== 'finished' || !m.score) return null;
    const sh = m.score.home ?? 0, sa = m.score.away ?? 0;
    if (sh > sa) return m.home;
    if (sa > sh) return m.away;
    // Draw in regular time — check fixture's explicit winner (penalties / ET)
    const f = DATA.fixtures.find(fx => fx.id === m.id);
    if (f && f.winner) {
      if (m.home && m.home.code === f.winner) return m.home;
      if (m.away && m.away.code === f.winner) return m.away;
    }
    return (m.home.fifaPoints ?? 0) >= (m.away.fifaPoints ?? 0) ? m.home : m.away;
  };

  // parentWinnerCode = code of the team that won this node's *parent* match,
  // used to light the spoke for the team that advanced.
  const decorate = (s, parentWinnerCode) => {
    const m = byId[s.id];
    const winner = winnerOf(m);
    const decided = !!(m && m.status === 'finished');
    const advanced = !!(winner && parentWinnerCode && winner.code === parentWinnerCode);

    if (s.round === 'r32') {
      const teams = m ? [m.home, m.away] : [null, null];
      const children = s.children.map((leaf, i) => {
        const team = teams[i] || { label: 'TBD', code: '?', flag: '🏳️', dummy: true };
        return {
          id: leaf.id, round: 'team', team, children: [],
          eliminated: !team.dummy && eliminated.has(team.code),
          advanced: !!(winner && winner.code === team.code), // won this R32 tie
        };
      });
      return { id: s.id, round: 'r32', team: winner, decided, advanced, children, match: m };
    }

    const children = s.children.map(c => decorate(c, winner ? winner.code : null));
    return { id: s.id, round: s.round, team: winner, decided, advanced, children, match: m };
  };

  return decorate(buildBracketStructure(), null);
}

function renderWheel() {
  const container = document.getElementById('wheel-canvas');
  const caption = document.getElementById('wheel-caption');
  if (!container) return;
  let tree;
  try {
    tree = buildBracketTree();
  } catch (e) {
    return; // group data not ready yet
  }
  renderBracketWheel(tree, { container, caption });
  
  const svg = container.querySelector('.wheel-svg');
  if (svg) {
    svg.classList.add('anim-hologram');
  }
}

function renderFantasyHub(setpieceFilter = '') {
  const setpiecesList = document.getElementById('setpiece-list');
  setpiecesList.innerHTML = '';

  const eliminated = getEliminatedTeams();

  const allTeams = [];
  for (const groupTeams of Object.values(DATA.groups)) {
    allTeams.push(...groupTeams);
  }
  allTeams.sort((a, b) => a.name.localeCompare(b.name));

  // Split into active vs eliminated
  const activeTeams = allTeams.filter(t => !eliminated.has(t.code));
  const eliminatedCount = allTeams.length - activeTeams.length;

  const filteredTeams = activeTeams.filter(t => {
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

  // Show eliminated count as a subtle footer note
  const wrap = setpiecesList.closest('.setpiece-table-wrap');
  const existing = wrap?.querySelector('.elim-note');
  if (existing) existing.remove();
  if (eliminatedCount > 0 && wrap) {
    const note = document.createElement('div');
    note.className = 'elim-note';
    note.textContent = `${eliminatedCount} eliminated team${eliminatedCount > 1 ? 's' : ''} hidden`;
    wrap.appendChild(note);
  }
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
  // If the qualified groups are exactly B, D, E, F, I, J, K, L, return the official FIFA assignment 
  // that maps Group F (Sweden) to Group I (France) and Group D (Paraguay) to Group E (Germany).
  const qualifiedStr = [...qualifiedGroups].sort().join(',');
  if (qualifiedStr === 'B,D,E,F,I,J,K,L') {
    return { E: 'D', I: 'F', A: 'E', L: 'K', D: 'B', G: 'I', B: 'J', K: 'L' };
  }

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

function isGroupFinished(groupLetter) {
  const groupMatches = DATA.fixtures.filter(m => m.stage === 'group' && m.group === groupLetter);
  return groupMatches.length === 6 && groupMatches.every(m => m.status === 'finished');
}

function isGroupStageFinished() {
  const groupMatches = DATA.fixtures.filter(m => m.stage === 'group');
  return groupMatches.length === 72 && groupMatches.every(m => m.status === 'finished');
}

function getTeamBySlot(slot, assignments) {
  const rankNum = parseInt(slot[0]);
  const groupLetter = slot[1];
  
  if (rankNum === 3) {
    const isStageFinal = isGroupStageFinished();
    if (isStageFinal) {
      const assignedGroup = assignments[groupLetter];
      const sorted = getSortedGroupTeams(assignedGroup);
      const team = sorted[2]; // 3rd place team (index 2)
      return {
        label: team.name,
        flag: team.flag,
        code: team.code,
        dummy: false,
        fifaPoints: team.fifaPoints
      };
    } else {
      const optionsMap = {
        'E': 'A/B/C/D/F',
        'I': 'C/D/F/G/H',
        'A': 'C/E/F/H/I',
        'L': 'E/H/I/J/K',
        'D': 'B/E/F/I/J',
        'G': 'A/E/H/I/J',
        'B': 'E/F/G/I/J',
        'K': 'D/E/I/J/L'
      };
      const opts = optionsMap[groupLetter] || '';
      return {
        label: `3rd Group ${opts}`,
        flag: '🏳️',
        code: `3rd ${groupLetter}`,
        dummy: true,
        fifaPoints: 0
      };
    }
  }

  const isFinal = isGroupFinished(groupLetter);
  if (isFinal) {
    const sorted = getSortedGroupTeams(groupLetter);
    const team = sorted[rankNum - 1];
    return {
      label: team.name,
      flag: team.flag,
      code: team.code,
      dummy: false,
      fifaPoints: team.fifaPoints
    };
  } else {
    return {
      label: `${rankNum === 1 ? 'Winner' : 'Runner-up'} Group ${groupLetter}`,
      flag: '🏳️',
      code: `${rankNum}${groupLetter}`,
      dummy: true,
      fifaPoints: 0
    };
  }
}

function getMatchWinner(matchId, homeTeam, awayTeam) {
  const f = DATA.fixtures.find(m => m.id === matchId);
  if (f && f.status === 'finished') {
    if (f.winner) {
      if (homeTeam && homeTeam.code === f.winner) return homeTeam;
      if (awayTeam && awayTeam.code === f.winner) return awayTeam;
    }
    if (f.score.home > f.score.away) return homeTeam;
    if (f.score.home < f.score.away) return awayTeam;
    return homeTeam.fifaPoints >= awayTeam.fifaPoints ? homeTeam : awayTeam;
  }

  return {
    label: `Winner Match ${matchId.replace('M', '')}`,
    flag: '🏳️',
    code: `W${matchId.replace('M', '')}`,
    dummy: true,
    fifaPoints: 0
  };
}

let PREDICTIONS = {};

function loadPredictions() {
  try {
    const saved = localStorage.getItem('world_cup_2026_predictions');
    if (saved) {
      PREDICTIONS = JSON.parse(saved);
    }
    loadPredictionsFromUrl();
  } catch (e) {
    console.error('Error loading predictions', e);
  }
}

function savePredictions() {
  try {
    localStorage.setItem('world_cup_2026_predictions', JSON.stringify(PREDICTIONS));
  } catch (e) {
    console.error('Error saving predictions', e);
  }
}

function getPredictedMatchWinner(matchId, homeTeam, awayTeam) {
  const predictedCode = PREDICTIONS[matchId];
  if (predictedCode) {
    if (homeTeam && homeTeam.code === predictedCode) return homeTeam;
    if (awayTeam && awayTeam.code === predictedCode) return awayTeam;
    delete PREDICTIONS[matchId];
    savePredictions();
  }

  const f = DATA.fixtures.find(m => m.id === matchId);
  if (f && f.status === 'finished') {
    if (f.winner) {
      if (homeTeam && homeTeam.code === f.winner) return homeTeam;
      if (awayTeam && awayTeam.code === f.winner) return awayTeam;
    }
    if (f.score.home > f.score.away) return homeTeam;
    if (f.score.home < f.score.away) return awayTeam;
    return homeTeam.fifaPoints >= awayTeam.fifaPoints ? homeTeam : awayTeam;
  }

  return {
    label: `Winner Match ${matchId.replace('M', '')}`,
    flag: '🏳️',
    code: `W${matchId.replace('M', '')}`,
    dummy: true,
    fifaPoints: 0
  };
}

function getPredictedMatchLoser(matchId, homeTeam, awayTeam) {
  const predictedCode = PREDICTIONS[matchId];
  if (predictedCode) {
    if (homeTeam && homeTeam.code === predictedCode) return awayTeam;
    if (awayTeam && awayTeam.code === predictedCode) return homeTeam;
  }

  const f = DATA.fixtures.find(m => m.id === matchId);
  if (f && f.status === 'finished') {
    const winner = getPredictedMatchWinner(matchId, homeTeam, awayTeam);
    return winner.code === homeTeam.code ? awayTeam : homeTeam;
  }

  return {
    label: `Loser Match ${matchId.replace('M', '')}`,
    flag: '🏳️',
    code: `L${matchId.replace('M', '')}`,
    dummy: true,
    fifaPoints: 0
  };
}

const KNOCKOUT_SCHEDULE = {
  // Round of 32
  M73: { kickoffUK: '2026-06-28T20:00:00+01:00', venue: 'SoFi Stadium, Los Angeles' },
  M74: { kickoffUK: '2026-06-29T21:30:00+01:00', venue: 'Gillette Stadium, Foxborough' },
  M75: { kickoffUK: '2026-06-29T18:00:00+01:00', venue: 'Estadio BBVA, Monterrey' },
  M76: { kickoffUK: '2026-06-29T18:00:00+01:00', venue: 'NRG Stadium, Houston' },
  M77: { kickoffUK: '2026-06-30T22:00:00+01:00', venue: 'MetLife Stadium, East Rutherford' },
  M78: { kickoffUK: '2026-06-30T18:00:00+01:00', venue: 'AT&T Stadium, Arlington' },
  M79: { kickoffUK: '2026-07-01T02:00:00+01:00', venue: 'Estadio Azteca, Mexico City' },
  M80: { kickoffUK: '2026-07-01T17:00:00+01:00', venue: 'Mercedes-Benz Stadium, Atlanta' },
  M81: { kickoffUK: '2026-07-02T01:00:00+01:00', venue: 'Levi\'s Stadium, Santa Clara' },
  M82: { kickoffUK: '2026-07-01T21:00:00+01:00', venue: 'Lumen Field, Seattle' },
  M83: { kickoffUK: '2026-07-03T00:00:00+01:00', venue: 'BMO Field, Toronto' },
  M84: { kickoffUK: '2026-07-02T20:00:00+01:00', venue: 'SoFi Stadium, Los Angeles' },
  M85: { kickoffUK: '2026-07-03T04:00:00+01:00', venue: 'BC Place, Vancouver' },
  M86: { kickoffUK: '2026-07-03T23:00:00+01:00', venue: 'Hard Rock Stadium, Miami' },
  M87: { kickoffUK: '2026-07-04T02:30:00+01:00', venue: 'Arrowhead Stadium, Kansas City' },
  M88: { kickoffUK: '2026-07-03T19:00:00+01:00', venue: 'AT&T Stadium, Arlington' },

  // Round of 16
  M89: { kickoffUK: '2026-07-04T22:00:00+01:00', venue: 'Lincoln Financial Field, Philadelphia' },
  M90: { kickoffUK: '2026-07-04T18:00:00+01:00', venue: 'NRG Stadium, Houston' },
  M91: { kickoffUK: '2026-07-05T21:00:00+01:00', venue: 'MetLife Stadium, East Rutherford' },
  M92: { kickoffUK: '2026-07-06T01:00:00+01:00', venue: 'Estadio Azteca, Mexico City' },
  M93: { kickoffUK: '2026-07-06T20:00:00+01:00', venue: 'AT&T Stadium, Arlington' },
  M94: { kickoffUK: '2026-07-07T01:00:00+01:00', venue: 'Lumen Field, Seattle' },
  M95: { kickoffUK: '2026-07-07T17:00:00+01:00', venue: 'Mercedes-Benz Stadium, Atlanta' },
  M96: { kickoffUK: '2026-07-07T21:00:00+01:00', venue: 'BC Place, Vancouver' },

  // Quarter-finals
  M97: { kickoffUK: '2026-07-09T21:00:00+01:00', venue: 'Gillette Stadium, Foxborough' },
  M98: { kickoffUK: '2026-07-10T20:00:00+01:00', venue: 'SoFi Stadium, Los Angeles' },
  M99: { kickoffUK: '2026-07-11T22:00:00+01:00', venue: 'Hard Rock Stadium, Miami' },
  M100: { kickoffUK: '2026-07-12T02:00:00+01:00', venue: 'Arrowhead Stadium, Kansas City' },

  // Semi-finals
  M101: { kickoffUK: '2026-07-14T20:00:00+01:00', venue: 'AT&T Stadium, Arlington' },
  M102: { kickoffUK: '2026-07-15T20:00:00+01:00', venue: 'Mercedes-Benz Stadium, Atlanta' },

  // Final & 3rd Place
  M103: { kickoffUK: '2026-07-18T22:00:00+01:00', venue: 'Hard Rock Stadium, Miami' },
  M104: { kickoffUK: '2026-07-19T20:00:00+01:00', venue: 'MetLife Stadium, East Rutherford' }
};

function getMatchDetails(matchId, projectedHome, projectedAway) {
  const f = DATA.fixtures.find(m => m.id === matchId);
  const sched = KNOCKOUT_SCHEDULE[matchId] || { kickoffUK: '', venue: '' };

  if (f) {
    const homeTeamInfo = f.home ? findTeamByCode(f.home) : null;
    const awayTeamInfo = f.away ? findTeamByCode(f.away) : null;

    return {
      id: f.id,
      home: homeTeamInfo ? { label: homeTeamInfo.name, flag: homeTeamInfo.flag, code: homeTeamInfo.code, dummy: false, fifaPoints: homeTeamInfo.fifaPoints } : projectedHome,
      away: awayTeamInfo ? { label: awayTeamInfo.name, flag: awayTeamInfo.flag, code: awayTeamInfo.code, dummy: false, fifaPoints: awayTeamInfo.fifaPoints } : projectedAway,
      status: f.status,
      score: f.score,
      venue: f.venue || sched.venue,
      dateUK: f.dateUK || (sched.kickoffUK ? sched.kickoffUK.split('T')[0] : ''),
      kickoffUK: f.kickoffUK || sched.kickoffUK
    };
  }
  
  return {
    id: matchId,
    home: projectedHome,
    away: projectedAway,
    status: 'scheduled',
    score: { home: null, away: null },
    venue: sched.venue,
    dateUK: sched.kickoffUK ? sched.kickoffUK.split('T')[0] : '',
    kickoffUK: sched.kickoffUK
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
    const f = DATA.fixtures.find(m => m.id === matchId);
    if (f && f.status === 'finished') {
      const winner = getMatchWinner(matchId, home, away);
      return winner.code === home.code ? away : home;
    }
    return {
      label: `Loser Match ${matchId.replace('M', '')}`,
      flag: '🏳️',
      code: `L${matchId.replace('M', '')}`,
      dummy: true,
      fifaPoints: 0
    };
  };
  const thirdHomeProj = getMatchLoser(sf1.id, sf1.home, sf1.away);
  const thirdAwayProj = getMatchLoser(sf2.id, sf2.home, sf2.away);
  const thirdMatchData = getMatchDetails('M103', thirdHomeProj, thirdAwayProj);

  const container = document.getElementById('knockout-bracket-container');
  container.innerHTML = '';

  const ukDate = (iso) => {
    const d = new Date(iso);
    const day = d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Europe/London' });
    const month = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'Europe/London' });
    return `${day} ${month}`;
  };

  const renderMatchCardHTML = (m) => {
    const played = m.status === 'finished';
    const homeScore = played ? m.score.home : '';
    const awayScore = played ? m.score.away : '';
    
    let dateStr = '';
    let timeStr = '';
    if (!played && m.kickoffUK) {
      dateStr = ukDate(m.kickoffUK);
      timeStr = ukTime(m.kickoffUK);
    } else if (!played) {
      dateStr = 'Proj';
      timeStr = '';
    }

    const rightHome = played ? homeScore : dateStr;
    const rightAway = played ? awayScore : timeStr;

    const homeWinner = played && m.score.home > m.score.away;
    const awayWinner = played && m.score.away > m.score.home;

    return `
      <div class="bracket-match-header">
        <span>${m.id}</span>
        <span class="bracket-venue">${m.venue || ''}</span>
      </div>
      <div class="bracket-match-teams">
        <div class="bracket-match-team ${m.home.dummy ? 'dummy' : ''} ${homeWinner ? 'winner' : ''}">
          <span class="flag">${m.home.flag}</span>
          <span class="team-label">${m.home.label}</span>
          <span class="code">${m.home.code}</span>
          <span class="score-or-time">${rightHome}</span>
        </div>
        <div class="bracket-match-team ${m.away.dummy ? 'dummy' : ''} ${awayWinner ? 'winner' : ''}">
          <span class="flag">${m.away.flag}</span>
          <span class="team-label">${m.away.label}</span>
          <span class="code">${m.away.code}</span>
          <span class="score-or-time">${rightAway}</span>
        </div>
      </div>
    `;
  };

  const r32Order = ['M74', 'M77', 'M73', 'M75', 'M83', 'M84', 'M81', 'M82', 'M76', 'M78', 'M79', 'M80', 'M86', 'M88', 'M85', 'M87'];
  const r16Order = ['M89', 'M90', 'M93', 'M94', 'M91', 'M92', 'M95', 'M96'];
  const qfOrder = ['M97', 'M98', 'M99', 'M100'];
  const sfOrder = ['M101', 'M102'];

  const sortedR32 = r32Order.map(id => r32MatchesData.find(m => m.id === id));
  const sortedR16 = r16Order.map(id => r16MatchesData.find(m => m.id === id));
  const sortedQF = qfOrder.map(id => qfMatchesData.find(m => m.id === id));
  const sortedSF = sfOrder.map(id => sfMatchesData.find(m => m.id === id));
  const sortedFinal = [finalMatchData, thirdMatchData];

  const columns = [
    { title: 'Round of 32', matches: sortedR32 },
    { title: 'Round of 16', matches: sortedR16 },
    { title: 'Quarter-finals', matches: sortedQF },
    { title: 'Semi-finals', matches: sortedSF },
    { title: 'Final & 3rd Place', matches: sortedFinal }
  ];

  columns.forEach((col, roundIdx) => {
    const colDiv = document.createElement('div');
    colDiv.className = 'bracket-column';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'bracket-column-title';
    titleDiv.textContent = col.title;
    colDiv.appendChild(titleDiv);

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'bracket-column-body';

    col.matches.forEach(m => {
      const matchCard = document.createElement('div');
      matchCard.className = 'bracket-match';
      
      if (m.status === 'finished') {
        matchCard.classList.add('has-winner');
      }

      matchCard.innerHTML = renderMatchCardHTML(m);
      bodyDiv.appendChild(matchCard);
    });
    
    colDiv.appendChild(bodyDiv);
    container.appendChild(colDiv);
  });

  const countCaption = document.getElementById('knockout-caption');
  if (knockoutView === 'bracket') {
    countCaption.textContent = 'Dynamic World Cup 2026 bracket pathway projection';
    if (!document.getElementById('knockout-view').hidden) {
      requestAnimationFrame(() => {
        drawBracketLines();
      });
    }
  } else {
    const currentFinishedCount = DATA.fixtures.filter(m => m.stage === 'group' && m.status === 'finished').length;
    countCaption.textContent = `${currentFinishedCount}/72 group stage matches finished`;
  }
}

function drawBracketLines() {
  drawBracketLinesGeneral('knockout-bracket-container', 'bracket-svg-overlay');
}

function drawBracketLinesForPredictions() {
  drawBracketLinesGeneral('predictions-bracket-container', 'predictions-svg-overlay');
}

function drawBracketLinesGeneral(containerId, svgId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (containerId === 'knockout-bracket-container' && knockoutView !== 'bracket') return;

  // Clear existing SVG overlay
  let svg = document.getElementById(svgId);
  if (svg) {
    svg.innerHTML = '';
  } else {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = svgId;
    container.appendChild(svg);
  }

  // Set SVG size to match scrollable container dimensions
  svg.setAttribute('width', container.scrollWidth);
  svg.setAttribute('height', container.scrollHeight);

  const columns = container.querySelectorAll('.bracket-column');
  if (columns.length < 2) return;

  // Traverse each column to draw connector paths to the next round
  for (let c = 0; c < columns.length - 1; c++) {
    const sMatches = columns[c].querySelectorAll('.bracket-match');
    const dMatches = columns[c + 1].querySelectorAll('.bracket-match');
    if (!sMatches.length || !dMatches.length) continue;

    sMatches.forEach((sMatch, i) => {
      // Find destination match
      let destIdx = Math.floor(i / 2);
      if (c === 3) {
        destIdx = 0; // Both semi-finals connect to the Final (Match 0 in Column 4)
      }
      const dMatch = dMatches[destIdx];
      if (!dMatch) return;

      // Calculate absolute positions relative to the container
      const sOffset = getRelativeCoords(sMatch, container);
      const dOffset = getRelativeCoords(dMatch, container);

      const x1 = sOffset.left + sMatch.offsetWidth;
      const y1 = sOffset.top + sMatch.offsetHeight / 2;
      const x2 = dOffset.left;
      const y2 = dOffset.top + dMatch.offsetHeight / 2;

      const midX = x1 + (x2 - x1) / 2;

      // Draw orthogonal branching path
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`);
      path.setAttribute('fill', 'none');

      // Check if match was played/finished to highlight the winner path
      let played = false;
      if (containerId === 'predictions-bracket-container') {
        const sourceMatchId = sMatch.dataset.matchId;
        played = !!PREDICTIONS[sourceMatchId];
      } else {
        played = sMatch.classList.contains('has-winner');
      }
      path.setAttribute('stroke', played ? 'var(--accent)' : 'var(--line-hover)');
      path.setAttribute('stroke-width', played ? '2.5' : '1.5');
      path.style.transition = 'stroke 0.25s, stroke-width 0.25s';

      if (played) {
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
      }

      svg.appendChild(path);
    });
  }
}

function getRelativeCoords(element, container) {
  let top = 0;
  let left = 0;
  let current = element;
  while (current && current !== container) {
    top += current.offsetTop;
    left += current.offsetLeft;
    current = current.offsetParent;
  }
  return { top, left };
}

let _statsPoller = null;

function initStatsFilter() {
  const chipsContainer = document.getElementById('stats-country-chips');
  const searchInput    = document.getElementById('stats-country-search');
  const clearBtn       = document.getElementById('stats-filter-clear');

  // Build sorted team list
  const allTeams = [];
  for (const teams of Object.values(DATA.groups)) allTeams.push(...teams);
  allTeams.sort((a, b) => a.name.localeCompare(b.name));

  // Render chips
  chipsContainer.innerHTML = '';
  for (const team of allTeams) {
    const chip = document.createElement('button');
    chip.className = 'stats-chip';
    chip.dataset.code = team.code;
    chip.dataset.name = team.name.toLowerCase();
    chip.innerHTML = `<span class="chip-flag">${team.flag}</span><span class="chip-code">${team.code}</span>`;
    chip.title = team.name;
    chip.setAttribute('type', 'button');
    chip.addEventListener('click', () => {
      if (statsCountryFilter.has(team.code)) {
        statsCountryFilter.delete(team.code);
        chip.classList.remove('active');
      } else {
        statsCountryFilter.add(team.code);
        chip.classList.add('active');
      }
      clearBtn.hidden = statsCountryFilter.size === 0;
      renderStats();
    });
    chipsContainer.appendChild(chip);
  }

  // Search filter
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    chipsContainer.querySelectorAll('.stats-chip').forEach(chip => {
      chip.hidden = q ? !chip.dataset.name.includes(q) && !chip.dataset.code.toLowerCase().includes(q) : false;
    });
  });

  // Clear all
  clearBtn.addEventListener('click', () => {
    statsCountryFilter.clear();
    chipsContainer.querySelectorAll('.stats-chip').forEach(c => c.classList.remove('active'));
    clearBtn.hidden = true;
    renderStats();
  });
}

function renderStats() {
  const now = Date.now();
  // Apply country filter: only include matches where home or away team is selected
  const hasCountryFilter = statsCountryFilter.size > 0;
  const allFinished = DATA.fixtures.filter(m => m.status === 'finished');
  const finishedMatches = hasCountryFilter
    ? allFinished.filter(m => statsCountryFilter.has(m.home) || statsCountryFilter.has(m.away))
    : allFinished;

  // Update chart description
  const descEl = document.getElementById('stats-chart-desc');
  if (descEl) {
    if (hasCountryFilter) {
      const codes = [...statsCountryFilter].join(', ');
      descEl.textContent = `Showing matches involving: ${codes}`;
    } else {
      descEl.textContent = 'Tracking the scoring rate as the tournament progresses.';
    }
  }
  
  const stages = [
    { id: 'MD1', label: 'Matchday 1', filter: m => m.stage === 'group' && m.matchday === 1 },
    { id: 'MD2', label: 'Matchday 2', filter: m => m.stage === 'group' && m.matchday === 2 },
    { id: 'MD3', label: 'Matchday 3', filter: m => m.stage === 'group' && m.matchday === 3 },
    { id: 'R32', label: 'Round of 32', filter: m => m.stage === 'round of 32' },
    { id: 'R16', label: 'Round of 16', filter: m => m.stage === 'round of 16' },
    { id: 'QF', label: 'Quarter-Finals', filter: m => m.stage === 'quarter-finals' },
    { id: 'SF', label: 'Semi-Finals', filter: m => m.stage === 'semi-finals' },
    { id: 'FIN', label: 'Finals', filter: m => m.stage === 'final' || m.stage === 'third-place match' }
  ];

  let totalGoals = 0;
  let maxAvg = 0;

  const stageData = stages.map(s => {
    // For live detection use all fixtures (filtered by country if active), not just finished
    const countryPool = hasCountryFilter
      ? DATA.fixtures.filter(m => statsCountryFilter.has(m.home) || statsCountryFilter.has(m.away))
      : DATA.fixtures;
    const allStageMatches = countryPool.filter(s.filter);
    const matches = allStageMatches.filter(m => m.status === 'finished');
    const count = matches.length;
    let goals = [];
    matches.forEach(m => {
      if (hasCountryFilter) {
        let matchGoals = 0;
        if (statsCountryFilter.has(m.home)) matchGoals += (m.score?.home || 0);
        if (statsCountryFilter.has(m.away)) matchGoals += (m.score?.away || 0);
        goals.push(matchGoals);
      } else {
        goals.push((m.score?.home || 0) + (m.score?.away || 0));
      }
    });
    const totalStageGoals = goals.reduce((sum, g) => sum + g, 0);
    const avg = count > 0 ? totalStageGoals / count : 0;
    


    // Detect if any match in this stage is currently LIVE
    // (kickoff has passed within the last ~130 minutes and not yet finished)
    const isLive = allStageMatches.some(m => {
      if (m.status === 'finished') return false;
      const kickoff = m.kickoffUK ? new Date(m.kickoffUK).getTime() : null;
      if (!kickoff) return false;
      const elapsed = now - kickoff;
      return elapsed > 0 && elapsed < 130 * 60 * 1000; // within 130 mins of kickoff
    });
    
    totalGoals += totalStageGoals;
    if (avg > maxAvg) maxAvg = avg;
    return { ...s, count, goals: totalStageGoals, avg, isLive };
  });

  const summaryContainer = document.getElementById('goals-summary');
  const totalMatches = finishedMatches.length;
  const overallAvg = totalMatches > 0 ? (totalGoals / totalMatches) : 0;
  const anyLive = stageData.some(s => s.isLive);
  


  // Update card title with live badge if any match is live
  const cardTitle = document.querySelector('#stats-trend-container .fantasy-card-title');
  if (cardTitle) {
    cardTitle.innerHTML = anyLive
      ? `📊 Average Goals per Match by Stage <span class="live-badge">● LIVE</span>`
      : `📊 Average Goals per Match by Stage`;
  }
  
  summaryContainer.innerHTML = `
    <div class="summary-item">
      <div class="summary-value">${totalGoals}</div>
      <div class="summary-label">Total Goals</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">${totalMatches}</div>
      <div class="summary-label">Matches Played</div>
    </div>
    <div class="summary-item">
      <div class="summary-value" style="color: var(--accent);">${overallAvg.toFixed(2)}</div>
      <div class="summary-label">Goals per Match</div>
    </div>
  `;



  // Render Line Trend view (Option 2)
  const points = stageData.map((s, idx) => {
    const x = 60 + idx * 102.85;
    const y = s.count > 0 && maxAvg > 0
      ? 170 - (s.avg / (maxAvg * 1.1)) * 130
      : 170;
    return { ...s, x, y };
  });

  const activePoints = points.filter(p => p.count > 0);
  let pathD = '', areaD = '';
  
  if (activePoints.length > 0) {
    pathD = `M ${activePoints[0].x} ${activePoints[0].y} ` + activePoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
    areaD = `M ${activePoints[0].x} 170 L ${activePoints[0].x} ${activePoints[0].y} ` + activePoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') + ` L ${activePoints[activePoints.length - 1].x} 170 Z`;
  }

  // Generate grid lines
  const gridLines = [];
  const divisions = 4;
  for (let i = 0; i <= divisions; i++) {
    const val = maxAvg > 0 ? ((maxAvg * 1.1) * (i / divisions)).toFixed(1) : (i * 0.5).toFixed(1);
    const y = 170 - (i / divisions) * 130;
    gridLines.push(`
      <line x1="60" y1="${y}" x2="740" y2="${y}" stroke="var(--line)" stroke-width="1" stroke-dasharray="4,4" />
      <text x="50" y="${y + 4}" fill="var(--muted)" font-size="10" font-weight="700" text-anchor="end">${val}</text>
    `);
  }

  const stageMarkers = points.map((p, idx) => {
    const opacity = p.count > 0 ? 1 : (p.isLive ? 0.9 : 0.3);
    const nodeColor = p.isLive ? '#22c55e' : 'var(--accent)';
    const labelColor = p.isLive ? '#22c55e' : 'var(--text)';

    return `
      <g class="clickable-node" style="opacity: ${opacity}" onclick="window.openStageGoalsDetail('${p.id}')">
        <!-- Interactive background column highlight hitbox -->
        <rect x="${p.x - 46}" y="5" width="92" height="206" rx="12" fill="var(--accent)" fill-opacity="0" class="column-hitbox" style="transition: fill-opacity 0.2s;" />
        
        <!-- Background vertical guideline -->
        <line x1="${p.x}" y1="170" x2="${p.x}" y2="20" stroke="var(--line)" stroke-width="1" stroke-dasharray="2,2" />
        
        <!-- Node circle (live = green pulsing outer ring) -->
        ${p.isLive
          ? `<circle cx="${p.x}" cy="${p.y}" r="9" fill="${nodeColor}" fill-opacity="0.2" class="live-ring" />
             <circle cx="${p.x}" cy="${p.y}" r="5" fill="${nodeColor}" stroke="var(--panel)" stroke-width="2" filter="drop-shadow(0 0 6px #22c55e)" />`
          : p.count > 0 
            ? `<circle cx="${p.x}" cy="${p.y}" r="5" fill="${nodeColor}" stroke="var(--panel)" stroke-width="2" filter="drop-shadow(0 0 4px var(--accent))" />` 
            : `<circle cx="${p.x}" cy="170" r="4" fill="var(--muted)" stroke="var(--panel)" stroke-width="1" opacity="0.4" />`}
        
        <!-- Value label -->
        ${p.count > 0 
          ? `<text x="${p.x}" y="${p.y - 14}" fill="${labelColor}" font-size="10" font-weight="800" text-anchor="middle">${p.avg.toFixed(2)}</text>`
          : ''}
          
        <!-- Bottom labels -->
        <text x="${p.x}" y="192" fill="${p.isLive ? '#22c55e' : 'var(--text)'}" font-size="11" font-weight="700" text-anchor="middle">${p.id}</text>
        <text x="${p.x}" y="204" fill="var(--muted)" font-size="9" font-weight="500" text-anchor="middle">${p.isLive ? 'LIVE' : p.count > 0 ? `${p.count} matches` : 'Upcoming'}</text>
      </g>
    `;
  }).join('');

  document.getElementById('goals-chart').innerHTML = `
    <svg width="100%" height="220" viewBox="0 0 800 220" preserveAspectRatio="xMidYMid meet" style="overflow: visible;">
      <!-- Horizontal Grid Lines -->
      ${gridLines.join('')}
      <!-- Area Fill Under Line -->
      ${areaD ? `<path d="${areaD}" fill="var(--accent)" fill-opacity="0.06" />` : ''}
      <!-- Main Trend Line -->
      ${pathD ? `<path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="drop-shadow(0 0 6px var(--accent))" />` : ''}
      <!-- Whiskers, Nodes, and Labels -->
      ${stageMarkers}
    </svg>`;

  // Multi-edition comparison chart (tournament-wide; independent of the country filter)
  renderEditionsChart();

  // --- Live auto-refresh polling ---
  // Start or restart a 60-second poller only while live matches exist
  if (_statsPoller) clearInterval(_statsPoller);
  if (anyLive) {
    _statsPoller = setInterval(async () => {
      try {
        const fresh = await fetch(`data/fixtures.json?cb=${Date.now()}`).then(r => r.json());
        DATA.fixtures = fresh;
        renderStats();
        // also refresh fixtures list
        applyFilters();
      } catch(e) { /* silent fail */ }
    }, 60000);
  }
}

// ── Multi-Edition Goals Comparison Chart ──
// Compares average goals per match by stage across past World Cups (2010–2022),
// all in the 32-team format. Data comes from the static, auditable
// data/historical-goals.json. Tournament-wide, so it ignores statsCountryFilter.
let editionsHighlight = null; // year currently emphasised via the legend, or null

// x-axis stages for the 32-team format (no Round of 32).
const EDITION_STAGES = [
  { id: 'MD1', label: 'MD1' },
  { id: 'MD2', label: 'MD2' },
  { id: 'MD3', label: 'MD3' },
  { id: 'R16', label: 'R16' },
  { id: 'QF',  label: 'QF'  },
  { id: 'SF',  label: 'SF'  },
  { id: 'FIN', label: 'FIN' },
];

const X0 = 60, X_END = 740, Y_BOTTOM = 170, Y_TOP = 40, PLOT_H = Y_BOTTOM - Y_TOP;
const X_STEP = (X_END - X0) / (EDITION_STAGES.length - 1);
const xForStage = idx => X0 + idx * X_STEP;

function buildHistoricalSeries(edition) {
  const avgs = {};
  for (const s of EDITION_STAGES) {
    const rec = edition.stages[s.id];
    avgs[s.id] = rec ? { avg: rec.goals / rec.matches, goals: rec.goals, matches: rec.matches } : null;
  }
  return { year: edition.year, host: edition.host, color: edition.color, avgs };
}

// Break a series into runs of consecutive present stages so any absent stage
// leaves a gap rather than a line drawn through it.
function seriesRuns(series, maxAvg) {
  const runs = [];
  let run = [];
  EDITION_STAGES.forEach((s, idx) => {
    const rec = series.avgs[s.id];
    if (rec) {
      run.push({ idx, x: xForStage(idx), y: Y_BOTTOM - (rec.avg / maxAvg) * PLOT_H, ...rec });
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  });
  if (run.length) runs.push(run);
  return runs;
}

function renderEditionsChart() {
  const card = document.getElementById('editions-card');
  const chartEl = document.getElementById('editions-chart');
  if (!card || !chartEl) return;

  // Hide gracefully if the historical dataset failed to load.
  if (!HISTORICAL || !Array.isArray(HISTORICAL.editions) || HISTORICAL.editions.length === 0) {
    card.hidden = true;
    return;
  }
  card.hidden = false;

  const historical = [...HISTORICAL.editions]
    .sort((a, b) => a.year - b.year)
    .map(buildHistoricalSeries);
  const drawOrder = historical;

  // Y-scale from the max stage-average across every edition (10% headroom).
  let peak = 0;
  for (const ser of drawOrder) {
    for (const s of EDITION_STAGES) {
      const rec = ser.avgs[s.id];
      if (rec && rec.avg > peak) peak = rec.avg;
    }
  }
  const maxAvg = (peak > 0 ? peak : 3) * 1.1;

  // Grid lines + y labels (goals/match), matching the chart above.
  const divisions = 4;
  const gridLines = [];
  for (let i = 0; i <= divisions; i++) {
    const val = (maxAvg * (i / divisions)).toFixed(1);
    const y = Y_BOTTOM - (i / divisions) * PLOT_H;
    gridLines.push(`
      <line x1="60" y1="${y}" x2="740" y2="${y}" stroke="var(--line)" stroke-width="1" stroke-dasharray="4,4" />
      <text x="50" y="${y + 4}" fill="var(--muted)" font-size="10" font-weight="700" text-anchor="end">${val}</text>`);
  }

  // x-axis stage labels.
  const xLabels = EDITION_STAGES.map((s, idx) =>
    `<text x="${xForStage(idx)}" y="192" fill="var(--muted)" font-size="11" font-weight="700" text-anchor="middle">${s.label}</text>`
  ).join('');

  // Series paths + nodes.
  const seriesSvg = drawOrder.map(ser => {
    const dimmed = editionsHighlight !== null && editionsHighlight !== ser.year;
    const highlighted = editionsHighlight === ser.year;
    const width = highlighted ? 3.5 : 2.5;
    const opacity = dimmed ? 0.12 : (highlighted ? 1 : 0.82);
    const glow = highlighted && !dimmed
      ? `filter="drop-shadow(0 0 5px ${ser.color})"` : '';

    const runs = seriesRuns(ser, maxAvg);
    const paths = runs.map(run => {
      const d = `M ${run[0].x} ${run[0].y} ` + run.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
      return `<path d="${d}" fill="none" stroke="${ser.color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" ${glow} />`;
    }).join('');

    const nodes = runs.flat().map(p => {
      const stageId = EDITION_STAGES[p.idx].id;
      const label = highlighted
        ? `<text x="${p.x}" y="${p.y - 9}" fill="${ser.color}" font-size="9" font-weight="800" text-anchor="middle">${p.avg.toFixed(2)}</text>`
        : '';
      return `
        <circle cx="${p.x}" cy="${p.y}" r="${highlighted ? 4 : 3}" fill="${ser.color}" stroke="var(--panel)" stroke-width="1.5" opacity="${opacity}">
          <title>${ser.year} · ${stageId}: ${p.avg.toFixed(2)} goals/match (${p.goals} in ${p.matches})</title>
        </circle>
        ${label}`;
    }).join('');

    return paths + nodes;
  }).join('');

  chartEl.innerHTML = `
    <svg width="100%" height="210" viewBox="0 0 800 210" preserveAspectRatio="xMidYMid meet" style="overflow: visible;">
      ${gridLines.join('')}
      ${xLabels}
      ${seriesSvg}
    </svg>`;

  // Legend — newest edition first; click to emphasise a line.
  const legendEl = document.getElementById('editions-legend');
  if (legendEl) {
    const legendOrder = [...historical].reverse(); // newest edition first
    legendEl.innerHTML = legendOrder.map(ser => {
      const active = editionsHighlight === ser.year;
      return `
        <button type="button" class="edition-chip${active ? ' active' : ''}${editionsHighlight !== null && !active ? ' muted' : ''}"
                onclick="window.toggleEditionHighlight(${ser.year})">
          <span class="edition-swatch" style="background:${ser.color}"></span>
          <span class="edition-year">${ser.year}</span>
          <span class="edition-host">${ser.host}</span>
        </button>`;
    }).join('');
  }

  // Footnote.
  const footEl = document.getElementById('editions-footnote');
  if (footEl) {
    footEl.textContent = 'Past editions in the 32-team format (2010–2022). Goals count regulation + extra time and exclude penalty-shootout goals.';
  }
}

window.toggleEditionHighlight = (year) => {
  editionsHighlight = (editionsHighlight === year) ? null : year;
  renderEditionsChart();
};

// ── Stage Goals Detail Modal Helper Functions ──
let selectedMatchId = null;

function getTeamFlag(code) {
  for (const groupTeams of Object.values(DATA.groups)) {
    const found = groupTeams.find(t => t.code === code);
    if (found) return found.flag;
  }
  return '';
}

function getTeamName(code) {
  for (const groupTeams of Object.values(DATA.groups)) {
    const found = groupTeams.find(t => t.code === code);
    if (found) return found.name;
  }
  return code;
}

window.updateGoalsDetailPanel = (element, matchDataJsonStr, isClick = false) => {
  const data = JSON.parse(decodeURIComponent(matchDataJsonStr));
  
  if (isClick) {
    if (selectedMatchId === data.id) {
      selectedMatchId = null;
      window.clearGoalsDetailPanel();
      return;
    }
    selectedMatchId = data.id;
  } else {
    if (selectedMatchId !== null) return;
  }

  document.querySelectorAll('.detail-node-group').forEach(group => {
    const hg = group.querySelector('.hover-guide');
    const hr = group.querySelector('.hover-ring');
    if (hg) {
      hg.style.opacity = '0';
      hg.setAttribute('stroke-width', '1');
    }
    if (hr) hr.style.fillOpacity = '0';
  });

  const hoverGuide = element.querySelector('.hover-guide');
  const hoverRing = element.querySelector('.hover-ring');
  if (hoverGuide) {
    hoverGuide.style.opacity = isClick ? '0.9' : '0.6';
    hoverGuide.setAttribute('stroke-width', isClick ? '2' : '1');
  }
  if (hoverRing) hoverRing.style.fillOpacity = isClick ? '0.25' : '0.15';

  const panel = document.getElementById('goals-info-panel');
  if (!panel) return;

  const homeFlag = getTeamFlag(data.home);
  const awayFlag = getTeamFlag(data.away);
  const homeName = getTeamName(data.home);
  const awayName = getTeamName(data.away);

  panel.classList.add('active');
  panel.innerHTML = `
    <div class="goals-info-data">
      <div class="goals-info-meta">
        <span>Match ${data.id} • ${data.stage} ${isClick ? '📌' : ''}</span>
        <span>${data.date || ''}</span>
      </div>
      <div class="goals-info-teams-row">
        <div class="goals-info-team home">
          <span class="team-name">${homeName}</span>
          <span class="team-flag">${homeFlag}</span>
        </div>
        <div class="goals-info-score-container">
          <div class="goals-info-score">${data.homeScore} - ${data.awayScore}</div>
          <div class="goals-info-score-label">${data.totalGoals} GOAL${data.totalGoals === 1 ? '' : 'S'}${statsCountryFilter.size > 0 ? ' BY SELECTED' : ''}${data.runningAvg ? ` • avg ${data.runningAvg}` : ''}</div>
        </div>
        <div class="goals-info-team away">
          <span class="team-flag">${awayFlag}</span>
          <span class="team-name">${awayName}</span>
        </div>
      </div>
      <div class="goals-info-venue">📍 ${data.venue}</div>
    </div>
  `;
};

window.clearGoalsDetailPanel = () => {
  if (selectedMatchId !== null) return;

  document.querySelectorAll('.detail-node-group').forEach(group => {
    const hoverGuide = group.querySelector('.hover-guide');
    const hoverRing = group.querySelector('.hover-ring');
    if (hoverGuide) {
      hoverGuide.style.opacity = '0';
      hoverGuide.setAttribute('stroke-width', '1');
    }
    if (hoverRing) hoverRing.style.fillOpacity = '0';
  });

  const panel = document.getElementById('goals-info-panel');
  if (!panel) return;
  panel.classList.remove('active');
  panel.innerHTML = `
    <div class="goals-info-placeholder">
      <span>ℹ️</span> Hover over any match point on the trend line to view details.
    </div>
  `;
};

window.openStageGoalsDetail = (stageId) => {
  selectedMatchId = null;

  const stages = [
    { id: 'MD1', label: 'Matchday 1', filter: m => m.stage === 'group' && m.matchday === 1 },
    { id: 'MD2', label: 'Matchday 2', filter: m => m.stage === 'group' && m.matchday === 2 },
    { id: 'MD3', label: 'Matchday 3', filter: m => m.stage === 'group' && m.matchday === 3 },
    { id: 'R32', label: 'Round of 32', filter: m => m.stage === 'round of 32' },
    { id: 'R16', label: 'Round of 16', filter: m => m.stage === 'round of 16' },
    { id: 'QF', label: 'Quarter-Finals', filter: m => m.stage === 'quarter-finals' },
    { id: 'SF', label: 'Semi-Finals', filter: m => m.stage === 'semi-finals' },
    { id: 'FIN', label: 'Finals', filter: m => m.stage === 'final' || m.stage === 'third-place match' }
  ];

  const stage = stages.find(s => s.id === stageId);
  if (!stage) return;

  const hasCountryFilter = statsCountryFilter.size > 0;
  const stageMatches = DATA.fixtures
    .filter(stage.filter)
    .filter(m => !hasCountryFilter || statsCountryFilter.has(m.home) || statsCountryFilter.has(m.away));

  const finishedMatches = stageMatches.filter(m => m.status === 'finished');
  
  finishedMatches.sort((a, b) => {
    const timeA = a.kickoffUK ? new Date(a.kickoffUK).getTime() : 0;
    const timeB = b.kickoffUK ? new Date(b.kickoffUK).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });

  const card = document.getElementById('goals-detail-card');
  const modal = document.getElementById('goals-detail-modal');

  if (finishedMatches.length === 0) {
    card.innerHTML = `
      <button class="modal-close" id="goals-modal-close" aria-label="Close modal">&times;</button>
      <div class="goals-detail-content">
        <div class="goals-detail-title-area">
          <div class="goals-detail-title">⚽ Goals Trend — ${stage.label}</div>
          <div class="goals-detail-subtitle">Individual match breakdown</div>
        </div>
        <div style="padding: 40px 20px; text-align: center; color: var(--muted); font-size: 14px; font-weight: 500;">
          No matches finished in this stage yet. Upcoming matches will appear here once completed.
        </div>
      </div>
    `;
    document.getElementById('goals-modal-close').onclick = () => { modal.hidden = true; };
    modal.hidden = false;
    return;
  }

  const totalGoals = finishedMatches.reduce((sum, m) => {
    if (hasCountryFilter) {
      let g = 0;
      if (statsCountryFilter.has(m.home)) g += (m.score?.home || 0);
      if (statsCountryFilter.has(m.away)) g += (m.score?.away || 0);
      return sum + g;
    }
    return sum + ((m.score?.home || 0) + (m.score?.away || 0));
  }, 0);
  const played = finishedMatches.length;
  const average = totalGoals / played;

  const goalCounts = finishedMatches.map(m => {
    if (hasCountryFilter) {
      let g = 0;
      if (statsCountryFilter.has(m.home)) g += (m.score?.home || 0);
      if (statsCountryFilter.has(m.away)) g += (m.score?.away || 0);
      return g;
    }
    return (m.score?.home || 0) + (m.score?.away || 0);
  });
  const maxGoals = Math.max(4, ...goalCounts);

  const maxGoalsCount = Math.max(...goalCounts);
  const highestScoringMatches = finishedMatches.filter(m => {
    let g = 0;
    if (hasCountryFilter) {
      if (statsCountryFilter.has(m.home)) g += (m.score?.home || 0);
      if (statsCountryFilter.has(m.away)) g += (m.score?.away || 0);
    } else {
      g = (m.score?.home || 0) + (m.score?.away || 0);
    }
    return g === maxGoalsCount;
  });
  let highestLabel = 'N/A';
  if (highestScoringMatches.length > 0) {
    const firstM = highestScoringMatches[0];
    const scoreText = `${firstM.score.home}-${firstM.score.away}`;
    highestLabel = `${firstM.home} vs ${firstM.away} (${scoreText})`;
    if (highestScoringMatches.length > 1) {
      highestLabel += ` +${highestScoringMatches.length - 1} more`;
    }
  }

  const statsHtml = `
    <div class="goals-detail-stats">
      <div class="goals-stat-card">
        <div class="goals-stat-value" style="color: var(--accent);">${average.toFixed(2)}</div>
        <div class="goals-stat-label">Goals / Match</div>
      </div>
      <div class="goals-stat-card">
        <div class="goals-stat-value">${totalGoals}</div>
        <div class="goals-stat-label">Total Goals</div>
      </div>
      <div class="goals-stat-card">
        <div class="goals-stat-value">${played}</div>
        <div class="goals-stat-label">Matches Played</div>
      </div>
      <div class="goals-stat-card" title="${highestLabel}">
        <div class="goals-stat-value" style="font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; padding: 4px 0;">${maxGoalsCount} goals</div>
        <div class="goals-stat-label">Highest Score</div>
      </div>
    </div>
  `;

  const width = 720;
  const height = 240;
  const padL = 40;
  const padR = 40;
  const padT = 30;
  const padB = 40;

  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  let cumulativeSum = 0;
  const points = finishedMatches.map((m, idx) => {
    let goals = 0;
    if (hasCountryFilter) {
      if (statsCountryFilter.has(m.home)) goals += (m.score?.home || 0);
      if (statsCountryFilter.has(m.away)) goals += (m.score?.away || 0);
    } else {
      goals = (m.score?.home || 0) + (m.score?.away || 0);
    }
    cumulativeSum += goals;
    const runningAvg = cumulativeSum / (idx + 1);
    const x = finishedMatches.length > 1 
      ? padL + (idx / (finishedMatches.length - 1)) * plotW
      : padL + plotW / 2;
    const y = padT + plotH - (goals / maxGoals) * plotH;
    const yAvg = padT + plotH - (runningAvg / maxGoals) * plotH;
    return { match: m, goals, runningAvg, x, y, yAvg, index: idx + 1 };
  });

  const gridLines = [];
  for (let i = 0; i <= maxGoals; i++) {
    const y = padT + plotH - (i / maxGoals) * plotH;
    gridLines.push(`
      <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="var(--line)" stroke-width="1" stroke-dasharray="4,4" />
      <text x="${padL - 10}" y="${y + 4}" fill="var(--muted)" font-size="10" font-weight="700" text-anchor="end">${i}</text>
    `);
  }

  let pathD = '';
  let areaD = '';
  let avgPathD = '';
  if (points.length > 0) {
    pathD = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
    areaD = `M ${points[0].x} ${padT + plotH} L ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') + ` L ${points[points.length - 1].x} ${padT + plotH} Z`;
    avgPathD = `M ${points[0].x} ${points[0].yAvg} ` + points.slice(1).map(p => `L ${p.x} ${p.yAvg}`).join(' ');
  }

  const nodesHtml = points.map(p => {
    const matchData = encodeURIComponent(JSON.stringify({
      id: p.match.id,
      stage: p.match.stage,
      venue: p.match.venue,
      home: p.match.home,
      away: p.match.away,
      homeScore: p.match.score.home,
      awayScore: p.match.score.away,
      totalGoals: p.goals,
      runningAvg: p.runningAvg.toFixed(2),
      date: p.match.dateUK,
    }));

    return `
      <g class="detail-node-group" 
         onmouseenter="window.updateGoalsDetailPanel(this, '${matchData}')" 
         onmouseleave="window.clearGoalsDetailPanel()"
         onclick="window.updateGoalsDetailPanel(this, '${matchData}', true)">
        <line class="hover-guide" x1="${p.x}" y1="${padT}" x2="${p.x}" y2="${padT + plotH}" stroke="var(--accent)" stroke-width="1" stroke-dasharray="2,2" opacity="0" style="transition: opacity 0.2s;" />
        <circle class="hover-ring" cx="${p.x}" cy="${p.y}" r="10" fill="var(--accent)" fill-opacity="0" style="transition: fill-opacity 0.2s;" />
        <circle class="node-dot" cx="${p.x}" cy="${p.y}" r="4" fill="var(--accent)" stroke="var(--panel)" stroke-width="1.5" />
        <circle cx="${p.x}" cy="${p.y}" r="15" fill="transparent" pointer-events="all" />
      </g>
    `;
  }).join('');

  const xLabels = points.map((p, idx) => {
    const showLabel = finishedMatches.length <= 12 || idx % 2 === 0 || idx === finishedMatches.length - 1;
    if (!showLabel) return '';
    return `<text x="${p.x}" y="${padT + plotH + 16}" fill="var(--muted)" font-size="8.5" font-weight="700" text-anchor="middle">${p.match.id}</text>`;
  }).join('');

  const svgHtml = `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
      ${gridLines.join('')}
      ${areaD ? `<path d="${areaD}" fill="var(--accent)" fill-opacity="0.04" />` : ''}
      ${avgPathD ? `<path d="${avgPathD}" fill="none" stroke="var(--text)" stroke-width="2" stroke-dasharray="4,4" opacity="0.6" style="pointer-events: none;" />` : ''}
      ${pathD ? `<path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" filter="drop-shadow(0 0 4px var(--accent-glow))" />` : ''}
      ${xLabels}
      ${nodesHtml}
    </svg>
  `;

  card.innerHTML = `
    <button class="modal-close" id="goals-modal-close" aria-label="Close modal">&times;</button>
    <div class="goals-detail-content">
      <div class="goals-detail-title-area">
        <div class="goals-detail-title">⚽ Goals Trend — ${stage.label}</div>
        <div class="goals-detail-subtitle">Individual match breakdown (goals vs match ID)</div>
      </div>
      
      ${statsHtml}
      
      <div style="display: flex; justify-content: flex-end; gap: 16px; font-size: 11px; margin-bottom: 8px; font-weight: 600; padding: 0 4px;">
        <div style="display: flex; align-items: center; gap: 6px; color: var(--text);">
          <span style="display: inline-block; width: 12px; height: 3px; background: var(--accent); border-radius: 2px;"></span>
          <span>Match Goals</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; color: var(--muted);">
          <span style="display: inline-block; width: 12px; height: 0px; border-bottom: 2px dashed var(--muted);"></span>
          <span>Running Average</span>
        </div>
      </div>
      
      <div class="goals-detail-chart-container">
        ${svgHtml}
      </div>
      
      <div class="goals-detail-info-panel" id="goals-info-panel">
        <div class="goals-info-placeholder">
          <span>ℹ️</span> Hover over any match point on the trend line to view details.
        </div>
      </div>
    </div>
  `;

  document.getElementById('goals-modal-close').onclick = () => {
    modal.hidden = true;
  };
  
  modal.hidden = false;
};

// Handle closing goals detail modal when clicking outside
document.getElementById('goals-detail-modal').onclick = e => { 
  if (e.target.id === 'goals-detail-modal') {
    e.currentTarget.hidden = true; 
  }
};



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

window.addEventListener('resize', () => {
  if (knockoutView === 'bracket' && !document.getElementById('knockout-view').hidden) {
    drawBracketLines();
  }
  if (!document.getElementById('predictions-view').hidden) {
    drawBracketLinesForPredictions();
  }
});

// ── Predictions Bracket Implementation ──
const MATCH_CONNECTIONS = {
  // R32 -> R16
  'M74': { nextMatchId: 'M89', slot: 'home' },
  'M77': { nextMatchId: 'M89', slot: 'away' },
  'M73': { nextMatchId: 'M90', slot: 'home' },
  'M75': { nextMatchId: 'M90', slot: 'away' },
  'M76': { nextMatchId: 'M91', slot: 'home' },
  'M78': { nextMatchId: 'M91', slot: 'away' },
  'M79': { nextMatchId: 'M92', slot: 'home' },
  'M80': { nextMatchId: 'M92', slot: 'away' },
  'M83': { nextMatchId: 'M93', slot: 'home' },
  'M84': { nextMatchId: 'M93', slot: 'away' },
  'M81': { nextMatchId: 'M94', slot: 'home' },
  'M82': { nextMatchId: 'M94', slot: 'away' },
  'M86': { nextMatchId: 'M95', slot: 'home' },
  'M88': { nextMatchId: 'M95', slot: 'away' },
  'M85': { nextMatchId: 'M96', slot: 'home' },
  'M87': { nextMatchId: 'M96', slot: 'away' },

  // R16 -> QF
  'M89': { nextMatchId: 'M97', slot: 'home' },
  'M90': { nextMatchId: 'M97', slot: 'away' },
  'M93': { nextMatchId: 'M98', slot: 'home' },
  'M94': { nextMatchId: 'M98', slot: 'away' },
  'M91': { nextMatchId: 'M99', slot: 'home' },
  'M92': { nextMatchId: 'M99', slot: 'away' },
  'M95': { nextMatchId: 'M100', slot: 'home' },
  'M96': { nextMatchId: 'M100', slot: 'away' },

  // QF -> SF
  'M97': { nextMatchId: 'M101', slot: 'home' },
  'M98': { nextMatchId: 'M101', slot: 'away' },
  'M99': { nextMatchId: 'M102', slot: 'home' },
  'M100': { nextMatchId: 'M102', slot: 'away' },

  // SF -> Final & 3rd Place
  'M101': { nextMatchId: 'M104', slot: 'home' },
  'M102': { nextMatchId: 'M104', slot: 'away' },
  
  // Final -> Champion
  'M104': { nextMatchId: 'champion-card', slot: 'winner' }
};

function setupDragAndDropEvents(el, matchId, team) {
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ matchId, teamCode: team.code }));
    e.dataTransfer.effectAllowed = 'move';
    
    // Find valid drop target
    const conn = MATCH_CONNECTIONS[matchId];
    if (conn) {
      let targetSelector = '';
      if (conn.nextMatchId === 'champion-card') {
        targetSelector = '#predictions-view .predictions-champ-slot';
      } else {
        targetSelector = `#predictions-view .bracket-match[data-match-id="${conn.nextMatchId}"] .bracket-match-team[data-role="${conn.slot}"]`;
      }
      
      const targetEl = document.querySelector(targetSelector);
      if (targetEl) {
        targetEl.classList.add('valid-drop-target');
      }
    }
  });

  el.addEventListener('dragend', () => {
    // Clean up all highlighted targets
    document.querySelectorAll('#predictions-view .valid-drop-target').forEach(x => {
      x.classList.remove('valid-drop-target');
      x.classList.remove('drop-hover');
    });
  });
}

function makeSlotDropTarget(el, destMatchId, role) {
  const sourceMatchId = Object.keys(MATCH_CONNECTIONS).find(key => {
    const conn = MATCH_CONNECTIONS[key];
    return conn.nextMatchId === destMatchId && conn.slot === role;
  });

  if (!sourceMatchId) return;

  el.addEventListener('dragover', (e) => {
    if (el.classList.contains('valid-drop-target')) {
      e.preventDefault();
      el.classList.add('drop-hover');
    }
  });

  el.addEventListener('dragleave', () => {
    el.classList.remove('drop-hover');
  });

  el.addEventListener('drop', (e) => {
    el.classList.remove('drop-hover');
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.matchId === sourceMatchId) {
        selectPredictedWinner(sourceMatchId, data.teamCode);
      }
    } catch (err) {
      console.error('Error on drop', err);
    }
  });
}

function makeChampSlotDropTarget(el) {
  el.addEventListener('dragover', (e) => {
    if (el.classList.contains('valid-drop-target')) {
      e.preventDefault();
      el.classList.add('drop-hover');
    }
  });

  el.addEventListener('dragleave', () => {
    el.classList.remove('drop-hover');
  });

  el.addEventListener('drop', (e) => {
    el.classList.remove('drop-hover');
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.matchId === 'M104') {
        selectPredictedWinner('M104', data.teamCode);
      }
    } catch (err) {
      console.error('Error on drop', err);
    }
  });
}

function selectPredictedWinner(matchId, teamCode) {
  if (!teamCode || teamCode.startsWith('W') || teamCode.startsWith('3rd') || teamCode.startsWith('2') || teamCode.startsWith('1')) {
    return;
  }
  
  PREDICTIONS[matchId] = teamCode;
  savePredictions();
  renderPredictions();
}

function renderPredictions() {
  const thirds = getThirdPlaceStandings();
  const qualifiedThirds = thirds.slice(0, 8);
  const qualifiedGroups = qualifiedThirds.map(t => t.group).sort();
  const assignments = solveThirdPlaceMatchups(qualifiedGroups);

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
    const homeProj = getPredictedMatchWinner(homeR32.id, homeR32.home, homeR32.away);
    const awayProj = getPredictedMatchWinner(awayR32.id, awayR32.home, awayR32.away);
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
    const homeProj = getPredictedMatchWinner(homeR16.id, homeR16.home, homeR16.away);
    const awayProj = getPredictedMatchWinner(awayR16.id, awayR16.home, awayR16.away);
    return getMatchDetails(p.id, homeProj, awayProj);
  });

  const sfPairings = [
    { id: 'M101', name: 'Match 101', homeM: 'M97', awayM: 'M98' },
    { id: 'M102', name: 'Match 102', homeM: 'M99', awayM: 'M100' }
  ];
  const sfMatchesData = sfPairings.map(p => {
    const homeQF = qfMatchesData.find(x => x.id === p.homeM);
    const awayQF = qfMatchesData.find(x => x.id === p.awayM);
    const homeProj = getPredictedMatchWinner(homeQF.id, homeQF.home, homeQF.away);
    const awayProj = getPredictedMatchWinner(awayQF.id, awayQF.home, awayQF.away);
    return getMatchDetails(p.id, homeProj, awayProj);
  });

  const sf1 = sfMatchesData.find(x => x.id === 'M101');
  const sf2 = sfMatchesData.find(x => x.id === 'M102');
  
  const finalHomeProj = getPredictedMatchWinner(sf1.id, sf1.home, sf1.away);
  const finalAwayProj = getPredictedMatchWinner(sf2.id, sf2.home, sf2.away);
  const finalMatchData = getMatchDetails('M104', finalHomeProj, finalAwayProj);

  const thirdHomeProj = getPredictedMatchLoser(sf1.id, sf1.home, sf1.away);
  const thirdAwayProj = getPredictedMatchLoser(sf2.id, sf2.home, sf2.away);
  const thirdMatchData = getMatchDetails('M103', thirdHomeProj, thirdAwayProj);

  const champProj = getPredictedMatchWinner('M104', finalMatchData.home, finalMatchData.away);

  const r32Order = ['M74', 'M77', 'M73', 'M75', 'M83', 'M84', 'M81', 'M82', 'M76', 'M78', 'M79', 'M80', 'M86', 'M88', 'M85', 'M87'];
  const r16Order = ['M89', 'M90', 'M93', 'M94', 'M91', 'M92', 'M95', 'M96'];
  const qfOrder = ['M97', 'M98', 'M99', 'M100'];
  const sfOrder = ['M101', 'M102'];

  const sortedR32 = r32Order.map(id => r32MatchesData.find(m => m.id === id));
  const sortedR16 = r16Order.map(id => r16MatchesData.find(m => m.id === id));
  const sortedQF = qfOrder.map(id => qfMatchesData.find(m => m.id === id));
  const sortedSF = sfOrder.map(id => sfMatchesData.find(m => m.id === id));
  const sortedFinal = [finalMatchData, thirdMatchData];

  const columns = [
    { title: 'Round of 32', matches: sortedR32 },
    { title: 'Round of 16', matches: sortedR16 },
    { title: 'Quarter-finals', matches: sortedQF },
    { title: 'Semi-finals', matches: sortedSF },
    { title: 'Final & 3rd Place', matches: sortedFinal }
  ];

  const container = document.getElementById('predictions-bracket-container');
  if (!container) return;
  container.innerHTML = '';

  columns.forEach((col, roundIdx) => {
    const colDiv = document.createElement('div');
    colDiv.className = 'bracket-column';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'bracket-column-title';
    titleDiv.textContent = col.title;
    colDiv.appendChild(titleDiv);

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'bracket-column-body';

    col.matches.forEach(m => {
      const matchCard = document.createElement('div');
      matchCard.className = 'bracket-match';
      matchCard.dataset.matchId = m.id;

      const pWinner = PREDICTIONS[m.id];
      const actualFinished = m.status === 'finished';
      const hasWinner = !!pWinner || actualFinished;
      if (hasWinner) {
        matchCard.classList.add('has-winner');
      }

      const homeScore = actualFinished ? m.score.home : '';
      const awayScore = actualFinished ? m.score.away : '';

      let homeHighlight = false;
      let awayHighlight = false;
      if (pWinner) {
        homeHighlight = m.home.code === pWinner;
        awayHighlight = m.away.code === pWinner;
      } else if (actualFinished) {
        homeHighlight = m.score.home > m.score.away;
        awayHighlight = m.score.away > m.score.home;
      }

      const headerDiv = document.createElement('div');
      headerDiv.className = 'bracket-match-header';
      headerDiv.innerHTML = `
        <span>${m.id}</span>
        <span class="bracket-venue">${m.venue || ''}</span>
      `;
      matchCard.appendChild(headerDiv);

      const teamsDiv = document.createElement('div');
      teamsDiv.className = 'bracket-match-teams';

      const homeTeamDiv = document.createElement('div');
      homeTeamDiv.className = `bracket-match-team ${m.home.dummy ? 'dummy' : 'draggable'} ${homeHighlight ? 'predicted-winner' : ''}`;
      homeTeamDiv.dataset.teamCode = m.home.code;
      homeTeamDiv.dataset.role = 'home';
      if (!m.home.dummy) {
        homeTeamDiv.setAttribute('draggable', 'true');
      }
      homeTeamDiv.innerHTML = `
        <span class="flag">${m.home.flag}</span>
        <span class="team-label">${m.home.label}</span>
        <span class="code">${m.home.code}</span>
        <span class="score-or-time">${actualFinished ? homeScore : (homeHighlight ? '✓' : '')}</span>
      `;

      const awayTeamDiv = document.createElement('div');
      awayTeamDiv.className = `bracket-match-team ${m.away.dummy ? 'dummy' : 'draggable'} ${awayHighlight ? 'predicted-winner' : ''}`;
      awayTeamDiv.dataset.teamCode = m.away.code;
      awayTeamDiv.dataset.role = 'away';
      if (!m.away.dummy) {
        awayTeamDiv.setAttribute('draggable', 'true');
      }
      awayTeamDiv.innerHTML = `
        <span class="flag">${m.away.flag}</span>
        <span class="team-label">${m.away.label}</span>
        <span class="code">${m.away.code}</span>
        <span class="score-or-time">${actualFinished ? awayScore : (awayHighlight ? '✓' : '')}</span>
      `;

      if (!m.home.dummy) {
        setupDragAndDropEvents(homeTeamDiv, m.id, m.home);
        homeTeamDiv.addEventListener('click', () => {
          selectPredictedWinner(m.id, m.home.code);
        });
      }
      if (!m.away.dummy) {
        setupDragAndDropEvents(awayTeamDiv, m.id, m.away);
        awayTeamDiv.addEventListener('click', () => {
          selectPredictedWinner(m.id, m.away.code);
        });
      }

      makeSlotDropTarget(homeTeamDiv, m.id, 'home');
      makeSlotDropTarget(awayTeamDiv, m.id, 'away');

      teamsDiv.appendChild(homeTeamDiv);
      teamsDiv.appendChild(awayTeamDiv);
      matchCard.appendChild(teamsDiv);
      bodyDiv.appendChild(matchCard);
    });

    if (col.title === 'Final & 3rd Place') {
      const champCard = document.createElement('div');
      champCard.className = 'bracket-match champion-card';
      champCard.style.marginTop = '16px';
      champCard.style.borderColor = 'var(--accent)';
      champCard.style.boxShadow = '0 0 15px var(--accent-glow)';
      
      const headerDiv = document.createElement('div');
      headerDiv.className = 'bracket-match-header';
      headerDiv.innerHTML = `
        <span style="color: var(--accent); font-weight: 800; font-size: 9px; letter-spacing: 0.8px;">🏆 predicted champion</span>
      `;
      champCard.appendChild(headerDiv);

      const teamsDiv = document.createElement('div');
      teamsDiv.className = 'bracket-match-teams';

      const champSlot = document.createElement('div');
      const hasChamp = champProj && !champProj.dummy;
      if (hasChamp) {
        champSlot.className = 'bracket-match-team predicted-winner predictions-champ-slot';
        champSlot.style.cursor = 'pointer';
        champSlot.innerHTML = `
          <span class="flag" style="font-size: 16px;">${champProj.flag}</span>
          <span class="team-label" style="font-weight: 800;">${champProj.label}</span>
          <span class="code">(${champProj.code})</span>
          <span class="score-or-time" style="font-size: 13px;">🏆</span>
        `;
        champSlot.addEventListener('click', () => {
          delete PREDICTIONS['M104'];
          savePredictions();
          renderPredictions();
        });
        makeChampSlotDropTarget(champSlot);
      } else {
        champSlot.className = 'bracket-match-team dummy predictions-champ-slot';
        champSlot.style.border = '1px dashed var(--line)';
        champSlot.style.padding = '8px';
        champSlot.style.justifyContent = 'center';
        champSlot.innerHTML = `
          <span class="team-label" style="color: var(--muted); font-style: italic; font-weight: 500;">Drag Winner Here</span>
        `;
        makeChampSlotDropTarget(champSlot);
      }
      
      teamsDiv.appendChild(champSlot);
      champCard.appendChild(teamsDiv);
      bodyDiv.appendChild(champCard);
    }

    colDiv.appendChild(bodyDiv);
    container.appendChild(colDiv);
  });

  requestAnimationFrame(() => {
    drawBracketLinesForPredictions();
  });
}

function getShareableLink() {
  const pairs = Object.entries(PREDICTIONS).map(([mId, teamCode]) => `${mId}-${teamCode}`);
  const encoded = encodeURIComponent(pairs.join(','));
  const url = new URL(window.location.href);
  url.hash = `#/predictions?b=${encoded}`;
  return url.toString();
}

function loadPredictionsFromUrl() {
  try {
    const hash = window.location.hash;
    const match = hash.match(/\?b=([^&]*)/);
    if (match && match[1]) {
      const decodedStr = decodeURIComponent(match[1]);
      if (decodedStr) {
        const pairs = decodedStr.split(',');
        pairs.forEach(pair => {
          const [mId, teamCode] = pair.split('-');
          if (mId && teamCode) {
            PREDICTIONS[mId] = teamCode;
          }
        });
        savePredictions();
        
        // Clean URL hash after importing
        const url = new URL(window.location.href);
        url.hash = `#/predictions`;
        window.history.replaceState(null, '', url.toString());
      }
    }
  } catch (e) {
    console.error('Error loading predictions from URL', e);
  }
}

function initCompareMode() {
  const compareBtn = document.getElementById('btn-toggle-compare');
  if (!compareBtn) return;

  const compContainer = document.getElementById('comparator-container');
  const leftIframe = document.getElementById('left-pane-iframe');
  const rightIframe = document.getElementById('right-pane-iframe');

  compareBtn.onclick = () => {
    compareMode = !compareMode;
    document.body.classList.toggle('comparator-active', compareMode);
    
    if (compareMode) {
      compareBtn.innerHTML = `
        <svg class="icon-compare" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 4h4v16H5zM15 4h4v16h-4z"/>
        </svg>
        <span>Compare: On</span>
      `;
      compareBtn.classList.add('active');
      compContainer.style.display = 'flex';
      
      // Hide all standard views in the parent window
      toggleParentViewsVisibility(true);

      // Load iframes if not already loaded, or update their hashes to current
      const currentURL = window.location.pathname + window.location.search + window.location.hash;
      leftIframe.src = currentURL;
      rightIframe.src = currentURL;
    } else {
      compareBtn.innerHTML = `
        <svg class="icon-compare" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 4h4v16H5zM15 4h4v16h-4z"/>
        </svg>
        <span>Compare</span>
      `;
      compareBtn.classList.remove('active');
      compContainer.style.display = 'none';
      
      // Show standard views in the parent window
      toggleParentViewsVisibility(false);
      // Trigger route to re-show the correct active tab in parent window
      handleRouting();
    }
  };

  // When parent hash changes, sync both iframes if compareMode is active
  window.addEventListener('hashchange', () => {
    if (compareMode) {
      if (leftIframe.contentWindow) {
        leftIframe.contentWindow.location.hash = window.location.hash;
      }
      if (rightIframe.contentWindow) {
        rightIframe.contentWindow.location.hash = window.location.hash;
      }
    }
  });

  // Dual Iframe Scroll Sync
  let isScrollingLeft = false;
  let isScrollingRight = false;

  const syncScrollLeftToRight = () => {
    if (isScrollingRight) return;
    try {
      const leftDoc = leftIframe.contentDocument;
      const rightDoc = rightIframe.contentDocument;
      if (leftDoc && rightDoc) {
        isScrollingLeft = true;
        rightDoc.documentElement.scrollTop = leftDoc.documentElement.scrollTop;
        rightDoc.documentElement.scrollLeft = leftDoc.documentElement.scrollLeft;
        setTimeout(() => { isScrollingLeft = false; }, 30);
      }
    } catch (e) {}
  };

  const syncScrollRightToLeft = () => {
    if (isScrollingLeft) return;
    try {
      const leftDoc = leftIframe.contentDocument;
      const rightDoc = rightIframe.contentDocument;
      if (leftDoc && rightDoc) {
        isScrollingRight = true;
        leftDoc.documentElement.scrollTop = rightDoc.documentElement.scrollTop;
        leftDoc.documentElement.scrollLeft = rightDoc.documentElement.scrollLeft;
        setTimeout(() => { isScrollingRight = false; }, 30);
      }
    } catch (e) {}
  };

  leftIframe.addEventListener('load', () => {
    try {
      leftIframe.contentWindow.removeEventListener('scroll', syncScrollLeftToRight);
      leftIframe.contentWindow.addEventListener('scroll', syncScrollLeftToRight, { passive: true });
    } catch(e) {}
  });

  rightIframe.addEventListener('load', () => {
    try {
      rightIframe.contentWindow.removeEventListener('scroll', syncScrollRightToLeft);
      rightIframe.contentWindow.addEventListener('scroll', syncScrollRightToLeft, { passive: true });
    } catch(e) {}
  });
}

function toggleParentViewsVisibility(hide) {
  const viewIds = [
    'groups-view', 'fixtures-view', 'strength-view', 
    'fantasy-view', 'fantasy-players-view', 'knockout-view', 'predictions-view', 
    'wheel-view', 'stats-view'
  ];
  viewIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (hide) {
        el.style.display = 'none';
      } else {
        el.style.display = '';
      }
    }
  });
}

// ── Fantasy Players Implementation ──

let activeFantasyPreset = 'all';

function initFantasyPlayersFilters() {
  const select = document.getElementById('filter-player-country');
  if (!select) return;
  select.innerHTML = '<option value="ALL">All Countries 🌍</option>';

  // Collect unique countries
  const countries = {};
  FANTASY_PLAYERS.forEach(p => {
    if (p.teamCode && p.teamName) {
      countries[p.teamCode] = `${p.teamFlag} ${p.teamName}`;
    }
  });

  const sortedCountries = Object.entries(countries).sort((a, b) => a[1].localeCompare(b[1]));
  sortedCountries.forEach(([code, nameWithFlag]) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = nameWithFlag;
    select.appendChild(opt);
  });
}

function getDreamTeam(players) {
  // Sort players by totalPoints descending
  const sorted = [...players].sort((a, b) => b.totalPoints - a.totalPoints);
  
  const gks = sorted.filter(p => p.position === 'GK').slice(0, 1);
  const defs = sorted.filter(p => p.position === 'DEF').slice(0, 4);
  const mids = sorted.filter(p => p.position === 'MID').slice(0, 4);
  const fwds = sorted.filter(p => p.position === 'FWD').slice(0, 2);
  
  return [...gks, ...defs, ...mids, ...fwds];
}

function resetAllFantasyControls() {
  document.getElementById('player-search').value = '';
  document.getElementById('filter-player-position').value = 'ALL';
  document.getElementById('filter-player-country').value = 'ALL';
  document.getElementById('filter-player-status').value = 'ALL';
  
  document.getElementById('filter-max-price').value = 12.0;
  document.getElementById('label-max-price').textContent = '$12.0m';
  
  document.getElementById('filter-min-form').value = 0.0;
  document.getElementById('label-min-form').textContent = '0.0';
  
  document.getElementById('filter-one-to-watch').checked = false;
  document.getElementById('filter-hide-unavailable').checked = false;

  document.querySelectorAll('.pitch-node').forEach(n => n.classList.remove('active'));

  activeFantasyPreset = 'all';

  fantasyPlayersLimit = fantasyPlayersPageSize;
  renderFantasyPlayers();
}

function wireFantasyPlayersEvents() {
  const searchInput = document.getElementById('player-search');
  const posSelect = document.getElementById('filter-player-position');
  const countrySelect = document.getElementById('filter-player-country');
  const statusSelect = document.getElementById('filter-player-status');
  
  const maxPriceInput = document.getElementById('filter-max-price');
  const minFormInput = document.getElementById('filter-min-form');
  
  const oneToWatchCheck = document.getElementById('filter-one-to-watch');
  const hideUnavailableCheck = document.getElementById('filter-hide-unavailable');
  
  const resetBtn = document.getElementById('btn-reset-fantasy-filters');
  const showMoreBtn = document.getElementById('btn-show-more-players');

  // Input listeners that trigger render
  const triggerRender = () => {
    fantasyPlayersLimit = fantasyPlayersPageSize;
    renderFantasyPlayers();
  };

  const pitchNodes = document.querySelectorAll('.pitch-node');
  const syncPitchNodesWithSelect = () => {
    const currentPos = posSelect ? posSelect.value : 'ALL';
    pitchNodes.forEach(n => {
      const isActive = n.dataset.pos === currentPos;
      n.classList.toggle('active', isActive);
    });
  };

  pitchNodes.forEach(node => {
    node.onclick = () => {
      const pos = node.dataset.pos;
      const isAlreadyActive = node.classList.contains('active');
      
      pitchNodes.forEach(n => n.classList.remove('active'));
      
      if (isAlreadyActive) {
        if (posSelect) posSelect.value = 'ALL';
      } else {
        node.classList.add('active');
        if (posSelect) posSelect.value = pos;
      }
      triggerRender();
    };
  });

  if (searchInput) searchInput.oninput = triggerRender;
  if (posSelect) {
    posSelect.onchange = () => {
      syncPitchNodesWithSelect();
      triggerRender();
    };
  }
  if (countrySelect) countrySelect.onchange = triggerRender;
  if (statusSelect) statusSelect.onchange = triggerRender;

  if (maxPriceInput) {
    maxPriceInput.oninput = () => {
      document.getElementById('label-max-price').textContent = `$${parseFloat(maxPriceInput.value).toFixed(1)}m`;
      triggerRender();
    };
  }
  if (minFormInput) {
    minFormInput.oninput = () => {
      document.getElementById('label-min-form').textContent = `${parseFloat(minFormInput.value).toFixed(1)}`;
      triggerRender();
    };
  }
  if (oneToWatchCheck) oneToWatchCheck.onchange = triggerRender;
  if (hideUnavailableCheck) hideUnavailableCheck.onchange = triggerRender;

  if (resetBtn) resetBtn.onclick = resetAllFantasyControls;
  if (showMoreBtn) {
    showMoreBtn.onclick = () => {
      fantasyPlayersLimit += fantasyPlayersPageSize;
      renderFantasyPlayers();
    };
  }

  // Sorting headers click listeners
  const headers = document.querySelectorAll('#player-table-headers th[data-sort]');
  headers.forEach(th => {
    th.onclick = () => {
      const field = th.dataset.sort;
      if (fantasyPlayersSortField === field) {
        fantasyPlayersSortAsc = !fantasyPlayersSortAsc;
      } else {
        fantasyPlayersSortField = field;
        // Default to desc sorting for numeric values, asc for name/code
        fantasyPlayersSortAsc = (field === 'name' || field === 'teamCode' || field === 'position');
      }

      // Update header classes
      headers.forEach(h => {
        h.classList.remove('asc', 'desc');
        if (h.dataset.sort === field) {
          h.classList.add(fantasyPlayersSortAsc ? 'asc' : 'desc');
        }
      });

      renderFantasyPlayers();
    };
  });
}

function getFieldValue(obj, field) {
  if (field.includes('.')) {
    return field.split('.').reduce((o, i) => o ? o[i] : null, obj);
  }
  return obj[field];
}

function renderTacticalPitch() {
  if (!FANTASY_PLAYERS || FANTASY_PLAYERS.length === 0) return;
  
  // Sort active players by totalPoints descending
  const sorted = [...FANTASY_PLAYERS].filter(p => p.status !== 'eliminated').sort((a, b) => b.totalPoints - a.totalPoints);
  
  // Get top players for GK, DEF, MID, FWD
  const gk = sorted.find(p => p.position === 'GK');
  const defs = sorted.filter(p => p.position === 'DEF').slice(0, 2);
  const mids = sorted.filter(p => p.position === 'MID').slice(0, 2);
  const fwd = sorted.find(p => p.position === 'FWD');
  
  // Helper to safely update node content
  const updateNode = (selector, player) => {
    const node = document.querySelector(selector);
    if (!node) return;
    if (player) {
      const shirtEl = node.querySelector('.player-shirt');
      if (shirtEl) shirtEl.textContent = player.teamFlag || '🏳️';
      
      const nameEl = node.querySelector('.player-name');
      if (nameEl) {
        nameEl.innerHTML = `${player.name.split(' ').pop()} <span style="color:var(--accent); font-weight:800; margin-left:4px;">${player.totalPoints}p</span>`;
      }
      node.setAttribute('title', `${player.name} (${player.teamCode}) - Price: $${player.price}m, Pts: ${player.totalPoints}`);
    }
  };

  updateNode('.pitch-node.pos-gk', gk);
  updateNode('.pitch-node.pos-def1', defs[0]);
  updateNode('.pitch-node.pos-def2', defs[1]);
  updateNode('.pitch-node.pos-mid1', mids[0]);
  updateNode('.pitch-node.pos-mid2', mids[1]);
  updateNode('.pitch-node.pos-fwd', fwd);
}

function renderFantasyPlayers() {
  const list = document.getElementById('fantasy-players-list');
  if (!list) return;

  renderTacticalPitch();

  const searchQuery = (document.getElementById('player-search')?.value || '').toLowerCase().trim();
  const posFilter = document.getElementById('filter-player-position')?.value || 'ALL';
  const statusFilter = document.getElementById('filter-player-status')?.value || 'ALL';
  const countryFilter = document.getElementById('filter-player-country')?.value || 'ALL';
  
  const maxPrice = parseFloat(document.getElementById('filter-max-price')?.value) || 12.0;
  const minForm = parseFloat(document.getElementById('filter-min-form')?.value) || 0.0;
  
  const oneToWatchFilter = document.getElementById('filter-one-to-watch')?.checked || false;
  const hideUnavailableFilter = document.getElementById('filter-hide-unavailable')?.checked || false;

  // 1. Permanently exclude eliminated players
  let baseList = FANTASY_PLAYERS.filter(p => p.status !== 'eliminated');

  // 2. Custom Filter
  let filtered = baseList.filter(p => {
    // Search query
    if (searchQuery) {
      const nameMatch = p.name.toLowerCase().includes(searchQuery);
      const teamMatch = p.teamName.toLowerCase().includes(searchQuery) || p.teamCode.toLowerCase().includes(searchQuery);
      if (!nameMatch && !teamMatch) return false;
    }
    // Position
    if (posFilter !== 'ALL' && p.position !== posFilter) return false;
    // Status
    if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
    // Country
    if (countryFilter !== 'ALL' && p.teamCode !== countryFilter) return false;

    // Price slider
    if (p.price > maxPrice) return false;
    // Form slider
    if (p.form < minForm) return false;

    // One to watch
    if (oneToWatchFilter && !p.oneToWatch) return false;

    // Hide Unavailable
    if (hideUnavailableFilter && p.status !== 'playing') return false;

    return true;
  });

  // 3. Sort
  filtered.sort((a, b) => {
    let valA = getFieldValue(a, fantasyPlayersSortField);
    let valB = getFieldValue(b, fantasyPlayersSortField);

    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    if (valA === valB) return 0;
    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;

    let res = 0;
    if (valA < valB) res = -1;
    else if (valA > valB) res = 1;

    return fantasyPlayersSortAsc ? res : -res;
  });

  // 4. Update Summary Cards
  renderFantasyPlayersSummary();

  // 5. Paginate/Limit
  const totalCount = filtered.length;
  const sliced = filtered.slice(0, fantasyPlayersLimit);

  list.innerHTML = '';
  if (sliced.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="12" style="text-align: center; color: var(--muted); padding: 24px;">No players found matching current filters.</td>`;
    list.appendChild(tr);
  } else {
    sliced.forEach(p => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.onclick = () => openPlayerModal(p);
      
      const nameStyle = p.status === 'eliminated' ? 'color: var(--muted); text-decoration: line-through; opacity: 0.7;' : 'font-weight: 600;';
      
      // Detailed status badges
      let statusIndicator = '';
      if (p.status === 'eliminated') {
        statusIndicator = '<span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(239, 68, 68, 0.1); color: #ef4444; margin-left: 6px; font-weight: 600; display: inline-block;">OUT</span>';
      } else if (p.status === 'injured') {
        statusIndicator = '<span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(245, 158, 11, 0.1); color: #f59e0b; margin-left: 6px; font-weight: 600; display: inline-block;">INJ</span>';
      } else if (p.status === 'suspended') {
        statusIndicator = '<span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(239, 68, 68, 0.15); color: #dc2626; margin-left: 6px; font-weight: 600; display: inline-block;">SUSP</span>';
      } else if (p.status === 'transferred') {
        statusIndicator = '<span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(107, 114, 128, 0.1); color: #6b7280; margin-left: 6px; font-weight: 600; display: inline-block;">TRNS</span>';
      }

      // Star indicator for One to Watch
      const star = p.oneToWatch ? '<span style="color: #f59e0b; font-size: 12px; margin-right: 4px;">⭐</span>' : '';

      // Form trend indicator
      const formDiff = p.form - p.avgPoints;
      let trendArrow = '';
      if (formDiff > 1.0) {
        trendArrow = '<span style="color: #22c55e; font-weight: bold; margin-left: 4px;" title="Form is rising compared to average">↗</span>';
      } else if (formDiff < -1.0) {
        trendArrow = '<span style="color: #ef4444; font-weight: bold; margin-left: 4px;" title="Form is slumping compared to average">↘</span>';
      } else {
        trendArrow = '<span style="color: var(--muted); margin-left: 4px;" title="Form is stable">→</span>';
      }

      tr.innerHTML = `
        <td>
          <div style="display: flex; align-items: center; gap: 4px;">
            ${star}
            <div style="${nameStyle}">${p.name}${statusIndicator}</div>
          </div>
        </td>
        <td>
          <div class="team-cell" style="font-weight: 500;">
            <span class="team-flag">${p.teamFlag}</span>
            <span class="team-name" style="font-size: 12px;">${p.teamName}</span>
          </div>
        </td>
        <td class="text-center" style="font-weight: 600; font-size: 11px; color: var(--muted);">${p.position}</td>
        <td class="text-right" style="font-weight: 600;">$${p.price.toFixed(1)}m</td>
        <td class="text-right" style="color: var(--muted);">${p.percentSelected.toFixed(1)}%</td>
        <td class="text-center">${p.avgPoints.toFixed(1)}</td>
        <td class="text-center">${p.form.toFixed(1)}${trendArrow}</td>
        <td class="text-center">${p.pointsByRound.md1}</td>
        <td class="text-center">${p.pointsByRound.md2}</td>
        <td class="text-center">${p.pointsByRound.md3}</td>
        <td class="text-center">${p.pointsByRound.r32}</td>
        <td class="text-center">${p.pointsByRound.r16 || 0}</td>
        <td class="text-center">${p.pointsByRound.qf || 0}</td>
        <td class="text-center">${p.pointsByRound.sf || 0}</td>
        <td class="text-center">${p.pointsByRound.fi || 0}</td>
        <td class="text-center" style="font-weight: 700; color: ${p.status === 'eliminated' ? 'var(--muted)' : 'var(--accent)'}; font-size: 14px;">${p.totalPoints}</td>
      `;
      list.appendChild(tr);
    });
  }

  // Update show more button and labels
  const label = document.getElementById('player-count-label');
  if (label) {
    label.textContent = `Showing ${Math.min(fantasyPlayersLimit, totalCount)} of ${totalCount} players`;
  }
  const showMoreBtn = document.getElementById('btn-show-more-players');
  if (showMoreBtn) {
    showMoreBtn.style.display = fantasyPlayersLimit >= totalCount ? 'none' : 'block';
  }
}

function renderFantasyPlayersSummary() {
  if (!FANTASY_PLAYERS || FANTASY_PLAYERS.length === 0) return;

  // 1. Top Scorer
  const topScorer = [...FANTASY_PLAYERS].sort((a, b) => b.totalPoints - a.totalPoints)[0];
  const scorerVal = document.getElementById('top-scorer-val');
  const scorerSub = document.getElementById('top-scorer-sub');
  if (scorerVal && topScorer) {
    scorerVal.innerHTML = `<span style="font-size: 14px; margin-right: 4px;">${topScorer.teamFlag}</span> ${topScorer.name}`;
    scorerSub.textContent = `${topScorer.totalPoints} pts · ${topScorer.position} ($${topScorer.price}m)`;
  }

  // 2. Most Selected
  const mostSelected = [...FANTASY_PLAYERS].sort((a, b) => b.percentSelected - a.percentSelected)[0];
  const selectedVal = document.getElementById('most-selected-val');
  const selectedSub = document.getElementById('most-selected-sub');
  if (selectedVal && mostSelected) {
    selectedVal.innerHTML = `<span style="font-size: 14px; margin-right: 4px;">${mostSelected.teamFlag}</span> ${mostSelected.name}`;
    selectedSub.textContent = `${mostSelected.percentSelected.toFixed(1)}% selected · ${mostSelected.totalPoints} pts`;
  }

  // 3. Best Value (ratio points / price, only check players with points >= 10 and price > 0)
  const valuePlayers = FANTASY_PLAYERS.filter(p => p.price > 0 && p.totalPoints >= 10);
  const bestValue = valuePlayers.sort((a, b) => (b.totalPoints / b.price) - (a.totalPoints / a.price))[0];
  const valueVal = document.getElementById('best-value-val');
  const valueSub = document.getElementById('best-value-sub');
  if (valueVal && bestValue) {
    const ratio = (bestValue.totalPoints / bestValue.price).toFixed(2);
    valueVal.innerHTML = `<span style="font-size: 14px; margin-right: 4px;">${bestValue.teamFlag}</span> ${bestValue.name}`;
    valueSub.textContent = `${ratio} pts/m · Total: ${bestValue.totalPoints} pts ($${bestValue.price}m)`;
  }

  // 4. Top Country
  const countryPoints = {};
  const countryFlags = {};
  FANTASY_PLAYERS.forEach(p => {
    if (p.teamCode && p.teamCode !== 'UNK') {
      countryPoints[p.teamCode] = (countryPoints[p.teamCode] || 0) + p.totalPoints;
      countryFlags[p.teamCode] = p.teamFlag;
    }
  });
  const topCountryEntry = Object.entries(countryPoints).sort((a, b) => b[1] - a[1])[0];
  const countryVal = document.getElementById('top-country-val');
  const countrySub = document.getElementById('top-country-sub');
  if (countryVal && topCountryEntry) {
    const [code, pts] = topCountryEntry;
    const playerOfCountry = FANTASY_PLAYERS.find(p => p.teamCode === code);
    const countryName = playerOfCountry ? playerOfCountry.teamName : code;
    const flag = countryFlags[code] || '';
    countryVal.innerHTML = `<span style="font-size: 14px; margin-right: 4px;">${flag}</span> ${countryName}`;
    countrySub.textContent = `Squad Total: ${pts} pts`;
  }
}

function openPlayerModal(p) {
  const card = document.getElementById('modal-card');
  const modal = document.getElementById('modal');
  if (!card || !modal) return;

  const sp = FANTASY.setPieces[p.teamCode] || { penalties: 'N/A', freeKicks: 'N/A', corners: 'N/A' };
  const valueRatio = p.price > 0 ? (p.totalPoints / p.price).toFixed(2) : '0.00';
  
  // Determine form trend and description
  const formDiff = p.form - p.avgPoints;
  let formTrendDesc = '';
  if (formDiff > 1.0) {
    formTrendDesc = `<span style="color: #22c55e; font-weight: 700;">Rising (↗ +${formDiff.toFixed(1)})</span> - Outperforming their season average.`;
  } else if (formDiff < -1.0) {
    formTrendDesc = `<span style="color: #ef4444; font-weight: 700;">Slumping (↘ ${formDiff.toFixed(1)})</span> - Underperforming their season average.`;
  } else {
    formTrendDesc = `<span style="color: var(--muted); font-weight: 700;">Stable (→)</span> - Performing at their season average level.`;
  }

  // Draw sparkline bar chart
  const rounds = [
    { label: 'MD1', val: p.pointsByRound.md1 },
    { label: 'MD2', val: p.pointsByRound.md2 },
    { label: 'MD3', val: p.pointsByRound.md3 },
    { label: 'R32', val: p.pointsByRound.r32 },
    { label: 'R16', val: p.pointsByRound.r16 || 0 },
    { label: 'QF', val: p.pointsByRound.qf || 0 },
    { label: 'SF', val: p.pointsByRound.sf || 0 },
    { label: 'FI', val: p.pointsByRound.fi || 0 }
  ];
  const maxVal = Math.max(1, ...rounds.map(r => r.val));

  const barChartHtml = rounds.map(r => {
    const pct = maxVal > 0 ? (r.val / maxVal) : 0;
    const barHeight = Math.max(6, pct * 90);
    return `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1;">
        <div style="font-size: 12px; font-weight: 800; color: var(--text);">${r.val} pts</div>
        <div style="width: 100%; max-width: 36px; background: var(--accent); border-radius: 6px; height: ${barHeight}px; min-height: 6px; transition: height 0.4s ease-out; box-shadow: 0 2px 8px var(--accent-glow);"></div>
        <div style="font-size: 10px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;">${r.label}</div>
      </div>
    `;
  }).join('');

  // Availability status badge
  let statusBadge = '';
  if (p.status === 'playing') {
    statusBadge = '<span style="background: rgba(34, 197, 94, 0.1); color: #22c55e; font-size: 11px; padding: 4px 10px; border-radius: 20px; font-weight: 700;">🟢 Active</span>';
  } else if (p.status === 'eliminated') {
    statusBadge = '<span style="background: rgba(239, 68, 68, 0.1); color: #ef4444; font-size: 11px; padding: 4px 10px; border-radius: 20px; font-weight: 700;">🔴 Eliminated</span>';
  } else if (p.status === 'injured') {
    statusBadge = '<span style="background: rgba(245, 158, 11, 0.1); color: #f59e0b; font-size: 11px; padding: 4px 10px; border-radius: 20px; font-weight: 700;">⚠️ Injured</span>';
  } else if (p.status === 'suspended') {
    statusBadge = '<span style="background: rgba(239, 68, 68, 0.2); color: #ef4444; font-size: 11px; padding: 4px 10px; border-radius: 20px; font-weight: 700;">⛔ Suspended</span>';
  } else {
    statusBadge = `<span style="background: rgba(107, 114, 128, 0.1); color: #9ca3af; font-size: 11px; padding: 4px 10px; border-radius: 20px; font-weight: 700;">⚪ ${p.status}</span>`;
  }

  const oneToWatchBanner = p.oneToWatch ? `
    <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 12px; padding: 12px 16px; display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
      <span style="font-size: 20px;">⭐</span>
      <div style="font-size: 12.5px; color: #f59e0b; font-weight: 600;">One to Watch: designated as a key tournament performer or hot option.</div>
    </div>
  ` : '';

  card.innerHTML = `
    <button class="modal-close" id="modal-close-btn" aria-label="Close modal">&times;</button>
    
    <!-- Player Header -->
    <div style="display: flex; gap: 16px; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--line); padding-bottom: 16px;">
      <div style="font-size: 32px; background: var(--bg); width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; border-radius: 16px; border: 1px solid var(--line);">
        ${p.teamFlag}
      </div>
      <div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: var(--text);">${p.name}</h2>
          ${statusBadge}
        </div>
        <div style="font-size: 13px; color: var(--muted); margin-top: 4px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
          <span>${p.teamName}</span> · 
          <span style="color: var(--accent);">${p.position}</span> · 
          <span>$${p.price.toFixed(1)}m price</span> ·
          <span>${p.percentSelected.toFixed(1)}% ownership</span>
        </div>
      </div>
    </div>

    ${oneToWatchBanner}

    <!-- Round-by-Round Trend -->
    <div class="fantasy-card-title" style="margin-bottom: 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted);">📊 Round-by-Round Performance Trend</div>
    <div style="display: flex; gap: 12px; height: 160px; align-items: flex-end; justify-content: space-around; margin-bottom: 24px; background: rgba(255,255,255,0.01); padding: 20px; border-radius: 14px; border: 1px solid var(--line);">
      ${barChartHtml}
    </div>

    <!-- Analytical Details Grid -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
      
      <!-- Stats Panel -->
      <div style="background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 8px;">
        <div style="font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--line); padding-bottom: 4px; margin-bottom: 4px;">Performance Metrics</div>
        <div style="display: flex; justify-content: space-between; font-size: 13px;"><span>Total Points</span><span style="font-weight: 700; color: var(--accent);">${p.totalPoints} pts</span></div>
        <div style="display: flex; justify-content: space-between; font-size: 13px;"><span>Average Points</span><span style="font-weight: 700;">${p.avgPoints.toFixed(1)} pts</span></div>
        <div style="display: flex; justify-content: space-between; font-size: 13px;"><span>Form (Last 3)</span><span style="font-weight: 700;">${p.form.toFixed(1)}</span></div>
        <div style="display: flex; justify-content: space-between; font-size: 13px;"><span>Points per Million</span><span style="font-weight: 700; color: #22c55e;">${valueRatio}</span></div>
      </div>

      <!-- Set Piece Takers -->
      <div style="background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 8px;">
        <div style="font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--line); padding-bottom: 4px; margin-bottom: 4px;">Set Piece Duties</div>
        <div style="display: flex; justify-content: space-between; font-size: 13px;"><span>Penalties</span><span style="font-weight: 700; color: ${sp.penalties === p.name ? 'var(--accent)' : 'inherit'};">${sp.penalties}</span></div>
        <div style="display: flex; justify-content: space-between; font-size: 13px;"><span>Free Kicks</span><span style="font-weight: 700; color: ${sp.freeKicks === p.name ? 'var(--accent)' : 'inherit'};">${sp.freeKicks}</span></div>
        <div style="display: flex; justify-content: space-between; font-size: 13px;"><span>Corners</span><span style="font-weight: 700; color: ${sp.corners === p.name ? 'var(--accent)' : 'inherit'};">${sp.corners}</span></div>
      </div>
    </div>

    <!-- Form Trend Insights -->
    <div style="margin-top: 16px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 14px; font-size: 12.5px; line-height: 1.5;">
      <div style="font-weight: 700; color: var(--text); margin-bottom: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Form Trend Analysis</div>
      <div>Current Trend: ${formTrendDesc}</div>
    </div>
  `;

  const closeBtn = document.getElementById('modal-close-btn');
  if (closeBtn) {
    closeBtn.onclick = () => {
      modal.hidden = true;
    };
  }

  modal.hidden = false;
}



