import fs from 'fs';
import path from 'path';

const rawPath = path.resolve('data/raw_fantasy_players.json');
const groupsPath = path.resolve('data/groups.json');
const outputPath = path.resolve('data/fantasy_players.json');

const SQUAD_MAP = {
  "1": "ALG", "2": "ARG", "3": "AUS", "4": "AUT", "5": "BEL", "6": "BIH",
  "7": "BRA", "8": "CPV", "9": "CAN", "10": "COL", "11": "COD", "12": "CIV",
  "13": "CRO", "14": "CUW", "15": "CZE", "16": "ECU", "17": "EGY", "18": "ENG",
  "19": "FRA", "20": "GER", "21": "GHA", "22": "HAI", "23": "IRN", "24": "IRQ",
  "25": "JPN", "26": "JOR", "27": "KOR", "28": "MEX", "29": "MAR", "30": "NED",
  "31": "NZL", "32": "NOR", "33": "PAN", "34": "PAR", "35": "POR", "36": "QAT",
  "37": "KSA", "38": "SCO", "39": "SEN", "40": "RSA", "41": "ESP", "42": "SWE",
  "43": "SUI", "44": "TUN", "45": "TUR", "46": "URU", "47": "USA", "48": "UZB"
};

function run() {
  if (!fs.existsSync(rawPath)) {
    console.error(`Error: Raw data file not found at ${rawPath}`);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));
  const groups = JSON.parse(fs.readFileSync(groupsPath, 'utf-8'));
  
  // Flatten groups into a country lookup dictionary
  const countries = {};
  Object.keys(groups).forEach(groupLetter => {
    groups[groupLetter].forEach(c => {
      countries[c.code] = c;
    });
  });

  const processedPlayers = rawData.map(p => {
    const countryCode = SQUAD_MAP[p.squadId];
    const country = countries[countryCode] || { name: 'Unknown', flag: '🏳️' };

    // Format display name
    let displayName = '';
    if (p.knownName && p.knownName.trim() !== '') {
      displayName = p.knownName.trim();
    } else {
      displayName = `${p.firstName || ''} ${p.lastName || ''}`.trim();
    }

    const stats = p.stats || {};
    const roundPoints = stats.roundPoints || {};

    // Retrieve round points safely
    const md1 = parseInt(roundPoints["1"], 10) || 0;
    const md2 = parseInt(roundPoints["2"], 10) || 0;
    const md3 = parseInt(roundPoints["3"], 10) || 0;
    const r32 = parseInt(roundPoints["4"], 10) || 0;
    const r16 = parseInt(roundPoints["5"], 10) || 0; // Round of 16 points

    // Total points can be parsed from stats or recalculated
    const totalPoints = parseInt(stats.totalPoints, 10) || 0;
    const avgPoints = parseFloat(stats.avgPoints) || 0;
    const form = parseFloat(stats.form) || 0;
    const lastRoundPoints = parseInt(stats.lastRoundPoints, 10) || 0;

    return {
      id: String(p.id),
      fifaId: String(p.fifaId),
      name: displayName,
      firstName: p.firstName || '',
      lastName: p.lastName || '',
      position: p.position || 'N/A',
      price: parseFloat(p.price) || 0,
      percentSelected: parseFloat(p.percentSelected) || 0,
      teamCode: countryCode || 'UNK',
      teamName: country.name,
      teamFlag: country.flag,
      avgPoints: avgPoints,
      form: form,
      lastRoundPoints: lastRoundPoints,
      totalPoints: totalPoints,
      pointsByRound: {
        md1,
        md2,
        md3,
        r32,
        r16
      },
      status: p.status || 'playing',
      oneToWatch: p.oneToWatch === true
    };
  }).filter(p => p.name !== '');

  fs.writeFileSync(outputPath, JSON.stringify(processedPlayers, null, 2));
  console.log(`Successfully processed and outputted ${processedPlayers.length} players to ${outputPath}`);
}

run();
