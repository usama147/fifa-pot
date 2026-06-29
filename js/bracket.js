// js/bracket.js
import { db, teamMatches } from "./config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { ESPN_BASE, LIVE_STATES, FINAL_STATES, buildCard } from "./matches.js";

// ── Round config ───────────────────────────────────────────────────────────────
const ROUND_ORDER  = ["r32", "r16", "qf", "sf", "third", "final", "other"];
const ROUND_LABELS = {
  r32:   "ROUND OF 32",
  r16:   "ROUND OF 16",
  qf:    "QUARTER-FINALS",
  sf:    "SEMI-FINALS",
  third: "THIRD PLACE",
  final: "FINAL",
  other: "OTHER",
};

// ── Round detection ────────────────────────────────────────────────────────────
// ESPN returns knockout matches with empty notes[], so we detect round by:
//   1. Event name patterns (TBD matches like "Round of 32 3 Winner at Canada"
//      are actually Round of 16 slots — the name tells us the feeder round)
//   2. Match date against FIFA 2026 published schedule
//
// FIFA World Cup 2026 knockout schedule:
//   Round of 32 : Jun 28 – Jul  5
//   Round of 16 : Jul  7 – Jul 10
//   Quarter-finals: Jul 12 – Jul 13
//   Semi-finals   : Jul 15 – Jul 16
//   Third place   : Jul 19
//   Final         : Jul 20
function detectRound(event) {
  // 1. Check notes first (future-proofs if ESPN ever adds them)
  const notes = event.competitions?.[0]?.notes || [];
  for (const note of notes) {
    const t = (note.headline || note.type?.text || "").toLowerCase().trim();
    if (!t) continue;
    if (/group/i.test(t))            return null;
    if (/round of 32/i.test(t))      return "r32";
    if (/round of 16/i.test(t))      return "r16";
    if (/quarter.?final/i.test(t))   return "qf";
    if (/semi.?final/i.test(t))      return "sf";
    if (/third.?place/i.test(t))     return "third";
    if (/\bfinal\b/i.test(t))        return "final";
  }

  const d    = new Date(event.date || "");
  const name = event.name || "";

  // Before knockout stage → group stage, skip
  if (d < new Date("2026-06-28T00:00:00Z")) return null;

  // 2. TBD match names reveal the feeder round, not the current round.
  //    "Round of 32 X Winner at Team" → this is a Round of 16 slot
  //    "Round of 16 X Winner at Team" → this is a Quarter-final slot
  if (/round of 32.+winner|winner.+round of 32/i.test(name)) return "r16";
  if (/round of 16.+winner|winner.+round of 16/i.test(name)) return "qf";
  if (/quarter.?final.+winner|winner.+quarter.?final/i.test(name)) return "sf";
  if (/semi.?final.+winner|winner.+semi.?final/i.test(name)) return "final";

  // 3. Date-range fallback for confirmed matches (actual team names)
  if (d <= new Date("2026-07-05T23:59:59Z")) return "r32";
  if (d <= new Date("2026-07-10T23:59:59Z")) return "r16";
  if (d <= new Date("2026-07-13T23:59:59Z")) return "qf";
  if (d <= new Date("2026-07-16T23:59:59Z")) return "sf";
  if (d <= new Date("2026-07-19T23:59:59Z")) return "third";
  return "final";
}

// ── Pool teams ─────────────────────────────────────────────────────────────────
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

// ── Fetch + bucket by round ────────────────────────────────────────────────────
// ESPN caps results on broad queries — the full group stage (72 matches) fills
// the limit, leaving no room for knockout matches. We query the knockout window
// directly: Jun 28 → Jul 21 (covers R32 through the Final).
async function fetchRounds() {
  const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, "");
  const res  = await fetch(`${ESPN_BASE}?dates=${fmt(new Date("2026-06-28"))}-${fmt(new Date("2026-07-21"))}`);
  const data = await res.json();

  const rounds = {};
  (data.events || []).forEach(ev => {
    const key = detectRound(ev);
    if (!key) return;
    if (!rounds[key]) rounds[key] = [];
    rounds[key].push(ev);
  });
  return rounds;
}

// ── Main entry ─────────────────────────────────────────────────────────────────
let pollTimer = null;

export async function renderBracket(container) {
  container.innerHTML = `<div class="loading">Loading bracket...</div>`;
  const poolTeams = await loadPoolTeams();
  await fetchAndRender(container, poolTeams);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => fetchAndRender(container, poolTeams), 60000);
}

async function fetchAndRender(container, poolTeams) {
  try {
    const rounds = await fetchRounds();
    renderViews(container, rounds, poolTeams);
  } catch (err) {
    console.error("Bracket fetch error:", err);
    container.innerHTML = `
      <div class="empty-state">
        <p>Could not load bracket data.</p>
        <p style="font-size:12px;margin-top:8px;">Scores will appear as matches are played.</p>
      </div>`;
  }
}

function renderViews(container, rounds, poolTeams) {
  container.innerHTML = "";

  const hasAny = ROUND_ORDER.some(k => rounds[k]?.length);
  if (!hasAny) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Knockout stage hasn't started yet.</p>
        <p style="font-size:12px;margin-top:8px;">Check back once the group stage is complete.</p>
      </div>`;
    return;
  }

  // Mobile list view (hidden on desktop via CSS)
  const listEl = document.createElement("div");
  listEl.className = "bracket-list";
  renderList(listEl, rounds, poolTeams);
  container.appendChild(listEl);

  // Desktop tree view (hidden on mobile via CSS)
  const treeEl = document.createElement("div");
  treeEl.className = "bracket-tree";
  renderTree(treeEl, rounds, poolTeams);
  container.appendChild(treeEl);

  // Timestamp
  const ts = document.createElement("p");
  ts.className = "bracket-timestamp";
  ts.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  container.appendChild(ts);
}

// ── Mobile list view ──────────────────────────────────────────────────────────
function renderList(container, rounds, poolTeams) {
  ROUND_ORDER.forEach(key => {
    const events = rounds[key];
    if (!events?.length) return;

    const isLiveRound = events.some(ev => LIVE_STATES.has(ev.status?.type?.name || ""));

    // Section header (same style as matches.js sectionHeader())
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

    // Sort: live → completed (newest first) → upcoming (soonest first)
    const live     = events.filter(ev => LIVE_STATES.has(ev.status?.type?.name || ""));
    const done     = events.filter(ev => FINAL_STATES.has(ev.status?.type?.name || "")).sort((a, b) => new Date(b.date) - new Date(a.date));
    const upcoming = events.filter(ev => !LIVE_STATES.has(ev.status?.type?.name || "") && !FINAL_STATES.has(ev.status?.type?.name || "")).sort((a, b) => new Date(a.date) - new Date(b.date));

    [...live, ...done, ...upcoming].forEach(ev => {
      const s       = ev.status?.type?.name || "STATUS_SCHEDULED";
      const isLive  = LIVE_STATES.has(s);
      const isFinal = FINAL_STATES.has(s);
      container.appendChild(buildCard(ev, poolTeams, isLive, isFinal));
    });
  });
}

// ── Bracket side detection ─────────────────────────────────────────────────────
// Left half of the WC2026 bracket (hardcoded from FIFA's draw)
const LEFT_TEAMS = new Set([
  "germany","paraguay","france","sweden",
  "south africa","canada","netherlands","morocco",
  "portugal","croatia","spain","austria",
  "united states","bosnia-herzegovina","bosnia and herzegovina","belgium","senegal",
]);
const RIGHT_TEAMS = new Set([
  "brazil","japan","ivory coast","côte d'ivoire","cote d'ivoire","norway",
  "mexico","ecuador","england","congo dr","dr congo","democratic republic of the congo",
  "argentina","cape verde","colombia","ghana",
  "australia","egypt","switzerland","algeria",
]);

function getEventSide(ev) {
  const comps = ev.competitions?.[0]?.competitors || [];
  for (const c of comps) {
    const n = (c.team?.displayName || "").toLowerCase();
    if (LEFT_TEAMS.has(n))  return "left";
    if (RIGHT_TEAMS.has(n)) return "right";
  }
  // Also search the event name (helps for "Canada vs TBC" style entries)
  const evName = (ev.name || "").toLowerCase();
  for (const t of LEFT_TEAMS)  { if (evName.includes(t)) return "left"; }
  for (const t of RIGHT_TEAMS) { if (evName.includes(t)) return "right"; }
  return null; // truly unknown — caller will balance
}

// ── Desktop tree view — two-sided FIFA-style bracket ─────────────────────────
function renderTree(container, rounds, poolTeams) {
  const byDate = arr => [...arr].sort((a, b) => new Date(a.date) - new Date(b.date));

  const left   = {};
  const right  = {};
  const center = {};

  // R32: known teams → deterministic side assignment
  if (rounds.r32) {
    left.r32  = byDate(rounds.r32.filter(ev => getEventSide(ev) !== "right"));
    right.r32 = byDate(rounds.r32.filter(ev => getEventSide(ev) === "right"));
  }

  // R16, QF, SF: detect from team names; balance unknowns across sides
  ["r16", "qf", "sf"].forEach(key => {
    if (!rounds[key]) return;
    left[key]  = [];
    right[key] = [];
    const unassigned = [];
    byDate(rounds[key]).forEach(ev => {
      const side = getEventSide(ev);
      if (side === "left")        left[key].push(ev);
      else if (side === "right") right[key].push(ev);
      else                        unassigned.push(ev);
    });
    // Distribute unknowns to keep sides balanced
    unassigned.forEach(ev => {
      (left[key].length <= right[key].length ? left : right)[key].push(ev);
    });
  });

  // Final + 3rd place → center column
  if (rounds.final) center.final = rounds.final;
  if (rounds.third) center.third = rounds.third;

  // ── DOM construction ─────────────────────────────────────────────────────────
  const wrapper = document.createElement("div");
  wrapper.className = "bracket-wrapper";

  // Left half: R32 → R16 → QF → SF (columns left to right, converging inward)
  const leftEl = document.createElement("div");
  leftEl.className = "bracket-half bracket-half-left";
  ["r32", "r16", "qf", "sf"].forEach(key => {
    if (!left[key]?.length) return;
    leftEl.appendChild(buildBracketColumn(key, left[key], poolTeams));
  });
  wrapper.appendChild(leftEl);

  // Center: Final + 3rd place
  if (center.final?.length || center.third?.length) {
    const centerEl = document.createElement("div");
    centerEl.className = "bracket-center";
    if (center.final?.length) {
      const lbl = document.createElement("div");
      lbl.className = "bracket-center-label";
      lbl.textContent = "FINAL";
      centerEl.appendChild(lbl);
      center.final.forEach(ev => centerEl.appendChild(buildBracketSlot(ev, poolTeams)));
    }
    if (center.third?.length) {
      const lbl = document.createElement("div");
      lbl.className = "bracket-center-label bracket-center-label-third";
      lbl.textContent = "3RD PLACE";
      centerEl.appendChild(lbl);
      center.third.forEach(ev => centerEl.appendChild(buildBracketSlot(ev, poolTeams)));
    }
    wrapper.appendChild(centerEl);
  }

  // Right half: SF → QF → R16 → R32 (mirrored — columns from center outward)
  const rightEl = document.createElement("div");
  rightEl.className = "bracket-half bracket-half-right";
  ["sf", "qf", "r16", "r32"].forEach(key => {
    if (!right[key]?.length) return;
    rightEl.appendChild(buildBracketColumn(key, right[key], poolTeams));
  });
  wrapper.appendChild(rightEl);

  container.appendChild(wrapper);
}

function buildBracketColumn(key, events, poolTeams) {
  const col = document.createElement("div");
  col.className = "bracket-col";

  const hdr = document.createElement("div");
  hdr.className = "bracket-col-header";
  hdr.textContent = ROUND_LABELS[key] || key.toUpperCase();
  col.appendChild(hdr);

  const slots = document.createElement("div");
  slots.className = "bracket-slots";
  events.forEach(ev => slots.appendChild(buildBracketSlot(ev, poolTeams)));
  col.appendChild(slots);

  return col;
}

function buildBracketSlot(event, poolTeams) {
  const comp  = event.competitions?.[0];
  const comps = comp?.competitors || [];
  const home  = comps.find(c => c.homeAway === "home");
  const away  = comps.find(c => c.homeAway === "away");
  const s     = event.status?.type?.name || "STATUS_SCHEDULED";
  const isLive  = LIVE_STATES.has(s);
  const isFinal = FINAL_STATES.has(s);

  const homeScore = parseInt(home?.score ?? 0, 10);
  const awayScore = parseInt(away?.score ?? 0, 10);
  const homeWon   = isFinal && homeScore > awayScore;
  const awayWon   = isFinal && awayScore > homeScore;

  const homePool = poolTeams.filter(pt => teamMatches(home?.team?.displayName || "", pt.team.name));
  const awayPool = poolTeams.filter(pt => teamMatches(away?.team?.displayName || "", pt.team.name));

  const slot = document.createElement("div");
  slot.className = "bracket-slot";

  const card = document.createElement("div");
  card.className = "bracket-match";

  // Status line
  const statusEl = document.createElement("div");
  statusEl.className = "bracket-match-status";
  if (isLive) {
    statusEl.textContent = event.status?.displayClock ? `LIVE · ${event.status.displayClock}` : "LIVE";
    statusEl.style.color = "var(--green)";
  } else if (isFinal) {
    statusEl.textContent = bracketFinalLabel(event);
  } else {
    statusEl.textContent = bracketKickoff(event.date);
  }
  card.appendChild(statusEl);

  // Divider
  const divider = document.createElement("div");
  divider.className = "bracket-divider";
  card.appendChild(divider);

  // Home team row + owner tags
  card.appendChild(buildBracketTeamRow(home, isFinal && !homeWon, isFinal || isLive));
  homePool.forEach(pt => card.appendChild(buildBracketOwnerTag(pt)));

  // Away team row + owner tags
  card.appendChild(buildBracketTeamRow(away, isFinal && !awayWon, isFinal || isLive));
  awayPool.forEach(pt => card.appendChild(buildBracketOwnerTag(pt)));

  slot.appendChild(card);
  return slot;
}

function buildBracketTeamRow(competitor, dimmed, showScore) {
  const row = document.createElement("div");
  row.className = "bracket-team-row";
  if (dimmed) row.style.opacity = "0.35";

  const name = document.createElement("span");
  name.className = "bracket-team-name";
  name.textContent = competitor?.team?.displayName || "TBC";
  row.appendChild(name);

  if (showScore) {
    const score = document.createElement("span");
    score.className = "bracket-score";
    score.textContent = competitor?.score ?? "–";
    row.appendChild(score);
  }
  return row;
}

function buildBracketOwnerTag(pt) {
  const tag = document.createElement("span");
  tag.className = `bracket-owner-tag ${pt.tierKey}`;
  tag.textContent = pt.participantName;
  return tag;
}

function bracketFinalLabel(event) {
  const d = (event.status?.type?.shortDetail || "").toLowerCase();
  if (/pen/i.test(d))       return "FT · PENS";
  if (/extra|aet/i.test(d)) return "FT · AET";
  return "FT";
}

function bracketKickoff(dateStr) {
  if (!dateStr) return "TBC";
  const d   = new Date(dateStr);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  const tom = new Date(now); tom.setDate(now.getDate() + 1);
  if (d.toDateString() === tom.toDateString()) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}
