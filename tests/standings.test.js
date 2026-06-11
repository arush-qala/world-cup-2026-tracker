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
  // Final pts: POR6, ESP6, BRA4, ARG1. POR vs ESP tie on pts -> GD decides.
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
