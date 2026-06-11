# World Cup 2026 Group-Stage Tracker — Design Spec

**Date:** 2026-06-11
**Status:** Approved (pending spec review)

## 1. Summary

A live website that tracks each team's progress through its group across the
World Cup 2026 group stage, using jersey-colored progression line charts —
spiritually a successor to the IPL_Charts project, but richer. Deployed on
Vercel, self-updating via a scheduled Claude routine that web-fetches results
and redeploys.

Two tabs:

- **Groups** (headline) — a grid of all 12 groups (A–L) as small-multiple line
  charts; click one to expand. A `[ Points | Rank ]` segmented toggle flips
  every chart at once between cumulative-points and live-group-rank views.
- **Fixtures** — date-by-date list of all 104 matches, both nations' flags on
  each, UK kickoff times, and the score once played.

## 2. Goals & non-goals

**Goals**
- Beautiful, scannable group-stage progression for all 12 groups.
- Lines colored by national jersey color; same-group color clashes auto-shaded.
- Self-updating live site; results land within ~3h of full-time.
- Date-by-date fixtures with flags and UK kickoff times.

**Non-goals (YAGNI)**
- Knockout-stage bracket (group stage only for v1).
- User accounts, comments, predictions.
- Manual score-entry UI (updates come via the Claude routine / on-demand fetch).
- Native app. It's a responsive web page.

## 3. Visual direction (locked from playground)

Theme **Midnight**. Smooth eased curves at **3px** weight with a **neon glow**
(intensity ~16). **Flag-emoji chips at each matchday**, sized **+30% vs the
playground default (≈17px)**. **Flag + country-code labels** at the end of each
line. **Qualification emphasis**: brighten the top-2 (advancing) teams, dim the
rest, dashed top-2 cutoff line. **Hover** spotlights a team's line and fades the
others. **No background gridlines**. Lines **draw on left-to-right** when data
updates, at **0.5× speed**.

The SVG chart engine prototyped in `visual-playground.html` (path builder for
smooth/linear/stepped curves, glow filter, markers, end labels, qualification
emphasis, hover focus, draw-on animation, HSL de-collision) is the reference
implementation and is carried into the build.

## 4. Architecture

Static site + one scheduled routine. No backend server, no framework, no
Chart.js — reuse the playground's dependency-free SVG renderer.

```
fixtures.json  ──►  standings engine (browser)  ──►  render (SVG charts + list)
 (source of         points · rank · tiebreakers
  truth)
     ▲
     │  Scheduled Claude routine (several runs/day during the tournament):
     │   1. find matches where kickoff + ~2h (play) + 3h (buffer) has passed
     │      and status is still "scheduled"
     │   2. web-fetch the score, write it into fixtures.json
     │   3. redeploy to Vercel  →  live site refreshes
     └────────────────────────────────────────────────────────────────────
```

### Components

| Unit | Responsibility | Depends on |
|---|---|---|
| `data/groups.json` | 12 groups: each team's code, name, flag emoji, jersey color | — |
| `data/fixtures.json` | 104 matches: id, group/stage, date, UK kickoff, venue, home/away codes, status, score | — |
| `js/colors.js` | jersey color map + same-group HSL de-collision (`resolveColors`) | groups.json |
| `js/standings.js` | compute cumulative points & live rank per group with football tiebreakers (points → GD → goals scored → head-to-head) | fixtures.json |
| `js/chart.js` | SVG line renderer (from playground): paths, glow, flag chips, end labels, qualification emphasis, hover, draw-on anim | colors, standings |
| `js/app.js` | tabs, group grid + expand, Points/Rank toggle, fixtures list render | all of the above |
| `index.html` + `css` | shell, Midnight theme | — |
| `scripts/update.md` | runbook the routine follows: fetch eligible results → patch fixtures.json → redeploy | — |

Each unit is independently understandable and testable: `standings.js` is pure
(fixtures in → standings out), `colors.js` is pure (teams in → colors out),
`chart.js` takes computed series and draws.

## 5. Data model

**groups.json** (illustrative shape)
```json
{
  "A": [
    { "code": "MEX", "name": "Mexico", "flag": "🇲🇽", "color": "#006847" },
    { "code": "...", "name": "...", "flag": "...", "color": "#..." }
  ]
}
```

**fixtures.json** (illustrative shape)
```json
{
  "id": "M1",
  "stage": "group",
  "group": "A",
  "matchday": 1,
  "dateUK": "2026-06-11",
  "kickoffUK": "2026-06-11T23:00:00+01:00",
  "venue": "Estadio Azteca, Mexico City",
  "home": "MEX", "away": "...",
  "status": "scheduled",          // scheduled | finished
  "score": { "home": null, "away": null }
}
```

Kickoffs are stored as ISO timestamps in UK time (BST = UTC+1 during the
tournament), converted from each venue's local time during data sourcing.

## 6. Standings engine

For each group, fold its finished fixtures in matchday order:

- **Points:** win 3, draw 1, loss 0; series is `[0, MD1, MD2, MD3]` cumulative.
- **Rank:** after each matchday, sort the group table by FIFA tiebreakers
  (points → goal difference → goals scored → head-to-head → fair play →
  drawing of lots fallback). Series is the team's 1–4 position per matchday.
- **Qualifiers:** top 2 of the final (or current) table. Drives the brighten/dim
  emphasis and the dashed cutoff.

Computed client-side so a single fixtures.json edit refreshes every chart.

## 7. Update flow & "kickoff + 3h" trigger

The Claude routine (configured via the `/schedule` skill) runs on a cadence set
from the actual fixture timings once sourced. Each run:

1. Reads fixtures.json, selects matches where `now ≥ kickoff + 3h` and
   `status == "scheduled"` (a match runs ~2h, so this checks ≈1h after FT).
2. Web-fetches each eligible match's final score.
3. Patches fixtures.json (`status: "finished"`, `score`).
4. Redeploys to Vercel.

On-demand path stays available: in a session, "update the tracker" runs the same
fetch-and-patch immediately, as an override / correction.

## 8. Data sourcing

The 2026 draw, venues, and kickoff times fall after the assistant's knowledge
cutoff, so the build **web-fetches the authoritative fixture list and group
draw** rather than guessing, then converts every kickoff to UK time and assigns
jersey colors per nation.

## 9. Deployment

- `git init` the project; commit.
- Deploy to Vercel as a static site (no build step needed; plain HTML/CSS/JS).
- The routine redeploys on each data update.

## 10. Testing

- **Unit:** `standings.js` against hand-computed fixtures (incl. tiebreaker
  edge cases and ties); `colors.js` de-collision (duplicate colors in a group
  shift apart, cross-group duplicates do not).
- **Visual:** the grid renders 12 groups; Points/Rank toggle morphs all charts;
  hover/qualification emphasis behave; flag chips are the larger size.
- **Update:** dry-run the routine against a fixtures.json with a just-finished
  match and confirm it patches the right record.

## 11. Open items deferred to implementation

- Exact routine cadence (set after fixture timings are sourced).
- Final jersey-color map for all 48 nations (sourced during build).
