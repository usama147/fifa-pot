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
export const VENUE_ALIASES = {
  // ESPN renamed these venues vs the FIFA skeleton (data/knockout-bracket.json).
  estadiobanorte: "estadioazteca",       // Estadio Banorte (ESPN) = Estadio Azteca (skeleton)
  gehafieldatarrowhead: "arrowhead",     // GEHA Field at Arrowhead Stadium (ESPN) = Arrowhead Stadium (skeleton)
};

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

// ESPN supplies placeholder competitors for unplayed matches (e.g.
// "Semifinal 1 Winner", "Round of 16 7 Winner"). Treat those as NOT-a-real-team
// so we fall back to the skeleton's own feed/group placeholder resolution.
const PLACEHOLDER_TEAM_RE = /winner|loser|runner|round of|semifinal|quarterfinal|third place|\bgroup [a-l]\b/i;

function isRealTeam(competitor) {
  const name = competitor?.team?.displayName || "";
  return !!name && !PLACEHOLDER_TEAM_RE.test(name);
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
      home: home && isRealTeam(home) ? slotFromCompetitor(home) : slotFromDef(def.homeDef, bound),
      away: away && isRealTeam(away) ? slotFromCompetitor(away) : slotFromDef(def.awayDef, bound),
    });
  }
  return { order: skeleton.bracketOrder, byNumber };
}
