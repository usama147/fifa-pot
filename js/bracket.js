// js/bracket.js
import { db, teamMatches } from "./config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { ESPN_BASE, LIVE_STATES, FINAL_STATES, buildCard } from "./matches.js";

// ── Round config ───────────────────────────────────────────────────────────────
const ROUND_ORDER  = ["r16", "qf", "sf", "third", "final", "other"];
const ROUND_LABELS = {
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
    if (/group/i.test(text))                        return null;
    if (/round of 16|round of sixteen/i.test(text)) return "r16";
    if (/quarter.?final/i.test(text))               return "qf";
    if (/semi.?final/i.test(text))                  return "sf";
    if (/third.?place/i.test(text))                 return "third";
    if (/\bfinal\b/i.test(text))                    return "final";
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

// Stubs — filled in Tasks 3 & 4
function renderList(container, rounds, poolTeams) {}
function renderTree(container, rounds, poolTeams) {}
