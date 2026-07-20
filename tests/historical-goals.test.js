import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(
  readFileSync(new URL('../data/historical-goals.json', import.meta.url), 'utf8')
);

// Published tournament goal totals (regulation + extra time, excluding shootouts).
const KNOWN_TOTAL = {
  1958: 126, 1962: 89, 1966: 89, 1970: 95,
  1986: 132, 1990: 115, 1994: 141, 1998: 171,
  2002: 161, 2006: 147, 2010: 145, 2014: 171,
  2018: 169, 2022: 172
};

test('stageOrder lists the 8 standard stages', () => {
  assert.deepEqual(data.stageOrder, ['MD1', 'MD2', 'MD3', 'R16', 'QF', 'SF', '3RD', 'FIN']);
});

test('all 14 historical editions (1958–2022) are present', () => {
  const years = data.editions.map(e => e.year).sort((a, b) => a - b);
  assert.deepEqual(years, [1958, 1962, 1966, 1970, 1986, 1990, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022]);
});

for (const year of Object.keys(KNOWN_TOTAL).map(Number)) {
  test(`${year}: stage figures are valid and total matches the published figure (${KNOWN_TOTAL[year]} goals)`, () => {
    const ed = data.editions.find(e => e.year === year);
    assert.ok(ed, `edition ${year} exists`);
    assert.ok(ed.teams === 16 || ed.teams === 24 || ed.teams === 32, `valid team count for ${year}`);
    assert.ok(ed.host && typeof ed.host === 'string');
    assert.match(ed.color, /^#[0-9a-fA-F]{6}$/);

    // Pre-2026 editions have no Round of 32 (R32).
    assert.equal(ed.stages.R32, undefined, 'no R32 in pre-2026 editions');

    let grand = 0;
    for (const [stage, rec] of Object.entries(ed.stages)) {
      assert.ok(Number.isInteger(rec.goals) && rec.goals >= 0, `${year} ${stage} goals is a non-negative integer`);
      assert.ok(Number.isInteger(rec.matches) && rec.matches > 0, `${year} ${stage} matches is a positive integer`);
      grand += rec.goals;
    }
    assert.equal(grand, KNOWN_TOTAL[year], `${year} grand total`);
  });
}
