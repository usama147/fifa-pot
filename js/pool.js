// js/pool.js
import { db } from "./config.js";
import {
  doc, getDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { fetchKnockoutEliminations, mergeEliminations, isTeamEliminated } from "./elimination.js";

export async function renderPool(container) {
  container.innerHTML = `<div class="loading">Loading pool...</div>`;

  let poolSnap, partsSnap;
  try {
    [poolSnap, partsSnap] = await Promise.all([
      getDoc(doc(db, "pool", "main")),
      getDocs(collection(db, "pool", "main", "participants"))
    ]);
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="empty-state"><p>Failed to load pool data. Please refresh.</p></div>`;
    return;
  }

  if (!poolSnap.exists()) {
    container.innerHTML = `<div class="empty-state"><p>No pool data yet. Admin needs to set up the pool.</p></div>`;
    return;
  }

  const pool = poolSnap.data();
  const participants = partsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.drawOrder - b.drawOrder);

  container.innerHTML = "";

  // Header
  const hdr = document.createElement("div");
  hdr.style.marginBottom = "20px";
  const potTotal = pool.buyIn * participants.length;

  if (pool.drawCompleted) {
    hdr.innerHTML = `
      <h2 style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:1px;margin-bottom:4px;">
        The Draw
      </h2>
      <p style="color:var(--muted);font-size:13px;">
        ${participants.length} participants · Pot: <strong style="color:var(--green)">R${potTotal}</strong>
      </p>`;
  } else {
    hdr.innerHTML = `
      <div class="empty-state">
        <h2 style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:1px;">Draw Not Yet Run</h2>
        <p>Check back once the admin has completed the draw.</p>
      </div>`;
    container.appendChild(hdr);
    return;
  }
  container.appendChild(hdr);

  // Eliminated teams: merge Firestore manual list with ESPN knockout losers
  const firestoreElim = new Set(
    (pool.eliminatedTeams || []).map(t => t.name.toLowerCase())
  );
  const espnElim = await fetchKnockoutEliminations();
  const eliminatedSet = mergeEliminations(firestoreElim, espnElim);

  // Tier label map
  const tierLabel = {};
  (pool.tiers || []).forEach(t => { tierLabel[t.key] = t; });

  // Participant cards
  participants.forEach(p => {
    const card = document.createElement("div");
    card.className = "participant-card";

    const allTeams = Object.values(p.teams || {});
    const alive = allTeams.filter(t => !isTeamEliminated(t.name, eliminatedSet));
    const isOut = alive.length === 0 && allTeams.length > 0;

    const nameDiv = document.createElement("div");
    nameDiv.className = "participant-name";
    if (isOut) {
      nameDiv.style.opacity = "0.4";
      nameDiv.style.textDecoration = "line-through";
    }
    nameDiv.textContent = p.name;
    if (isOut) {
      const outBadge = document.createElement("span");
      outBadge.style.cssText = "font-family:Outfit,sans-serif;font-size:12px;color:var(--error);margin-left:8px;";
      outBadge.textContent = "ELIMINATED";
      nameDiv.appendChild(outBadge);
    }
    card.appendChild(nameDiv);

    const teamsEl = document.createElement("div");
    teamsEl.className = "participant-teams";

    const tierOrder = ["big", "smaller", "underdog"];
    tierOrder.forEach(key => {
      const team = p.teams?.[key];
      if (!team) return;
      const tier = tierLabel[key];
      const isElim = isTeamEliminated(team.name, eliminatedSet);
      const chip = document.createElement("span");
      chip.className = `team-chip ${key}${isElim ? " eliminated" : ""}`;
      chip.textContent = `${team.flag} ${team.name}`;
      if (tier) chip.title = tier.label;
      teamsEl.appendChild(chip);
    });

    card.appendChild(teamsEl);
    container.appendChild(card);
  });
}
