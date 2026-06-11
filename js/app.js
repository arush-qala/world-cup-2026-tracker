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

// Implemented in Task 7 (Fixtures tab). Stub keeps boot() working until then.
function renderFixtures(){}

boot();
