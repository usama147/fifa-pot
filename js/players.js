// js/players.js
import { db } from "./config.js";
import {
  doc, getDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

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

  const eliminatedNames = new Set((pool.eliminatedTeams || []).map(t => t.name.toLowerCase()));
  const eliminatedMap   = {};
  (pool.eliminatedTeams || []).forEach(t => {
    eliminatedMap[t.name.toLowerCase()] = t;
  });

  showList(container, participants, pool, eliminatedNames, eliminatedMap);
}

// ── Participant list ──────────────────────────────────────────────────────────
function showList(container, participants, pool, eliminatedNames, eliminatedMap) {
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
    const aliveTeams = teams.filter(t => !eliminatedNames.has(t.name.toLowerCase()));
    const isOut      = teams.length > 0 && aliveTeams.length === 0;

    const card = mk("div", "participant-card");
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
        const elim = eliminatedNames.has(t.name.toLowerCase());
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

  const potTotal   = pool.buyIn * participants.length;
  const teams      = Object.entries(p.teams || {}).map(([key, t]) => ({ key, ...t }));
  const aliveTeams = teams.filter(t => !eliminatedNames.has(t.name.toLowerCase()));
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
      const elim     = eliminatedNames.has(t.name.toLowerCase());
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

  // ── Payout potential card (only if still in the running)
  if (!isOut && teams.length > 0) {
    const payCard = mk("div", "card");
    payCard.style.marginBottom = "12px";
    payCard.dataset.ga = "1";

    const payHdr = mk("div", "section-header");
    payHdr.textContent = "Payout Potential";
    payCard.appendChild(payHdr);

    [
      { label: "🥇 If Champion",   pct: 0.60 },
      { label: "🥈 If Runner-Up",  pct: 0.25 },
      { label: "🥉 If 3rd Place",  pct: 0.15 },
    ].forEach(({ label, pct }, i) => {
      const finalAmt = Math.round(potTotal * pct);
      const row = mk("div");
      row.style.cssText = `
        display:flex;justify-content:space-between;align-items:center;
        padding:10px 0;
        border-bottom:${i < 2 ? "1px solid var(--border)" : "none"};`;

      const lbl = mk("span");
      lbl.style.fontSize = "14px";
      lbl.textContent = label;
      row.appendChild(lbl);

      const amt = mk("strong");
      amt.style.color = "var(--green)";
      amt.textContent = "R0";
      gsap.to({ val: 0 }, {
        val: finalAmt,
        duration: 1.0,
        ease: "power2.out",
        delay: 0.4 + i * 0.12,
        onUpdate() { amt.textContent = `R${Math.round(this.targets()[0].val)}`; }
      });
      row.appendChild(amt);
      payCard.appendChild(row);
    });

    container.appendChild(payCard);
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

// ── Utility ───────────────────────────────────────────────────────────────────
function mk(tag, cls = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
