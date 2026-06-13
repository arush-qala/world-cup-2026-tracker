// teams: [{code}], matches: [{matchday,home,away,status,score:{home,away}}]
export function computeGroup(teams, matches){
  const codes = teams.map(t=>t.code);
  const blank = () => ({ pts:0, gf:0, ga:0, played:0 });
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
      points: cumPoints[c],
      rank: [perMD[1][c], perMD[2][c], perMD[3][c]],
      qualified: perMD[3][c] <= 2,
    };
  }
  return out;
}

function gd(s){ return s.gf - s.ga; }
function rankTable(codes, acc, matches, md){
  const sorted = [...codes].sort((a,b)=>{
    if(acc[b].pts!==acc[a].pts) return acc[b].pts-acc[a].pts;
    if(gd(acc[b])!==gd(acc[a])) return gd(acc[b])-gd(acc[a]);
    if(acc[b].gf!==acc[a].gf) return acc[b].gf-acc[a].gf;
    return headToHead(a,b,matches,md);
  });
  const rank = {};
  sorted.forEach((c, i) => {
    if (i > 0) {
      const prev = sorted[i - 1];
      const tied = acc[c].pts === acc[prev].pts &&
                   gd(acc[c]) === gd(acc[prev]) &&
                   acc[c].gf === acc[prev].gf &&
                   headToHead(c, prev, matches, md) === 0;
      if (tied) {
        rank[c] = rank[prev];
        return;
      }
    }
    rank[c] = i + 1;
  });
  return rank;
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
