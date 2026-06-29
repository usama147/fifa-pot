// js/bracket.js
import { db, teamMatches } from "./config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { ESPN_BASE, LIVE_STATES, FINAL_STATES, buildCard } from "./matches.js";

// ── Round config ───────────────────────────────────────────────────────────────
const ROUND_ORDER  = ["r32", "r16", "qf", "sf", "third", "final", "other"];
const ROUND_LABELS = {
  r32:   "ROUND OF 32",
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
    const t = (note.headline || note.type?.text || "").toLowerCase().trim();
    if (!t) continue;
    if (/group/i.test(t))            return null;
    if (/round of 32/i.test(t))      return "r32";
    if (/round of 16/i.test(t))      return "r16";
    if (/quarter.?final/i.test(t))   return "qf";
    if (/semi.?final/i.test(t))      return "sf";
    if (/third.?place/i.test(t))     return "third";
    if (/\bfinal\b/i.test(t))        return "final";
  }
  const d    = new Date(event.date || "");
  const name = event.name || "";
  if (d < new Date("2026-06-28T00:00:00Z")) return null;
  if (/round of 32.+winner|winner.+round of 32/i.test(name)) return "r16";
  if (/round of 16.+winner|winner.+round of 16/i.test(name)) return "qf";
  if (/quarter.?final.+winner|winner.+quarter.?final/i.test(name)) return "sf";
  if (/semi.?final.+winner|winner.+semi.?final/i.test(name)) return "final";
  if (d <= new Date("2026-07-05T23:59:59Z")) return "r32";
  if (d <= new Date("2026-07-10T23:59:59Z")) return "r16";
  if (d <= new Date("2026-07-13T23:59:59Z")) return "qf";
  if (d <= new Date("2026-07-16T23:59:59Z")) return "sf";
  if (d <= new Date("2026-07-19T23:59:59Z")) return "third";
  return "final";
}

// ── Hardcoded bracket slot order (FIFA WC2026 published bracket) ─────────────
// ESPN API has no bracket-position field, and ESPN event IDs don't match FIFA's
// bracket order — so we hardcode the visual top-to-bottom order per half.
// Each entry = name fragments that identify the teams in one R32 match.
const R32_L = [
  ["germany","paraguay"],                                         // M74  slot 0
  ["france","sweden"],                                            // M77  slot 1
  ["south africa","canada"],                                      // M73  slot 2
  ["netherlands","morocco"],                                      // M75  slot 3
  ["portugal","croatia"],                                         // M83  slot 4
  ["spain","austria"],                                            // M84  slot 5
  ["united states","bosnia","herze"],                             // M81  slot 6
  ["belgium","senegal"],                                          // M82  slot 7
];
const R32_R = [
  ["brazil","japan"],                                             // M76  slot 0
  ["ivory coast","côte","cote","norway"],                         // M78  slot 1
  ["mexico","ecuador"],                                           // M79  slot 2
  ["england","congo"],                                            // M80  slot 3
  ["argentina","cape verde"],                                     // M86  slot 4
  ["australia","egypt"],                                          // M88  slot 5
  ["switzerland","algeria"],                                      // M85  slot 6
  ["colombia","ghana"],                                           // M87  slot 7
];

// FIFA match numbers per bracket half (top-to-bottom visual order)
// Source: thestatsapi.com/world-cup/data
const MATCH_NUMS_L = {
  r32: [74, 77, 73, 75, 83, 84, 81, 82],
  r16: [89, 90, 93, 94],
  qf:  [97, 98],
  sf:  [101],
};
const MATCH_NUMS_R = {
  r32: [76, 78, 79, 80, 86, 88, 85, 87],
  r16: [91, 92, 95, 96],
  qf:  [99, 100],
  sf:  [102],
};
const MATCH_NUMS_CENTER = { final: 104, third: 103 };

// Match a team display-name against a slot's name fragments
function nameHitsSlot(displayName, slotFrags) {
  const n = displayName.toLowerCase();
  return slotFrags.some(f => n.includes(f));
}

// Recursively resolve event name references to actual team names.
// Handles the full chain: "Quarterfinal N" → R16 event → "Round of 32 M" → R32 event → teams.
// ESPN uses 1-indexed numbering by event ID order within each round.
const REF_PATTERNS = [
  { re: /round of 32 (\d+)/gi,  key: "r32" },
  { re: /round of 16 (\d+)/gi,  key: "r16" },
  { re: /quarterfinal (\d+)/gi, key: "qf"  },
  { re: /semifinal (\d+)/gi,    key: "sf"  },
];

function resolveEventTeams(evName, roundsSorted, visited) {
  if (!visited) visited = new Set();
  const teams = [];

  for (const { re, key } of REF_PATTERNS) {
    const sorted = roundsSorted[key];
    if (!sorted?.length) continue;
    // Reset regex lastIndex for each pass
    const regex = new RegExp(re.source, re.flags);
    for (const m of evName.matchAll(regex)) {
      const n = parseInt(m[1]) - 1; // 1-indexed → 0-indexed
      if (n < 0 || n >= sorted.length) continue;
      const refEv = sorted[n];
      if (visited.has(refEv.id)) continue; // prevent cycles
      visited.add(refEv.id);

      // Get direct team names (skip placeholder names like "Round of 32 3 Winner")
      const comps = refEv.competitions?.[0]?.competitors || [];
      const direct = comps
        .map(c => c.team?.displayName || "")
        .filter(n => n && !/winner|loser|round of|quarterfinal|semifinal/i.test(n));

      if (direct.length) {
        teams.push(...direct);
      } else {
        // Recurse: resolve this event's name to get teams from earlier rounds
        teams.push(...resolveEventTeams(
          (refEv.name || "").toLowerCase(), roundsSorted, visited
        ));
      }
    }
  }
  return teams;
}

// Check if an event (or its resolved refs) hits a slot list. Returns true/false.
function eventHitsSide(ev, slotList, roundsSorted) {
  const comps  = ev.competitions?.[0]?.competitors || [];
  const evName = (ev.name || "").toLowerCase();
  // Direct team name match
  if (comps.some(c => slotList.some(frags => nameHitsSlot(c.team?.displayName || "", frags)))) return true;
  if (slotList.some(frags => frags.some(f => evName.includes(f)))) return true;
  // Resolve round references recursively (QF → R16 → R32 → teams)
  const refTeams = resolveEventTeams(evName, roundsSorted);
  if (refTeams.some(t => slotList.some(frags => nameHitsSlot(t, frags)))) return true;
  return false;
}

// Return R32 slot index (0-7) for an event in a given half, or -1 if unknown
function r32SlotOf(ev, slotList) {
  const comps  = ev.competitions?.[0]?.competitors || [];
  const evName = (ev.name || "").toLowerCase();
  for (let i = 0; i < slotList.length; i++) {
    const frags = slotList[i];
    const hit   = comps.some(c => nameHitsSlot(c.team?.displayName || "", frags))
                || frags.some(f => evName.includes(f));
    if (hit) return i;
  }
  return -1;
}

// For R16/QF/SF: trace any known team back to their R32 slot → derive position.
// Recursively resolves round refs for unresolved events (QF → R16 → R32 → teams).
function traceSlot(ev, slotList, depth, roundsSorted) {
  const comps  = ev.competitions?.[0]?.competitors || [];
  const evName = (ev.name || "").toLowerCase();
  // Direct team name match
  for (const c of comps) {
    const name = c.team?.displayName || "";
    if (!name) continue;
    for (let i = 0; i < slotList.length; i++) {
      if (nameHitsSlot(name, slotList[i])) return Math.floor(i / depth);
    }
  }
  // Event name team fragment match
  for (let i = 0; i < slotList.length; i++) {
    if (slotList[i].some(f => evName.includes(f))) return Math.floor(i / depth);
  }
  // Resolve round references recursively to actual team names
  const refTeams = resolveEventTeams(evName, roundsSorted);
  for (const t of refTeams) {
    for (let i = 0; i < slotList.length; i++) {
      if (nameHitsSlot(t, slotList[i])) return Math.floor(i / depth);
    }
  }
  return -1;
}

// Sort events into correct bracket positions within a half.
// Uses slot-filling: place events with known positions first, then fill gaps.
function splitAndOrder(events, slotList, round, roundsSorted) {
  const depth = { r32: 1, r16: 2, qf: 4, sf: 8 }[round] ?? 1;
  const expectedSlots = Math.ceil(8 / depth); // 8, 4, 2, 1

  const placed   = new Array(expectedSlots).fill(null);
  const unplaced = [];

  events.forEach(ev => {
    const idx = round === "r32" ? r32SlotOf(ev, slotList)
                                : traceSlot(ev, slotList, depth, roundsSorted);
    if (idx >= 0 && idx < expectedSlots && placed[idx] === null) {
      placed[idx] = ev;
    } else {
      unplaced.push(ev);
    }
  });

  // Fill empty slots with unplaced events (sorted by ESPN ID for consistency)
  unplaced.sort((a, b) => parseInt(a.id) - parseInt(b.id));
  let ui = 0;
  const result = [];
  for (let i = 0; i < expectedSlots; i++) {
    if (placed[i])              result.push(placed[i]);
    else if (ui < unplaced.length) result.push(unplaced[ui++]);
  }
  // Append any remaining
  while (ui < unplaced.length) result.push(unplaced[ui++]);

  return result;
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
  const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, "");
  const res  = await fetch(`${ESPN_BASE}?dates=${fmt(new Date("2026-06-28"))}-${fmt(new Date("2026-07-21"))}`);
  const data = await res.json();
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

  // Mobile list view
  const listEl = document.createElement("div");
  listEl.className = "bracket-list";
  renderList(listEl, rounds, poolTeams);
  container.appendChild(listEl);

  // Top scrollbar rail (desktop only via CSS)
  const scrollTop      = document.createElement("div");
  scrollTop.className  = "bracket-scroll-top";
  const scrollTopInner = document.createElement("div");
  scrollTopInner.className = "bracket-scroll-top-inner";
  scrollTop.appendChild(scrollTopInner);
  container.appendChild(scrollTop);

  // Desktop tree
  const treeEl = document.createElement("div");
  treeEl.className = "bracket-tree";
  const wrapper = renderTree(rounds, poolTeams);
  treeEl.appendChild(wrapper);
  container.appendChild(treeEl);

  // Sync scroll + draw connectors after layout
  requestAnimationFrame(() => {
    scrollTopInner.style.width = wrapper.scrollWidth + "px";
    let syncing = false;
    scrollTop.addEventListener("scroll", () => {
      if (syncing) return; syncing = true;
      treeEl.scrollLeft = scrollTop.scrollLeft;
      syncing = false;
    });
    treeEl.addEventListener("scroll", () => {
      if (syncing) return; syncing = true;
      scrollTop.scrollLeft = treeEl.scrollLeft;
      syncing = false;
    });
    drawConnectors(wrapper);
  });

  const ts = document.createElement("p");
  ts.className = "bracket-timestamp";
  ts.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  container.appendChild(ts);
}

// ── Mobile list view ──────────────────────────────────────────────────────────
function renderList(container, rounds, poolTeams) {
  ROUND_ORDER.forEach(key => {
    const events = rounds[key];
    if (!events?.length) return;
    const isLiveRound = events.some(ev => LIVE_STATES.has(ev.status?.type?.name || ""));
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
    const live     = events.filter(ev => LIVE_STATES.has(ev.status?.type?.name || ""));
    const done     = events.filter(ev => FINAL_STATES.has(ev.status?.type?.name || "")).sort((a, b) => new Date(b.date) - new Date(a.date));
    const upcoming = events.filter(ev => !LIVE_STATES.has(ev.status?.type?.name || "") && !FINAL_STATES.has(ev.status?.type?.name || "")).sort((a, b) => new Date(a.date) - new Date(b.date));
    [...live, ...done, ...upcoming].forEach(ev => {
      const s = ev.status?.type?.name || "STATUS_SCHEDULED";
      container.appendChild(buildCard(ev, poolTeams, LIVE_STATES.has(s), FINAL_STATES.has(s)));
    });
  });
}

// ── Desktop tree view ─────────────────────────────────────────────────────────
function renderTree(rounds, poolTeams) {
  const left  = {};
  const right = {};
  const center = {};

  // All rounds sorted by ESPN ID — used to recursively resolve event name refs.
  // Chain: "Quarterfinal N" → R16 event → "Round of 32 M" → R32 event → teams.
  const roundsSorted = {};
  ["r32", "r16", "qf", "sf"].forEach(key => {
    if (rounds[key]?.length) {
      roundsSorted[key] = [...rounds[key]].sort((a, b) => parseInt(a.id) - parseInt(b.id));
    }
  });

  ["r32", "r16", "qf", "sf"].forEach(key => {
    if (!rounds[key]?.length) return;
    const allEvents = rounds[key];

    // Separate events into left/right by matching team names to R32 slot pools.
    // For unresolved events, recursively resolves round refs to actual team names.
    const leftEvs  = [];
    const rightEvs = [];
    const neither  = [];
    allEvents.forEach(ev => {
      const hitsL = eventHitsSide(ev, R32_L, roundsSorted);
      const hitsR = eventHitsSide(ev, R32_R, roundsSorted);
      if (hitsL && !hitsR)       leftEvs.push(ev);
      else if (hitsR && !hitsL) rightEvs.push(ev);
      else                       neither.push(ev);
    });
    // Balance unknowns
    neither.forEach(ev => {
      (leftEvs.length <= rightEvs.length ? leftEvs : rightEvs).push(ev);
    });

    left[key]  = splitAndOrder(leftEvs,  R32_L, key, roundsSorted);
    right[key] = splitAndOrder(rightEvs, R32_R, key, roundsSorted);
  });

  if (rounds.final) center.final = rounds.final;
  if (rounds.third) center.third = rounds.third;

  // DOM
  const wrapper = document.createElement("div");
  wrapper.className = "bracket-wrapper";

  // Left half: R32 → R16 → QF → SF
  const leftEl = document.createElement("div");
  leftEl.className = "bracket-half bracket-half-left";
  ["r32", "r16", "qf", "sf"].forEach(key => {
    if (!left[key]?.length) return;
    leftEl.appendChild(buildBracketColumn(key, left[key], poolTeams, MATCH_NUMS_L[key]));
  });
  wrapper.appendChild(leftEl);

  // Center
  if (center.final?.length || center.third?.length) {
    const centerEl = document.createElement("div");
    centerEl.className = "bracket-center";
    if (center.final?.length) {
      const lbl = document.createElement("div");
      lbl.className = "bracket-center-label";
      lbl.textContent = "FINAL";
      centerEl.appendChild(lbl);
      center.final.forEach(ev => centerEl.appendChild(buildBracketSlot(ev, poolTeams, MATCH_NUMS_CENTER.final)));
    }
    if (center.third?.length) {
      const lbl = document.createElement("div");
      lbl.className = "bracket-center-label bracket-center-label-third";
      lbl.textContent = "3RD PLACE";
      centerEl.appendChild(lbl);
      center.third.forEach(ev => centerEl.appendChild(buildBracketSlot(ev, poolTeams, MATCH_NUMS_CENTER.third)));
    }
    wrapper.appendChild(centerEl);
  }

  // Right half: SF → QF → R16 → R32
  const rightEl = document.createElement("div");
  rightEl.className = "bracket-half bracket-half-right";
  ["sf", "qf", "r16", "r32"].forEach(key => {
    if (!right[key]?.length) return;
    rightEl.appendChild(buildBracketColumn(key, right[key], poolTeams, MATCH_NUMS_R[key]));
  });
  wrapper.appendChild(rightEl);

  return wrapper;
}

// ── Column builder ────────────────────────────────────────────────────────────
function buildBracketColumn(key, events, poolTeams, matchNums) {
  const col = document.createElement("div");
  col.className = "bracket-col";
  col.dataset.round = key;

  const hdr = document.createElement("div");
  hdr.className = "bracket-col-header";
  hdr.textContent = ROUND_LABELS[key] || key.toUpperCase();
  col.appendChild(hdr);

  const slots = document.createElement("div");
  slots.className = "bracket-slots";

  // Pair slots for connector lines (slots 0+1, 2+3, …)
  for (let i = 0; i < events.length; i += 2) {
    const pair = document.createElement("div");
    pair.className = "bracket-pair";
    pair.appendChild(buildBracketSlot(events[i], poolTeams, matchNums?.[i]));
    if (events[i + 1]) pair.appendChild(buildBracketSlot(events[i + 1], poolTeams, matchNums?.[i + 1]));
    slots.appendChild(pair);
  }

  col.appendChild(slots);
  return col;
}

// ── Slot builder ──────────────────────────────────────────────────────────────
function buildBracketSlot(event, poolTeams, matchNum) {
  const comp  = event.competitions?.[0];
  const comps = comp?.competitors || [];
  const home  = comps.find(c => c.homeAway === "home");
  const away  = comps.find(c => c.homeAway === "away");
  const s     = event.status?.type?.name || "STATUS_SCHEDULED";
  const isLive  = LIVE_STATES.has(s);
  const isFinal = FINAL_STATES.has(s);

  const homeScore = parseInt(home?.score ?? 0, 10);
  const awayScore = parseInt(away?.score ?? 0, 10);
  const homeWon   = isFinal && homeScore > awayScore;
  const awayWon   = isFinal && awayScore > homeScore;

  const homePool = poolTeams.filter(pt => teamMatches(home?.team?.displayName || "", pt.team.name));
  const awayPool = poolTeams.filter(pt => teamMatches(away?.team?.displayName || "", pt.team.name));

  const slot = document.createElement("div");
  slot.className = "bracket-slot";

  const card = document.createElement("div");
  card.className = "bracket-match" + (isFinal ? " bracket-match--played" : "") + (isLive ? " bracket-match--live" : "");

  // Status line with match number
  const statusEl = document.createElement("div");
  statusEl.className = "bracket-match-status";
  const matchLabel = matchNum ? `M${matchNum} · ` : "";
  if (isLive) {
    statusEl.textContent = event.status?.displayClock ? `${matchLabel}LIVE · ${event.status.displayClock}` : `${matchLabel}LIVE`;
    statusEl.style.color = "var(--green)";
  } else if (isFinal) {
    statusEl.textContent = matchLabel + bracketFinalLabel(event);
  } else {
    statusEl.textContent = matchLabel + bracketKickoff(event.date);
  }
  card.appendChild(statusEl);

  const divider = document.createElement("div");
  divider.className = "bracket-divider";
  card.appendChild(divider);

  card.appendChild(buildBracketTeamRow(home, isFinal && !homeWon, isFinal || isLive));
  homePool.forEach(pt => card.appendChild(buildBracketOwnerTag(pt)));
  card.appendChild(buildBracketTeamRow(away, isFinal && !awayWon, isFinal || isLive));
  awayPool.forEach(pt => card.appendChild(buildBracketOwnerTag(pt)));

  // Click → detail modal
  card.style.cursor = "pointer";
  card.addEventListener("click", () => showMatchModal(event, poolTeams));

  slot.appendChild(card);
  return slot;
}

function buildBracketTeamRow(competitor, dimmed, showScore) {
  const row = document.createElement("div");
  row.className = "bracket-team-row";
  if (dimmed) row.style.opacity = "0.35";

  // Flag
  const logoUrl = competitor?.team?.logo || competitor?.team?.logos?.[0]?.href;
  if (logoUrl) {
    const flag = document.createElement("img");
    flag.className = "bracket-flag";
    flag.src = logoUrl;
    flag.alt = "";
    flag.loading = "lazy";
    row.appendChild(flag);
  } else {
    const ph = document.createElement("span");
    ph.className = "bracket-flag-ph";
    row.appendChild(ph);
  }

  const name = document.createElement("span");
  name.className = "bracket-team-name";
  name.textContent = competitor?.team?.abbreviation || competitor?.team?.displayName || "TBC";
  row.appendChild(name);

  if (showScore) {
    const score = document.createElement("span");
    score.className = "bracket-score";
    score.textContent = competitor?.score ?? "–";
    row.appendChild(score);
  }
  return row;
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
function showMatchModal(event, poolTeams) {
  // Remove any existing modal
  document.getElementById("bracket-modal")?.remove();

  const comp  = event.competitions?.[0];
  const comps = comp?.competitors || [];
  const home  = comps.find(c => c.homeAway === "home");
  const away  = comps.find(c => c.homeAway === "away");
  const s     = event.status?.type?.name || "STATUS_SCHEDULED";
  const isLive  = LIVE_STATES.has(s);
  const isFinal = FINAL_STATES.has(s);
  const venue   = comp?.venue;

  const overlay = document.createElement("div");
  overlay.id = "bracket-modal";
  overlay.className = "bm-overlay";
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  const panel = document.createElement("div");
  panel.className = "bm-panel";
  panel.addEventListener("click", e => e.stopPropagation());

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.className = "bm-close";
  closeBtn.innerHTML = "&#x2715;";
  closeBtn.addEventListener("click", () => overlay.remove());
  panel.appendChild(closeBtn);

  // Round label
  const roundKey = detectRound(event) || "other";
  const roundLbl = document.createElement("div");
  roundLbl.className = "bm-round";
  roundLbl.textContent = ROUND_LABELS[roundKey] || roundKey.toUpperCase();
  panel.appendChild(roundLbl);

  // Status
  const statusEl = document.createElement("div");
  statusEl.className = "bm-status" + (isLive ? " bm-status--live" : "");
  if (isLive) {
    statusEl.textContent = event.status?.displayClock ? `LIVE · ${event.status.displayClock}` : "LIVE";
  } else if (isFinal) {
    statusEl.textContent = bracketFinalLabel(event);
  } else {
    const d = new Date(event.date);
    statusEl.textContent = d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })
      + " · " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  panel.appendChild(statusEl);

  // Teams
  const teamsEl = document.createElement("div");
  teamsEl.className = "bm-teams";

  [home, away].forEach((c, idx) => {
    const teamEl = document.createElement("div");
    teamEl.className = "bm-team" + (isFinal && c && (isFinal && (idx === 0 ? parseInt(home?.score) < parseInt(away?.score) : parseInt(away?.score) < parseInt(home?.score))) ? " bm-team--dim" : "");

    const logoUrl = c?.team?.logo || c?.team?.logos?.[0]?.href;
    if (logoUrl) {
      const img = document.createElement("img");
      img.className = "bm-flag";
      img.src = logoUrl;
      img.alt = "";
      teamEl.appendChild(img);
    }

    const nameEl = document.createElement("div");
    nameEl.className = "bm-team-name";
    nameEl.textContent = c?.team?.displayName || "TBC";
    teamEl.appendChild(nameEl);

    if (isFinal || isLive) {
      const scoreEl = document.createElement("div");
      scoreEl.className = "bm-score";
      scoreEl.textContent = c?.score ?? "–";
      teamEl.appendChild(scoreEl);
    }

    // Pool owners for this team
    const owners = poolTeams.filter(pt => teamMatches(c?.team?.displayName || "", pt.team.name));
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

    teamsEl.appendChild(teamEl);

    // VS divider
    if (idx === 0) {
      const vs = document.createElement("div");
      vs.className = "bm-vs";
      vs.textContent = "vs";
      teamsEl.appendChild(vs);
    }
  });

  panel.appendChild(teamsEl);

  // Venue
  if (venue?.fullName) {
    const venueEl = document.createElement("div");
    venueEl.className = "bm-venue";
    const city = venue.address?.city || "";
    venueEl.textContent = venue.fullName + (city ? `, ${city}` : "");
    panel.appendChild(venueEl);
  }

  // Keyboard close
  const onKey = e => { if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // Entrance animation
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
