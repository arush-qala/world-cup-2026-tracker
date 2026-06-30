import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBracketStructure, inOrderLeaves } from '../js/bracket-wheel.js';

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
