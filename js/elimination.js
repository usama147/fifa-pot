// js/elimination.js
// Auto-detect eliminated teams from ESPN knockout match results + group stage exits
import { ESPN_BASE, FINAL_STATES } from "./matches.js";
import { normalizeTeamName, DEFAULT_TIERS } from "./config.js";

const KNOCKOUT_SLUGS = [
  "round-of-32", "round-of-16", "quarterfinals",
  "quarter-finals", "semifinals", "semi-finals",
  "third-place", "final"
];

const KNOCKOUT_RE = /round of 32|round of 16|quarterfinal|semifinal|third.place|\bfinal\b/i;

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

// All 48 pool team names (lowercased + normalized) for group-stage elimination detection
const ALL_POOL_TEAMS = new Set();
DEFAULT_TIERS.forEach(tier => {
  tier.teams.forEach(t => {
    ALL_POOL_TEAMS.add(t.name.toLowerCase());
    ALL_POOL_TEAMS.add(normalizeTeamName(t.name));
  });
});

/**
 * Fetch ESPN knockout data and return a Set of eliminated team names.
 * Detects TWO types of elimination:
 * 1. Group-stage exits: teams not appearing in any R32 match
 * 2. Knockout losers: teams that lost a completed knockout match
 */
export async function fetchKnockoutEliminations() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;

  const eliminated = new Set();

  try {
    const today = new Date();
    const r32Start = new Date("2026-06-28");
    if (today < r32Start) { _cache = eliminated; _cacheTime = now; return eliminated; }

    // Fetch all knockout matches (R32 through Final, scheduled + completed)
    // Always query through at least July 20 to capture ALL rounds including the final
    const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, "");
    const endDate = new Date(Math.max(today.getTime(), new Date("2026-07-20").getTime()));
    const res = await fetch(`${ESPN_BASE}?dates=${fmt(r32Start)}-${fmt(endDate)}`);
    const data = await res.json();
    const events = data.events || [];

    // ── Step 1: Collect all teams in R32 (qualified teams) ────────────────
    const qualifiedTeams = new Set();
    const knockoutEvents = [];

    for (const ev of events) {
      const notes = ev.competitions?.[0]?.notes || [];
      const headline = notes.map(n => n.headline || "").join(" ").toLowerCase();
      const slug = (ev.season?.slug || "").toLowerCase();
      const isKnockout =
        KNOCKOUT_SLUGS.some(k => slug.includes(k)) ||
        KNOCKOUT_RE.test(headline) ||
        KNOCKOUT_RE.test(ev.name || "");

      if (!isKnockout) continue;
      knockoutEvents.push({ ev, headline, slug });

      // Collect team names from R32 matches (both scheduled and completed)
      const isR32 = /round of 32/i.test(headline) || slug.includes("round-of-32");
      if (isR32) {
        const comps = ev.competitions?.[0]?.competitors || [];
        for (const c of comps) {
          const name = c.team?.displayName;
          if (name && !/winner|loser|group|third|runner/i.test(name)) {
            qualifiedTeams.add(name.toLowerCase());
            qualifiedTeams.add(normalizeTeamName(name));
          }
        }
      }
    }

    // ── Step 2: Mark pool teams NOT in R32 as group-stage eliminated ──────
    // Only do this if we found a reasonable number of qualified teams
    // (avoids false positives if API returned partial data)
    if (qualifiedTeams.size >= 20) {
      for (const poolName of ALL_POOL_TEAMS) {
        if (!qualifiedTeams.has(poolName)) {
          eliminated.add(poolName);
        }
      }
    }

    // ── Step 3: Mark knockout losers ──────────────────────────────────────
    for (const { ev, headline, slug } of knockoutEvents) {
      if (!FINAL_STATES.has(ev.status?.type?.name || "")) continue;

      // Third-place match: both teams already eliminated from SF
      if (/third.place/i.test(headline) || /third.place/i.test(slug)) continue;

      const comps = ev.competitions?.[0]?.competitors || [];
      if (comps.length !== 2) continue;

      // ESPN sets winner: true/false on competitors for completed knockout matches
      const loser = comps.find(c => c.winner === false);
      if (loser) {
        const name = loser.team?.displayName;
        if (name) {
          eliminated.add(name.toLowerCase());
          eliminated.add(normalizeTeamName(name));
        }
        continue;
      }

      // Fallback: compare scores
      const [a, b] = comps;
      const scoreA = parseInt(a?.score ?? 0, 10);
      const scoreB = parseInt(b?.score ?? 0, 10);
      if (scoreA !== scoreB) {
        const loserComp = scoreA < scoreB ? a : b;
        const name = loserComp.team?.displayName;
        if (name) {
          eliminated.add(name.toLowerCase());
          eliminated.add(normalizeTeamName(name));
        }
      }
    }
  } catch (err) {
    console.warn("Could not fetch knockout eliminations:", err);
  }

  _cache = eliminated;
  _cacheTime = now;
  return eliminated;
}

/**
 * Merge Firestore eliminatedTeams names with ESPN knockout losers.
 * Returns a Set of lowercased team names (both raw and normalized).
 */
export function mergeEliminations(firestoreEliminated, espnEliminated) {
  const merged = new Set(firestoreEliminated);
  for (const name of espnEliminated) merged.add(name);
  // Also add normalized versions of all names for cross-matching
  for (const name of firestoreEliminated) merged.add(normalizeTeamName(name));
  return merged;
}

/**
 * Check if a pool team name is in the eliminated set.
 * Checks both the raw lowercase and the normalized form.
 */
export function isTeamEliminated(teamName, eliminatedSet) {
  const lower = teamName.toLowerCase();
  return eliminatedSet.has(lower) || eliminatedSet.has(normalizeTeamName(lower));
}
