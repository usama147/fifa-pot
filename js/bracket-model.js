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
