// js/matches.js
import { db } from "./config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { teamMatches } from "./config.js";

export const ESPN_BASE    = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
export const ESPN_SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary";
export const LIVE_STATES  = new Set(["STATUS_IN_PROGRESS", "STATUS_HALFTIME", "STATUS_END_PERIOD"]);
export const FINAL_STATES = new Set(["STATUS_FINAL", "STATUS_FULL_TIME", "STATUS_FT_EXTRA_TIME", "STATUS_PENALTIES"]);
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

async function fetchAndRender(container, poolTeams) {
  try {
    const now   = new Date();
    const start = new Date(Math.max(new Date("2026-06-11"), now - 7 * 86400000));
    const end   = new Date(now.getTime() + 7 * 86400000);
    const fmt   = d => d.toISOString().slice(0, 10).replace(/-/g, "");
    const res   = await fetch(`${ESPN_BASE}?dates=${fmt(start)}-${fmt(end)}`);
    const data  = await res.json();
    renderMatchCards(container, data.events || [], poolTeams);
  } catch {
    container.innerHTML = `
      <div class="empty-state">
        <p>Could not load match data.</p>
        <p style="font-size:12px;margin-top:8px;">Live scores will appear here once the tournament begins.</p>
      </div>`;
  }
}

function renderMatchCards(container, events, poolTeams) {
  container.innerHTML = "";
  if (!events.length) {
    container.innerHTML = `<div class="empty-state"><p>No matches found.</p></div>`;
    return;
  }

  const results  = [];
  const live     = [];
  const upcoming = [];

  events.forEach(ev => {
    const s = ev.status?.type?.name || "STATUS_SCHEDULED";
    if (FINAL_STATES.has(s))     results.push(ev);
    else if (LIVE_STATES.has(s)) live.push(ev);
    else                         upcoming.push(ev);
  });

  results.sort((a, b)  => new Date(b.date) - new Date(a.date));
  upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (live.length)     { container.appendChild(sectionHeader("LIVE NOW", true)); live.forEach(ev => container.appendChild(buildCard(ev, poolTeams, true,  false))); }
  if (results.length)  { container.appendChild(sectionHeader("RESULTS"));        results.forEach(ev => container.appendChild(buildCard(ev, poolTeams, false, true))); }
  if (upcoming.length) { container.appendChild(sectionHeader("UPCOMING MATCHES")); upcoming.forEach(ev => container.appendChild(buildCard(ev, poolTeams, false, false))); }

  const ts = document.createElement("p");
  ts.style.cssText = "color:var(--muted);font-size:11px;text-align:right;margin-top:12px;font-family:'IBM Plex Mono',monospace;";
  ts.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  container.appendChild(ts);
}

// ─── Section header ───────────────────────────────────────────────────────────
function sectionHeader(label, pulse = false) {
  const el = document.createElement("div");
  el.style.cssText = "display:flex;align-items:center;gap:8px;margin:18px 0 10px;";
  if (pulse) { const dot = document.createElement("span"); dot.className = "live-dot"; el.appendChild(dot); }
  const text = document.createElement("span");
  text.style.cssText = "font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:2px;color:var(--muted);white-space:nowrap;";
  text.textContent = label;
  el.appendChild(text);
  const line = document.createElement("div");
  line.style.cssText = "flex:1;height:1px;background:var(--border);";
  el.appendChild(line);
  return el;
}

// ─── Match card ───────────────────────────────────────────────────────────────
export function buildCard(event, poolTeams, isLive, isFinal) {
  const comp  = event.competitions?.[0];
  const comps = comp?.competitors || [];
  const home  = comps.find(c => c.homeAway === "home");
  const away  = comps.find(c => c.homeAway === "away");

  const homeScore = parseInt(home?.score ?? 0, 10);
  const awayScore = parseInt(away?.score ?? 0, 10);
  const homeWon   = isFinal && homeScore > awayScore;
  const awayWon   = isFinal && awayScore > homeScore;

  const homePool = poolTeams.filter(pt => teamMatches(home?.team?.displayName || "", pt.team.name));
  const awayPool = poolTeams.filter(pt => teamMatches(away?.team?.displayName || "", pt.team.name));
  const allPool  = [...homePool, ...awayPool];

  const card = document.createElement("div");
  card.className = "match-card";

  // ── Status row ──────────────────────────────────────────────────────────────
  const statusRow = document.createElement("div");
  statusRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;";

  const statusEl = document.createElement("div");
  statusEl.style.cssText = "font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:1px;display:flex;align-items:center;gap:5px;";

  if (isLive) {
    const dot = document.createElement("span"); dot.className = "live-dot";
    statusEl.appendChild(dot);
    statusEl.appendChild(document.createTextNode(liveLabel(event)));
    statusEl.className = "match-status-live";
  } else if (isFinal) {
    statusEl.textContent = finalLabel(event);
    statusEl.className = "match-status-final";
  } else {
    statusEl.textContent = formatKickoff(event.date);
    statusEl.className = "match-status-sched";
  }
  statusRow.appendChild(statusEl);

  const namedPool = allPool.filter(pt => pt.participantName);
  if (namedPool.length > 0) {
    const poolTag = document.createElement("span");
    poolTag.style.cssText = "font-size:10px;color:var(--green);font-family:'IBM Plex Mono',monospace;letter-spacing:1px;";
    poolTag.textContent = "POOL TEAMS";
    statusRow.appendChild(poolTag);
  }
  card.appendChild(statusRow);

  // ── Teams + Score row ───────────────────────────────────────────────────────
  const teamsRow = document.createElement("div");
  teamsRow.className = "match-teams";

  // Home col
  const homeCol = document.createElement("div");
  homeCol.className = "match-team-col home";
  const homeName = document.createElement("span");
  homeName.textContent = home?.team?.displayName || "TBC";
  if (isFinal) homeName.style.opacity = homeWon ? "1" : "0.4";
  homeCol.appendChild(homeName);
  homePool.forEach(pt => {
    const tag = document.createElement("span");
    tag.className = `owner-tag ${pt.tierKey}`;
    tag.textContent = pt.participantName
      ? `${pt.participantName} · ${tierLabel(pt.tierKey)}`
      : tierLabel(pt.tierKey).toUpperCase();
    homeCol.appendChild(tag);
  });
  teamsRow.appendChild(homeCol);

  // Score / vs col
  const scoreCol = document.createElement("div");
  scoreCol.className = "match-score-col";
  if (isFinal || isLive) {
    const scoreEl = document.createElement("span");
    scoreEl.className = "match-score";
    scoreEl.textContent = `${homeScore}–${awayScore}`;
    scoreCol.appendChild(scoreEl);

    if (isFinal && homeScore !== awayScore) {
      const winTag = document.createElement("span");
      winTag.className = "match-win-tag";
      const winner = homeWon
        ? (home?.team?.shortDisplayName || home?.team?.displayName || "")
        : (away?.team?.shortDisplayName || away?.team?.displayName || "");
      winTag.textContent = `${winner} WIN`;
      scoreCol.appendChild(winTag);
    } else if (isFinal) {
      const drawTag = document.createElement("span");
      drawTag.className = "match-draw-tag";
      drawTag.textContent = "DRAW";
      scoreCol.appendChild(drawTag);
    }
  } else {
    const vsEl = document.createElement("span");
    vsEl.style.cssText = "color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:12px;padding-top:4px;";
    vsEl.textContent = "vs";
    scoreCol.appendChild(vsEl);
  }
  teamsRow.appendChild(scoreCol);

  // Away col
  const awayCol = document.createElement("div");
  awayCol.className = "match-team-col away";
  const awayName = document.createElement("span");
  awayName.textContent = away?.team?.displayName || "TBC";
  if (isFinal) awayName.style.opacity = awayWon ? "1" : "0.4";
  awayCol.appendChild(awayName);
  awayPool.forEach(pt => {
    const tag = document.createElement("span");
    tag.className = `owner-tag ${pt.tierKey}`;
    tag.textContent = pt.participantName
      ? `${pt.participantName} · ${tierLabel(pt.tierKey)}`
      : tierLabel(pt.tierKey).toUpperCase();
    awayCol.appendChild(tag);
  });
  teamsRow.appendChild(awayCol);

  card.appendChild(teamsRow);

  // ── Venue + round footer ────────────────────────────────────────────────────
  const venueName = comp?.venue?.fullName || "";
  const venueCity = comp?.venue?.address?.city || "";
  const venueStr  = [venueName, venueCity].filter(Boolean).join(" · ");
  const groupNote = (comp?.notes || []).find(n => /group/i.test(n.type?.text || "") || /group/i.test(n.headline || ""));
  const roundStr  = groupNote?.headline || "";

  const footer = document.createElement("div");
  footer.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid var(--border);gap:8px;";
  const venueEl = document.createElement("span");
  venueEl.style.cssText = "font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
  venueEl.textContent = venueStr;
  footer.appendChild(venueEl);
  if (roundStr) {
    const roundEl = document.createElement("span");
    roundEl.style.cssText = "font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);letter-spacing:1px;white-space:nowrap;flex-shrink:0;";
    roundEl.textContent = roundStr.toUpperCase();
    footer.appendChild(roundEl);
  }
  card.appendChild(footer);

  // ── Expand toggle (for completed + live matches) ────────────────────────────
  if (isFinal || isLive) {
    const expandBtn = document.createElement("button");
    expandBtn.className = "match-expand-btn";
    expandBtn.innerHTML = `MATCH DETAILS <span class="chevron">▾</span>`;

    let detailEl   = null;
    let loading    = false;
    let expanded   = false;

    expandBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      expanded = !expanded;
      expandBtn.classList.toggle("open", expanded);

      if (!expanded) {
        detailEl?.remove();
        detailEl = null;
        return;
      }

      if (loading) return;
      loading = true;

      detailEl = document.createElement("div");
      detailEl.className = "match-detail";
      detailEl.innerHTML = `<div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted);padding:6px 0;">Loading details…</div>`;
      card.appendChild(detailEl);

      try {
        const res  = await fetch(`${ESPN_SUMMARY}?event=${event.id}`);
        const data = await res.json();
        populateDetail(detailEl, data, home?.team?.id, away?.team?.id);
      } catch {
        detailEl.innerHTML = `<div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted);padding:6px 0;">Could not load details.</div>`;
      }
      loading = false;
    });

    card.appendChild(expandBtn);
  }

  return card;
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

/** Extract athlete name — ESPN uses `participants[].athlete` or `athletesInvolved[]` */
function getAthleteName(detail, index = 0) {
  // Primary: participants[].athlete (confirmed ESPN World Cup structure)
  const p = detail?.participants?.[index];
  if (p) return p.athlete?.displayName || p.athlete?.fullName || p.athlete?.shortName || null;
  // Fallback: athletesInvolved[] (older ESPN endpoints)
  const inv = detail?.athletesInvolved?.[index];
  if (inv) return inv.displayName || inv.fullName || inv.shortName || inv.athlete?.displayName || null;
  return null;
}

function populateDetail(container, data, homeId, awayId) {
  container.innerHTML = "";

  // ESPN places events under header.competitions[0].details
  const details = data.header?.competitions?.[0]?.details || [];


  const goals   = details.filter(d => d.scoringPlay);
  // ESPN World Cup uses `yellowCard`/`redCard` booleans OR type.text
  const yellows = details.filter(d => !d.scoringPlay && (d.yellowCard || /yellow card/i.test(d.type?.text || "")));
  const reds    = details.filter(d => !d.scoringPlay && (d.redCard   || /red card/i.test(d.type?.text   || "")));
  const injuries = data.injuryReport || [];

  if (!goals.length && !yellows.length && !reds.length && !injuries.length) {
    container.innerHTML = `<div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted);padding:6px 0;">No detailed events available.</div>`;
    return;
  }

  // Goals
  if (goals.length) {
    const sec = detailSection("GOALS");
    goals.forEach(g => {
      const isAway  = g.team?.id === awayId;
      const athlete = getAthleteName(g) || "—";
      const minute  = g.clock?.displayValue || (g.addedClock?.displayValue ? `${g.clock?.value}'` : "");
      const isOg    = g.ownGoal;
      const isPen   = g.penaltyKick;
      const label   = [isOg ? "(OG)" : null, isPen ? "(Pen)" : null].filter(Boolean).join(" ");
      sec.appendChild(eventRow("⚽", minute, athlete, label, isAway));
    });
    container.appendChild(sec);
  }

  // Bookings
  if (yellows.length || reds.length) {
    const sec = detailSection("BOOKINGS");
    [...yellows, ...reds].sort((a, b) => (a.clock?.value ?? 0) - (b.clock?.value ?? 0)).forEach(c => {
      const isAway  = c.team?.id === awayId;
      const athlete = getAthleteName(c) || "—";
      const minute  = c.clock?.displayValue || "";
      const icon    = c.redCard ? "🟥" : "🟨";
      sec.appendChild(eventRow(icon, minute, athlete, "", isAway));
    });
    container.appendChild(sec);
  }

  // Injuries
  if (injuries.length) {
    const sec = detailSection("INJURIES");
    injuries.forEach(inj => {
      const row = document.createElement("div");
      row.className = "match-event-row";
      row.innerHTML = `<span class="match-event-icon">🩹</span><span class="match-event-name">${inj.displayName || "Unknown"}</span><span class="match-event-sub">${inj.injuryType || ""}</span>`;
      sec.appendChild(row);
    });
    container.appendChild(sec);
  }
}

function detailSection(label) {
  const sec = document.createElement("div");
  sec.className = "match-detail-section";
  const lbl = document.createElement("div");
  lbl.className = "match-detail-label";
  lbl.textContent = label;
  sec.appendChild(lbl);
  return sec;
}

function eventRow(icon, minute, name, sub, isAway) {
  const row = document.createElement("div");
  row.className = `match-event-row${isAway ? " away" : ""}`;

  const minEl  = document.createElement("span"); minEl.className  = "match-event-minute"; minEl.textContent = minute;
  const iconEl = document.createElement("span"); iconEl.className = "match-event-icon";   iconEl.textContent = icon;
  const nameEl = document.createElement("span"); nameEl.className = "match-event-name";   nameEl.textContent = name;

  if (isAway) {
    row.appendChild(nameEl);
    if (sub) { const subEl = document.createElement("span"); subEl.className = "match-event-sub"; subEl.textContent = sub; row.appendChild(subEl); }
    row.appendChild(iconEl);
    row.appendChild(minEl);
  } else {
    row.appendChild(minEl);
    row.appendChild(iconEl);
    row.appendChild(nameEl);
    if (sub) { const subEl = document.createElement("span"); subEl.className = "match-event-sub"; subEl.textContent = sub; row.appendChild(subEl); }
  }
  return row;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function tierLabel(key) {
  return { big: "Big", smaller: "Smaller", underdog: "Underdog" }[key] || key;
}

function liveLabel(event) {
  const clock  = event.status?.displayClock || "";
  const detail = event.status?.type?.shortDetail || "";
  if (/half.?time/i.test(detail)) return "HALF TIME";
  return clock ? `LIVE · ${clock}` : "LIVE";
}

function finalLabel(event) {
  const detail = (event.status?.type?.shortDetail || "").toLowerCase();
  if (/pen/i.test(detail))         return "FT · PENS";
  if (/extra|aet/i.test(detail))   return "FT · AET";
  return "FT";
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
