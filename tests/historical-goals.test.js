import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(
  readFileSync(new URL('../data/historical-goals.json', import.meta.url), 'utf8')
);

// Published tournament goal totals (regulation + extra time, excluding shootouts).
const KNOWN_TOTAL = { 2010: 145, 2014: 171, 2018: 169, 2022: 172 };
// Expected match counts per stage for a 32-team edition.
const EXPECTED_MATCHES = { MD1: 16, MD2: 16, MD3: 16, R16: 8, QF: 4, SF: 2, FIN: 2 };

test('stageOrder lists the 7 stages of the 32-team format (no R32)', () => {
  assert.deepEqual(data.stageOrder, ['MD1', 'MD2', 'MD3', 'R16', 'QF', 'SF', 'FIN']);
});

test('all four editions (2010–2022) are present', () => {
  const years = data.editions.map(e => e.year).sort();
  assert.deepEqual(years, [2010, 2014, 2018, 2022]);
});

for (const year of [2010, 2014, 2018, 2022]) {
  test(`${year}: stage figures are valid and total matches the published figure`, () => {
    const ed = data.editions.find(e => e.year === year);
    assert.ok(ed, `edition ${year} exists`);
    assert.equal(ed.teams, 32);
    assert.ok(ed.host && typeof ed.host === 'string');
    assert.match(ed.color, /^#[0-9a-fA-F]{6}$/);

    // 32-team editions have no Round of 32.
    assert.equal(ed.stages.R32, undefined, 'no R32 in pre-2026 editions');

    let grand = 0;
    for (const [stage, expMatches] of Object.entries(EXPECTED_MATCHES)) {
      const rec = ed.stages[stage];
      assert.ok(rec, `${year} has stage ${stage}`);
      assert.ok(Number.isInteger(rec.goals) && rec.goals >= 0, `${year} ${stage} goals is a non-negative integer`);
      assert.equal(rec.matches, expMatches, `${year} ${stage} has ${expMatches} matches`);
      grand += rec.goals;
    }
    assert.equal(grand, KNOWN_TOTAL[year], `${year} grand total`);
  });
}
