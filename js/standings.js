// js/standings.js
import { db, teamMatches } from "./config.js";
import {
  doc, getDoc, collection, getDocs, updateDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const ESPN_STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings";
let pollInterval = null;
let ctxMenuEl    = null;   // singleton context menu

export async function renderStandings(container, isAdmin) {
  container.innerHTML = `<div class="loading">Loading group standings...</div>`;

  const [poolTeams, eliminatedNames] = await loadPoolData();

  await fetchAndRender(container, poolTeams, eliminatedNames, isAdmin);

  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(
    () => fetchAndRender(container, poolTeams, eliminatedNames, isAdmin),
    120000  // 2 min — ESPN is free, no rate limit
  );
}

// ── Data loaders ─────────────────────────────────────────────────────────────

async function loadPoolData() {
  try {
    const [poolSnap, partsSnap] = await Promise.all([
      getDoc(doc(db, "pool", "main")),
      getDocs(collection(db, "pool", "main", "participants"))
    ]);

    const poolTeams = [];
    partsSnap.forEach(d => {
      const p = d.data();
      if (!p.teams) return;
      Object.entries(p.teams).forEach(([tierKey, team]) => {
        poolTeams.push({ participantName: p.name, tierKey, team });
      });
    });

    const eliminatedNames = new Set(
      (poolSnap.exists() ? poolSnap.data().eliminatedTeams || [] : [])
        .map(t => t.name.toLowerCase())
    );

    return [poolTeams, eliminatedNames];
  } catch {
    return [[], new Set()];
  }
}

// ── Fetch + render ────────────────────────────────────────────────────────────

async function fetchAndRender(container, poolTeams, eliminatedNames, isAdmin) {
  try {
    const res    = await fetch(ESPN_STANDINGS_URL);
    const data   = await res.json();
    const groups = data.children || [];
    renderGroups(container, groups, poolTeams, eliminatedNames, isAdmin);
  } catch {
    container.innerHTML = `
      <div class="empty-state">
        <p>Could not load standings.</p>
        <p style="font-size:12px;margin-top:8px;">Check your internet connection or try again later.</p>
      </div>`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStat(entry, name) {
  const s = entry.stats?.find(st => st.name === name);
  return s ? (parseInt(s.displayValue, 10) || 0) : 0;
}

function fmtGD(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

// ── Context menu ──────────────────────────────────────────────────────────────

function getCtxMenu() {
  if (ctxMenuEl) return ctxMenuEl;
  ctxMenuEl = el("div", "ctx-menu");
  ctxMenuEl.style.display = "none";
  document.body.appendChild(ctxMenuEl);

  // Dismiss on any outside click or Escape
  document.addEventListener("click",   hideCtxMenu);
  document.addEventListener("keydown", e => { if (e.key === "Escape") hideCtxMenu(); });
  return ctxMenuEl;
}

function hideCtxMenu() {
  if (ctxMenuEl) ctxMenuEl.style.display = "none";
}

function showCtxMenu(x, y, items) {
  const menu = getCtxMenu();
  menu.innerHTML = "";

  items.forEach(({ label, action, danger }) => {
    const item = el("div", `ctx-menu-item${danger ? " danger" : ""}`);
    item.textContent = label;
    item.addEventListener("click", e => {
      e.stopPropagation();
      hideCtxMenu();
      action();
    });
    menu.appendChild(item);
  });

  menu.style.left    = `${x}px`;
  menu.style.top     = `${y}px`;
  menu.style.display = "block";

  // Keep menu fully on-screen
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right  > window.innerWidth  - 8) menu.style.left = `${x - rect.width}px`;
    if (rect.bottom > window.innerHeight - 8) menu.style.top  = `${y - rect.height}px`;
  });
}

// ── Custom confirm dialog ─────────────────────────────────────────────────────

function showConfirm(teamName, teamFlag, onConfirm) {
  const existing = document.getElementById("elim-confirm-overlay");
  if (existing) existing.remove();

  const overlay = el("div", "elim-confirm-overlay");
  overlay.id = "elim-confirm-overlay";

  const modal = el("div", "elim-confirm-modal");

  const msg = el("p", "elim-confirm-msg");
  msg.innerHTML = `Are you sure you want to eliminate<br><strong>${teamFlag} ${teamName}</strong>?`;
  modal.appendChild(msg);

  const btns = el("div", "elim-confirm-btns");

  const cancelBtn = el("button", "btn-ghost");
  cancelBtn.textContent = "No, Cancel";
  cancelBtn.addEventListener("click", () => overlay.remove());

  const confirmBtn = el("button", "btn-danger");
  confirmBtn.textContent = "Yes, Eliminate";
  confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Eliminating...";
    overlay.remove();
    await onConfirm();
  });

  btns.appendChild(cancelBtn);
  btns.appendChild(confirmBtn);
  modal.appendChild(btns);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  // Entrance animation
  gsap.from(modal, { duration: 0.25, opacity: 0, y: 14, ease: "power2.out" });
}

// ── Render groups ─────────────────────────────────────────────────────────────

function renderGroups(container, groups, poolTeams, eliminatedNames, isAdmin) {
  container.innerHTML = "";

  const hdr = el("div");
  hdr.style.marginBottom = "16px";
  hdr.innerHTML = `
    <h2 style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:1px;margin-bottom:4px;">
      Group Stage
    </h2>
    <p style="color:var(--muted);font-size:13px;">
      ${groups.length > 0 ? `${groups.length} groups · ` : ""}Top 2 advance · 3rd uncertain · 4th eliminated
      ${isAdmin ? '<span style="margin-left:8px;font-size:10px;letter-spacing:1px;font-family:\'IBM Plex Mono\',monospace;">· RIGHT-CLICK A TEAM TO ELIMINATE</span>' : ""}
    </p>`;
  container.appendChild(hdr);

  if (groups.length === 0) {
    const empty = el("div", "empty-state");
    empty.innerHTML = `
      <p>No standings data yet.</p>
      <p style="font-size:12px;margin-top:8px;">Group stage data will appear once matches begin.</p>`;
    container.appendChild(empty);
    appendTimestamp(container);
    return;
  }

  groups.forEach(group => {
    const groupName = group.name || "Group ?";
    const entries   = [...(group.standings?.entries || [])]
      .sort((a, b) => (a.note?.rank ?? 99) - (b.note?.rank ?? 99));

    const table = el("div", "group-table");

    // ── Column header row
    const headerRow = el("div", "group-table-header");
    const nameSpan  = el("span", "group-table-name");
    nameSpan.textContent = groupName;
    headerRow.appendChild(nameSpan);

    const colLabels = el("div", "group-col-labels");
    [
      { text: "P",   sm: false, bold: false },
      { text: "W",   sm: false, bold: false },
      { text: "D",   sm: false, bold: false },
      { text: "L",   sm: false, bold: false },
      { text: "GF",  sm: true,  bold: false },
      { text: "GA",  sm: true,  bold: false },
      { text: "GD",  sm: false, bold: false },
      { text: "Pts", sm: false, bold: true  },
    ].forEach(({ text, sm, bold }) => {
      const s = el("span", [sm ? "col-hide-sm" : "", bold ? "col-pts" : ""].filter(Boolean).join(" "));
      s.textContent = text;
      colLabels.appendChild(s);
    });
    headerRow.appendChild(colLabels);
    table.appendChild(headerRow);

    // ── Team rows
    entries.forEach(entry => {
      const rank    = entry.note?.rank ?? 0;
      const apiName = entry.team?.displayName || "";

      const gp  = getStat(entry, "gamesPlayed");
      const w   = getStat(entry, "wins");
      const d   = getStat(entry, "ties");
      const l   = getStat(entry, "losses");
      const gf  = getStat(entry, "pointsFor");
      const ga  = getStat(entry, "pointsAgainst");
      const gd  = getStat(entry, "pointDifferential");
      const pts = getStat(entry, "points");

      const poolMatch = poolTeams.find(pt => teamMatches(apiName, pt.team.name));
      const isPool    = !!poolMatch;
      const isElim    = poolMatch ? eliminatedNames.has(poolMatch.team.name.toLowerCase()) : false;

      const row = el("div", `group-table-row${isPool ? " is-pool" : ""}${isAdmin && isPool && !isElim ? " admin-row" : ""}`);

      // Coloured bar
      const bar = el("span", `group-pos-bar pos-${rank}`);
      row.appendChild(bar);

      // Rank
      const rankEl = el("span", "group-rank");
      rankEl.textContent = rank;
      row.appendChild(rankEl);

      // Team name + owner chip
      const teamCell = el("div", "group-team-cell");
      const displayName = poolMatch ? `${poolMatch.team.flag} ${poolMatch.team.name}` : apiName;
      const nameEl = el("span", ["group-team-name", isPool ? "is-pool" : "", isElim ? "is-elim" : ""].filter(Boolean).join(" "));
      nameEl.textContent = displayName;
      teamCell.appendChild(nameEl);

      if (isPool) {
        const ownerTag = el("span", `pool-owner-tag ${poolMatch.tierKey}`);
        ownerTag.textContent = poolMatch.participantName;
        teamCell.appendChild(ownerTag);
      }
      row.appendChild(teamCell);

      // Stats
      const statsDiv = el("div", "group-stats");
      [
        { v: gp,        sm: false },
        { v: w,         sm: false },
        { v: d,         sm: false },
        { v: l,         sm: false },
        { v: gf,        sm: true  },
        { v: ga,        sm: true  },
        { v: fmtGD(gd), sm: false },
        { v: pts,       bold: true },
      ].forEach(({ v, sm, bold }) => {
        const s = el("span", ["group-stat", sm ? "col-hide-sm" : "", bold ? "col-pts" : ""].filter(Boolean).join(" "));
        s.textContent = v;
        statsDiv.appendChild(s);
      });
      row.appendChild(statsDiv);

      // Admin right-click to eliminate (pool teams not yet eliminated only)
      if (isAdmin && isPool && !isElim) {
        row.addEventListener("contextmenu", e => {
          e.preventDefault();
          showCtxMenu(e.clientX, e.clientY, [
            {
              label:  `Eliminate ${poolMatch.team.flag} ${poolMatch.team.name}`,
              danger: true,
              action: () => {
                showConfirm(poolMatch.team.name, poolMatch.team.flag, async () => {
                  try {
                    await updateDoc(doc(db, "pool", "main"), {
                      eliminatedTeams: arrayUnion({
                        name:            poolMatch.team.name,
                        flag:            poolMatch.team.flag,
                        tier:            poolMatch.tierKey,
                        participantName: poolMatch.participantName,
                        eliminatedAt:    new Date().toISOString()
                      })
                    });
                    const [freshPoolTeams, freshElimNames] = await loadPoolData();
                    renderGroups(container, groups, freshPoolTeams, freshElimNames, isAdmin);
                  } catch (err) {
                    console.error(err);
                    alert("Failed to mark team as eliminated. Please try again.");
                  }
                });
              }
            }
          ]);
        });
      }

      table.appendChild(row);
    });

    container.appendChild(table);
  });

  appendTimestamp(container);
}

function appendTimestamp(container) {
  const ts = el("p");
  ts.style.cssText = "color:var(--muted);font-size:11px;text-align:right;margin-top:12px;font-family:'IBM Plex Mono',monospace;";
  ts.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  container.appendChild(ts);
}

// ── Utility ───────────────────────────────────────────────────────────────────
function el(tag, cls = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
