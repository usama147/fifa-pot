# Knockout Bracket Accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the knockout bracket from the authoritative `data/knockout-bracket.json` skeleton, binding live ESPN data onto fixed positions, so structure/teams/live-population/stability are all correct and penalty winners advance properly.

**Architecture:** A new pure module `js/bracket-model.js` loads the skeleton, joins each live ESPN knockout event to its FIFA match number by `(venue + date-within-1-day)`, resolves winners via ESPN's `winner` flag, and advances teams structurally through the skeleton's `Winner Match N` references. `js/bracket.js` is rewritten to be rendering-only, consuming that model. The model is Firebase-free and DOM-free so it runs under `node --test`.

**Tech Stack:** Vanilla ES modules, no build step. Tests via Node's built-in `node --test` (Node 24). ESPN scoreboard API. Firebase only in the render layer (unchanged).

## Global Constraints

- No build step, no framework, no new runtime dependencies (project no-build-step principle).
- `js/bracket-model.js` MUST NOT import `js/config.js`, `js/matches.js`, or anything that pulls Firebase — it must import cleanly under Node. Duplicate the two small status Sets locally instead.
- Do NOT modify `js/elimination.js`, `js/pot.js`, `js/pool.js`, `js/leaderboard.js`, `js/players.js`, `js/standings.js`.
- Source of truth is `data/knockout-bracket.json` (top-level keys `bracket` and `bracketOrder`). Do not edit it.
- ESPN endpoint: `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=YYYYMMDD-YYYYMMDD`.
- Round short-keys everywhere: `r32`, `r16`, `qf`, `sf`, `third`, `final`.
- Winner determination is ALWAYS via ESPN `competitor.winner === true` — never score comparison.

---

## File Structure

| File | Responsibility |
|---|---|
| `js/bracket-model.js` | **New.** Pure: skeleton indexing, venue normalization, ESPN→match-number join, winner/feed resolution, `buildModel()`. No DOM, no Firebase. |
| `test/bracket-model.test.mjs` | **New.** `node --test` unit tests for the model. |
| `data/espn-knockout-fixture.json` | **New.** Captured live ESPN snapshot — deterministic test input. |
| `js/bracket.js` | **Rewritten.** Rendering only: loads skeleton + ESPN, calls `buildModel`, builds DOM, attaches owner tags, winner via flag. |
| `data/knockout-bracket.json` | Unchanged (source of truth). |
| `js/elimination.js`, pot/pool/leaderboard/players | Unchanged. |

### Model interface (defined here, referenced by all tasks)

```
// A skeleton match definition (from indexSkeleton)
MatchDef = { matchNumber:int, round:'r32'|'r16'|'qf'|'sf'|'third'|'final',
             stadium:str, hostCity:str, date:str, feedsInto:int|undefined,
             homeDef:str, awayDef:str }           // homeDef/awayDef = raw JSON strings

// A resolved slot for rendering
Slot = { label:str, teamName:str|null, competitor:object|null,
         score:str|null, isWinner:bool, resolved:bool }

// A resolved match for rendering
ResolvedMatch = { matchNumber:int, round:str, stadium:str, hostCity:str, date:str,
                  feedsInto:int|undefined, status:str, event:object|null,
                  home:Slot, away:Slot }

// buildModel output
Model = { order:object /* = skeleton.bracketOrder */, byNumber:Map<int,ResolvedMatch> }
```

Exports from `js/bracket-model.js`:
`VENUE_ALIASES`, `normalizeVenue(name)`, `dayMs(dateStr)`, `ROUND_KEY`, `indexSkeleton(skeleton)`, `isKnockoutEvent(ev)`, `bindEvents(index, espnEvents)`, `outcome(matchNumber, bound)`, `resolveDef(defString, bound)`, `buildModel(skeleton, espnEvents)`, `loadSkeleton()`.

---

## Task 1: Skeleton indexing + venue normalization

**Files:**
- Create: `js/bracket-model.js`
- Create: `test/bracket-model.test.mjs`
- Create: `data/espn-knockout-fixture.json`

**Interfaces:**
- Produces: `normalizeVenue(name)→str`, `dayMs(dateStr)→int`, `ROUND_KEY` object, `indexSkeleton(skeleton)→{ byNumber:Map<int,MatchDef>, venueIndex:Array<{num,venue,dayMs}> }`.

- [ ] **Step 1: Capture the deterministic ESPN fixture**

Run:
```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
curl -s "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260628-20260720" -o data/espn-knockout-fixture.json
node -e "const d=require('./data/espn-knockout-fixture.json');console.log('events:',(d.events||[]).length)"
```
Expected: prints `events:` with a number ≥ 16.

- [ ] **Step 2: Write the failing test**

Create `test/bracket-model.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeVenue, dayMs, indexSkeleton, ROUND_KEY } from '../js/bracket-model.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const skeleton = JSON.parse(readFileSync(join(__dir, '../data/knockout-bracket.json'), 'utf8'));

test('normalizeVenue strips punctuation, diacritics, and the word stadium', () => {
  assert.equal(normalizeVenue('SoFi Stadium'), 'sofi');
  assert.equal(normalizeVenue('AT&T Stadium'), 'att');
  assert.equal(normalizeVenue('Estadio Azteca'), 'estadioazteca');
  assert.equal(normalizeVenue('Estadio BBVA'), 'estadiobbva');
});

test('dayMs returns UTC midnight and ignores time-of-day', () => {
  assert.equal(dayMs('2026-06-29'), dayMs('2026-06-29T20:30Z'));
  assert.equal(dayMs('2026-06-30T01:00Z') - dayMs('2026-06-29'), 86400000);
});

test('indexSkeleton indexes all 32 matches with short round keys', () => {
  const { byNumber, venueIndex } = indexSkeleton(skeleton);
  assert.equal(byNumber.size, 32);
  assert.equal(byNumber.get(74).round, 'r32');
  assert.equal(byNumber.get(74).stadium, 'Gillette Stadium');
  assert.equal(byNumber.get(74).homeDef, 'Group E winners');
  assert.equal(byNumber.get(89).round, 'r16');
  assert.equal(byNumber.get(89).homeDef, 'Winner Match 74');
  assert.equal(byNumber.get(104).round, 'final');
  assert.equal(ROUND_KEY['round-of-32'], 'r32');
  assert.equal(venueIndex.length, 32);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/bracket-model.test.mjs`
Expected: FAIL — cannot import `../js/bracket-model.js` (module not found / no exports).

- [ ] **Step 4: Write the minimal implementation**

Create `js/bracket-model.js`:
```js
// js/bracket-model.js
// Pure bracket model: skeleton indexing, ESPN join, winner/feed resolution.
// MUST stay DOM-free and Firebase-free so it runs under `node --test`.

// Duplicated locally (do NOT import matches.js — it pulls Firebase via config.js).
const FINAL_STATES = new Set([
  "STATUS_FINAL", "STATUS_FULL_TIME", "STATUS_FT_EXTRA_TIME",
  "STATUS_PENALTIES", "STATUS_FINAL_PEN",
]);

export const ROUND_KEY = {
  "round-of-32": "r32",
  "round-of-16": "r16",
  "quarter-finals": "qf",
  "semi-finals": "sf",
  "third-place": "third",
  "final": "final",
};

// Extension point: map a normalized ESPN venue to a normalized skeleton venue
// when the two sources name a stadium differently. Empty until needed.
export const VENUE_ALIASES = {};

export function normalizeVenue(name) {
  const base = (name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")                        // drop all non-alphanumerics
    .replace(/stadium/g, "");
  return VENUE_ALIASES[base] || base;
}

export function dayMs(dateStr) {
  return Date.UTC(
    +dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10)
  );
}

export function indexSkeleton(skeleton) {
  const byNumber = new Map();
  const venueIndex = [];
  const bracket = skeleton.bracket || {};
  for (const [roundName, matches] of Object.entries(bracket)) {
    const round = ROUND_KEY[roundName] || roundName;
    for (const m of matches) {
      const def = {
        matchNumber: m.matchNumber,
        round,
        stadium: m.stadium,
        hostCity: m.hostCity,
        date: m.date,
        feedsInto: m.feedsInto,
        homeDef: m.homeTeam,
        awayDef: m.awayTeam,
      };
      byNumber.set(m.matchNumber, def);
      venueIndex.push({
        num: m.matchNumber,
        venue: normalizeVenue(m.stadium),
        dayMs: dayMs(m.date),
      });
    }
  }
  return { byNumber, venueIndex };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/bracket-model.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
git add js/bracket-model.js test/bracket-model.test.mjs data/espn-knockout-fixture.json
git commit -m "feat: bracket-model skeleton indexing + venue normalization

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: ESPN → match-number join

**Files:**
- Modify: `js/bracket-model.js`
- Modify: `test/bracket-model.test.mjs`

**Interfaces:**
- Consumes: `indexSkeleton()`, `normalizeVenue()`, `dayMs()`.
- Produces: `isKnockoutEvent(ev)→bool`, `bindEvents(index, espnEvents)→Map<int, espnEvent>` (match number → bound ESPN event). Join key = same normalized venue AND date within ±1 day; unbound events logged via `console.warn`.

- [ ] **Step 1: Write the failing test**

Append to `test/bracket-model.test.mjs`:
```js
import { isKnockoutEvent, bindEvents } from '../js/bracket-model.js';

const fixture = JSON.parse(readFileSync(join(__dir, '../data/espn-knockout-fixture.json'), 'utf8'));
const espnEvents = fixture.events || [];

test('isKnockoutEvent detects knockout events by season slug', () => {
  const r32 = espnEvents.find(e => (e.season?.slug || '').includes('round-of-32'));
  assert.ok(r32, 'fixture should contain an R32 event');
  assert.equal(isKnockoutEvent(r32), true);
});

test('bindEvents joins events to match numbers by venue + date (±1 day)', () => {
  const idx = indexSkeleton(skeleton);
  const bound = bindEvents(idx, espnEvents);

  // M74 = Gillette Stadium, 2026-06-29 = ESPN Germany v Paraguay
  const m74 = bound.get(74);
  assert.ok(m74, 'M74 should bind');
  const names74 = m74.competitions[0].competitors.map(c => c.team.displayName).sort();
  assert.deepEqual(names74, ['Germany', 'Paraguay']);

  // M75 = Estadio BBVA, 2026-06-29 — but ESPN dates it 2026-06-30T01:00Z (UTC rollover).
  // The ±1 day tolerance must still bind it.
  const m75 = bound.get(75);
  assert.ok(m75, 'M75 should bind across the UTC day boundary');
  const names75 = m75.competitions[0].competitors.map(c => c.team.displayName).sort();
  assert.deepEqual(names75, ['Morocco', 'Netherlands']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/bracket-model.test.mjs`
Expected: FAIL — `isKnockoutEvent`/`bindEvents` are not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `js/bracket-model.js`:
```js
const KNOCKOUT_SLUGS = [
  "round-of-32", "round-of-16", "quarterfinals", "quarter-finals",
  "semifinals", "semi-finals", "third-place", "3rd-place", "final",
];
const DAY = 86400000;

export function isKnockoutEvent(ev) {
  const slug = (ev.season?.slug || "").toLowerCase();
  return KNOCKOUT_SLUGS.some(k => slug.includes(k));
}

// Join each ESPN knockout event to its FIFA match number.
// Key: identical normalized venue AND kickoff within ±1 calendar day
// (ESPN timestamps are UTC, so a North-American evening match can roll to the
// next UTC day). Venue + a 1-day window is unique across the whole bracket.
export function bindEvents(index, espnEvents) {
  const bound = new Map();
  for (const ev of espnEvents) {
    if (!isKnockoutEvent(ev)) continue;
    const venue = normalizeVenue(ev.competitions?.[0]?.venue?.fullName || "");
    const evDay = dayMs(ev.date || "");
    let best = null;
    let bestDiff = Infinity;
    for (const cand of index.venueIndex) {
      if (cand.venue !== venue) continue;
      const diff = Math.abs(cand.dayMs - evDay);
      if (diff <= DAY && diff < bestDiff && !bound.has(cand.num)) {
        best = cand;
        bestDiff = diff;
      }
    }
    if (best) {
      bound.set(best.num, ev);
    } else {
      console.warn(
        `Unbound knockout event: ${ev.name || "?"} @ ` +
        `${ev.competitions?.[0]?.venue?.fullName || "?"} ${ev.date || "?"}`
      );
    }
  }
  return bound;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/bracket-model.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
git add js/bracket-model.js test/bracket-model.test.mjs
git commit -m "feat: bind ESPN events to match numbers by venue + date window

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Winner/feed resolution + buildModel

**Files:**
- Modify: `js/bracket-model.js`
- Modify: `test/bracket-model.test.mjs`

**Interfaces:**
- Consumes: `indexSkeleton()`, `bindEvents()`.
- Produces:
  - `outcome(matchNumber, bound)→{ winner:str|null, loser:str|null }` (via `winner` flag; null unless the bound event is final).
  - `resolveDef(defString, bound)→{ label:str, teamName:str|null, resolved:bool }` (resolves `Winner Match N` / `Loser Match N` one level; group strings pass through).
  - `buildModel(skeleton, espnEvents)→Model` where `Model = { order, byNumber:Map<int,ResolvedMatch> }`.

- [ ] **Step 1: Write the failing test**

Append to `test/bracket-model.test.mjs`:
```js
import { outcome, resolveDef, buildModel } from '../js/bracket-model.js';

test('outcome uses the winner flag, so penalty results resolve correctly', () => {
  const bound = bindEvents(indexSkeleton(skeleton), espnEvents);
  // M74 Germany v Paraguay ended on penalties; Paraguay carries winner:true.
  const o = outcome(74, bound);
  assert.equal(o.winner, 'Paraguay');
  assert.equal(o.loser, 'Germany');
});

test('resolveDef advances winners one level and placeholders the unplayed', () => {
  const bound = bindEvents(indexSkeleton(skeleton), espnEvents);
  const played = resolveDef('Winner Match 74', bound);
  assert.equal(played.teamName, 'Paraguay');
  assert.equal(played.resolved, true);

  const unplayed = resolveDef('Winner Match 101', bound); // SF, not in fixture window
  assert.equal(unplayed.teamName, null);
  assert.equal(unplayed.resolved, false);
  assert.equal(unplayed.label, 'Winner M101');

  const group = resolveDef('Group E winners', bound);
  assert.equal(group.resolved, false);
  assert.equal(group.label, 'Group E winners');
});

test('buildModel resolves 32 matches; winner flag drives isWinner', () => {
  const model = buildModel(skeleton, espnEvents);
  assert.equal(model.byNumber.size, 32);

  const m74 = model.byNumber.get(74);
  // Bound match renders its own event competitors; Paraguay is the winner.
  const winners = [m74.home, m74.away].filter(s => s.isWinner).map(s => s.teamName);
  assert.deepEqual(winners, ['Paraguay']);

  // The final is unplayed → both slots are feed placeholders.
  const m104 = model.byNumber.get(104);
  assert.equal(m104.home.label, 'Winner M101');
  assert.equal(m104.away.label, 'Winner M102');
  assert.equal(m104.home.resolved, false);

  // order passes through for the renderer.
  assert.deepEqual(model.order.left.r32, [74, 77, 73, 75, 83, 84, 81, 82]);
});

test('buildModel is deterministic — identical output on repeat (drift guard)', () => {
  const project = m => [...m.byNumber.entries()]
    .map(([n, r]) => [n, r.home.label, r.away.label, r.status]);
  const a = project(buildModel(skeleton, espnEvents));
  const b = project(buildModel(skeleton, espnEvents));
  assert.deepEqual(a, b);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/bracket-model.test.mjs`
Expected: FAIL — `outcome`/`resolveDef`/`buildModel` not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `js/bracket-model.js`:
```js
export function outcome(matchNumber, bound) {
  const ev = bound.get(matchNumber);
  if (!ev || !FINAL_STATES.has(ev.status?.type?.name || "")) {
    return { winner: null, loser: null };
  }
  const comps = ev.competitions?.[0]?.competitors || [];
  const w = comps.find(c => c.winner === true);
  const l = comps.find(c => c.winner === false);
  return {
    winner: w?.team?.displayName || null,
    loser: l?.team?.displayName || null,
  };
}

// Resolve a slot definition string to a display label + (maybe) a real team.
// One level only: an unplayed feed shows "Winner M<n>" rather than recursing.
export function resolveDef(defString, bound) {
  const s = defString || "";
  const win = s.match(/winner match (\d+)/i);
  const los = s.match(/loser match (\d+)/i);
  if (win || los) {
    const num = parseInt((win || los)[1], 10);
    const o = outcome(num, bound);
    const name = win ? o.winner : o.loser;
    if (name) return { label: name, teamName: name, resolved: true };
    return { label: `${win ? "Winner" : "Loser"} M${num}`, teamName: null, resolved: false };
  }
  // Group placeholder (e.g. "Group E winners") — passes through untouched.
  return { label: s, teamName: null, resolved: false };
}

function slotFromCompetitor(c) {
  return {
    label: c?.team?.displayName || "TBC",
    teamName: c?.team?.displayName || null,
    competitor: c || null,
    score: c?.score ?? null,
    isWinner: c?.winner === true,
    resolved: !!c?.team?.displayName,
  };
}

function slotFromDef(defString, bound) {
  const r = resolveDef(defString, bound);
  return {
    label: r.label,
    teamName: r.teamName,
    competitor: null,
    score: null,
    isWinner: false,
    resolved: r.resolved,
  };
}

export function buildModel(skeleton, espnEvents) {
  const index = indexSkeleton(skeleton);
  const bound = bindEvents(index, espnEvents);
  const byNumber = new Map();

  for (const [num, def] of index.byNumber) {
    const ev = bound.get(num) || null;
    const comps = ev?.competitions?.[0]?.competitors || [];
    const home = comps.find(c => c.homeAway === "home");
    const away = comps.find(c => c.homeAway === "away");

    byNumber.set(num, {
      matchNumber: num,
      round: def.round,
      stadium: def.stadium,
      hostCity: def.hostCity,
      date: ev?.date || def.date,
      feedsInto: def.feedsInto,
      status: ev?.status?.type?.name || "STATUS_SCHEDULED",
      event: ev,
      home: ev && home ? slotFromCompetitor(home) : slotFromDef(def.homeDef, bound),
      away: ev && away ? slotFromCompetitor(away) : slotFromDef(def.awayDef, bound),
    });
  }
  return { order: skeleton.bracketOrder, byNumber };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/bracket-model.test.mjs`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
git add js/bracket-model.js test/bracket-model.test.mjs
git commit -m "feat: winner/feed resolution and buildModel with drift guard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: bracket.js data layer + delete dead inference code

**Files:**
- Modify: `js/bracket.js:1-293` (imports, round config, delete inference block, entry points)

**Interfaces:**
- Consumes: `buildModel`, `loadSkeleton` from `./bracket-model.js`.
- Produces: `loadSkeleton()` in the model module; `renderBracket(container)` unchanged signature; `fetchAndRender(container, poolTeams, skeleton)` now builds a model and calls `renderViews(container, model, poolTeams)`.

- [ ] **Step 1: Add the browser skeleton loader to the model**

Append to `js/bracket-model.js`:
```js
// Browser-only: fetch the skeleton JSON. Not exercised by node tests.
export async function loadSkeleton() {
  const res = await fetch("./data/knockout-bracket.json");
  if (!res.ok) throw new Error(`skeleton load failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Rewrite the top of `js/bracket.js` (imports + round labels), deleting the inference block**

Replace `js/bracket.js` lines 1–268 (everything from the top through the end of `fetchRounds`) with:
```js
// js/bracket.js — renders the knockout bracket from the fixed skeleton model.
import { teamMatches } from "./config.js";
import { LIVE_STATES, FINAL_STATES, buildCard } from "./matches.js";
import { buildModel, loadSkeleton } from "./bracket-model.js";

const ROUND_ORDER  = ["r32", "r16", "qf", "sf", "third", "final"];
const ROUND_LABELS = {
  r32: "ROUND OF 32", r16: "ROUND OF 16", qf: "QUARTER-FINALS",
  sf: "SEMI-FINALS", third: "THIRD PLACE", final: "FINAL",
};
```

Note: this deletes `detectRound`, `R32_L`, `R32_R`, `MATCH_NUMS_L/R/CENTER`, `nameHitsSlot`, `REF_PATTERNS`, `resolveEventTeams`, `eventHitsSide`, `r32SlotOf`, `traceSlot`, `splitAndOrder`, `loadPoolTeams`, `fetchRounds`, and the old `ESPN_BASE`/`collection`/`getDocs`/`db` imports. `loadPoolTeams` moves in Step 3.

- [ ] **Step 3: Rewrite the entry points**

Replace the old `renderBracket` / `fetchAndRender` (previously lines ~270–293) with:
```js
// ── Pool teams (Firestore) ──────────────────────────────────────────────────
import { db } from "./config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

async function loadPoolTeams() {
  try {
    const snap = await getDocs(collection(db, "pool", "main", "participants"));
    const result = [];
    snap.forEach(d => {
      const p = d.data();
      if (!p.teams) return;
      Object.entries(p.teams).forEach(([tierKey, team]) => {
        result.push({ participantName: p.name, tierKey, team });
      });
    });
    return result;
  } catch { return []; }
}

// ── Main entry ──────────────────────────────────────────────────────────────
let pollTimer = null;

export async function renderBracket(container) {
  container.innerHTML = `<div class="loading">Loading bracket...</div>`;
  let skeleton;
  try {
    skeleton = await loadSkeleton();
  } catch (err) {
    console.error("Bracket skeleton load error:", err);
    container.innerHTML = `
      <div class="empty-state"><p>Could not load bracket structure.</p></div>`;
    return;
  }
  const poolTeams = await loadPoolTeams();
  await fetchAndRender(container, poolTeams, skeleton);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => fetchAndRender(container, poolTeams, skeleton), 60000);
}

async function fetchAndRender(container, poolTeams, skeleton) {
  let events = [];
  try {
    const start = "20260628";
    const end   = "20260720";
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${start}-${end}`
    );
    events = (await res.json()).events || [];
  } catch (err) {
    console.warn("Bracket ESPN fetch failed — rendering skeleton only:", err);
  }
  const model = buildModel(skeleton, events);
  renderViews(container, model, poolTeams);
}
```

- [ ] **Step 4: Verify the model still binds via a Node smoke check**

Run:
```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
node --input-type=module -e "
import { buildModel } from './js/bracket-model.js';
import { readFileSync } from 'node:fs';
const sk = JSON.parse(readFileSync('./data/knockout-bracket.json','utf8'));
const ev = JSON.parse(readFileSync('./data/espn-knockout-fixture.json','utf8')).events;
const m = buildModel(sk, ev);
const m74 = m.byNumber.get(74);
console.log('M74:', m74.home.label, m74.home.score, 'vs', m74.away.label, m74.away.score, '| status', m74.status);
console.log('M104:', m.byNumber.get(104).home.label, 'vs', m.byNumber.get(104).away.label);
"
```
Expected: prints `M74: Germany 1 vs Paraguay 1 | status STATUS_FINAL_PEN` and `M104: Winner M101 vs Winner M102`.

- [ ] **Step 5: Run the full model test suite (must still pass)**

Run: `node --test test/bracket-model.test.mjs`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
git add js/bracket.js js/bracket-model.js
git commit -m "refactor: drive bracket data layer from skeleton model, drop inference

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Render columns + slots from the model (winner flag, placeholders, owner tags)

**Files:**
- Modify: `js/bracket.js` (`renderViews`, `renderTree`, `buildBracketColumn`, `buildBracketSlot`, `buildBracketTeamRow`, `buildBracketOwnerTag`)

**Interfaces:**
- Consumes: `Model` (`{ order, byNumber }`), `ResolvedMatch`, `Slot`.
- Produces: DOM. `buildBracketSlot(match, poolTeams)` renders a `ResolvedMatch`; `buildBracketTeamRow(slot, dimmed, showScore)` renders a `Slot`.

- [ ] **Step 1: Rewrite `renderViews` + `renderTree` to iterate the skeleton order**

Replace the existing `renderViews` and `renderTree` with:
```js
function renderViews(container, model, poolTeams) {
  container.innerHTML = "";
  const anyPlayed = [...model.byNumber.values()].some(
    m => LIVE_STATES.has(m.status) || FINAL_STATES.has(m.status)
  );

  // Mobile list
  const listEl = document.createElement("div");
  listEl.className = "bracket-list";
  renderList(listEl, model, poolTeams);
  container.appendChild(listEl);

  // Top scrollbar rail
  const scrollTop = document.createElement("div");
  scrollTop.className = "bracket-scroll-top";
  const scrollTopInner = document.createElement("div");
  scrollTopInner.className = "bracket-scroll-top-inner";
  scrollTop.appendChild(scrollTopInner);
  container.appendChild(scrollTop);

  // Desktop tree
  const treeEl = document.createElement("div");
  treeEl.className = "bracket-tree";
  const wrapper = renderTree(model, poolTeams);
  treeEl.appendChild(wrapper);
  container.appendChild(treeEl);

  requestAnimationFrame(() => {
    scrollTopInner.style.width = wrapper.scrollWidth + "px";
    let syncing = false;
    scrollTop.addEventListener("scroll", () => {
      if (syncing) return; syncing = true;
      treeEl.scrollLeft = scrollTop.scrollLeft; syncing = false;
    });
    treeEl.addEventListener("scroll", () => {
      if (syncing) return; syncing = true;
      scrollTop.scrollLeft = treeEl.scrollLeft; syncing = false;
    });
    drawConnectors(wrapper);
  });

  const ts = document.createElement("p");
  ts.className = "bracket-timestamp";
  ts.textContent = anyPlayed
    ? `Updated ${new Date().toLocaleTimeString()}`
    : `Knockout stage starts 28 June · Updated ${new Date().toLocaleTimeString()}`;
  container.appendChild(ts);
}

function renderTree(model, poolTeams) {
  const wrapper = document.createElement("div");
  wrapper.className = "bracket-wrapper";
  const get = n => model.byNumber.get(n);

  // Left half: R32 → R16 → QF → SF
  const leftEl = document.createElement("div");
  leftEl.className = "bracket-half bracket-half-left";
  ["r32", "r16", "qf", "sf"].forEach(key => {
    const nums = model.order.left?.[key] || [];
    if (!nums.length) return;
    leftEl.appendChild(buildBracketColumn(key, nums.map(get), poolTeams));
  });
  wrapper.appendChild(leftEl);

  // Center: Final + Third place
  const finalM = get(104);
  const thirdM = get(103);
  if (finalM || thirdM) {
    const centerEl = document.createElement("div");
    centerEl.className = "bracket-center";
    if (finalM) {
      const lbl = document.createElement("div");
      lbl.className = "bracket-center-label";
      lbl.textContent = "FINAL";
      centerEl.appendChild(lbl);
      centerEl.appendChild(buildBracketSlot(finalM, poolTeams));
    }
    if (thirdM) {
      const lbl = document.createElement("div");
      lbl.className = "bracket-center-label bracket-center-label-third";
      lbl.textContent = "3RD PLACE";
      centerEl.appendChild(lbl);
      centerEl.appendChild(buildBracketSlot(thirdM, poolTeams));
    }
    wrapper.appendChild(centerEl);
  }

  // Right half: SF → QF → R16 → R32
  const rightEl = document.createElement("div");
  rightEl.className = "bracket-half bracket-half-right";
  ["sf", "qf", "r16", "r32"].forEach(key => {
    const nums = model.order.right?.[key] || [];
    if (!nums.length) return;
    rightEl.appendChild(buildBracketColumn(key, nums.map(get), poolTeams));
  });
  wrapper.appendChild(rightEl);

  return wrapper;
}
```

- [ ] **Step 2: Rewrite `buildBracketColumn` + `buildBracketSlot` to take model nodes**

Replace the existing `buildBracketColumn` and `buildBracketSlot` with:
```js
function buildBracketColumn(key, matches, poolTeams) {
  const col = document.createElement("div");
  col.className = "bracket-col";
  col.dataset.round = key;

  const hdr = document.createElement("div");
  hdr.className = "bracket-col-header";
  hdr.textContent = ROUND_LABELS[key] || key.toUpperCase();
  col.appendChild(hdr);

  const slots = document.createElement("div");
  slots.className = "bracket-slots";
  for (let i = 0; i < matches.length; i += 2) {
    const pair = document.createElement("div");
    pair.className = "bracket-pair";
    if (matches[i])     pair.appendChild(buildBracketSlot(matches[i], poolTeams));
    if (matches[i + 1]) pair.appendChild(buildBracketSlot(matches[i + 1], poolTeams));
    slots.appendChild(pair);
  }
  col.appendChild(slots);
  return col;
}

function buildBracketSlot(match, poolTeams) {
  const isLive  = LIVE_STATES.has(match.status);
  const isFinal = FINAL_STATES.has(match.status);

  const slot = document.createElement("div");
  slot.className = "bracket-slot";

  const card = document.createElement("div");
  card.className = "bracket-match"
    + (isFinal ? " bracket-match--played" : "")
    + (isLive ? " bracket-match--live" : "");

  const statusEl = document.createElement("div");
  statusEl.className = "bracket-match-status";
  const matchLabel = `M${match.matchNumber} · `;
  if (isLive) {
    const clock = match.event?.status?.displayClock;
    statusEl.textContent = clock ? `${matchLabel}LIVE · ${clock}` : `${matchLabel}LIVE`;
    statusEl.style.color = "var(--green)";
  } else if (isFinal) {
    statusEl.textContent = matchLabel + bracketFinalLabel(match.event);
  } else {
    statusEl.textContent = matchLabel + bracketKickoff(match.date);
  }
  card.appendChild(statusEl);

  const divider = document.createElement("div");
  divider.className = "bracket-divider";
  card.appendChild(divider);

  // A slot's own played state dims the loser; live/final shows scores.
  card.appendChild(buildBracketTeamRow(match.home, isFinal && !match.home.isWinner, isFinal || isLive));
  ownerTagsFor(match.home, poolTeams).forEach(t => card.appendChild(t));
  card.appendChild(buildBracketTeamRow(match.away, isFinal && !match.away.isWinner, isFinal || isLive));
  ownerTagsFor(match.away, poolTeams).forEach(t => card.appendChild(t));

  card.style.cursor = "pointer";
  card.addEventListener("click", () => showMatchModal(match, poolTeams));

  slot.appendChild(card);
  return slot;
}

// Owner tags live in the render layer (needs Firebase-loaded poolTeams + teamMatches).
function ownerTagsFor(slot, poolTeams) {
  if (!slot.teamName) return [];
  return poolTeams
    .filter(pt => teamMatches(slot.teamName, pt.team.name))
    .map(pt => buildBracketOwnerTag(pt));
}
```

- [ ] **Step 3: Rewrite `buildBracketTeamRow` to take a `Slot`**

Replace the existing `buildBracketTeamRow` with:
```js
function buildBracketTeamRow(slot, dimmed, showScore) {
  const row = document.createElement("div");
  row.className = "bracket-team-row";
  if (dimmed) row.style.opacity = "0.35";

  const logoUrl = slot.competitor?.team?.logo || slot.competitor?.team?.logos?.[0]?.href;
  if (logoUrl) {
    const flag = document.createElement("img");
    flag.className = "bracket-flag";
    flag.src = logoUrl; flag.alt = ""; flag.loading = "lazy";
    row.appendChild(flag);
  } else {
    const ph = document.createElement("span");
    ph.className = "bracket-flag-ph";
    row.appendChild(ph);
  }

  const name = document.createElement("span");
  name.className = "bracket-team-name";
  // Real team → abbreviation if available; placeholder → its label text.
  name.textContent = slot.competitor?.team?.abbreviation || slot.label;
  if (!slot.resolved) name.style.opacity = "0.6";
  row.appendChild(name);

  if (showScore) {
    const score = document.createElement("span");
    score.className = "bracket-score";
    score.textContent = slot.score ?? "–";
    row.appendChild(score);
  }
  return row;
}
```

`buildBracketOwnerTag` is unchanged — keep it as-is.

- [ ] **Step 4: Manual verification in the browser**

Run a static server and open the app:
```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
python3 -m http.server 8765
```
Open `http://localhost:8765/` → go to the Bracket tab. Verify:
- Left half top-to-bottom R32 shows match numbers **M74, M77, M73, M75, M83, M84, M81, M82** (matches the skeleton, not the old order).
- Germany–Paraguay (M74) shows **Paraguay** bold/undimmed and **Germany** dimmed (penalty result), status `M74 · FT · PENS`.
- The Final (center) shows **Winner M101 vs Winner M102** greyed until those matches complete.
- Refresh the page twice — no slot changes position.

Stop the server with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
git add js/bracket.js
git commit -m "feat: render bracket columns/slots from model with winner-flag dimming

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: List view + match modal on model nodes

**Files:**
- Modify: `js/bracket.js` (`renderList`, `showMatchModal`)

**Interfaces:**
- Consumes: `Model`, `ResolvedMatch`, `Slot`.
- Produces: DOM (mobile list + detail modal).

- [ ] **Step 1: Rewrite `renderList` to walk the skeleton order**

Replace the existing `renderList` with:
```js
function renderList(container, model, poolTeams) {
  const order = model.order;
  const numsByRound = {
    r32:  [...(order.left?.r32 || []), ...(order.right?.r32 || [])],
    r16:  [...(order.left?.r16 || []), ...(order.right?.r16 || [])],
    qf:   [...(order.left?.qf  || []), ...(order.right?.qf  || [])],
    sf:   [...(order.left?.sf  || []), ...(order.right?.sf  || [])],
    third: [103],
    final: [104],
  };

  ROUND_ORDER.forEach(key => {
    const matches = (numsByRound[key] || [])
      .map(n => model.byNumber.get(n))
      .filter(Boolean);
    if (!matches.length) return;

    const isLiveRound = matches.some(m => LIVE_STATES.has(m.status));
    const hdr = document.createElement("div");
    hdr.style.cssText = "display:flex;align-items:center;gap:8px;margin:18px 0 10px;";
    if (isLiveRound) {
      const dot = document.createElement("span");
      dot.className = "live-dot";
      hdr.appendChild(dot);
    }
    const text = document.createElement("span");
    text.style.cssText = "font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:2px;color:var(--muted);white-space:nowrap;";
    text.textContent = ROUND_LABELS[key] || key.toUpperCase();
    hdr.appendChild(text);
    const line = document.createElement("div");
    line.style.cssText = "flex:1;height:1px;background:var(--border);";
    hdr.appendChild(line);
    container.appendChild(hdr);

    // Bound matches render the rich ESPN card; unplayed slots use the bracket slot.
    matches.forEach(m => {
      if (m.event) {
        const s = m.status;
        container.appendChild(buildCard(m.event, poolTeams, LIVE_STATES.has(s), FINAL_STATES.has(s)));
      } else {
        container.appendChild(buildBracketSlot(m, poolTeams));
      }
    });
  });
}
```

- [ ] **Step 2: Rewrite `showMatchModal` to take a model node**

Replace the existing `showMatchModal` with:
```js
function showMatchModal(match, poolTeams) {
  document.getElementById("bracket-modal")?.remove();

  const isLive  = LIVE_STATES.has(match.status);
  const isFinal = FINAL_STATES.has(match.status);
  const venue   = match.event?.competitions?.[0]?.venue;

  const overlay = document.createElement("div");
  overlay.id = "bracket-modal";
  overlay.className = "bm-overlay";
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  const panel = document.createElement("div");
  panel.className = "bm-panel";
  panel.addEventListener("click", e => e.stopPropagation());

  const closeBtn = document.createElement("button");
  closeBtn.className = "bm-close";
  closeBtn.innerHTML = "&#x2715;";
  closeBtn.addEventListener("click", () => overlay.remove());
  panel.appendChild(closeBtn);

  const roundLbl = document.createElement("div");
  roundLbl.className = "bm-round";
  roundLbl.textContent = (ROUND_LABELS[match.round] || match.round.toUpperCase())
    + ` · M${match.matchNumber}`;
  panel.appendChild(roundLbl);

  const statusEl = document.createElement("div");
  statusEl.className = "bm-status" + (isLive ? " bm-status--live" : "");
  if (isLive) {
    const clock = match.event?.status?.displayClock;
    statusEl.textContent = clock ? `LIVE · ${clock}` : "LIVE";
  } else if (isFinal) {
    statusEl.textContent = bracketFinalLabel(match.event);
  } else {
    const d = new Date(match.date);
    statusEl.textContent = d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })
      + " · " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  panel.appendChild(statusEl);

  const teamsEl = document.createElement("div");
  teamsEl.className = "bm-teams";
  [match.home, match.away].forEach((slot, idx) => {
    const teamEl = document.createElement("div");
    teamEl.className = "bm-team" + (isFinal && !slot.isWinner ? " bm-team--dim" : "");

    const logoUrl = slot.competitor?.team?.logo || slot.competitor?.team?.logos?.[0]?.href;
    if (logoUrl) {
      const img = document.createElement("img");
      img.className = "bm-flag";
      img.src = logoUrl; img.alt = "";
      teamEl.appendChild(img);
    }

    const nameEl = document.createElement("div");
    nameEl.className = "bm-team-name";
    nameEl.textContent = slot.competitor?.team?.displayName || slot.label;
    teamEl.appendChild(nameEl);

    if (isFinal || isLive) {
      const scoreEl = document.createElement("div");
      scoreEl.className = "bm-score";
      scoreEl.textContent = slot.score ?? "–";
      teamEl.appendChild(scoreEl);
    }

    if (slot.teamName) {
      const owners = poolTeams.filter(pt => teamMatches(slot.teamName, pt.team.name));
      if (owners.length) {
        const ownersEl = document.createElement("div");
        ownersEl.className = "bm-owners";
        owners.forEach(pt => {
          const tag = document.createElement("span");
          tag.className = `bm-owner-tag ${pt.tierKey}`;
          tag.textContent = pt.participantName;
          ownersEl.appendChild(tag);
        });
        teamEl.appendChild(ownersEl);
      }
    }

    teamsEl.appendChild(teamEl);
    if (idx === 0) {
      const vs = document.createElement("div");
      vs.className = "bm-vs";
      vs.textContent = "vs";
      teamsEl.appendChild(vs);
    }
  });
  panel.appendChild(teamsEl);

  if (venue?.fullName) {
    const venueEl = document.createElement("div");
    venueEl.className = "bm-venue";
    const city = venue.address?.city || "";
    venueEl.textContent = venue.fullName + (city ? `, ${city}` : "");
    panel.appendChild(venueEl);
  }

  const onKey = e => { if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  gsap.from(panel, { duration: 0.25, opacity: 0, y: 20, ease: "power3.out" });
}
```

`drawConnectors`, `drawColConnectors`, `bracketFinalLabel`, `bracketKickoff`, `buildBracketOwnerTag` are unchanged — keep them.

- [ ] **Step 2b: Verify no dangling references to deleted symbols**

Run:
```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
grep -nE "detectRound|R32_L|R32_R|MATCH_NUMS|resolveEventTeams|eventHitsSide|r32SlotOf|traceSlot|splitAndOrder|fetchRounds|roundsSorted" js/bracket.js || echo "clean — no dead references"
```
Expected: `clean — no dead references`.

- [ ] **Step 3: Manual verification in the browser**

Run `python3 -m http.server 8765` and open `http://localhost:8765/` → Bracket tab:
- Mobile width (narrow the window): list view groups by round R32→Final; completed matches show rich cards, future rounds show placeholder slots.
- Click any match → modal opens with `ROUND · M##`, correct teams/score/venue, loser dimmed on final matches, pool owners listed.
- Esc / click-outside / ✕ all close the modal.

Stop the server with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
git add js/bracket.js
git commit -m "feat: model-driven bracket list view and match modal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes (author checklist — already applied)

- **Spec coverage:** skeleton-driven render (Tasks 4–6), date+venue join with alias table (Task 2), winner-flag + `feedsInto` advancement (Task 3), placeholders (Task 3/5), error handling (Task 4), fixture + tests (Tasks 1–3). Eliminations untouched per spec.
- **Join tolerance:** ±1 day added to the spec's date+venue join to handle ESPN's UTC day-rollover (discovered against live data). Documented in Task 2.
- **Testability refinement:** owner-tag matching lives in the render layer (Task 5) rather than the model, so `bracket-model.js` stays Firebase-free and `node --test`-able — a deliberate refinement of the spec's slot shape.
- **Type consistency:** `Slot`/`ResolvedMatch`/`Model` shapes are used identically across Tasks 3–6; `buildBracketSlot(match, poolTeams)` and `buildBracketTeamRow(slot, dimmed, showScore)` signatures match every call site.
