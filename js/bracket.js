// js/bracket.js — renders the knockout bracket from the fixed skeleton model.
import { teamMatches } from "./config.js";
import { LIVE_STATES, FINAL_STATES, buildCard } from "./matches.js";
import { buildModel, loadSkeleton } from "./bracket-model.js";

const ROUND_ORDER  = ["r32", "r16", "qf", "sf", "third", "final"];
const ROUND_LABELS = {
  r32: "ROUND OF 32", r16: "ROUND OF 16", qf: "QUARTER-FINALS",
  sf: "SEMI-FINALS", third: "THIRD PLACE", final: "FINAL",
};

// ── Pool teams (Firestore) ──────────────────────────────────────────────────
import { db } from "./config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

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

// ── Main entry ──────────────────────────────────────────────────────────────
let pollTimer = null;

export async function renderBracket(container) {
  container.innerHTML = `<div class="loading">Loading bracket...</div>`;
  let skeleton;
  try {
    skeleton = await loadSkeleton();
  } catch (err) {
    console.error("Bracket skeleton load error:", err);
    container.innerHTML = `
      <div class="empty-state"><p>Could not load bracket structure.</p></div>`;
    return;
  }
  const poolTeams = await loadPoolTeams();
  await fetchAndRender(container, poolTeams, skeleton);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => fetchAndRender(container, poolTeams, skeleton), 60000);
}

async function fetchAndRender(container, poolTeams, skeleton) {
  let events = [];
  try {
    const start = "20260628";
    const end   = "20260720";
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${start}-${end}`
    );
    events = (await res.json()).events || [];
  } catch (err) {
    console.warn("Bracket ESPN fetch failed — rendering skeleton only:", err);
  }
  const model = buildModel(skeleton, events);
  renderViews(container, model, poolTeams);
}

function renderViews(container, model, poolTeams) {
  container.innerHTML = "";
  const anyPlayed = [...model.byNumber.values()].some(
    m => LIVE_STATES.has(m.status) || FINAL_STATES.has(m.status)
  );

  // Mobile list
  const listEl = document.createElement("div");
  listEl.className = "bracket-list";
  renderList(listEl, model, poolTeams);
  container.appendChild(listEl);

  // Top scrollbar rail
  const scrollTop = document.createElement("div");
  scrollTop.className = "bracket-scroll-top";
  const scrollTopInner = document.createElement("div");
  scrollTopInner.className = "bracket-scroll-top-inner";
  scrollTop.appendChild(scrollTopInner);
  container.appendChild(scrollTop);

  // Desktop tree
  const treeEl = document.createElement("div");
  treeEl.className = "bracket-tree";
  const wrapper = renderTree(model, poolTeams);
  treeEl.appendChild(wrapper);
  container.appendChild(treeEl);

  requestAnimationFrame(() => {
    scrollTopInner.style.width = wrapper.scrollWidth + "px";
    let syncing = false;
    scrollTop.addEventListener("scroll", () => {
      if (syncing) return; syncing = true;
      treeEl.scrollLeft = scrollTop.scrollLeft; syncing = false;
    });
    treeEl.addEventListener("scroll", () => {
      if (syncing) return; syncing = true;
      scrollTop.scrollLeft = treeEl.scrollLeft; syncing = false;
    });
    drawConnectors(wrapper);
  });

  const ts = document.createElement("p");
  ts.className = "bracket-timestamp";
  ts.textContent = anyPlayed
    ? `Updated ${new Date().toLocaleTimeString()}`
    : `Knockout stage starts 28 June · Updated ${new Date().toLocaleTimeString()}`;
  container.appendChild(ts);
}

// ── Mobile list view ──────────────────────────────────────────────────────────
function renderList(container, model, poolTeams) {
  const order = model.order;
  const numsByRound = {
    r32:  [...(order.left?.r32 || []), ...(order.right?.r32 || [])],
    r16:  [...(order.left?.r16 || []), ...(order.right?.r16 || [])],
    qf:   [...(order.left?.qf  || []), ...(order.right?.qf  || [])],
    sf:   [...(order.left?.sf  || []), ...(order.right?.sf  || [])],
    third: [103],
    final: [104],
  };

  ROUND_ORDER.forEach(key => {
    const matches = (numsByRound[key] || [])
      .map(n => model.byNumber.get(n))
      .filter(Boolean);
    if (!matches.length) return;

    const isLiveRound = matches.some(m => LIVE_STATES.has(m.status));
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

    // Bound matches render the rich ESPN card; unplayed slots use the bracket slot.
    matches.forEach(m => {
      if (m.event) {
        const s = m.status;
        container.appendChild(buildCard(m.event, poolTeams, LIVE_STATES.has(s), FINAL_STATES.has(s)));
      } else {
        container.appendChild(buildBracketSlot(m, poolTeams));
      }
    });
  });
}

// ── Desktop tree view ─────────────────────────────────────────────────────────
function renderTree(model, poolTeams) {
  const wrapper = document.createElement("div");
  wrapper.className = "bracket-wrapper";
  const get = n => model.byNumber.get(n);

  // Left half: R32 → R16 → QF → SF
  const leftEl = document.createElement("div");
  leftEl.className = "bracket-half bracket-half-left";
  ["r32", "r16", "qf", "sf"].forEach(key => {
    const nums = model.order.left?.[key] || [];
    if (!nums.length) return;
    leftEl.appendChild(buildBracketColumn(key, nums.map(get), poolTeams));
  });
  wrapper.appendChild(leftEl);

  // Center: Final + Third place
  const finalM = get(104);
  const thirdM = get(103);
  if (finalM || thirdM) {
    const centerEl = document.createElement("div");
    centerEl.className = "bracket-center";
    if (finalM) {
      const lbl = document.createElement("div");
      lbl.className = "bracket-center-label";
      lbl.textContent = "FINAL";
      centerEl.appendChild(lbl);
      centerEl.appendChild(buildBracketSlot(finalM, poolTeams));
    }
    if (thirdM) {
      const lbl = document.createElement("div");
      lbl.className = "bracket-center-label bracket-center-label-third";
      lbl.textContent = "3RD PLACE";
      centerEl.appendChild(lbl);
      centerEl.appendChild(buildBracketSlot(thirdM, poolTeams));
    }
    wrapper.appendChild(centerEl);
  }

  // Right half: SF → QF → R16 → R32
  const rightEl = document.createElement("div");
  rightEl.className = "bracket-half bracket-half-right";
  ["sf", "qf", "r16", "r32"].forEach(key => {
    const nums = model.order.right?.[key] || [];
    if (!nums.length) return;
    rightEl.appendChild(buildBracketColumn(key, nums.map(get), poolTeams));
  });
  wrapper.appendChild(rightEl);

  return wrapper;
}

// ── Column builder ────────────────────────────────────────────────────────────
function buildBracketColumn(key, matches, poolTeams) {
  const col = document.createElement("div");
  col.className = "bracket-col";
  col.dataset.round = key;

  const hdr = document.createElement("div");
  hdr.className = "bracket-col-header";
  hdr.textContent = ROUND_LABELS[key] || key.toUpperCase();
  col.appendChild(hdr);

  const slots = document.createElement("div");
  slots.className = "bracket-slots";
  for (let i = 0; i < matches.length; i += 2) {
    const pair = document.createElement("div");
    pair.className = "bracket-pair";
    if (matches[i])     pair.appendChild(buildBracketSlot(matches[i], poolTeams));
    if (matches[i + 1]) pair.appendChild(buildBracketSlot(matches[i + 1], poolTeams));
    slots.appendChild(pair);
  }
  col.appendChild(slots);
  return col;
}

// ── Slot builder ──────────────────────────────────────────────────────────────
function buildBracketSlot(match, poolTeams) {
  const isLive  = LIVE_STATES.has(match.status);
  const isFinal = FINAL_STATES.has(match.status);

  const slot = document.createElement("div");
  slot.className = "bracket-slot";

  const card = document.createElement("div");
  card.className = "bracket-match"
    + (isFinal ? " bracket-match--played" : "")
    + (isLive ? " bracket-match--live" : "");

  const statusEl = document.createElement("div");
  statusEl.className = "bracket-match-status";
  const matchLabel = `M${match.matchNumber} · `;
  if (isLive) {
    const clock = match.event?.status?.displayClock;
    statusEl.textContent = clock ? `${matchLabel}LIVE · ${clock}` : `${matchLabel}LIVE`;
    statusEl.style.color = "var(--green)";
  } else if (isFinal) {
    statusEl.textContent = matchLabel + bracketFinalLabel(match.event);
  } else {
    statusEl.textContent = matchLabel + bracketKickoff(match.date);
  }
  card.appendChild(statusEl);

  const divider = document.createElement("div");
  divider.className = "bracket-divider";
  card.appendChild(divider);

  // A slot's own played state dims the loser; live/final shows scores.
  card.appendChild(buildBracketTeamRow(match.home, isFinal && !match.home.isWinner, isFinal || isLive));
  ownerTagsFor(match.home, poolTeams).forEach(t => card.appendChild(t));
  card.appendChild(buildBracketTeamRow(match.away, isFinal && !match.away.isWinner, isFinal || isLive));
  ownerTagsFor(match.away, poolTeams).forEach(t => card.appendChild(t));

  card.style.cursor = "pointer";
  card.addEventListener("click", () => showMatchModal(match, poolTeams));

  slot.appendChild(card);
  return slot;
}

function buildBracketTeamRow(slot, dimmed, showScore) {
  const row = document.createElement("div");
  row.className = "bracket-team-row";
  if (dimmed) row.style.opacity = "0.35";

  const logoUrl = slot.competitor?.team?.logo || slot.competitor?.team?.logos?.[0]?.href;
  if (logoUrl) {
    const flag = document.createElement("img");
    flag.className = "bracket-flag";
    flag.src = logoUrl; flag.alt = ""; flag.loading = "lazy";
    row.appendChild(flag);
  } else {
    const ph = document.createElement("span");
    ph.className = "bracket-flag-ph";
    row.appendChild(ph);
  }

  const name = document.createElement("span");
  name.className = "bracket-team-name";
  // Real team → abbreviation if available; placeholder → its label text.
  name.textContent = slot.competitor?.team?.abbreviation || slot.label;
  if (!slot.resolved) name.style.opacity = "0.6";
  row.appendChild(name);

  if (showScore) {
    const score = document.createElement("span");
    score.className = "bracket-score";
    score.textContent = slot.score ?? "–";
    row.appendChild(score);
  }
  return row;
}

// Owner tags live in the render layer (needs Firebase-loaded poolTeams + teamMatches).
function ownerTagsFor(slot, poolTeams) {
  if (!slot.teamName) return [];
  return poolTeams
    .filter(pt => teamMatches(slot.teamName, pt.team.name))
    .map(pt => buildBracketOwnerTag(pt));
}

function buildBracketOwnerTag(pt) {
  const tag = document.createElement("span");
  tag.className = `bracket-owner-tag ${pt.tierKey}`;
  tag.textContent = pt.participantName;
  return tag;
}

// ── SVG bracket connector lines ────────────────────────────────────────────────
function drawConnectors(wrapper) {
  const halfLeft  = wrapper.querySelector(".bracket-half-left");
  const halfRight = wrapper.querySelector(".bracket-half-right");

  if (halfLeft) {
    const cols = [...halfLeft.querySelectorAll(".bracket-col")];
    // All columns except the last (SF) get right-side connectors
    cols.slice(0, -1).forEach(col => drawColConnectors(col, "right"));
  }
  if (halfRight) {
    const cols = [...halfRight.querySelectorAll(".bracket-col")];
    // All columns except the first (SF) get left-side connectors
    cols.slice(1).forEach(col => drawColConnectors(col, "left"));
  }
}

function drawColConnectors(col, side) {
  const colRect = col.getBoundingClientRect();
  if (!colRect.width) return;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:1;";
  col.style.position = "relative";

  const pairs = [...col.querySelectorAll(".bracket-pair")];
  pairs.forEach(pair => {
    const slots = [...pair.querySelectorAll(".bracket-slot")];
    if (slots.length < 2) return;

    const r1 = slots[0].getBoundingClientRect();
    const r2 = slots[1].getBoundingClientRect();
    const y1 = r1.top - colRect.top + r1.height / 2;
    const y2 = r2.top - colRect.top + r2.height / 2;

    const played1 = slots[0].querySelector(".bracket-match--played") !== null;
    const played2 = slots[1].querySelector(".bracket-match--played") !== null;
    const color = (played1 && played2)
      ? "rgba(247,197,32,0.55)"
      : "rgba(255,255,255,0.13)";

    const W    = colRect.width;
    const pad  = 10; // matches .bracket-slots padding

    // C-bracket shape: two horizontal arms + vertical bar at the column edge
    let d;
    if (side === "right") {
      // Arms from card right-edge → column right-edge, then vertical bar
      d = `M ${W - pad} ${y1} H ${W + 8} V ${y2} H ${W - pad}`;
    } else {
      // Arms from card left-edge → column left-edge, then vertical bar
      d = `M ${pad} ${y1} H ${-8} V ${y2} H ${pad}`;
    }

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  });

  col.appendChild(svg);
}

// ── Match detail modal ────────────────────────────────────────────────────────
function showMatchModal(match, poolTeams) {
  document.getElementById("bracket-modal")?.remove();

  const isLive  = LIVE_STATES.has(match.status);
  const isFinal = FINAL_STATES.has(match.status);
  const venue   = match.event?.competitions?.[0]?.venue;

  const overlay = document.createElement("div");
  overlay.id = "bracket-modal";
  overlay.className = "bm-overlay";
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  const panel = document.createElement("div");
  panel.className = "bm-panel";
  panel.addEventListener("click", e => e.stopPropagation());

  const closeBtn = document.createElement("button");
  closeBtn.className = "bm-close";
  closeBtn.innerHTML = "&#x2715;";
  closeBtn.addEventListener("click", () => overlay.remove());
  panel.appendChild(closeBtn);

  const roundLbl = document.createElement("div");
  roundLbl.className = "bm-round";
  roundLbl.textContent = (ROUND_LABELS[match.round] || match.round.toUpperCase())
    + ` · M${match.matchNumber}`;
  panel.appendChild(roundLbl);

  const statusEl = document.createElement("div");
  statusEl.className = "bm-status" + (isLive ? " bm-status--live" : "");
  if (isLive) {
    const clock = match.event?.status?.displayClock;
    statusEl.textContent = clock ? `LIVE · ${clock}` : "LIVE";
  } else if (isFinal) {
    statusEl.textContent = bracketFinalLabel(match.event);
  } else {
    const d = new Date(match.date);
    statusEl.textContent = d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })
      + " · " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  panel.appendChild(statusEl);

  const teamsEl = document.createElement("div");
  teamsEl.className = "bm-teams";
  [match.home, match.away].forEach((slot, idx) => {
    const teamEl = document.createElement("div");
    teamEl.className = "bm-team" + (isFinal && !slot.isWinner ? " bm-team--dim" : "");

    const logoUrl = slot.competitor?.team?.logo || slot.competitor?.team?.logos?.[0]?.href;
    if (logoUrl) {
      const img = document.createElement("img");
      img.className = "bm-flag";
      img.src = logoUrl; img.alt = "";
      teamEl.appendChild(img);
    }

    const nameEl = document.createElement("div");
    nameEl.className = "bm-team-name";
    nameEl.textContent = slot.competitor?.team?.displayName || slot.label;
    teamEl.appendChild(nameEl);

    if (isFinal || isLive) {
      const scoreEl = document.createElement("div");
      scoreEl.className = "bm-score";
      scoreEl.textContent = slot.score ?? "–";
      teamEl.appendChild(scoreEl);
    }

    if (slot.teamName) {
      const owners = poolTeams.filter(pt => teamMatches(slot.teamName, pt.team.name));
      if (owners.length) {
        const ownersEl = document.createElement("div");
        ownersEl.className = "bm-owners";
        owners.forEach(pt => {
          const tag = document.createElement("span");
          tag.className = `bm-owner-tag ${pt.tierKey}`;
          tag.textContent = pt.participantName;
          ownersEl.appendChild(tag);
        });
        teamEl.appendChild(ownersEl);
      }
    }

    teamsEl.appendChild(teamEl);
    if (idx === 0) {
      const vs = document.createElement("div");
      vs.className = "bm-vs";
      vs.textContent = "vs";
      teamsEl.appendChild(vs);
    }
  });
  panel.appendChild(teamsEl);

  if (venue?.fullName) {
    const venueEl = document.createElement("div");
    venueEl.className = "bm-venue";
    const city = venue.address?.city || "";
    venueEl.textContent = venue.fullName + (city ? `, ${city}` : "");
    panel.appendChild(venueEl);
  }

  const onKey = e => { if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  gsap.from(panel, { duration: 0.25, opacity: 0, y: 20, ease: "power3.out" });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
