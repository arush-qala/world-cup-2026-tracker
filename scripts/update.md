# Result-update runbook

The procedure to refresh the tracker with finished-match results. Run on a
schedule (see "Scheduling" below) or on demand ("update the tracker").

Live site: https://world-cup-2026-tracker-iota.vercel.app
Data source of truth: `data/fixtures.json` (project root).

## Procedure

1. **Pull Latest Changes**: Run `git pull --rebase` first to ensure any recent user UI or codebase modifications are fetched and integrated.
2. **Read** `data/fixtures.json`.
3. **Select eligible matches** — those where BOTH:
   - `status === "scheduled"`, AND
   - the current UK time is at least **kickoff + 3 hours** (i.e. `now >= new Date(kickoffUK) + 3h`).
   A match runs ~2h, so this checks roughly 1 hour after full-time.
4. If no matches are eligible, **stop** (nothing to do).
5. For each eligible match, **web-fetch the final score** from a reputable source
   (FIFA, BBC Sport, Sky Sports, ESPN). Confirm the result from at least one
   authoritative source; if a match was postponed/abandoned, leave it
   `scheduled` and note it.
6. **Patch the record in place**: set `status: "finished"` and
   `score: { home: <int>, away: <int> }`. Do NOT change any other field
   (id, kickoffUK, teams, venue, etc.).
7. **Save** `data/fixtures.json`.
8. **Verify Isolation**: Run `git status` to ensure **ONLY** `data/fixtures.json` has been modified. If any other files (e.g. `index.html`, `js/app.js`, `css/style.css`, etc.) show up as modified, restore them (e.g. `git checkout -- <file>`) to ensure no UI/code changes are overwritten.
9. **Commit**: `git add data/fixtures.json && git commit -m "data: results through <date>"`.
10. **Push**: Push the commit to the remote repository: `git push origin main`.
11. **Redeploy**: `vercel deploy --prod --yes` from the project root (if auto-deploy from GitHub is not configured, or to force-push the live site).
12. **Report** which matches were updated (and any that were postponed/uncertain).
13. **Ask for Fantasy Update**: Explicitly ask the user: *"Would you like to update the fantasy points database now as well?"*
    - If the user approves, follow the **Fantasy Points Database Updates** procedure below.
    - If the user declines, stop.

## Notes
- Standings (points, rank, qualification) are computed in the browser from
  `data/fixtures.json`, so patching scores is all that's needed — no other files
  change when results come in.
- Group stage runs **11–28 June 2026** (72 matches). After that, the group
  tracker is final.
- The single kickoff time flagged as uncertain during data sourcing
  (M36 TUN vs JPN, Monterrey) should be double-checked when its result is fetched.
- **Fantasy Updates**: Whenever the last match of a tournament round (MD1, MD2, MD3, R32, R16, etc.) has finished and scores are updated, the fantasy points database must be updated as well (see "Fantasy Points Database Updates" below).

## Fantasy Points Database Updates

Whenever a tournament round finishes and match scores are updated in `data/fixtures.json`:
1. **Run Scraper**: Execute `node scripts/capture_fantasy.js` to open the headed Chromium browser.
2. **User Login**: Prompt the user to log in to their FIFA account in the opened browser window. Once the dashboard loads, the script automatically captures `data/raw_fantasy_players.json` and closes the browser.
3. **Process Data**: Run `node scripts/process_captured_players.js` to format the captured raw JSON, extract the points for the completed round, and update `data/fantasy_players.json`.
4. **Commit & Push**: Stage the updated database files along with the fixtures:
   `git add data/raw_fantasy_players.json data/fantasy_players.json`
   Include these files in the git commit and push to `main` to deploy the new points to the live website.

## Scheduling

The cadence must be frequent enough that every match is picked up within ~3h of
kickoff during the group stage. Two supported substrates:

- **Cloud (recommended for a true self-updating site):** push this repo to
  GitHub, connect the Vercel project to it (so commits auto-deploy), and register
  a scheduled cloud agent (via the `/schedule` skill) that runs this runbook,
  committing results to GitHub. Runs independently of any local machine.
- **Local:** run this runbook via the `/loop` skill or a local `cron` on the
  Mac. Only updates while the machine is on.
