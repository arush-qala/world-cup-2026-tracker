import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUTPUT_FILE = path.resolve('data/raw_fantasy_players.json');

async function run() {
  console.log('====================================================');
  console.log('🤖 FIFA World Cup 2026 Fantasy Data Capturer');
  console.log('====================================================');
  console.log('Launching browser in headed mode...');
  console.log('Please log in to your account on the opened browser.');
  console.log('Once you are logged in, I will automatically capture the player');
  console.log('database API responses and save them.');
  console.log('----------------------------------------------------');

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    viewport: null
  });

  const page = await context.newPage();

  let captured = false;

  page.on('response', async (response) => {
    if (captured) return;

    const url = response.url();
    const contentType = response.headers()['content-type'] || '';

    if (contentType.includes('application/json')) {
      try {
        const text = await response.text();
        if (text.length < 500) return; // Ignore small JSONs like status checks

        const data = JSON.parse(text);

        // Check if this data has player structures.
        // It could be an array of players or an object with a players array.
        let playersArray = null;
        if (Array.isArray(data) && data.length > 50 && data[0].squadId) {
          playersArray = data;
        } else if (data && typeof data === 'object') {
          // Check key values
          for (const key of Object.keys(data)) {
            if (Array.isArray(data[key]) && data[key].length > 50 && data[key][0].squadId) {
              playersArray = data[key];
              break;
            }
          }
        }

        if (playersArray) {
          captured = true;
          console.log(`\n🎉 SUCCESS: Detected Player Data API Response!`);
          console.log(`URL: ${url}`);
          console.log(`Total items found: ${playersArray.length}`);
          
          // Save the full response
          fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
          console.log(`Saved raw JSON data to: ${OUTPUT_FILE}`);
          
          console.log('\nClosing browser in 3 seconds...');
          await page.waitForTimeout(3000);
          await browser.close();
          process.exit(0);
        }
      } catch (err) {
        // Ignore JSON parsing errors for non-JSON or chunked bodies
      }
    }
  });

  try {
    await page.goto('https://play.fifa.com/fantasy/team', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('\n👉 Browser is open. Please proceed with login if prompted.');
    console.log('Waiting for network requests... (Press Ctrl+C to abort)');

    // Keep the script running
    await new Promise((resolve) => {
      page.on('close', resolve);
    });
  } catch (error) {
    console.error('Error during execution:', error);
  } finally {
    try {
      await browser.close();
    } catch (e) {}
  }
}

run();
