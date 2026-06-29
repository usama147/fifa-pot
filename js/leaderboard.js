// js/leaderboard.js
import { db, teamMatches } from "./config.js";
import {
  doc, getDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { ESPN_BASE, FINAL_STATES } from "./matches.js";
import { fetchKnockoutEliminations, mergeEliminations, isTeamEliminated } from "./elimination.js";

export async function renderLeaderboard(container) {
  container.innerHTML = `<div class="loading">Loading leaderboard...</div>`;

  let poolSnap, partsSnap;
  try {
    [poolSnap, partsSnap] = await Promise.all([
      getDoc(doc(db, "pool", "main")),
      getDocs(collection(db, "pool", "main", "participants"))
    ]);
  } catch {
    container.innerHTML = `<div class="empty-state"><p>Failed to load data. Please refresh.</p></div>`;
    return;
  }

  if (!poolSnap.exists()) {
    container.innerHTML = `<div class="empty-state"><p>No pool data yet.</p></div>`;
    return;
  }

  const pool = poolSnap.data();

  if (!pool.drawCompleted) {
    container.innerHTML = `<div class="empty-state"><p>Draw not yet completed — leaderboard will appear after the draw.</p></div>`;
    return;
  }

  const participants = partsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Merge Firestore manual eliminations with ESPN knockout losers
  const firestoreElim = new Set((pool.eliminatedTeams || []).map(t => t.name.toLowerCase()));
  const espnElim = await fetchKnockoutEliminations();
  const eliminatedNames = mergeEliminations(firestoreElim, espnElim);

  // Fetch all completed matches since tournament start
  let events = [];
  try {
    const now   = new Date();
    const start = new Date("2026-06-11");
    const fmt   = d => d.toISOString().slice(0, 10).replace(/-/g, "");
    const res   = await fetch(`${ESPN_BASE}?dates=${fmt(start)}-${fmt(now)}`);
    const data  = await res.json();
    events = (data.events || []).filter(ev =>
      FINAL_STATES.has(ev.status?.type?.name || "")
    );
  } catch { /* proceed with zero goals */ }

  // Score each participant: sum goals scored by each of their 3 teams
  const scored = participants.map(p => {
    const tierKeys = ["big", "smaller", "underdog"];

    const teamEntries = tierKeys.map(key => {
      const t = p.teams?.[key];
      if (!t) return null;

      let goals = 0;
      events.forEach(ev => {
        const comps = ev.competitions?.[0]?.competitors || [];
        const mine  = comps.find(c => teamMatches(c.team?.displayName || "", t.name));
        if (mine) goals += parseInt(mine.score ?? 0, 10);
      });

      return {
        key,
        name:      t.name,
        flag:      t.flag,
        goals,
        eliminated: isTeamEliminated(t.name, eliminatedNames)
      };
    }).filter(Boolean);

    const totalGoals  = teamEntries.reduce((s, t) => s + t.goals, 0);
    const teamsAlive  = teamEntries.filter(t => !t.eliminated).length;

    return { ...p, teamEntries, totalGoals, teamsAlive };
  });

  // Sort: most goals → most teams alive → name
  scored.sort((a, b) =>
    b.totalGoals  - a.totalGoals  ||
    b.teamsAlive  - a.teamsAlive  ||
    a.name.localeCompare(b.name)
  );

  render(container, scored, events.length);
}

function render(container, entries, matchCount) {
  container.innerHTML = "";

  // ── Header ────────────────────────────────────────────────────────────────────
  const hdr = mk("div");
  hdr.style.marginBottom = "20px";
  hdr.innerHTML = `
    <h2 style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:1px;margin-bottom:4px;">
      Leaderboard
    </h2>
    <p style="color:var(--muted);font-size:13px;">
      Total goals scored across all three teams · ${matchCount} match${matchCount !== 1 ? "es" : ""} played
    </p>`;
  container.appendChild(hdr);

  entries.forEach((p, i) => {
    const rank = i + 1;
    const card = mk("div", "card lb-card");
    card.style.marginBottom = "10px";

    // Podium accents
    if (rank === 1) {
      card.style.cssText += "border-color:rgba(247,197,32,0.45);box-shadow:0 0 24px rgba(247,197,32,0.07);";
    } else if (rank === 2) {
      card.style.cssText += "border-color:rgba(151,166,190,0.35);";
    } else if (rank === 3) {
      card.style.cssText += "border-color:rgba(193,119,58,0.35);";
    }

    // ── Top row ───────────────────────────────────────────────────────────────
    const topRow = mk("div");
    topRow.style.cssText = "display:flex;align-items:center;gap:12px;";

    const rankEl = mk("div");
    rankEl.style.cssText = `
      font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:1px;
      min-width:32px;text-align:center;flex-shrink:0;
      color:${rank === 1 ? "var(--green)" : rank === 2 ? "#97A6BE" : rank === 3 ? "var(--underdog)" : "var(--muted)"};`;
    rankEl.textContent = `#${rank}`;
    topRow.appendChild(rankEl);

    const nameWrap = mk("div");
    nameWrap.style.cssText = "flex:1;min-width:0;display:flex;align-items:center;gap:8px;";

    const nameEl = mk("div");
    nameEl.style.cssText = "font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    nameEl.textContent = p.name;
    nameWrap.appendChild(nameEl);

    if (p.paid) {
      const badge = mk("span", "paid-badge");
      badge.textContent = "PAID";
      nameWrap.appendChild(badge);
    }

    topRow.appendChild(nameWrap);

    // Goals total
    const goalsWrap = mk("div");
    goalsWrap.style.cssText = "display:flex;align-items:baseline;gap:4px;flex-shrink:0;";

    const goalsEl = mk("div");
    goalsEl.style.cssText = `
      font-family:'Bebas Neue',sans-serif;font-size:32px;line-height:1;
      color:${rank === 1 ? "var(--green)" : "var(--text)"};`;
    goalsEl.textContent = p.totalGoals;
    goalsWrap.appendChild(goalsEl);

    const glsLabel = mk("div");
    glsLabel.style.cssText = "font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;padding-bottom:3px;";
    glsLabel.textContent = "GLS";
    goalsWrap.appendChild(glsLabel);

    topRow.appendChild(goalsWrap);
    card.appendChild(topRow);

    // ── Team breakdown ────────────────────────────────────────────────────────
    const breakdown = mk("div");
    breakdown.style.cssText = "display:flex;gap:6px;margin-top:10px;";

    p.teamEntries.forEach(t => {
      const chip = mk("div");
      chip.style.cssText = `
        display:flex;align-items:center;justify-content:space-between;gap:6px;
        flex:1;min-width:0;
        background:rgba(255,255,255,0.03);
        border:1px solid var(--border);
        border-radius:8px;padding:6px 9px;
        ${t.eliminated ? "opacity:0.38;" : ""}`;

      const label = mk("div");
      label.style.cssText = `font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${t.eliminated ? "text-decoration:line-through;" : ""}`;
      label.textContent = `${t.flag} ${t.name}`;
      chip.appendChild(label);

      const gls = mk("div");
      gls.style.cssText = "font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:1px;white-space:nowrap;color:var(--green);flex-shrink:0;";
      gls.textContent = `${t.goals}g`;
      chip.appendChild(gls);

      breakdown.appendChild(chip);
    });

    card.appendChild(breakdown);
    container.appendChild(card);
  });
}

function mk(tag, cls = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
