// js/matches.js
import { db } from "./config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { teamMatches } from "./config.js";

const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
let pollInterval = null;

export async function renderMatches(container) {
  container.innerHTML = `<div class="loading">Loading matches...</div>`;

  const poolTeams = await loadPoolTeams();

  await fetchAndRender(container, poolTeams);

  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => fetchAndRender(container, poolTeams), 60000);
}

async function loadPoolTeams() {
  try {
    const partsSnap = await getDocs(collection(db, "pool", "main", "participants"));
    const result = [];
    partsSnap.forEach(d => {
      const p = d.data();
      if (!p.teams) return;
      Object.entries(p.teams).forEach(([tierKey, team]) => {
        result.push({ participantName: p.name, tierKey, team });
      });
    });
    return result;
  } catch {
    return [];
  }
}

async function fetchAndRender(container, poolTeams) {
  try {
    const res  = await fetch(ESPN_URL);
    const data = await res.json();
    renderMatchCards(container, data.events || [], poolTeams);
  } catch {
    container.innerHTML = `
      <div class="empty-state">
        <p>Could not load match data.</p>
        <p style="font-size:12px;margin-top:8px;">Live scores will appear here once the tournament begins (11 June 2026).</p>
      </div>`;
  }
}

function renderMatchCards(container, events, poolTeams) {
  container.innerHTML = "";

  if (events.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No matches scheduled today.</p>
        <p style="font-size:12px;margin-top:8px;">The World Cup begins 11 June 2026.</p>
      </div>`;
    return;
  }

  const order = { STATUS_IN_PROGRESS: 0, STATUS_HALFTIME: 0, STATUS_SCHEDULED: 1, STATUS_FINAL: 2 };
  const sorted = [...events].sort((a, b) => {
    const sa = order[a.status?.type?.name] ?? 3;
    const sb = order[b.status?.type?.name] ?? 3;
    return sa - sb;
  });

  sorted.forEach(event => {
    const comp    = event.competitions?.[0];
    const comps   = comp?.competitors || [];
    const home    = comps.find(c => c.homeAway === "home");
    const away    = comps.find(c => c.homeAway === "away");
    const status  = event.status?.type?.name || "STATUS_SCHEDULED";
    const detail  = event.status?.type?.shortDetail || "";
    const isLive  = status === "STATUS_IN_PROGRESS" || status === "STATUS_HALFTIME";
    const isFinal = status === "STATUS_FINAL";

    const homePool = poolTeams.filter(pt => teamMatches(home?.team?.displayName || "", pt.team.name));
    const awayPool = poolTeams.filter(pt => teamMatches(away?.team?.displayName || "", pt.team.name));
    const allPool  = [...homePool, ...awayPool];

    const card = document.createElement("div");
    card.className = "match-card";

    // Status line
    const statusRow = document.createElement("div");
    statusRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;";

    const statusEl = document.createElement("div");
    statusEl.style.cssText = "font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:1px;";
    if (isLive) {
      const dot = document.createElement("span");
      dot.className = "live-dot";
      statusEl.appendChild(dot);
      statusEl.appendChild(document.createTextNode(`LIVE · ${detail}`));
      statusEl.className = "match-status-live";
    } else if (isFinal) {
      statusEl.textContent = "FT";
      statusEl.className = "match-status-final";
    } else {
      statusEl.textContent = formatKickoff(event.date);
      statusEl.className = "match-status-sched";
    }
    statusRow.appendChild(statusEl);

    if (allPool.length > 0) {
      const poolTag = document.createElement("span");
      poolTag.style.cssText = "font-size:10px;color:var(--green);font-family:'IBM Plex Mono',monospace;letter-spacing:1px;";
      poolTag.textContent = "POOL TEAMS";
      statusRow.appendChild(poolTag);
    }
    card.appendChild(statusRow);

    // Match teams row
    const teamsRow = document.createElement("div");
    teamsRow.className = "match-teams";

    const homeName = document.createElement("span");
    homeName.textContent = `${home?.team?.flag || ""} ${home?.team?.displayName || "TBC"}`;
    teamsRow.appendChild(homeName);

    if (isFinal || isLive) {
      const scoreEl = document.createElement("span");
      scoreEl.className = "match-score";
      scoreEl.textContent = `${home?.score ?? 0} – ${away?.score ?? 0}`;
      teamsRow.appendChild(scoreEl);
    } else {
      const vsEl = document.createElement("span");
      vsEl.style.cssText = "color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:12px;";
      vsEl.textContent = "vs";
      teamsRow.appendChild(vsEl);
    }

    const awayName = document.createElement("span");
    awayName.textContent = `${away?.team?.displayName || "TBC"} ${away?.team?.flag || ""}`;
    teamsRow.appendChild(awayName);

    card.appendChild(teamsRow);

    // Pool highlight line
    if (allPool.length > 0) {
      const highlightEl = document.createElement("div");
      highlightEl.className = "pool-highlight";
      highlightEl.textContent = allPool.map(pt => `${pt.participantName}'s ${tierIcon(pt.tierKey)} team`).join(" · ");
      card.appendChild(highlightEl);
    }

    container.appendChild(card);
  });

  const ts = document.createElement("p");
  ts.style.cssText = "color:var(--muted);font-size:11px;text-align:right;margin-top:12px;font-family:'IBM Plex Mono',monospace;";
  ts.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  container.appendChild(ts);
}

function tierIcon(key) {
  return { big: "◈", smaller: "◇", underdog: "○" }[key] || "";
}

function formatKickoff(dateStr) {
  if (!dateStr) return "TBC";
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday)    return `Today · ${time}`;
  if (isTomorrow) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}
