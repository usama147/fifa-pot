// js/pot.js
import { db } from "./config.js";
import {
  doc, getDoc, collection, getDocs,
  updateDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { fetchKnockoutEliminations, mergeEliminations, isTeamEliminated } from "./elimination.js";

export async function renderPot(container, isAdmin) {
  container.innerHTML = `<div class="loading">Loading pot...</div>`;

  let poolSnap, partsSnap;
  try {
    [poolSnap, partsSnap] = await Promise.all([
      getDoc(doc(db, "pool", "main")),
      getDocs(collection(db, "pool", "main", "participants"))
    ]);
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="empty-state"><p>Failed to load pot data. Please refresh.</p></div>`;
    return;
  }

  if (!poolSnap.exists()) {
    container.innerHTML = `<div class="empty-state"><p>No pool data yet.</p></div>`;
    return;
  }

  const pool = poolSnap.data();
  const participants = partsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.drawOrder - b.drawOrder);

  container.innerHTML = "";

  if (!pool.drawCompleted) {
    container.innerHTML = `<div class="empty-state"><p>Draw hasn't been run yet.</p></div>`;
    return;
  }

  const eliminated      = pool.eliminatedTeams || [];
  const firestoreElim   = new Set(eliminated.map(t => t.name.toLowerCase()));
  const espnElim        = await fetchKnockoutEliminations();
  const eliminatedNames = mergeEliminations(firestoreElim, espnElim);
  const potTotal        = pool.buyIn * participants.length;
  const finalStandings  = pool.finalStandings || { champion: null, runnerUp: null, thirdPlace: null };

  // ── Pot summary ─────────────────────────────────────────────────────────────
  const potCard = mkCard();
  const potHeader = document.createElement("div");
  potHeader.className = "section-header";
  potHeader.textContent = "Total Pot";
  potCard.appendChild(potHeader);

  const potTotalEl = document.createElement("div");
  potTotalEl.className = "pot-total";
  potTotalEl.textContent = "R0";
  potCard.appendChild(potTotalEl);
  // Count-up animation
  gsap.to({ val: 0 }, {
    val: potTotal,
    duration: 1.4,
    ease: "power2.out",
    delay: 0.3,
    onUpdate() { potTotalEl.textContent = `R${Math.round(this.targets()[0].val)}`; }
  });

  const potSubEl = document.createElement("div");
  potSubEl.style.cssText = "color:var(--muted);font-size:13px;margin-top:4px;";
  potSubEl.textContent = `${participants.length} participants × R${pool.buyIn}`;
  potCard.appendChild(potSubEl);
  container.appendChild(potCard);

  // ── Payout projections / final payouts ──────────────────────────────────────
  const payoutCard = mkCard();
  payoutCard.style.marginTop = "12px";
  const payoutHeader = document.createElement("div");
  payoutHeader.className = "section-header";
  payoutHeader.textContent = finalStandings.champion ? "Final Payouts" : "Projected Payouts";
  payoutCard.appendChild(payoutHeader);

  const places = [
    { label: "🥇 Champion",    key: "champion",   pct: 0.60 },
    { label: "🥈 Runner-Up",   key: "runnerUp",   pct: 0.25 },
    { label: "🥉 Third Place", key: "thirdPlace", pct: 0.15 },
  ];

  places.forEach(({ label, key, pct }, pi) => {
    const standing = finalStandings[key];
    const row = document.createElement("div");
    row.className = "payout-row";

    const labelEl = document.createElement("span");
    if (standing) {
      labelEl.textContent = `${label} ${standing.flag} ${standing.teamName}`;
    } else {
      labelEl.textContent = label;
    }
    row.appendChild(labelEl);

    const amtEl = document.createElement("div");
    amtEl.style.textAlign = "right";

    const amtNum = document.createElement("strong");
    amtNum.style.color = "var(--green)";
    const amtFinal = Math.round(potTotal * pct);
    amtNum.textContent = "R0";
    gsap.to({ val: 0 }, {
      val: amtFinal,
      duration: 1.2,
      ease: "power2.out",
      delay: 0.45 + pi * 0.12,
      onUpdate() { amtNum.textContent = `R${Math.round(this.targets()[0].val)}`; }
    });
    amtEl.appendChild(amtNum);

    if (standing) {
      const ownerEl = document.createElement("span");
      ownerEl.style.cssText = "color:var(--muted);font-size:12px;display:block;";
      ownerEl.textContent = standing.participantName;
      amtEl.appendChild(ownerEl);
    }
    row.appendChild(amtEl);
    payoutCard.appendChild(row);
  });
  container.appendChild(payoutCard);

  // ── Standings ────────────────────────────────────────────────────────────────
  const standingsCard = mkCard();
  standingsCard.style.marginTop = "12px";
  const standingsHeader = document.createElement("div");
  standingsHeader.className = "section-header";
  standingsHeader.textContent = "Standings";
  standingsCard.appendChild(standingsHeader);

  participants.forEach(p => {
    const teams = Object.entries(p.teams || {}).map(([key, t]) => ({ key, ...t }));
    const aliveTeams = teams.filter(t => !isTeamEliminated(t.name, eliminatedNames));
    const isOut = teams.length > 0 && aliveTeams.length === 0;

    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:flex-start;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);gap:10px;";

    const left = document.createElement("div");

    const nameEl = document.createElement("div");
    nameEl.style.cssText = `font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1px;${isOut ? "opacity:0.4;text-decoration:line-through;" : ""}`;
    nameEl.textContent = p.name;
    left.appendChild(nameEl);

    const chipsEl = document.createElement("div");
    chipsEl.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:5px;";
    ["big","smaller","underdog"].forEach(key => {
      const t = p.teams?.[key];
      if (!t) return;
      const elim = isTeamEliminated(t.name, eliminatedNames);
      const chip = document.createElement("span");
      chip.className = `team-chip ${key}${elim ? " eliminated" : ""}`;
      chip.textContent = `${t.flag} ${t.name}`;
      chipsEl.appendChild(chip);
    });
    left.appendChild(chipsEl);
    row.appendChild(left);

    const statusEl = document.createElement("div");
    statusEl.style.cssText = `color:${isOut ? "var(--error)" : "var(--green)"};font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:1px;white-space:nowrap;margin-top:4px;`;
    statusEl.textContent = isOut ? "OUT" : `${aliveTeams.length}/3 alive`;
    row.appendChild(statusEl);

    standingsCard.appendChild(row);
  });
  container.appendChild(standingsCard);

  // ── Admin controls ───────────────────────────────────────────────────────────
  if (isAdmin) {
    renderEliminationPanel(container, participants, eliminatedNames);
    if (!finalStandings.champion) {
      renderFinalStandingsPanel(container, participants, potTotal);
    }
  }
}

function renderEliminationPanel(container, participants, eliminatedNames) {
  const panel = mkCard();
  panel.style.marginTop = "12px";

  const header = document.createElement("div");
  header.className = "section-header";
  header.textContent = "Mark Team Eliminated";
  panel.appendChild(header);

  const allTeams = [];
  participants.forEach(p => {
    Object.entries(p.teams || {}).forEach(([key, team]) => {
      if (!isTeamEliminated(team.name, eliminatedNames)) {
        allTeams.push({ participantName: p.name, participantId: p.id, tierKey: key, team });
      }
    });
  });

  if (allTeams.length === 0) {
    const msg = document.createElement("p");
    msg.style.cssText = "color:var(--muted);font-size:13px;";
    msg.textContent = "All teams have been eliminated.";
    panel.appendChild(msg);
  } else {
    const select = document.createElement("select");
    select.style.cssText = "background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-family:Outfit,sans-serif;font-size:14px;width:100%;outline:none;margin-bottom:10px;";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a team...";
    select.appendChild(placeholder);

    allTeams.forEach((entry, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = `${entry.team.flag} ${entry.team.name} (${entry.participantName})`;
      select.appendChild(opt);
    });

    const elimBtn = document.createElement("button");
    elimBtn.className = "btn-danger";
    elimBtn.style.width = "100%";
    elimBtn.textContent = "Mark as Eliminated";

    elimBtn.addEventListener("click", async () => {
      const idx = parseInt(select.value);
      if (isNaN(idx)) { alert("Select a team first."); return; }
      const entry = allTeams[idx];
      if (!confirm(`Mark ${entry.team.flag} ${entry.team.name} as eliminated?`)) return;
      elimBtn.disabled = true;
      try {
        await updateDoc(doc(db, "pool", "main"), {
          eliminatedTeams: arrayUnion({
            name:            entry.team.name,
            flag:            entry.team.flag,
            tier:            entry.tierKey,
            participantName: entry.participantName,
            eliminatedAt:    new Date().toISOString()
          })
        });
        const { renderPot } = await import("./pot.js");
        renderPot(container, true);
      } catch (err) {
        console.error(err);
        alert("Failed to mark team as eliminated. Please try again.");
        elimBtn.disabled = false;
      }
    });

    panel.appendChild(select);
    panel.appendChild(elimBtn);
  }
  container.appendChild(panel);
}

function renderFinalStandingsPanel(container, participants, potTotal) {
  const panel = mkCard();
  panel.style.marginTop = "12px";

  const header = document.createElement("div");
  header.className = "section-header";
  header.textContent = "Set Final Standings (end of tournament)";
  panel.appendChild(header);

  const allTeamOptions = [];
  participants.forEach(p => {
    Object.entries(p.teams || {}).forEach(([key, team]) => {
      allTeamOptions.push({ participantName: p.name, tierKey: key, team });
    });
  });

  function makeSelect(id, labelText) {
    const wrapper = document.createElement("div");
    wrapper.style.marginBottom = "10px";

    const label = document.createElement("label");
    label.style.cssText = "color:var(--muted);font-size:12px;display:block;margin-bottom:4px;";
    label.textContent = labelText;
    wrapper.appendChild(label);

    const sel = document.createElement("select");
    sel.id = id;
    sel.style.cssText = "background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-family:Outfit,sans-serif;font-size:14px;width:100%;outline:none;";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select team...";
    sel.appendChild(placeholder);

    allTeamOptions.forEach((entry, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = `${entry.team.flag} ${entry.team.name} (${entry.participantName})`;
      sel.appendChild(opt);
    });
    wrapper.appendChild(sel);
    return wrapper;
  }

  panel.appendChild(makeSelect("standing-champion",  "🥇 World Cup Champion"));
  panel.appendChild(makeSelect("standing-runnerup",  "🥈 Runner-Up"));
  panel.appendChild(makeSelect("standing-third",     "🥉 Third Place"));

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn-primary";
  saveBtn.style.width = "100%";
  saveBtn.textContent = "Lock Final Standings";

  saveBtn.addEventListener("click", async () => {
    const c  = parseInt(panel.querySelector("#standing-champion").value);
    const ru = parseInt(panel.querySelector("#standing-runnerup").value);
    const tp = parseInt(panel.querySelector("#standing-third").value);
    if (isNaN(c) || isNaN(ru) || isNaN(tp)) { alert("Please select all three standings."); return; }
    if (!confirm("Lock final standings? This cannot be undone.")) return;

    saveBtn.disabled = true;
    const mk = (entry) => ({
      teamName:        entry.team.name,
      flag:            entry.team.flag,
      participantName: entry.participantName
    });

    try {
      await updateDoc(doc(db, "pool", "main"), {
        "finalStandings.champion":  mk(allTeamOptions[c]),
        "finalStandings.runnerUp":  mk(allTeamOptions[ru]),
        "finalStandings.thirdPlace":mk(allTeamOptions[tp])
      });
      const { renderPot } = await import("./pot.js");
      renderPot(container, true);
    } catch (err) {
      console.error(err);
      alert("Failed to save standings. Please try again.");
      saveBtn.disabled = false;
    }
  });

  panel.appendChild(saveBtn);
  container.appendChild(panel);
}

function mkCard() {
  const d = document.createElement("div");
  d.className = "card";
  return d;
}
