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
function detectRound(event) {
  const notes = event.competitions?.[0]?.notes || [];
  for (const note of notes) {
    const text = (note.headline || note.type?.text || "").toLowerCase().trim();
    if (!text) continue;
    if (/group/i.test(text))                           return null;
    if (/round of 32|round of thirty.?two/i.test(text)) return "r32";
    if (/round of 16|round of sixteen/i.test(text))    return "r16";
    if (/quarter.?final/i.test(text))                  return "qf";
    if (/semi.?final/i.test(text))                     return "sf";
    if (/third.?place/i.test(text))                    return "third";
    if (/\bfinal\b/i.test(text))                       return "final";
    return "other";
  }
  return null; // no notes → group stage or unknown, skip
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
async function fetchRounds() {
  const now   = new Date();
  const start = new Date(Math.max(new Date("2026-06-20").getTime(), now.getTime() - 14 * 86400000));
  const end   = new Date(now.getTime() + 30 * 86400000);
  const fmt   = d => d.toISOString().slice(0, 10).replace(/-/g, "");
  const res   = await fetch(`${ESPN_BASE}?dates=${fmt(start)}-${fmt(end)}`);
  const data  = await res.json();

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

// ── Desktop tree view ─────────────────────────────────────────────────────────
function renderTree(container, rounds, poolTeams) {
  ROUND_ORDER.forEach(key => {
    const events = rounds[key];
    if (!events?.length) return;

    const col = document.createElement("div");
    col.className = "bracket-col";

    const hdr = document.createElement("div");
    hdr.className = "bracket-col-header";
    hdr.textContent = ROUND_LABELS[key] || key.toUpperCase();
    col.appendChild(hdr);

    const slots = document.createElement("div");
    slots.className = "bracket-slots";

    [...events]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach(ev => slots.appendChild(buildBracketSlot(ev, poolTeams)));

    col.appendChild(slots);
    container.appendChild(col);
  });
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
