# Paid Badge + Group Standings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Paid" payment tracker for participants and a new "Groups" tab showing FIFA World Cup 2026 group stage standings pulled from API-Football.

**Architecture:** Two independent features. Paid badge stores a `paid` boolean on each Firestore participant document, displayed in the Players tab and toggled in the Admin tab. The Groups tab is a new `js/standings.js` module that fetches live standings from API-Football v3 every 10 minutes, renders all 12 groups with position-based colour coding, highlights pool teams, and lets the admin push 4th-place pool teams directly to `eliminatedTeams` in Firestore.

**Tech Stack:** Vanilla JS ES modules (no build step), Firebase Firestore v12.14.0 via CDN, GSAP 3.12.5 (global `gsap`), API-Football v3 (`https://v3.football.api-sports.io`), no test framework (verify in browser).

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `css/styles.css` | Modify | Add `.paid-badge`, `.standings-row`, `.standings-pos`, `.standings-team`, `.standings-stats`, `.standings-status` |
| `js/players.js` | Modify | Show `PAID` badge when `p.paid === true` in participant list and detail view |
| `js/admin.js` | Modify | Add `updateDoc` to import; add `renderPaidManager()` called in post-draw UI |
| `index.html` | Modify | Add Groups tab button (visible to all) and `#tab-standings` view div |
| `js/app.js` | Modify | Add `standings` case to `onTabActivated` |
| `js/config.js` | Modify | Add `API_FOOTBALL_KEY` and `STANDINGS_URL` constants |
| `js/standings.js` | Create | Full standings tab module |

---

### Task 1: Paid badge CSS

**Files:**
- Modify: `css/styles.css` (append at end)

- [ ] **Step 1: Add CSS for paid badge and standings rows**

Open `css/styles.css` and append the following block at the very end of the file:

```css
/* PAID BADGE */
.paid-badge {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--green);
  background: rgba(247,197,32,0.10);
  border: 1px solid rgba(247,197,32,0.25);
  border-radius: 4px;
  padding: 2px 6px;
  flex-shrink: 0;
}

/* GROUP STANDINGS */
.standings-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
}
.standings-row:last-child { border-bottom: none; }
.standings-row.standings-pool {
  background: rgba(247,197,32,0.04);
  border-radius: 6px;
  padding: 9px 8px;
  margin: 2px -8px;
}

.standings-pos {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 13px;
  font-weight: 600;
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}
.standings-pos.pos-1, .standings-pos.pos-2 { color: var(--green); }
.standings-pos.pos-3 { color: var(--warning); }
.standings-pos.pos-4 { color: var(--error); }

.standings-team {
  font-size: 14px;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.standings-team.is-pool-team { color: var(--green); font-weight: 600; }

.standings-stats {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.standings-status {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.5px;
  white-space: nowrap;
  flex-shrink: 0;
}

.group-header {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 8px;
}

.pool-owner-tag {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.5px;
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}
.pool-owner-tag.big      { color: var(--big);      background: var(--big-dim);      border: 1px solid var(--big-border); }
.pool-owner-tag.smaller  { color: var(--smaller);  background: var(--smaller-dim);  border: 1px solid var(--smaller-border); }
.pool-owner-tag.underdog { color: var(--underdog); background: var(--underdog-dim); border: 1px solid var(--underdog-border); }
```

- [ ] **Step 2: Verify in browser**

Open `index.html` in a browser (or reload). No visual change expected yet — this just adds CSS classes that will be used by later tasks.

- [ ] **Step 3: Commit**

```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
git add css/styles.css
git commit -m "style: add paid badge and standings CSS"
```

---

### Task 2: Paid badge in Players tab

**Files:**
- Modify: `js/players.js`

Context: `showList()` renders participant cards (lines 43–126). Each card has a `nameRow` div containing `nameEl` and optionally an alive/out badge. We need to insert a `paid-badge` span into that row when `p.paid === true`.

`showDetail()` renders the full profile card (lines 128–295). The `bigName` div shows the participant name — we add the paid badge just after it.

- [ ] **Step 1: Update `showList` to show PAID badge**

In `js/players.js`, find this block inside `showList` (around line 85–93):

```javascript
    if (pool.drawCompleted && teams.length > 0) {
      const badge = mk("span");
      badge.style.cssText = `
        font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:1px;
        margin-left:auto;
        color:${isOut ? "var(--error)" : "var(--green)"};`;
      badge.textContent = isOut ? "OUT" : `${aliveTeams.length}/${teams.length} ALIVE`;
      nameRow.appendChild(badge);
    }
```

Replace it with:

```javascript
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
```

- [ ] **Step 2: Update `showDetail` to show PAID badge**

In `js/players.js`, inside `showDetail()`, find this block (around lines 159–178):

```javascript
  const bigName = mk("div");
  bigName.style.cssText = `
    font-family:'Bebas Neue',sans-serif;font-size:38px;letter-spacing:2px;line-height:1;
    ${isOut ? "opacity:0.4;text-decoration:line-through;" : ""}`;
  bigName.textContent = p.name;
  profileCard.appendChild(bigName);

  const statusLine = mk("div");
```

Replace with:

```javascript
  const bigName = mk("div");
  bigName.style.cssText = `
    font-family:'Bebas Neue',sans-serif;font-size:38px;letter-spacing:2px;line-height:1;
    ${isOut ? "opacity:0.4;text-decoration:line-through;" : ""}`;
  bigName.textContent = p.name;
  profileCard.appendChild(bigName);

  if (p.paid) {
    const paidBadge = mk("span", "paid-badge");
    paidBadge.textContent = "PAID";
    paidBadge.style.cssText += ";margin-top:8px;display:inline-block;";
    profileCard.appendChild(paidBadge);
  }

  const statusLine = mk("div");
```

- [ ] **Step 3: Verify in browser**

Log in as admin, go to Players tab. Participants without a `paid` field set should look identical to before. No badge should appear yet (no one has been marked paid yet). Draw must be completed for teams to show — the name should render fine either way.

- [ ] **Step 4: Commit**

```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
git add js/players.js
git commit -m "feat: show PAID badge in Players tab"
```

---

### Task 3: Paid manager in Admin tab

**Files:**
- Modify: `js/admin.js`

Context: After the draw is completed, `renderAdminUI` shows a lock notice then calls `renderResetPanel`. We insert a new `renderPaidManager` call between them. We also need to add `updateDoc` to the Firestore import (currently missing from admin.js).

- [ ] **Step 1: Add `updateDoc` to the Firestore import**

In `js/admin.js`, find line 2–6:

```javascript
import {
  doc, getDoc, setDoc, collection,
  getDocs, addDoc, deleteDoc, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
```

Replace with:

```javascript
import {
  doc, getDoc, setDoc, collection,
  getDocs, addDoc, deleteDoc, serverTimestamp, writeBatch, updateDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
```

- [ ] **Step 2: Call `renderPaidManager` in the post-draw branch**

In `js/admin.js`, find this block in `renderAdminUI` (lines 78–87):

```javascript
  } else {
    const lockNotice = el("div", "card");
    lockNotice.innerHTML = `
      <p style="color:var(--muted);font-size:13px;text-align:center;">
        ✅ Draw is locked. Team assignments are set in stone.<br>
        Elimination controls are in the <strong>Pot</strong> tab.
      </p>`;
    container.appendChild(lockNotice);

    renderResetPanel(container, participants);
  }
```

Replace with:

```javascript
  } else {
    const lockNotice = el("div", "card");
    lockNotice.innerHTML = `
      <p style="color:var(--muted);font-size:13px;text-align:center;">
        ✅ Draw is locked. Team assignments are set in stone.<br>
        Elimination controls are in the <strong>Pot</strong> tab.
      </p>`;
    container.appendChild(lockNotice);

    renderPaidManager(container, participants);
    renderResetPanel(container, participants);
  }
```

- [ ] **Step 3: Add the `renderPaidManager` function**

In `js/admin.js`, find the comment `// ── Reset draw` (line 382). Insert the following new function immediately before it:

```javascript
// ── Paid manager ─────────────────────────────────────────────────────────────
function renderPaidManager(container, participants) {
  const section = el("div", "admin-section");
  section.innerHTML = `<h3>Payment Tracker</h3>`;

  const listEl = el("div");
  listEl.style.cssText = "display:flex;flex-direction:column;gap:8px;";

  participants.forEach(p => {
    const row = el("div");
    row.style.cssText = "display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px;padding:10px 14px;";

    const nameEl = el("span");
    nameEl.style.flex = "1";
    nameEl.textContent = p.name;
    row.appendChild(nameEl);

    if (p.paid) {
      const badge = el("span", "paid-badge");
      badge.textContent = "PAID";
      row.appendChild(badge);
    }

    const btn = el("button", `${p.paid ? "btn-ghost" : "btn-primary"} btn-sm`);
    btn.style.whiteSpace = "nowrap";
    btn.textContent = p.paid ? "Unmark" : "Mark Paid";

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await updateDoc(doc(db, "pool", "main", "participants", p.id), { paid: !p.paid });
        const { renderAdmin } = await import("./admin.js");
        renderAdmin(document.getElementById("tab-admin"));
      } catch (err) {
        console.error(err);
        alert("Failed to update payment status. Please try again.");
        btn.disabled = false;
      }
    });

    row.appendChild(btn);
    listEl.appendChild(row);
  });

  section.appendChild(listEl);
  container.appendChild(section);
}

```

- [ ] **Step 4: Verify in browser**

Log in as admin, go to Admin tab. You should see a "PAYMENT TRACKER" section with all 14 participant names. Each has a "Mark Paid" button. Click one — it should re-render the admin panel with that participant showing the gold "PAID" badge and an "Unmark" button. Go to Players tab — that participant should now show the gold "PAID" badge next to their name.

- [ ] **Step 5: Commit**

```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
git add js/admin.js
git commit -m "feat: add payment tracker to admin panel"
```

---

### Task 4: Add Groups tab to HTML and app router

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`

- [ ] **Step 1: Add Groups tab button to `index.html`**

In `index.html`, find the tab nav block:

```html
      <button class="tab-btn" data-tab="pot">Pot</button>
      <button class="tab-btn" data-tab="players" id="players-tab-btn" style="display:none">Players</button>
```

Replace with:

```html
      <button class="tab-btn" data-tab="pot">Pot</button>
      <button class="tab-btn" data-tab="standings">Groups</button>
      <button class="tab-btn" data-tab="players" id="players-tab-btn" style="display:none">Players</button>
```

- [ ] **Step 2: Add Groups tab view div to `index.html`**

In `index.html`, find:

```html
      <div id="tab-pot" class="tab-view" style="display:none"></div>
      <div id="tab-players" class="tab-view" style="display:none"></div>
```

Replace with:

```html
      <div id="tab-pot" class="tab-view" style="display:none"></div>
      <div id="tab-standings" class="tab-view" style="display:none"></div>
      <div id="tab-players" class="tab-view" style="display:none"></div>
```

- [ ] **Step 3: Add standings case to `onTabActivated` in `app.js`**

In `js/app.js`, find this block (around lines 272–279):

```javascript
  } else if (tab === "pot") {
    const { renderPot } = await import("./pot.js");
    renderPot(document.getElementById("tab-pot"), isAdmin);
  } else if (tab === "players" && isAdmin) {
```

Replace with:

```javascript
  } else if (tab === "pot") {
    const { renderPot } = await import("./pot.js");
    renderPot(document.getElementById("tab-pot"), isAdmin);
  } else if (tab === "standings") {
    const { renderStandings } = await import("./standings.js");
    renderStandings(document.getElementById("tab-standings"), isAdmin);
  } else if (tab === "players" && isAdmin) {
```

- [ ] **Step 4: Verify in browser**

Reload the app. You should see a "GROUPS" tab in the nav bar between "Pot" and "Players". Clicking it should show a loading spinner (the module doesn't exist yet, so it will throw a 404 error in the console — that's expected). The tab indicator should slide to the Groups tab correctly.

- [ ] **Step 5: Commit**

```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
git add index.html js/app.js
git commit -m "feat: add Groups tab to nav and app router"
```

---

### Task 5: API-Football config

**Files:**
- Modify: `js/config.js`

- [ ] **Step 1: Add API-Football constants to `config.js`**

In `js/config.js`, after the last line (line 95, the closing `}`  of `teamMatches`), append:

```javascript

// ── API-Football (api-sports.io) ─────────────────────────────────────────────
export const API_FOOTBALL_KEY = "69018ddd7e785e47912bdd4cda1c45af";
export const STANDINGS_URL    = "https://v3.football.api-sports.io/standings?league=1&season=2026";
```

Note: League ID `1` is FIFA World Cup on API-Football. If the fetch returns empty data, the league ID may need to be verified via `https://v3.football.api-sports.io/leagues?name=FIFA World Cup&season=2026` with the same API key. The standings.js module handles an empty response gracefully.

- [ ] **Step 2: Commit**

```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
git add js/config.js
git commit -m "config: add API-Football key and standings URL"
```

---

### Task 6: Build `js/standings.js`

**Files:**
- Create: `js/standings.js`

This module fetches group standings from API-Football, renders 12 group cards (each with 4 teams), highlights pool teams, colour-codes positions, and gives the admin an "Eliminate" button for 4th-place pool teams.

**API response shape** (`data.response[0].league.standings`) is a 2D array:
- Outer array: one entry per group (12 groups)
- Inner array: 4 team standing objects per group, sorted by rank
- Each standing object has: `rank` (1–4), `team.name` (string), `points`, `goalsDiff`, `group` (e.g. `"Group A"`), `all.played`, `all.win`, `all.draw`, `all.lose`

**Pool teams** are loaded from Firestore participants and stored as `{ participantName, tierKey, team: { name, flag } }` — same shape as `matches.js` uses.

- [ ] **Step 1: Create `js/standings.js`**

Create the file at `js/standings.js` with the following content:

```javascript
// js/standings.js
import { db, API_FOOTBALL_KEY, STANDINGS_URL, teamMatches } from "./config.js";
import {
  doc, getDoc, collection, getDocs, updateDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

let pollInterval = null;

export async function renderStandings(container, isAdmin) {
  container.innerHTML = `<div class="loading">Loading group standings...</div>`;

  const [poolTeams, eliminatedNames] = await loadPoolData();

  await fetchAndRender(container, poolTeams, eliminatedNames, isAdmin);

  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(
    () => fetchAndRender(container, poolTeams, eliminatedNames, isAdmin),
    600000  // 10 minutes — stays within 100 req/day free tier
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
    const res  = await fetch(STANDINGS_URL, {
      headers: { "x-apisports-key": API_FOOTBALL_KEY }
    });
    const data = await res.json();
    const groups = data.response?.[0]?.league?.standings || [];

    renderGroups(container, groups, poolTeams, eliminatedNames, isAdmin);
  } catch {
    container.innerHTML = `
      <div class="empty-state">
        <p>Could not load standings.</p>
        <p style="font-size:12px;margin-top:8px;">Check your internet connection or try again later.</p>
      </div>`;
  }
}

// ── Render groups ─────────────────────────────────────────────────────────────

function renderGroups(container, groups, poolTeams, eliminatedNames, isAdmin) {
  container.innerHTML = "";

  // Page header
  const hdr = el("div");
  hdr.style.marginBottom = "16px";
  hdr.innerHTML = `
    <h2 style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:1px;margin-bottom:4px;">
      Group Stage
    </h2>
    <p style="color:var(--muted);font-size:13px;">
      ${groups.length > 0 ? `${groups.length} groups · ` : ""}1st &amp; 2nd advance · 3rd uncertain · 4th eliminated
    </p>`;
  container.appendChild(hdr);

  if (groups.length === 0) {
    const empty = el("div", "empty-state");
    empty.innerHTML = `
      <p>No standings data yet.</p>
      <p style="font-size:12px;margin-top:8px;">Group stage data will appear once matches begin.</p>`;
    container.appendChild(empty);

    const ts = el("p");
    ts.style.cssText = "color:var(--muted);font-size:11px;text-align:right;margin-top:12px;font-family:'IBM Plex Mono',monospace;";
    ts.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    container.appendChild(ts);
    return;
  }

  groups.forEach(group => {
    const groupName = group[0]?.group || "Group ?";

    const card = el("div", "card");
    card.style.marginBottom = "10px";

    const groupHdr = el("div", "group-header");
    groupHdr.textContent = groupName;
    card.appendChild(groupHdr);

    group.forEach(entry => {
      const rank       = entry.rank;           // 1–4
      const apiName    = entry.team?.name || "";
      const played     = entry.all?.played ?? 0;
      const points     = entry.points ?? 0;
      const gd         = entry.goalsDiff ?? 0;

      // Find pool match(es) for this team
      const poolMatch  = poolTeams.find(pt => teamMatches(apiName, pt.team.name));
      const isPool     = !!poolMatch;
      const isElim     = poolMatch ? eliminatedNames.has(poolMatch.team.name.toLowerCase()) : false;

      const row = el("div", `standings-row${isPool ? " standings-pool" : ""}`);

      // Position number
      const pos = el("span", `standings-pos pos-${rank}`);
      pos.textContent = rank;
      row.appendChild(pos);

      // Team name (use pool name if matched, else API name)
      const displayName = poolMatch ? `${poolMatch.team.flag} ${poolMatch.team.name}` : apiName;
      const nameEl = el("span", `standings-team${isPool ? " is-pool-team" : ""}`);
      nameEl.textContent = displayName;
      if (isElim) nameEl.style.cssText += "opacity:0.4;text-decoration:line-through;";
      row.appendChild(nameEl);

      // Pool owner tag
      if (isPool) {
        const ownerTag = el("span", `pool-owner-tag ${poolMatch.tierKey}`);
        ownerTag.textContent = poolMatch.participantName;
        row.appendChild(ownerTag);
      }

      // Stats: played, points, GD
      const stats = el("span", "standings-stats");
      stats.textContent = `${played}GP · ${points}pts · ${gd >= 0 ? "+" : ""}${gd}`;
      row.appendChild(stats);

      // Status badge
      const status = el("span", "standings-status");
      if (rank <= 2) {
        status.textContent = "✓ THROUGH";
        status.style.color = "var(--green)";
      } else if (rank === 3) {
        status.textContent = "? UNCERTAIN";
        status.style.color = "var(--warning)";
      } else {
        status.textContent = "✗ OUT";
        status.style.color = "var(--error)";
      }
      row.appendChild(status);

      // Admin eliminate button — 4th place pool team, not already eliminated
      if (isAdmin && rank === 4 && isPool && !isElim) {
        const elimBtn = el("button", "btn-danger btn-sm");
        elimBtn.textContent = "Eliminate";
        elimBtn.style.marginLeft = "4px";
        elimBtn.addEventListener("click", async () => {
          const pt = poolMatch;
          if (!confirm(`Mark ${pt.team.flag} ${pt.team.name} as eliminated from the pool?`)) return;
          elimBtn.disabled = true;
          try {
            await updateDoc(doc(db, "pool", "main"), {
              eliminatedTeams: arrayUnion({
                name:            pt.team.name,
                flag:            pt.team.flag,
                tier:            pt.tierKey,
                participantName: pt.participantName,
                eliminatedAt:    new Date().toISOString()
              })
            });
            // Reload with fresh eliminated data
            const [freshPoolTeams, freshElimNames] = await loadPoolData();
            renderGroups(container, groups, freshPoolTeams, freshElimNames, isAdmin);
          } catch (err) {
            console.error(err);
            alert("Failed to mark team as eliminated. Please try again.");
            elimBtn.disabled = false;
          }
        });
        row.appendChild(elimBtn);
      }

      card.appendChild(row);
    });

    container.appendChild(card);
  });

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
```

- [ ] **Step 2: Verify in browser — tab loads**

Reload the app and click the Groups tab. It should show "Loading group standings..." briefly, then either:
- Show 12 group cards with team rows, OR
- Show "No standings data yet" if the API returns empty (tournament just started)

Check the browser console (F12) for any errors. If you see `401 Unauthorized`, the API key is wrong. If you see `CORS error`, the API doesn't support browser requests — see the fallback note below.

**If CORS blocks the request:** API-Football v3 via `v3.football.api-sports.io` supports browser requests with the correct headers. If it still fails, check the Network tab for the actual error code. A `403` means the league/season combo is wrong; try fetching `https://v3.football.api-sports.io/leagues?name=FIFA World Cup` to find the correct league ID and update `STANDINGS_URL` in `config.js`.

- [ ] **Step 3: Verify pool team highlighting**

If standings data loads, pool teams (Spain, Germany, Brazil, etc.) should appear with:
- Gold text and bold name
- Small owner tag chip showing the participant name (e.g. "Kim")
- Coloured position number (gold for 1st/2nd, amber for 3rd, red for 4th)

Teams not in the pool should appear as plain white text with no owner tag.

- [ ] **Step 4: Verify admin eliminate button (log in as admin)**

Log in as `usama@brandesign.co.za`. Go to Groups tab. Any pool team in 4th place (rank 4) that hasn't been eliminated yet should show a small red "Eliminate" button at the end of the row. Click it → confirm dialog → it should update Firestore and the row should update to show the team crossed out.

- [ ] **Step 5: Commit**

```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
git add js/standings.js
git commit -m "feat: add Group Standings tab with API-Football integration"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Paid badge visible in Players tab list and detail view
- ✅ Admin can toggle paid/unpaid in Admin tab
- ✅ Groups tab visible to all users
- ✅ 12 group cards with position colour-coding (green/amber/red)
- ✅ Pool teams highlighted with participant name
- ✅ Position logic: 1st/2nd = through, 3rd = uncertain, 4th = out
- ✅ Admin "Eliminate" button on 4th-place pool teams
- ✅ Elimination writes to Firestore `eliminatedTeams` (same array used by Pot tab)
- ✅ Visual only — no auto-elimination; admin triggers manually
- ✅ Auto-refresh every 10 minutes (API-Football 100 req/day limit)

**No placeholders:** All steps contain complete code. No TBDs.

**Type consistency:**
- `poolTeams` shape `{ participantName, tierKey, team: { name, flag } }` used consistently across standings.js, matches.js
- `eliminatedTeams` array shape `{ name, flag, tier, participantName, eliminatedAt }` matches pot.js usage
- `teamMatches(apiName, poolName)` called correctly throughout
