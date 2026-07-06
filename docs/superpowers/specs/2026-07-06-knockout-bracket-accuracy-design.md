# Knockout Bracket Accuracy — Design Spec

**Date:** 2026-07-06
**Status:** Approved design, pending implementation plan
**Supersedes:** the ESPN-inference approach in `2026-06-29-knockout-bracket-design.md`

## Problem

The knockout bracket (`js/bracket.js`) is inaccurate to the real tournament in four ways the user confirmed:

1. **Wrong structure/feeding** — match numbers and which R32 match feeds which R16 slot don't match FIFA's official bracket.
2. **Wrong teams in slots** — teams are placed by hardcoded name fragments and reverse-inference, not by their actual match.
3. **Teams don't populate live** — slots stay as guesses instead of filling with real winners as matches complete.
4. **Positions drift/shuffle** — slots move between the 60-second refreshes.

### Root cause

`js/bracket.js` never reads `data/knockout-bracket.json` — the authoritative FIFA WC2026 skeleton (match numbers, `feedsInto` links, group-slot definitions, stadiums, dates, left/right visual order). Instead it:

- Hardcodes team-name fragment arrays (`R32_L`, `R32_R`) and match-number arrays (`MATCH_NUMS_L`, `MATCH_NUMS_R`) that **disagree** with the JSON (e.g. JSON left-R32 ends `…81, 82` but code has `…81, 80`; JSON right-R32 is `76, 78, 79, 80, 86, 88, 85, 87` but code has `76, 78, 79, 82, 85, 86, 88, 87`).
- Reverse-engineers each event's bracket position from live team names every poll (`eventHitsSide`, `r32SlotOf`, `traceSlot`, `splitAndOrder`, `resolveEventTeams`). Because positions are recomputed from mutable data, they drift.

A second, independent bug: winners are computed by **score comparison** (`js/bracket.js:510` `homeWon = homeScore > awayScore`). On a penalty match the 90/120-minute score is level (e.g. Germany 1–1 Paraguay), so **neither side is marked the winner**, the loser isn't dimmed, and the correct team doesn't advance — even though ESPN reports the winner explicitly.

### Verified facts (against live ESPN data, 2026-07-06)

- ESPN sets `competitor.winner = true/false` correctly **including on penalty matches** (`STATUS_FINAL_PEN`): Germany `winner:false`, Paraguay `winner:true`, with note `"Paraguay advance 4-3 on penalties"`.
- `js/elimination.js` already keys off the `winner` flag first, so pool/pot/leaderboard/players **already auto-eliminate correctly**, penalty losers included. No change needed there.
- Each R32 skeleton match has a **unique `(calendar-day + venue)`** that matches ESPN exactly (skeleton M74 = Gillette Stadium / 2026-06-29 = ESPN "Paraguay at Germany" at Gillette Stadium). Venue strings align across the two sources.
- `data/knockout-bracket.json`'s `bracketOrder` is internally consistent with every `feedsInto` pairing (verified for all rounds R32→final). The skeleton is correct as-is.

## Goal

Make the bracket render **from the authoritative skeleton** and bind live ESPN data onto fixed positions, so structure, teams, live population, and stability are all correct — and the bracket's winner display agrees with the already-correct elimination logic.

## Non-goals (YAGNI)

- No changes to `js/elimination.js`, `js/pot.js`, `js/pool.js`, `js/leaderboard.js`, `js/players.js`, `js/standings.js`.
- No build step, no framework, no new dependencies (respects the project's no-build-step principle).
- No visual redesign of the bracket — same CSS/layout, correct data underneath.

## Architecture

Split the current mixed logic/DOM file into a pure model module and a rendering module.

```
data/knockout-bracket.json (fixed skeleton) ─┐
                                             ├─► buildModel() ─► renderTree / renderList (DOM)
ESPN scoreboard (live, polled every 60s) ────┤
pool participants (Firestore) ───────────────┘  (owner tags only)
```

### New: `js/bracket-model.js` (pure, no DOM, testable)

Responsibilities:

- Load and cache the skeleton JSON (`fetch('./data/knockout-bracket.json')`).
- Build a `byNumber` index of all 32 matches and a `parentsOf` index (the two matches whose `feedsInto` points at a given match, ordered by `bracketOrder` → home, away).
- `buildModel(skeleton, espnEvents, poolTeams)` → a **resolved bracket** object: for each match number, a node with `{ matchNumber, round, half, homeSlot, awaySlot, status, espnEvent | null }`, where each `slot` is `{ label, team | null, score | null, isWinner, ownerTags[] }`.

Binding & resolution rules:

1. **ESPN→match-number join.** For each ESPN knockout event compute `(calendar-day + normalizedVenue)` and look up the match number.
   - `normalizeVenue()`: lowercase, strip diacritics, strip punctuation, strip the word "stadium", collapse whitespace.
   - `VENUE_ALIASES`: small hardcoded map for known ESPN↔skeleton naming differences — the single tweak point if a venue is renamed mid-tournament.
   - Unbound events are **logged, never guessed**: `console.warn("Unbound knockout event: <name> @ <venue> <date>")`.
2. **Winner.** `winnerOf(match)` = the competitor with ESPN `winner === true` on the bound event (covers FT / AET / penalties). No score comparison. Returns `null` if not final or unbound.
3. **Team resolution per slot.**
   - **R32 slots** (no parents): if a bound ESPN event exists, use its home/away team + score + winner; otherwise show the skeleton's group-slot text (`"Group E winners"`, `"Best 3rd (A/B/C/D/F)"`).
   - **R16+ slots:** team = `winnerOf(parentMatch)` if that parent is final; otherwise the placeholder `"Winner M<parentNumber>"`. Live score/status still come from this match's own bound ESPN event when present.
4. **Owner tags.** For any slot with a real resolved team, attach pool participants via the existing `teamMatches()` matcher.

The model is a pure function of its inputs, so re-running it on unchanged inputs yields byte-identical positions (drift guard).

### Rewritten: `js/bracket.js` (rendering only)

- Keeps: `renderBracket` entry point, 60s polling, `renderViews`, `renderList` (mobile), `renderTree` (desktop), `buildBracketColumn`, `buildBracketSlot`, `buildBracketTeamRow`, `buildBracketOwnerTag`, `drawConnectors`/`drawColConnectors`, `showMatchModal`, `bracketFinalLabel`, `bracketKickoff`.
- **Deletes:** `detectRound`, `R32_L`, `R32_R`, `MATCH_NUMS_L`, `MATCH_NUMS_R`, `MATCH_NUMS_CENTER`, `nameHitsSlot`, `REF_PATTERNS`, `resolveEventTeams`, `eventHitsSide`, `r32SlotOf`, `traceSlot`, `splitAndOrder`, `fetchRounds`.
- Column/half/center order and match numbers now come from `skeleton.bracketOrder` and each node's `matchNumber`.
- `buildBracketSlot` renders a resolved model node: dim the loser and bold the winner using `slot.isWinner` (from the `winner` flag), not score. Placeholder slots render the label text with a placeholder flag.
- Winner/penalty label unchanged (`bracketFinalLabel` already reads `status.type.shortDetail` for `FT · PENS` / `FT · AET`).

## Error handling

| Failure | Behavior |
|---|---|
| Skeleton JSON fails to load | Empty-state message; bracket cannot render without structure. |
| ESPN fetch fails | Render the **full skeleton with placeholders** (correct structure, no live data) instead of a blanket "could not load". |
| A venue won't join | That match stays on its placeholder + one `console.warn`; all other matches render normally; the match resolves once its event binds (via alias fix or corrected data). |

## Testing

The project has no build step or test runner, so testing stays in-spirit: a standalone browser harness plus a captured fixture.

- **`data/espn-knockout-fixture.json`** — a snapshot of live ESPN knockout data captured during implementation (deterministic input).
- **`test-bracket.html`** — imports `js/bracket-model.js`, runs `buildModel()` against the fixture, and asserts to console:
  1. M74 binds to Germany–Paraguay (Gillette Stadium / 2026-06-29).
  2. Paraguay (penalty winner) is `isWinner` and resolves into M89's home slot.
  3. Germany is not the winner (loser dimmed), consistent with elimination.
  4. Running `buildModel()` twice on the same input produces identical slot→position assignments (drift guard).
  5. An R16 match with no completed parents shows `"Winner M<n>"` placeholders.

Manual verification: load the app against live ESPN and confirm current-round matchups match the official bracket and update on refresh without moving.

## Files touched

| File | Change |
|---|---|
| `js/bracket-model.js` | **New** — skeleton load, ESPN join, winner/advancement resolution. |
| `js/bracket.js` | **Rewritten** — rendering only; consumes the model; winner via flag. |
| `data/knockout-bracket.json` | Unchanged (source of truth). |
| `data/espn-knockout-fixture.json` | **New** — captured ESPN fixture for tests. |
| `test-bracket.html` | **New** — console assertion harness. |
| `js/elimination.js` and pot/pool/leaderboard/players | **Unchanged.** |
