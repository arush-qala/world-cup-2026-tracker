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
  const g1 = resolveColors([{ code:'A', color:'#FF0000' }]);
  const g2 = resolveColors([{ code:'B', color:'#FF0000' }]);
  assert.equal(g1.A, '#FF0000');
  assert.equal(g2.B, '#FF0000');
});
