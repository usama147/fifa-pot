# Knockout Bracket — Design Spec
_Date: 2026-06-29_

## Overview

Add a live knockout bracket view to FifaPot, replacing the Groups tab now that the group stage is complete. The bracket pulls live data from the same ESPN scoreboard API already used by `matches.js`, renders round-by-round match cards on mobile, and a horizontal visual bracket tree on desktop. Pool team ownership (participant name + tier) is shown throughout.

---

## Architecture

### New file: `js/bracket.js`

Single module that:
1. Fetches pool participants from Firestore (`pool/main/participants`) — same pattern as `matches.js`
2. Fetches ESPN scoreboard for the knockout window (date range covering R16 through Final)
3. Filters events to knockout rounds by checking that the round note does **not** contain "group"
4. Maps each event's note label to a canonical round key
5. Renders either the mobile list or desktop tree — controlled entirely by CSS (no JS branching on screen size)
6. Polls every 60 seconds for live score updates

### Modified files

| File | Change |
|------|--------|
| `index.html` | Rename Groups tab button: `data-tab="standings"` → `data-tab="bracket"`, label "Groups" → "Bracket". Keep `#tab-standings` div hidden in DOM. Add `#tab-bracket` div. |
| `js/app.js` | Add `bracket` case to `onTabActivated()`, dynamic import of `bracket.js` |
| `css/styles.css` | Add bracket-specific styles (desktop tree layout, mobile list, connecting lines) |

---

## Data Layer

### ESPN round detection

```
competitions[0].notes[].headline  →  e.g. "Round of 16", "Quarterfinal", "Semifinal", "Third Place Playoff", "Final"
```

A note is a knockout round if its headline does **not** match `/group/i`.

### Canonical round mapping

| ESPN label (case-insensitive) | Canonical key | Display label | Order |
|-------------------------------|---------------|---------------|-------|
| round of 16 / round of sixteen | `r16` | ROUND OF 16 | 1 |
| quarter-final / quarterfinal | `qf` | QUARTER-FINALS | 2 |
| semi-final / semifinal | `sf` | SEMI-FINALS | 3 |
| third place / third place playoff | `third` | THIRD PLACE | 4 |
| final | `final` | FINAL | 5 |

Unknown labels are assigned round key `other` and displayed as-is.

### Match statuses reused from `matches.js`

- `LIVE_STATES`, `FINAL_STATES` — imported directly, no duplication
- `buildCard()` — imported and reused for mobile list view
- `teamMatches()` — imported from `config.js`

---

## UI — Mobile (< 768px): Round-by-Round List

- Same `sectionHeader()` style as Matches tab (IBM Plex Mono, letter-spaced, dividing line)
- Rounds ordered R16 → QF → SF → 3rd Place → Final, each as a section
- Match cards: reuse `buildCard()` from `matches.js` — identical to existing match cards (score, owner tags, expand for details)
- Live dot on active section header if any match in that round is live
- Empty state if ESPN returns no knockout matches yet

---

## UI — Desktop (≥ 768px): Horizontal Bracket Tree

- Flex row, one column per round (R16, QF, SF, 3rd Place, Final)
- Round label at top of each column (same monospace style)
- Match slots spaced vertically to visually align with connecting lines
- Connecting lines: pure CSS (right border on match slot + `::after` pseudo-element for the horizontal connector). No SVG.
- Each match slot is a compact card:
  - Home team row: flag + name + score. Winner at full opacity, loser at 0.38 opacity (matches `--muted`)
  - Owner tag below team name (same `.owner-tag` classes)
  - Away team row: same
  - Round result badge: FT / FT · AET / FT · PENS / LIVE · clock / kickoff time
- Pool teams highlighted with their existing tier colour (`.owner-tag.big`, `.owner-tag.smaller`, `.owner-tag.underdog`)
- TBC slots (matches not yet confirmed) shown as `TBC` with muted styling

---

## Error Handling

- ESPN fetch failure: show empty-state div ("Could not load bracket data. Scores will appear as matches are played.")
- No knockout events yet: show empty-state ("Knockout stage hasn't started yet.")
- Unknown round label: bucket into `other`, display as-is — never silently drop a match

---

## What's explicitly out of scope

- No bracket admin input — ESPN is the sole source of truth
- No bracket persistence in Firestore — purely live/read-only
- No animated bracket progression (teams "moving" to next round)
- The Groups tab data is preserved in the DOM (just hidden) — no data is deleted
