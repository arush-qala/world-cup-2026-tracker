import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBracketStructure, inOrderLeaves, travelPath, collectTravelMarkers } from '../js/bracket-wheel.js';

test('structure has 32 leaves', () => {
  const leaves = inOrderLeaves(buildBracketStructure());
  assert.equal(leaves.length, 32);
});

test('every leaf is a unique group slot', () => {
  const slots = inOrderLeaves(buildBracketStructure()).map((l) => l.slot);
  assert.ok(slots.every(Boolean), 'all leaves carry a slot');
  assert.equal(new Set(slots).size, 32, 'no duplicate slots');
});

test('in-order leaf sequence matches the bracket feed order', () => {
  const expected = [
    '1E', '3E', '1I', '3I', '2A', '2B', '1F', '2C',
    '2K', '2L', '1H', '2J', '1D', '3D', '1G', '3G',
    '1C', '2F', '2E', '2I', '1A', '3A', '1L', '3L',
    '1J', '2H', '2D', '2G', '1B', '3B', '1K', '3K',
  ];
  const slots = inOrderLeaves(buildBracketStructure()).map((l) => l.slot);
  assert.deepEqual(slots, expected);
});

test('rounds nest correctly from final down to teams', () => {
  const root = buildBracketStructure();
  assert.equal(root.round, 'final');
  assert.deepEqual(root.children.map((c) => c.round), ['sf', 'sf']);

  // Walk one branch all the way to a leaf, collecting the rounds.
  const path = [];
  let n = root;
  while (n.children && n.children.length) {
    path.push(n.round);
    n = n.children[0];
  }
  path.push(n.round);
  assert.deepEqual(path, ['final', 'sf', 'qf', 'r16', 'r32', 'team']);
});

test('travelPath: straight spoke to the Final center', () => {
  const d = travelPath(90, 0.22, 0, 0, 'final');
  assert.equal(d, 'M595.0 500.0 L500.0 500.0');
});

test('travelPath: radial segment when child/parent share an angle', () => {
  const d = travelPath(0, 1.0, 0, 0.72, 'r32');
  assert.equal(d, 'M500.0 68.0 L500.0 189.0 L500.0 189.0 L500.0 189.0');
});

test('travelPath: radial segment plus arc sweep when angles differ', () => {
  const d = travelPath(10, 0.72, 30, 0.54, 'r16');
  assert.equal(
    d,
    'M554.0 193.7 L540.5 270.3 L556.4 273.6 L572.1 278.1 L587.4 283.7 L602.3 290.3 L616.6 298.0'
  );
});

test('collectTravelMarkers: one marker for the advanced child', () => {
  const tree = {
    round: 'r32', _angle: 0, _r: 0.72,
    children: [
      { round: 'team', _angle: 0, _r: 1.0, advanced: true, team: { flag: '🇫🇷', code: 'FRA', label: 'France' }, children: [] },
      { round: 'team', _angle: 10, _r: 1.0, advanced: false, team: { flag: '🇸🇪', code: 'SWE', label: 'Sweden' }, children: [] },
    ],
  };
  const markers = collectTravelMarkers(tree);
  assert.deepEqual(markers, [{
    team: { flag: '🇫🇷', code: 'FRA', label: 'France' },
    delay: 0.70,
    d: 'M500.0 68.0 L500.0 189.0 L500.0 189.0 L500.0 189.0',
  }]);
});

test('collectTravelMarkers: no markers when nothing advanced', () => {
  const tree = {
    round: 'r32', _angle: 0, _r: 0.72,
    children: [
      { round: 'team', _angle: 0, _r: 1.0, advanced: false, team: { flag: '🇫🇷', code: 'FRA', label: 'France' }, children: [] },
      { round: 'team', _angle: 10, _r: 1.0, advanced: false, team: { flag: '🇸🇪', code: 'SWE', label: 'Sweden' }, children: [] },
    ],
  };
  assert.deepEqual(collectTravelMarkers(tree), []);
});

test('collectTravelMarkers: recurses into nested rounds, parent-before-child order', () => {
  const tree = {
    round: 'r16', _angle: 0, _r: 0.54,
    children: [
      {
        round: 'r32', _angle: 0, _r: 0.72, advanced: true, team: { flag: '🇫🇷', code: 'FRA', label: 'France' },
        children: [
          { round: 'team', _angle: 0, _r: 1.0, advanced: true, team: { flag: '🇫🇷', code: 'FRA', label: 'France' }, children: [] },
          { round: 'team', _angle: 10, _r: 1.0, advanced: false, team: { flag: '🇸🇪', code: 'SWE', label: 'Sweden' }, children: [] },
        ],
      },
      {
        round: 'r32', _angle: 90, _r: 0.72, advanced: false, team: { flag: '🇧🇷', code: 'BRA', label: 'Brazil' },
        children: [
          { round: 'team', _angle: 80, _r: 1.0, advanced: false, team: { flag: '🇯🇵', code: 'JPN', label: 'Japan' }, children: [] },
          { round: 'team', _angle: 100, _r: 1.0, advanced: true, team: { flag: '🇧🇷', code: 'BRA', label: 'Brazil' }, children: [] },
        ],
      },
    ],
  };
  const markers = collectTravelMarkers(tree);
  assert.deepEqual(markers.map((m) => m.team.code), ['FRA', 'FRA', 'BRA']);
  assert.deepEqual(markers.map((m) => m.delay), [1.00, 0.70, 0.70]);
});
