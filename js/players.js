// js/players.js
import { db, teamMatches } from "./config.js";
import {
  doc, getDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { buildCard, ESPN_BASE, FINAL_STATES } from "./matches.js";
import { fetchKnockoutEliminations, mergeEliminations, isTeamEliminated } from "./elimination.js";

// ── Particle cleanup registry ─────────────────────────────────────────────────
let particleCleanups = [];

function cleanupParticles() {
  particleCleanups.forEach(fn => fn());
  particleCleanups = [];
}

function addPaidParticles(card) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
  card.insertBefore(canvas, card.firstChild);

  const COUNT = 14;
  let particles = null;
  let raf;

  function spawn(w, h, y) {
    return {
      x:         Math.random() * w,
      y:         y !== undefined ? y : Math.random() * h,
      r:         0.7 + Math.random() * 1.3,
      vx:        (Math.random() - 0.5) * 0.3,
      vy:        -(0.2 + Math.random() * 0.35),
      life:      Math.random(),
      lifeSpeed: 0.004 + Math.random() * 0.005,
    };
  }

  function draw() {
    const w = card.offsetWidth;
    const h = card.offsetHeight;

    if (!particles) {
      canvas.width  = w;
      canvas.height = h;
      particles = Array.from({ length: COUNT }, () => spawn(w, h));
    }

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);

    particles.forEach((p, i) => {
      p.life += p.lifeSpeed;
      p.x    += p.vx;
      p.y    += p.vy;

      if (p.life >= 1) {
        particles[i] = spawn(w, h, h + 4);
        return;
      }

      const alpha = Math.sin(p.life * Math.PI) * 0.45;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(247,197,32,${alpha.toFixed(3)})`;
      ctx.fill();
    });

    raf = requestAnimationFrame(draw);
  }

  draw();
  particleCleanups.push(() => cancelAnimationFrame(raf));
}

// ── Entry point ───────────────────────────────────────────────────────────────
export async function renderPlayers(container) {
  container.innerHTML = `<div class="loading">Loading players...</div>`;

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
  const participants = partsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.drawOrder ?? 0) - (b.drawOrder ?? 0)
                 || (a.addedAt?.seconds ?? 0) - (b.addedAt?.seconds ?? 0));

  // Merge Firestore manual eliminations with ESPN knockout losers
  const firestoreElim = new Set((pool.eliminatedTeams || []).map(t => t.name.toLowerCase()));
  const espnElim = await fetchKnockoutEliminations();
  const eliminatedNames = mergeEliminations(firestoreElim, espnElim);
  const eliminatedMap   = {};
  (pool.eliminatedTeams || []).forEach(t => {
    eliminatedMap[t.name.toLowerCase()] = t;
  });

  showList(container, participants, pool, eliminatedNames, eliminatedMap);
}

// ── Participant list ──────────────────────────────────────────────────────────
function showList(container, participants, pool, eliminatedNames, eliminatedMap) {
  cleanupParticles();
  container.innerHTML = "";

  // Header
  const hdr = mk("div");
  hdr.style.marginBottom = "20px";
  hdr.innerHTML = `
    <h2 style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:1px;margin-bottom:4px;">
      Participants
    </h2>
    <p style="color:var(--muted);font-size:13px;">
      ${participants.length} in the pool
      ${pool.drawCompleted ? "· tap a name to see their draw" : "· draw not yet run"}
    </p>`;
  container.appendChild(hdr);

  if (participants.length === 0) {
    const empty = mk("div", "empty-state");
    empty.innerHTML = "<p>No participants added yet.</p>";
    container.appendChild(empty);
    return;
  }

  participants.forEach(p => {
    const teams     = Object.entries(p.teams || {}).map(([key, t]) => ({ key, ...t }));
    const aliveTeams = teams.filter(t => !isTeamEliminated(t.name, eliminatedNames));
    const isOut      = teams.length > 0 && aliveTeams.length === 0;

    const card = mk("div", "participant-card");
    if (p.paid) {
      card.classList.add("paid-border");
      addPaidParticles(card);
    }
    if (pool.drawCompleted) card.style.cursor = "pointer";

    // Name + status row
    const nameRow = mk("div");
    nameRow.style.cssText = "display:flex;align-items:center;gap:12px;";

    const nameEl = mk("div");
    nameEl.style.cssText = `
      font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:1px;
      ${isOut ? "opacity:0.4;text-decoration:line-through;" : ""}`;
    nameEl.textContent = p.name;
    nameRow.appendChild(nameEl);

    if (p.paid) {
      const paidBadge = mk("span", "paid-badge");
      paidBadge.textContent = "PAID";
      nameRow.appendChild(paidBadge);
    }

    if (pool.drawCompleted && teams.length > 0) {
      const badge = mk("span");
      badge.style.cssText = `
        font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:1px;
        margin-left:auto;
        color:${isOut ? "var(--error)" : "var(--green)"};`;
      badge.textContent = isOut ? "OUT" : `${aliveTeams.length}/${teams.length} ALIVE`;
      nameRow.appendChild(badge);
    }
    card.appendChild(nameRow);

    // Team chips
    if (pool.drawCompleted && teams.length > 0) {
      const chips = mk("div");
      chips.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;";
      ["big", "smaller", "underdog"].forEach(key => {
        const t = p.teams?.[key];
        if (!t) return;
        const elim = isTeamEliminated(t.name, eliminatedNames);
        const chip = mk("span", `team-chip ${key}${elim ? " eliminated" : ""}`);
        chip.textContent = `${t.flag} ${t.name}`;
        chips.appendChild(chip);
      });
      card.appendChild(chips);
    }

    // Click → detail
    if (pool.drawCompleted) {
      card.addEventListener("click", () => {
        gsap.to(container, {
          duration: 0.18, opacity: 0,
          onComplete: () => {
            gsap.set(container, { clearProps: "opacity" });
            showDetail(container, p, participants, pool, eliminatedNames, eliminatedMap);
          }
        });
      });
    }

    container.appendChild(card);
  });
}

// ── Participant detail ────────────────────────────────────────────────────────
function showDetail(container, p, participants, pool, eliminatedNames, eliminatedMap) {
  container.innerHTML = "";

  const teams      = Object.entries(p.teams || {}).map(([key, t]) => ({ key, ...t }));
  const aliveTeams = teams.filter(t => !isTeamEliminated(t.name, eliminatedNames));
  const isOut      = teams.length > 0 && aliveTeams.length === 0;
  const tierLabel  = {};
  (pool.tiers || []).forEach(t => { tierLabel[t.key] = t; });

  // ── Back button
  const backBtn = mk("button", "btn-ghost");
  backBtn.style.marginBottom = "20px";
  backBtn.textContent = "← All Participants";
  backBtn.addEventListener("click", () => {
    gsap.to(container, {
      duration: 0.18, opacity: 0,
      onComplete: () => {
        gsap.set(container, { clearProps: "opacity" });
        showList(container, participants, pool, eliminatedNames, eliminatedMap);
      }
    });
  });
  container.appendChild(backBtn);

  // ── Profile card
  const profileCard = mk("div", "card");
  profileCard.style.marginBottom = "12px";
  profileCard.dataset.ga = "1"; // skip MutationObserver, we animate manually

  const bigName = mk("div");
  bigName.style.cssText = `
    font-family:'Bebas Neue',sans-serif;font-size:38px;letter-spacing:2px;line-height:1;
    ${isOut ? "opacity:0.4;text-decoration:line-through;" : ""}`;
  bigName.textContent = p.name;
  profileCard.appendChild(bigName);

  if (p.paid) {
    const paidBadge = mk("span", "paid-badge");
    paidBadge.textContent = "PAID";
    paidBadge.style.cssText = "margin-top:8px;display:inline-block;";
    profileCard.appendChild(paidBadge);
  }

  const statusLine = mk("div");
  statusLine.style.cssText = `
    font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:2px;margin-top:8px;
    color:${isOut ? "var(--error)" : "var(--green)"};`;
  if (isOut) {
    statusLine.textContent = "ELIMINATED — ALL TEAMS OUT";
  } else if (aliveTeams.length === teams.length) {
    statusLine.textContent = `ALL ${teams.length} TEAMS STILL IN`;
  } else {
    statusLine.textContent = `${aliveTeams.length} OF ${teams.length} TEAMS STILL IN`;
  }
  profileCard.appendChild(statusLine);
  container.appendChild(profileCard);

  // ── Teams breakdown card
  if (teams.length > 0) {
    const teamsCard = mk("div", "card");
    teamsCard.style.marginBottom = "12px";
    teamsCard.dataset.ga = "1";

    const teamsHdr = mk("div", "section-header");
    teamsHdr.textContent = "Draw Assignments";
    teamsCard.appendChild(teamsHdr);

    ["big", "smaller", "underdog"].forEach((key, ki) => {
      const t = p.teams?.[key];
      if (!t) return;
      const tier     = tierLabel[key];
      const elim     = isTeamEliminated(t.name, eliminatedNames);
      const elimInfo = eliminatedMap[t.name.toLowerCase()];

      const row = mk("div");
      row.style.cssText = `
        display:flex;align-items:center;gap:12px;padding:13px 0;
        border-bottom:1px solid var(--border);`;

      // Tier badge
      const tierBadge = mk("span", `tier-badge ${key}`);
      tierBadge.textContent = tier ? `${tier.icon} ${tier.label}` : key;
      tierBadge.style.flexShrink = "0";
      row.appendChild(tierBadge);

      // Team name + optional elim date
      const info = mk("div");
      info.style.flex = "1";

      const teamName = mk("div");
      teamName.style.cssText = `font-size:15px;${elim ? "opacity:0.42;text-decoration:line-through;" : ""}`;
      teamName.textContent = `${t.flag} ${t.name}`;
      info.appendChild(teamName);

      if (elim && elimInfo?.eliminatedAt) {
        const dateEl = mk("div");
        dateEl.style.cssText = "font-size:11px;color:var(--muted);margin-top:2px;font-family:'IBM Plex Mono',monospace;";
        const d = new Date(elimInfo.eliminatedAt);
        dateEl.textContent = `Eliminated ${d.toLocaleDateString([], { day: "numeric", month: "short" })}`;
        info.appendChild(dateEl);
      }
      row.appendChild(info);

      // Alive / out badge
      const statusBadge = mk("div");
      statusBadge.style.cssText = `
        font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:1px;
        white-space:nowrap;
        color:${elim ? "var(--error)" : "var(--green)"};`;
      statusBadge.textContent = elim ? "OUT" : "ALIVE";
      row.appendChild(statusBadge);

      if (ki === 2) row.style.borderBottom = "none"; // last row
      teamsCard.appendChild(row);
    });

    container.appendChild(teamsCard);
  }

  // ── Match History card
  if (teams.length > 0) {
    const histCard = mk("div", "card");
    histCard.style.marginBottom = "12px";
    histCard.dataset.ga = "1";

    const histHdr = mk("div", "section-header");
    histHdr.textContent = "Match History";
    histCard.appendChild(histHdr);

    const histBody = mk("div");
    histBody.style.marginTop = "8px";
    histCard.appendChild(histBody);

    container.appendChild(histCard);
    // Load async after render
    renderMatchHistory(histBody, teams).catch(() => {
      histBody.innerHTML = `<div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted);padding:6px 0;">Could not load match history.</div>`;
    });
  }

  // ── Entrance animation (manual stagger; cards marked data-ga skip MutationObserver)
  const elements = [backBtn, ...container.querySelectorAll(".card")];
  gsap.from(elements, {
    duration: 0.35,
    opacity: 0,
    y: 14,
    stagger: 0.07,
    ease: "power2.out"
  });
}

// ── Match History ─────────────────────────────────────────────────────────────
async function renderMatchHistory(container, playerTeams) {
  container.innerHTML = `<div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted);padding:6px 0;">Loading match history…</div>`;

  const teamNames = playerTeams.map(t => t.name);

  const now   = new Date();
  const start = new Date("2026-06-11");
  const fmt   = d => d.toISOString().slice(0, 10).replace(/-/g, "");
  const res   = await fetch(`${ESPN_BASE}?dates=${fmt(start)}-${fmt(now)}`);
  const data  = await res.json();
  const events = data.events || [];

  // Keep only completed matches involving at least one of this player's teams
  const played = events.filter(ev => {
    if (!FINAL_STATES.has(ev.status?.type?.name || "")) return false;
    const comps = ev.competitions?.[0]?.competitors || [];
    return comps.some(c => teamNames.some(name => teamMatches(c.team?.displayName || "", name)));
  });

  played.sort((a, b) => new Date(b.date) - new Date(a.date));

  container.innerHTML = "";

  if (!played.length) {
    container.innerHTML = `<div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--muted);padding:6px 0;">No matches played yet.</div>`;
    return;
  }

  // Format player's teams as poolTeams entries (empty participantName = show tier badge only)
  const playerPoolTeams = playerTeams.map(t => ({
    participantName: "",
    tierKey: t.key,
    team: t
  }));

  played.forEach(ev => {
    const comps = ev.competitions?.[0]?.competitors || [];
    // Find the competitor that matches one of the player's teams
    const playerComp = comps.find(c =>
      teamNames.some(name => teamMatches(c.team?.displayName || "", name))
    );

    let resultClass = "";
    if (playerComp) {
      const myScore  = parseInt(playerComp.score ?? 0, 10);
      const oppScore = parseInt(comps.find(c => c !== playerComp)?.score ?? 0, 10);
      if (myScore > oppScore)      resultClass = "result-win";
      else if (myScore < oppScore) resultClass = "result-loss";
      else                         resultClass = "result-draw";
    }

    const card = buildCard(ev, playerPoolTeams, false, true);
    if (resultClass) card.classList.add(resultClass);
    container.appendChild(card);
  });
}

// ── Utility ───────────────────────────────────────────────────────────────────
function mk(tag, cls = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
