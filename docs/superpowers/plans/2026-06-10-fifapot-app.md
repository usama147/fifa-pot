# FifaPot App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static multi-page web app for a 16-person World Cup 2026 pool — with email/password auth, an admin draw system, live match board, and pot tracker — deployable to GitHub Pages.

**Architecture:** Single-page app using vanilla JS ES modules, Firebase v12 CDN (Auth + Firestore), and static HTML/CSS files served from GitHub Pages. No build step. All data lives in a single Firestore document at `/pool/main` with a `/participants` subcollection.

**Tech Stack:** HTML5, CSS3, vanilla JS (ES modules), Firebase v12 (Auth + Firestore), ESPN unofficial API, GitHub Pages

---

## Admin email
`usama@brandesign.co.za` — hardcoded in security rules and `config.js`.

## Design tokens (use throughout)
```
Background:    #090B14
Card:          #0D1222
Border:        rgba(255,255,255,0.07)
Text primary:  #E8EDF5
Text muted:    rgba(255,255,255,0.35)
Green CTA:     #00D96C
Big gold:      #F5B432
Smaller silver:#97A6BE
Underdog bronze:#C1773A
Error red:     #F87171
Warning amber: #FBBF24
Fonts: Bebas Neue (titles), Outfit (body), IBM Plex Mono (labels/codes)
```

## Firestore Data Model

### `/pool/main` (single document)
```json
{
  "drawCompleted": false,
  "drawDate": null,
  "buyIn": 100,
  "tiers": [
    {
      "key": "big",
      "label": "Big Teams",
      "icon": "◈",
      "accent": "#F5B432",
      "dim": "rgba(245,180,50,0.08)",
      "border": "rgba(245,180,50,0.25)",
      "teams": [{ "name": "Argentina", "flag": "🇦🇷" }]
    },
    {
      "key": "smaller",
      "label": "Smaller Teams",
      "icon": "◇",
      "accent": "#97A6BE",
      "dim": "rgba(151,166,190,0.08)",
      "border": "rgba(151,166,190,0.25)",
      "teams": []
    },
    {
      "key": "underdog",
      "label": "Underdogs",
      "icon": "○",
      "accent": "#C1773A",
      "dim": "rgba(193,119,58,0.08)",
      "border": "rgba(193,119,58,0.25)",
      "teams": []
    }
  ],
  "eliminatedTeams": [],
  "finalStandings": { "champion": null, "runnerUp": null, "thirdPlace": null }
}
```

### `/pool/main/participants/{participantId}`
```json
{
  "name": "Matthew",
  "addedAt": "Timestamp",
  "drawOrder": 3,
  "teams": {
    "big":      { "name": "Brazil",       "flag": "🇧🇷" },
    "smaller":  { "name": "Canada",       "flag": "🇨🇦" },
    "underdog": { "name": "South Africa", "flag": "🇿🇦" }
  }
}
```

## File Structure

```
index.html              — App shell: auth screen + main app container + tab nav
css/
  styles.css            — All styles (design system, auth, tabs, components)
js/
  config.js             — Firebase init, ADMIN_EMAIL constant, DEFAULT_TIERS data
  auth.js               — login(), signup(), logout(), sendReset(), onAuthChange()
  app.js                — Entry point: auth state listener, tab routing, admin visibility
  admin.js              — Tier/team editor (pre-draw), participant management, draw trigger
  draw.js               — fisherYates(), runDraw(), saveDraw() — draw logic + Firestore write
  pool.js               — renderPool() — read participants + teams from Firestore, render cards
  matches.js            — fetchScoreboard(), renderMatches(), startPolling() — ESPN API
  pot.js                — renderPot(), markEliminated(), setFinalStandings(), calcPayouts()
```

---

## Task 1: Project scaffold + design system

**Files:**
- Create: `index.html`
- Create: `css/styles.css`

- [ ] **Step 1: Create index.html shell**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FifaPot 2026</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>

  <!-- AUTH SCREEN -->
  <div id="auth-screen">
    <div class="auth-card">
      <h1 class="auth-title">FIFAPOT</h1>
      <p class="auth-subtitle">World Cup 2026</p>

      <!-- Login form -->
      <form id="login-form">
        <input type="email" id="login-email" placeholder="Email" required>
        <input type="password" id="login-password" placeholder="Password" required>
        <div id="login-error" class="form-error"></div>
        <button type="submit" class="btn-primary">Sign In</button>
        <div class="auth-links">
          <button type="button" id="show-signup">Create account</button>
          <button type="button" id="show-forgot">Forgot password?</button>
        </div>
      </form>

      <!-- Signup form -->
      <form id="signup-form" style="display:none">
        <input type="text" id="signup-name" placeholder="Your name" required>
        <input type="email" id="signup-email" placeholder="Email" required>
        <input type="password" id="signup-password" placeholder="Password (min 6 chars)" required>
        <div id="signup-error" class="form-error"></div>
        <button type="submit" class="btn-primary">Create Account</button>
        <div class="auth-links">
          <button type="button" id="show-login">Back to sign in</button>
        </div>
      </form>

      <!-- Forgot password form -->
      <form id="forgot-form" style="display:none">
        <p class="form-hint">Enter your email and we'll send a reset link.</p>
        <input type="email" id="forgot-email" placeholder="Email" required>
        <div id="forgot-error" class="form-error"></div>
        <div id="forgot-success" class="form-success"></div>
        <button type="submit" class="btn-primary">Send Reset Link</button>
        <div class="auth-links">
          <button type="button" id="show-login-2">Back to sign in</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MAIN APP -->
  <div id="app" style="display:none">

    <!-- Top bar -->
    <header id="app-header">
      <span class="app-logo">FIFAPOT</span>
      <span id="user-email-display" class="user-email"></span>
      <button id="logout-btn" class="btn-ghost">Sign out</button>
    </header>

    <!-- Tab nav -->
    <nav id="tab-nav">
      <button class="tab-btn active" data-tab="pool">Pool</button>
      <button class="tab-btn" data-tab="matches">Matches</button>
      <button class="tab-btn" data-tab="pot">Pot</button>
      <button class="tab-btn" data-tab="admin" id="admin-tab-btn" style="display:none">Admin</button>
    </nav>

    <!-- Tab views -->
    <main>
      <div id="tab-pool" class="tab-view active"></div>
      <div id="tab-matches" class="tab-view" style="display:none"></div>
      <div id="tab-pot" class="tab-view" style="display:none"></div>
      <div id="tab-admin" class="tab-view" style="display:none"></div>
    </main>
  </div>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create css/styles.css with full design system**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #090B14;
  --card: #0D1222;
  --border: rgba(255,255,255,0.07);
  --text: #E8EDF5;
  --muted: rgba(255,255,255,0.35);
  --green: #00D96C;
  --green-dark: #00B55A;
  --big: #F5B432;
  --big-dim: rgba(245,180,50,0.08);
  --big-border: rgba(245,180,50,0.25);
  --smaller: #97A6BE;
  --smaller-dim: rgba(151,166,190,0.08);
  --smaller-border: rgba(151,166,190,0.25);
  --underdog: #C1773A;
  --underdog-dim: rgba(193,119,58,0.08);
  --underdog-border: rgba(193,119,58,0.25);
  --error: #F87171;
  --warning: #FBBF24;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  min-height: 100vh;
}

/* AUTH */
#auth-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.auth-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 40px 32px;
  width: 100%;
  max-width: 380px;
}

.auth-title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: clamp(36px, 10vw, 52px);
  color: var(--green);
  letter-spacing: 3px;
  text-align: center;
}

.auth-subtitle {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--muted);
  text-align: center;
  margin-bottom: 28px;
}

.auth-card form { display: flex; flex-direction: column; gap: 12px; }

.auth-card input {
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  color: var(--text);
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}
.auth-card input:focus { border-color: rgba(255,255,255,0.2); }
.auth-card input::placeholder { color: var(--muted); }

.btn-primary {
  background: linear-gradient(135deg, var(--green), var(--green-dark));
  color: #000;
  font-family: 'Bebas Neue', sans-serif;
  font-size: 18px;
  letter-spacing: 1px;
  border: none;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn-primary:hover { opacity: 0.9; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-ghost {
  background: none;
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 6px;
  padding: 6px 12px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.btn-ghost:hover { border-color: rgba(255,255,255,0.2); color: var(--text); }

.btn-danger {
  background: none;
  border: 1px solid rgba(248,113,113,0.3);
  color: var(--error);
  border-radius: 6px;
  padding: 6px 12px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  cursor: pointer;
}
.btn-danger:hover { background: rgba(248,113,113,0.08); }

.btn-sm {
  padding: 5px 10px;
  font-size: 12px;
  border-radius: 5px;
}

.auth-links {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.auth-links button {
  background: none;
  border: none;
  color: var(--muted);
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.auth-links button:hover { color: var(--text); }

.form-error { color: var(--error); font-size: 13px; min-height: 18px; }
.form-success { color: var(--green); font-size: 13px; min-height: 18px; }
.form-hint { color: var(--muted); font-size: 13px; }

/* APP SHELL */
#app-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
}

.app-logo {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 24px;
  color: var(--green);
  letter-spacing: 2px;
  flex: 1;
}

.user-email {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: var(--muted);
  letter-spacing: 1px;
}

/* TAB NAV */
#tab-nav {
  display: flex;
  border-bottom: 1px solid var(--border);
  padding: 0 20px;
  gap: 4px;
}

.tab-btn {
  background: none;
  border: none;
  color: var(--muted);
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.2s, border-color 0.2s;
  margin-bottom: -1px;
}

.tab-btn:hover { color: var(--text); }
.tab-btn.active { color: var(--green); border-bottom-color: var(--green); }

/* TAB VIEWS */
.tab-view { padding: 20px; max-width: 900px; margin: 0 auto; }

/* CARDS */
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px;
}

.card + .card { margin-top: 12px; }

/* TIER BADGE */
.tier-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 6px;
  padding: 3px 9px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.tier-badge.big    { background: var(--big-dim);      border: 1px solid var(--big-border);      color: var(--big); }
.tier-badge.smaller{ background: var(--smaller-dim);  border: 1px solid var(--smaller-border);  color: var(--smaller); }
.tier-badge.underdog{ background: var(--underdog-dim); border: 1px solid var(--underdog-border); color: var(--underdog); }

/* SECTION HEADER */
.section-header {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 12px;
}

/* PARTICIPANT CARD */
.participant-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 10px;
}

.participant-name {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 20px;
  letter-spacing: 1px;
  margin-bottom: 10px;
}

.participant-teams {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.team-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 13px;
  font-weight: 500;
}

.team-chip.big     { background: var(--big-dim);      border: 1px solid var(--big-border);      color: var(--big); }
.team-chip.smaller { background: var(--smaller-dim);  border: 1px solid var(--smaller-border);  color: var(--smaller); }
.team-chip.underdog{ background: var(--underdog-dim); border: 1px solid var(--underdog-border); color: var(--underdog); }
.team-chip.eliminated { opacity: 0.35; text-decoration: line-through; }

/* MATCH CARDS */
.match-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 10px;
}

.match-status-live   { color: var(--green); font-weight: 600; }
.match-status-final  { color: var(--muted); }
.match-status-sched  { color: var(--warning); }

.match-teams {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: 'Bebas Neue', sans-serif;
  font-size: 18px;
  letter-spacing: 1px;
  margin: 6px 0;
}

.match-score {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 16px;
  color: var(--text);
}

.pool-highlight {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}

/* POT */
.pot-total {
  font-family: 'Bebas Neue', sans-serif;
  font-size: clamp(36px, 8vw, 56px);
  color: var(--green);
  letter-spacing: 2px;
}

.payout-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.payout-row:last-child { border-bottom: none; }

/* ADMIN */
.admin-section { margin-bottom: 28px; }

.admin-section h3 {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 12px;
}

.team-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.team-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 20px;
  padding: 4px 10px 4px 8px;
  font-size: 13px;
  cursor: default;
}

.team-pill.big     { background: var(--big-dim);      border: 1px solid var(--big-border);      color: var(--big); }
.team-pill.smaller { background: var(--smaller-dim);  border: 1px solid var(--smaller-border);  color: var(--smaller); }
.team-pill.underdog{ background: var(--underdog-dim); border: 1px solid var(--underdog-border); color: var(--underdog); }

.team-pill .move-btn {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.5;
  cursor: pointer;
  font-size: 11px;
  padding: 0 2px;
}
.team-pill .move-btn:hover { opacity: 1; }

.participant-list { display: flex; flex-direction: column; gap: 8px; }

.participant-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
}

.participant-row span { flex: 1; }

.add-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.add-row input {
  flex: 1;
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--text);
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  outline: none;
}
.add-row input:focus { border-color: rgba(255,255,255,0.2); }
.add-row input::placeholder { color: var(--muted); }

/* LOADING / EMPTY */
.loading {
  color: var(--muted);
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  text-align: center;
  padding: 40px;
  letter-spacing: 2px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--muted);
}

.empty-state p { font-size: 14px; margin-top: 8px; }

/* PULSE ANIMATION for live matches */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.live-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: var(--green);
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
  margin-right: 4px;
}

/* RESPONSIVE */
@media (max-width: 600px) {
  .tab-btn { padding: 10px 10px; font-size: 10px; letter-spacing: 1px; }
  .tab-view { padding: 14px; }
  .user-email { display: none; }
  .participant-teams { gap: 6px; }
  .team-chip { font-size: 12px; padding: 4px 8px; }
}
```

- [ ] **Step 3: Verify scaffold renders**

Open `index.html` via a local server (not double-click — ES modules need HTTP):
```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
python3 -m http.server 8080
```
Open `http://localhost:8080`. You should see the dark auth screen with "FIFAPOT" in green and a login form.

---

## Task 2: Firebase config + auth module

**Files:**
- Create: `js/config.js`
- Create: `js/auth.js`

- [ ] **Step 1: Create js/config.js**

```js
// js/config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBUlwXDzLQaSIDZ8pR8vX4LLMr5Ap2KyF4",
  authDomain:        "fifapot.firebaseapp.com",
  projectId:         "fifapot",
  storageBucket:     "fifapot.firebasestorage.app",
  messagingSenderId: "873540305061",
  appId:             "1:873540305061:web:1b2799b707b8f4aab6cd4c",
  measurementId:     "G-0CHMWT5LCK"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

export const ADMIN_EMAIL = "usama@brandesign.co.za";

export const DEFAULT_TIERS = [
  {
    key: "big", label: "Big Teams", icon: "◈",
    accent: "#F5B432", dim: "rgba(245,180,50,0.08)", border: "rgba(245,180,50,0.25)",
    teams: [
      { name: "Argentina",   flag: "🇦🇷" }, { name: "France",      flag: "🇫🇷" },
      { name: "Spain",       flag: "🇪🇸" }, { name: "England",     flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
      { name: "Brazil",      flag: "🇧🇷" }, { name: "Portugal",    flag: "🇵🇹" },
      { name: "Netherlands", flag: "🇳🇱" }, { name: "Belgium",     flag: "🇧🇪" },
      { name: "Germany",     flag: "🇩🇪" }, { name: "Switzerland", flag: "🇨🇭" },
      { name: "Croatia",     flag: "🇭🇷" }, { name: "Colombia",    flag: "🇨🇴" },
      { name: "Morocco",     flag: "🇲🇦" }, { name: "Uruguay",     flag: "🇺🇾" },
      { name: "USA",         flag: "🇺🇸" }, { name: "Japan",       flag: "🇯🇵" }
    ]
  },
  {
    key: "smaller", label: "Smaller Teams", icon: "◇",
    accent: "#97A6BE", dim: "rgba(151,166,190,0.08)", border: "rgba(151,166,190,0.25)",
    teams: [
      { name: "Norway",           flag: "🇳🇴" }, { name: "Mexico",      flag: "🇲🇽" },
      { name: "South Korea",      flag: "🇰🇷" }, { name: "Senegal",     flag: "🇸🇳" },
      { name: "Ecuador",          flag: "🇪🇨" }, { name: "Austria",     flag: "🇦🇹" },
      { name: "Turkey",           flag: "🇹🇷" }, { name: "Scotland",    flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
      { name: "Canada",           flag: "🇨🇦" }, { name: "Australia",   flag: "🇦🇺" },
      { name: "Iran",             flag: "🇮🇷" }, { name: "Saudi Arabia",flag: "🇸🇦" },
      { name: "Algeria",          flag: "🇩🇿" }, { name: "Ivory Coast", flag: "🇨🇮" },
      { name: "Sweden",           flag: "🇸🇪" }, { name: "Paraguay",    flag: "🇵🇾" }
    ]
  },
  {
    key: "underdog", label: "Underdogs", icon: "○",
    accent: "#C1773A", dim: "rgba(193,119,58,0.08)", border: "rgba(193,119,58,0.25)",
    teams: [
      { name: "Bosnia-Herzegovina", flag: "🇧🇦" }, { name: "Czechia",      flag: "🇨🇿" },
      { name: "Qatar",              flag: "🇶🇦" }, { name: "Ghana",        flag: "🇬🇭" },
      { name: "Cape Verde",         flag: "🇨🇻" }, { name: "South Africa", flag: "🇿🇦" },
      { name: "Egypt",              flag: "🇪🇬" }, { name: "Tunisia",      flag: "🇹🇳" },
      { name: "Panama",             flag: "🇵🇦" }, { name: "Curaçao",      flag: "🇨🇼" },
      { name: "Haiti",              flag: "🇭🇹" }, { name: "Iraq",         flag: "🇮🇶" },
      { name: "Jordan",             flag: "🇯🇴" }, { name: "New Zealand",  flag: "🇳🇿" },
      { name: "Uzbekistan",         flag: "🇺🇿" }, { name: "DR Congo",     flag: "🇨🇩" }
    ]
  }
];

export const TEAM_ALIASES = {
  "united states": "usa",
  "us":            "usa",
  "ir iran":       "iran",
  "côte d'ivoire": "ivory coast",
  "cote d'ivoire": "ivory coast",
  "türkiye":       "turkey",
  "turkiye":       "turkey",
  "south korea":   "south korea",
  "republic of korea": "south korea",
  "czechia":       "czechia",
  "czech republic":"czechia",
  "dr congo":      "dr congo",
  "congo dr":      "dr congo",
  "democratic republic of the congo": "dr congo",
  "bosnia and herzegovina": "bosnia-herzegovina",
  "bosnia-herzegovina": "bosnia-herzegovina",
};

export function normalizeTeamName(name) {
  const lower = name.toLowerCase().trim();
  return TEAM_ALIASES[lower] || lower;
}

export function teamMatches(espnName, poolName) {
  const a = normalizeTeamName(espnName);
  const b = normalizeTeamName(poolName);
  return a === b || a.includes(b) || b.includes(a);
}
```

- [ ] **Step 2: Create js/auth.js**

```js
// js/auth.js
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { auth } from "./config.js";

export function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signup(email, password, displayName) {
  return createUserWithEmailAndPassword(auth, email, password).then(cred => {
    return updateProfile(cred.user, { displayName });
  });
}

export function logout() {
  return signOut(auth);
}

export function sendReset(email) {
  return sendPasswordResetEmail(auth, email);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
```

- [ ] **Step 3: Verify modules load without errors**

With local server running, open browser devtools → Console. Reload the page. There should be no import errors. (Auth functions won't be called yet — that's Task 3.)

---

## Task 3: App entry point + auth UI wiring

**Files:**
- Create: `js/app.js`

- [ ] **Step 1: Create js/app.js**

```js
// js/app.js
import { login, signup, logout, sendReset, onAuthChange } from "./auth.js";
import { ADMIN_EMAIL } from "./config.js";

// ── Auth screen form switching ──────────────────────────────────────────────
const authScreen   = document.getElementById("auth-screen");
const appEl        = document.getElementById("app");

const loginForm    = document.getElementById("login-form");
const signupForm   = document.getElementById("signup-form");
const forgotForm   = document.getElementById("forgot-form");

document.getElementById("show-signup").addEventListener("click",    () => showAuthForm("signup"));
document.getElementById("show-forgot").addEventListener("click",    () => showAuthForm("forgot"));
document.getElementById("show-login").addEventListener("click",     () => showAuthForm("login"));
document.getElementById("show-login-2").addEventListener("click",   () => showAuthForm("login"));

function showAuthForm(name) {
  loginForm.style.display  = name === "login"  ? "" : "none";
  signupForm.style.display = name === "signup" ? "" : "none";
  forgotForm.style.display = name === "forgot" ? "" : "none";
}

// ── Login ───────────────────────────────────────────────────────────────────
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl    = document.getElementById("login-error");
  errEl.textContent = "";
  const btn = loginForm.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    await login(email, password);
  } catch (err) {
    errEl.textContent = friendlyAuthError(err.code);
    btn.disabled = false;
  }
});

// ── Signup ──────────────────────────────────────────────────────────────────
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name     = document.getElementById("signup-name").value.trim();
  const email    = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const errEl    = document.getElementById("signup-error");
  errEl.textContent = "";
  if (!name) { errEl.textContent = "Please enter your name."; return; }
  const btn = signupForm.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    await signup(email, password, name);
  } catch (err) {
    errEl.textContent = friendlyAuthError(err.code);
    btn.disabled = false;
  }
});

// ── Forgot password ─────────────────────────────────────────────────────────
forgotForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email   = document.getElementById("forgot-email").value.trim();
  const errEl   = document.getElementById("forgot-error");
  const succEl  = document.getElementById("forgot-success");
  errEl.textContent = ""; succEl.textContent = "";
  try {
    await sendReset(email);
    succEl.textContent = "Reset email sent — check your inbox.";
  } catch (err) {
    errEl.textContent = friendlyAuthError(err.code);
  }
});

// ── Logout ───────────────────────────────────────────────────────────────────
document.getElementById("logout-btn").addEventListener("click", () => logout());

// ── Auth state listener ──────────────────────────────────────────────────────
onAuthChange((user) => {
  if (user) {
    authScreen.style.display = "none";
    appEl.style.display      = "";
    document.getElementById("user-email-display").textContent = user.email;

    const isAdmin = user.email === ADMIN_EMAIL;
    const adminTabBtn = document.getElementById("admin-tab-btn");
    adminTabBtn.style.display = isAdmin ? "" : "none";

    initTabs(isAdmin);
  } else {
    authScreen.style.display = "";
    appEl.style.display      = "none";
    showAuthForm("login");
    // Reset submit buttons
    loginForm.querySelector("button[type=submit]").disabled = false;
    signupForm.querySelector("button[type=submit]").disabled = false;
  }
});

// ── Tab navigation ───────────────────────────────────────────────────────────
let tabsInitialised = false;

function initTabs(isAdmin) {
  if (tabsInitialised) return;
  tabsInitialised = true;

  const tabBtns  = document.querySelectorAll(".tab-btn");
  const tabViews = document.querySelectorAll(".tab-view");

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      tabBtns.forEach(b  => b.classList.toggle("active", b.dataset.tab === target));
      tabViews.forEach(v => {
        const show = v.id === `tab-${target}`;
        v.style.display = show ? "" : "none";
        v.classList.toggle("active", show);
      });
      onTabActivated(target, isAdmin);
    });
  });

  // Load default tab
  onTabActivated("pool", isAdmin);
}

// ── Tab content loader ───────────────────────────────────────────────────────
async function onTabActivated(tab, isAdmin) {
  if (tab === "pool") {
    const { renderPool } = await import("./pool.js");
    renderPool(document.getElementById("tab-pool"));
  } else if (tab === "matches") {
    const { renderMatches } = await import("./matches.js");
    renderMatches(document.getElementById("tab-matches"));
  } else if (tab === "pot") {
    const { renderPot } = await import("./pot.js");
    renderPot(document.getElementById("tab-pot"), isAdmin);
  } else if (tab === "admin" && isAdmin) {
    const { renderAdmin } = await import("./admin.js");
    renderAdmin(document.getElementById("tab-admin"));
  }
}

// ── Error messages ───────────────────────────────────────────────────────────
function friendlyAuthError(code) {
  const map = {
    "auth/invalid-email":          "Invalid email address.",
    "auth/user-not-found":         "No account found with that email.",
    "auth/wrong-password":         "Incorrect password.",
    "auth/email-already-in-use":   "An account with this email already exists.",
    "auth/weak-password":          "Password must be at least 6 characters.",
    "auth/too-many-requests":      "Too many attempts — try again later.",
    "auth/invalid-credential":     "Incorrect email or password.",
    "auth/network-request-failed": "Network error — check your connection.",
  };
  return map[code] || "Something went wrong. Please try again.";
}
```

- [ ] **Step 2: Test auth flow in browser**

With server running at `http://localhost:8080`:
1. Try clicking "Create account" → signup form appears.
2. Try clicking "Forgot password?" → forgot form appears.
3. Try clicking "Back to sign in" → login form reappears.
4. Try signing up with a test email — Firebase should create the account and auto-login, showing the app shell with Pool/Matches/Pot tabs.
5. Sign in as `usama@brandesign.co.za` — you should see a 4th "Admin" tab.
6. Click "Sign out" — returns to auth screen.

---

## Task 4: Admin — Tier/team editor + participant management

**Files:**
- Create: `js/admin.js`

The admin tab has two sections:
1. **Pre-draw:** Edit tiers/teams (only available before draw is locked), add/remove participants
2. **Post-draw:** Draw is locked, manage eliminations + final standings (handled in Task 8)

- [ ] **Step 1: Create js/admin.js**

```js
// js/admin.js
import { db, DEFAULT_TIERS } from "./config.js";
import {
  doc, getDoc, setDoc, collection,
  getDocs, addDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const POOL_REF = () => doc(db, "pool", "main");
const PARTS_REF = () => collection(db, "pool", "main", "participants");

// ── Entry point ──────────────────────────────────────────────────────────────
export async function renderAdmin(container) {
  container.innerHTML = `<div class="loading">Loading admin panel...</div>`;

  let poolData = await loadPool();
  const participants = await loadParticipants();

  container.innerHTML = "";
  renderAdminUI(container, poolData, participants);
}

async function loadPool() {
  const snap = await getDoc(POOL_REF());
  if (snap.exists()) return snap.data();
  // First time: seed with defaults
  const initial = {
    drawCompleted: false,
    drawDate: null,
    buyIn: 100,
    tiers: DEFAULT_TIERS,
    eliminatedTeams: [],
    finalStandings: { champion: null, runnerUp: null, thirdPlace: null }
  };
  await setDoc(POOL_REF(), initial);
  return initial;
}

async function loadParticipants() {
  const snap = await getDocs(PARTS_REF());
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.drawOrder - b.drawOrder || a.addedAt?.seconds - b.addedAt?.seconds);
}

// ── Main admin UI ────────────────────────────────────────────────────────────
function renderAdminUI(container, poolData, participants) {
  const drawDone = poolData.drawCompleted;

  // Page header
  const header = el("div", "admin-section");
  header.innerHTML = `
    <h2 style="font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:1px;margin-bottom:4px;">
      Admin Panel
    </h2>
    <p style="color:var(--muted);font-size:13px;">
      ${drawDone
        ? `Draw completed on ${new Date(poolData.drawDate?.seconds * 1000).toLocaleDateString()}.`
        : `Draw not yet run. ${participants.length}/16 participants added.`}
    </p>`;
  container.appendChild(header);

  if (!drawDone) {
    renderParticipantManager(container, participants, poolData);
    renderTierEditor(container, poolData);
    renderDrawButton(container, participants, poolData);
  } else {
    const lockNotice = el("div", "card");
    lockNotice.innerHTML = `
      <p style="color:var(--muted);font-size:13px;text-align:center;">
        ✅ Draw is locked. Team assignments are set in stone.<br>
        Elimination controls are in the <strong>Pot</strong> tab.
      </p>`;
    container.appendChild(lockNotice);
  }
}

// ── Participant manager ──────────────────────────────────────────────────────
function renderParticipantManager(container, participants, poolData) {
  const section = el("div", "admin-section");
  section.innerHTML = `<h3>Participants (${participants.length}/16)</h3>`;

  const listEl = el("div", "participant-list");
  section.appendChild(listEl);

  function refreshList(parts) {
    listEl.innerHTML = "";
    if (parts.length === 0) {
      listEl.innerHTML = `<p style="color:var(--muted);font-size:13px;">No participants yet.</p>`;
    }
    parts.forEach(p => {
      const row = el("div", "participant-row");
      row.innerHTML = `<span>${p.name}</span>`;
      const delBtn = el("button", "btn-danger btn-sm");
      delBtn.textContent = "Remove";
      delBtn.addEventListener("click", async () => {
        if (!confirm(`Remove ${p.name}?`)) return;
        await deleteDoc(doc(db, "pool", "main", "participants", p.id));
        const idx = parts.findIndex(x => x.id === p.id);
        parts.splice(idx, 1);
        section.querySelector("h3").textContent = `Participants (${parts.length}/16)`;
        refreshList(parts);
      });
      row.appendChild(delBtn);
      listEl.appendChild(row);
    });
  }

  refreshList(participants);

  // Add participant row
  const addRow = el("div", "add-row");
  const nameInput = el("input");
  nameInput.placeholder = "Participant name";
  nameInput.maxLength = 30;
  const addBtn = el("button", "btn-primary btn-sm");
  addBtn.textContent = "Add";
  addBtn.style.fontFamily = "Outfit, sans-serif";
  addBtn.style.fontSize = "14px";
  addBtn.style.padding = "10px 16px";

  addBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) return;
    if (participants.length >= 16) {
      alert("Maximum 16 participants reached.");
      return;
    }
    if (participants.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      alert("A participant with that name already exists.");
      return;
    }
    addBtn.disabled = true;
    const newDoc = await addDoc(PARTS_REF(), {
      name,
      addedAt: serverTimestamp(),
      drawOrder: participants.length + 1,
      teams: {}
    });
    participants.push({ id: newDoc.id, name, teams: {} });
    section.querySelector("h3").textContent = `Participants (${participants.length}/16)`;
    nameInput.value = "";
    refreshList(participants);
    addBtn.disabled = false;
  });

  nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addBtn.click(); });

  addRow.appendChild(nameInput);
  addRow.appendChild(addBtn);
  section.appendChild(addRow);
  container.appendChild(section);
}

// ── Tier/team editor ─────────────────────────────────────────────────────────
function renderTierEditor(container, poolData) {
  const section = el("div", "admin-section");
  section.innerHTML = `<h3>Team Tiers (edit before draw)</h3>`;

  // Deep copy tiers for local editing
  let tiers = JSON.parse(JSON.stringify(poolData.tiers));

  const tiersEl = el("div");
  section.appendChild(tiersEl);

  const saveBtn = el("button", "btn-primary");
  saveBtn.textContent = "Save Tiers";
  saveBtn.style.marginTop = "16px";
  saveBtn.style.width = "100%";
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    await setDoc(POOL_REF(), { tiers }, { merge: true });
    saveBtn.textContent = "Saved ✓";
    setTimeout(() => { saveBtn.textContent = "Save Tiers"; saveBtn.disabled = false; }, 2000);
  });

  function renderTiers() {
    tiersEl.innerHTML = "";
    tiers.forEach((tier, ti) => {
      const tierCard = el("div", "card");
      tierCard.style.marginBottom = "10px";
      tierCard.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span class="tier-badge ${tier.key}">${tier.icon} ${tier.label}</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);margin-left:auto;">${tier.teams.length} teams</span>
        </div>`;

      const teamList = el("div", "team-list");
      tier.teams.forEach((team, idx) => {
        const pill = el("div", `team-pill ${tier.key}`);
        pill.innerHTML = `<span>${team.flag} ${team.name}</span>`;

        // Move to other tiers
        tiers.forEach((otherTier, oti) => {
          if (oti === ti) return;
          const moveBtn = el("button", "move-btn");
          moveBtn.textContent = `→${otherTier.icon}`;
          moveBtn.title = `Move to ${otherTier.label}`;
          moveBtn.addEventListener("click", () => {
            tiers[ti].teams.splice(idx, 1);
            tiers[oti].teams.push(team);
            renderTiers();
          });
          pill.appendChild(moveBtn);
        });

        teamList.appendChild(pill);
      });

      tierCard.appendChild(teamList);
      tiersEl.appendChild(tierCard);
    });
  }

  renderTiers();
  section.appendChild(saveBtn);
  container.appendChild(section);
}

// ── Draw button ──────────────────────────────────────────────────────────────
function renderDrawButton(container, participants, poolData) {
  const section = el("div", "admin-section");

  const tiers = poolData.tiers;
  const n = participants.length;

  const validationEl = el("div", "card");
  validationEl.style.marginBottom = "12px";

  function validate() {
    const issues = [];
    if (n < 2) issues.push(`Need at least 2 participants (have ${n}).`);
    tiers.forEach(t => {
      if (t.teams.length < n) {
        issues.push(`${t.label} has ${t.teams.length} teams but needs ${n}.`);
      }
    });
    if (issues.length === 0) {
      validationEl.innerHTML = `<p style="color:var(--green);font-size:13px;">✓ Ready to draw ${n} participants.</p>`;
      drawBtn.disabled = false;
    } else {
      validationEl.innerHTML = issues.map(i => `<p style="color:var(--warning);font-size:13px;">⚠ ${i}</p>`).join("");
      drawBtn.disabled = true;
    }
  }

  const drawBtn = el("button", "btn-primary");
  drawBtn.style.width = "100%";
  drawBtn.style.fontSize = "22px";
  drawBtn.style.padding = "16px";
  drawBtn.style.letterSpacing = "2px";
  drawBtn.textContent = "RUN THE DRAW";

  drawBtn.addEventListener("click", async () => {
    if (!confirm(`Run the draw for ${n} participants? This cannot be undone.`)) return;
    const { runDraw } = await import("./draw.js");
    drawBtn.disabled = true;
    drawBtn.textContent = "Drawing...";
    try {
      await runDraw(participants, poolData.tiers);
      drawBtn.textContent = "Draw complete!";
      // Reload admin panel to show locked state
      const { renderAdmin } = await import("./admin.js");
      const container = document.getElementById("tab-admin");
      container.innerHTML = "";
      renderAdmin(container);
    } catch (err) {
      console.error(err);
      drawBtn.textContent = "Error — try again";
      drawBtn.disabled = false;
    }
  });

  validate();
  section.appendChild(validationEl);
  section.appendChild(drawBtn);
  container.appendChild(section);
}

// ── Utility ──────────────────────────────────────────────────────────────────
function el(tag, className = "") {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
```

- [ ] **Step 2: Enable Firestore in Firebase Console**

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → `fifapot` project
2. Firestore Database → Create database → **Start in production mode** → Region: `us-central1`
3. Authentication → Sign-in method → **Email/Password** → Enable → Save

- [ ] **Step 3: Set Firestore security rules**

In Firebase Console → Firestore → Rules tab, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null
          && request.auth.token.email == "usama@brandesign.co.za";
    }

    function isSignedIn() {
      return request.auth != null;
    }

    match /pool/{doc} {
      allow read: if isSignedIn();
      allow write: if isAdmin();

      match /participants/{participantId} {
        allow read: if isSignedIn();
        allow write: if isAdmin();
      }
    }
  }
}
```

Click **Publish**.

- [ ] **Step 4: Test admin tab in browser**

Sign in as `usama@brandesign.co.za` → click Admin tab.
- Should see "Admin Panel" with an empty participant list and the tier editor showing all 48 teams grouped by tier.
- Add 2–3 test participants.
- Move a team between tiers and click "Save Tiers" — verify in Firebase Console → Firestore that `/pool/main` doc exists with updated tiers.

---

## Task 5: Draw system

**Files:**
- Create: `js/draw.js`

- [ ] **Step 1: Create js/draw.js**

```js
// js/draw.js
import { db } from "./config.js";
import {
  doc, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

function fisherYates(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function runDraw(participants, tiers) {
  const n = participants.length;

  // Validate
  for (const tier of tiers) {
    if (tier.teams.length < n) {
      throw new Error(`${tier.label} has only ${tier.teams.length} teams for ${n} participants.`);
    }
  }

  // Shuffle each tier's team pool and take first n
  const assignments = {}; // { participantId: { tierKey: team } }
  participants.forEach(p => { assignments[p.id] = {}; });

  for (const tier of tiers) {
    const shuffled = fisherYates(tier.teams).slice(0, n);
    participants.forEach((p, i) => {
      assignments[p.id][tier.key] = shuffled[i];
    });
  }

  // Write all participant docs + pool.drawCompleted in one batch
  const batch = writeBatch(db);

  participants.forEach((p, i) => {
    const ref = doc(db, "pool", "main", "participants", p.id);
    batch.update(ref, {
      teams: assignments[p.id],
      drawOrder: i + 1
    });
  });

  const poolRef = doc(db, "pool", "main");
  batch.update(poolRef, {
    drawCompleted: true,
    drawDate: serverTimestamp()
  });

  await batch.commit();
}
```

- [ ] **Step 2: Test the draw end-to-end**

1. In the Admin tab, make sure you have at least 2 participants added.
2. Click "RUN THE DRAW".
3. After completion, check Firebase Console → Firestore → `/pool/main/participants/` — each document should have a `teams` field with one team per tier.
4. The Admin tab should now show "Draw completed" in locked state.

---

## Task 6: Pool view

**Files:**
- Create: `js/pool.js`

- [ ] **Step 1: Create js/pool.js**

```js
// js/pool.js
import { db } from "./config.js";
import {
  doc, getDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

export async function renderPool(container) {
  container.innerHTML = `<div class="loading">Loading pool...</div>`;

  const [poolSnap, partsSnap] = await Promise.all([
    getDoc(doc(db, "pool", "main")),
    getDocs(collection(db, "pool", "main", "participants"))
  ]);

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

  // Eliminated teams set for quick lookup
  const eliminatedSet = new Set(
    (pool.eliminatedTeams || []).map(t => t.name.toLowerCase())
  );

  // Tier label map
  const tierLabel = {};
  (pool.tiers || []).forEach(t => { tierLabel[t.key] = t; });

  // Participant cards
  participants.forEach(p => {
    const card = document.createElement("div");
    card.className = "participant-card";

    const allTeams = Object.values(p.teams || {});
    const alive = allTeams.filter(t => !eliminatedSet.has(t.name.toLowerCase()));
    const isOut = alive.length === 0 && allTeams.length > 0;

    card.innerHTML = `
      <div class="participant-name" style="${isOut ? 'opacity:0.4;text-decoration:line-through;' : ''}">
        ${p.name}
        ${isOut ? '<span style="font-family:Outfit,sans-serif;font-size:12px;color:var(--error);margin-left:8px;">ELIMINATED</span>' : ""}
      </div>`;

    const teamsEl = document.createElement("div");
    teamsEl.className = "participant-teams";

    const tierOrder = ["big", "smaller", "underdog"];
    tierOrder.forEach(key => {
      const team = p.teams?.[key];
      if (!team) return;
      const tier = tierLabel[key];
      const isElim = eliminatedSet.has(team.name.toLowerCase());
      const chip = document.createElement("span");
      chip.className = `team-chip ${key}${isElim ? " eliminated" : ""}`;
      chip.innerHTML = `${team.flag} ${team.name}`;
      if (tier) chip.title = tier.label;
      teamsEl.appendChild(chip);
    });

    card.appendChild(teamsEl);
    container.appendChild(card);
  });
}
```

- [ ] **Step 2: Verify pool tab**

Click the Pool tab. After the draw has been run you should see all participant cards, each with 3 team chips (gold/silver/bronze coloured). Eliminated teams show struck-through.

---

## Task 7: Match Board

**Files:**
- Create: `js/matches.js`

- [ ] **Step 1: Create js/matches.js**

```js
// js/matches.js
import { db } from "./config.js";
import {
  doc, getDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { teamMatches } from "./config.js";

const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
let pollInterval = null;

export async function renderMatches(container) {
  container.innerHTML = `<div class="loading">Loading matches...</div>`;

  // Load pool teams for highlighting
  const poolTeams = await loadPoolTeams();

  await fetchAndRender(container, poolTeams);

  // Auto-refresh every 60s
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => fetchAndRender(container, poolTeams), 60000);
}

async function loadPoolTeams() {
  // Returns array of { participantName, tierKey, team: {name, flag} }
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
  } catch (err) {
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

  // Sort: live first, then upcoming, then completed
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

    // Cross-reference pool teams
    const homePool = poolTeams.filter(pt => teamMatches(home?.team?.displayName || "", pt.team.name));
    const awayPool = poolTeams.filter(pt => teamMatches(away?.team?.displayName || "", pt.team.name));

    const card = document.createElement("div");
    card.className = "match-card";

    const statusLine = isLive
      ? `<span class="match-status-live"><span class="live-dot"></span>LIVE · ${detail}</span>`
      : isFinal
      ? `<span class="match-status-final">FT</span>`
      : `<span class="match-status-sched">${formatKickoff(event.date)}</span>`;

    const scoreStr = isFinal || isLive
      ? `<span class="match-score">${home?.score ?? 0} – ${away?.score ?? 0}</span>`
      : `<span style="color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:12px;">vs</span>`;

    const highlightLine = [...homePool, ...awayPool].length > 0
      ? `<div class="pool-highlight">${[...homePool, ...awayPool].map(pt =>
          `${pt.participantName}'s ${tierIcon(pt.tierKey)} team`).join(" · ")}</div>`
      : "";

    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:1px;">${statusLine}</div>
        ${highlightLine ? '<span style="font-size:10px;color:var(--green);font-family:\'IBM Plex Mono\',monospace;letter-spacing:1px;">POOL TEAMS</span>' : ""}
      </div>
      <div class="match-teams">
        <span>${home?.team?.flag || ""} ${home?.team?.displayName || "TBC"}</span>
        ${scoreStr}
        <span>${away?.team?.displayName || "TBC"} ${away?.team?.flag || ""}</span>
      </div>
      ${highlightLine}`;

    container.appendChild(card);
  });

  // Refresh timestamp
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
```

- [ ] **Step 2: Test matches tab**

Click the Matches tab. Before June 11 you'll see "No matches scheduled today." This is expected. The ESPN endpoint goes live with match data from tournament start.

---

## Task 8: Pot Tracker

**Files:**
- Create: `js/pot.js`

- [ ] **Step 1: Create js/pot.js**

```js
// js/pot.js
import { db } from "./config.js";
import {
  doc, getDoc, collection, getDocs,
  updateDoc, arrayUnion, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

export async function renderPot(container, isAdmin) {
  container.innerHTML = `<div class="loading">Loading pot...</div>`;

  const [poolSnap, partsSnap] = await Promise.all([
    getDoc(doc(db, "pool", "main")),
    getDocs(collection(db, "pool", "main", "participants"))
  ]);

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

  const eliminated = pool.eliminatedTeams || [];
  const eliminatedNames = new Set(eliminated.map(t => t.name.toLowerCase()));
  const potTotal = pool.buyIn * participants.length;
  const finalStandings = pool.finalStandings || { champion: null, runnerUp: null, thirdPlace: null };

  // ── Pot summary ─────────────────────────────────────────────────────────────
  const potCard = card();
  potCard.innerHTML = `
    <div class="section-header">Total Pot</div>
    <div class="pot-total">R${potTotal}</div>
    <div style="color:var(--muted);font-size:13px;margin-top:4px;">${participants.length} participants × R${pool.buyIn}</div>`;
  container.appendChild(potCard);

  // ── Payout projections ───────────────────────────────────────────────────────
  const payoutCard = card();
  payoutCard.style.marginTop = "12px";

  if (finalStandings.champion) {
    // Final payouts known
    payoutCard.innerHTML = `<div class="section-header">Final Payouts</div>`;
    [
      { label: "🥇 Champion",   key: "champion",   pct: 0.60 },
      { label: "🥈 Runner-Up",  key: "runnerUp",   pct: 0.25 },
      { label: "🥉 Third Place",key: "thirdPlace",  pct: 0.15 },
    ].forEach(({ label, key, pct }) => {
      const standing = finalStandings[key];
      const row = document.createElement("div");
      row.className = "payout-row";
      row.innerHTML = `
        <span>${label} ${standing ? `${standing.flag} ${standing.teamName}` : "—"}</span>
        <span style="text-align:right;">
          <strong style="color:var(--green)">R${Math.round(potTotal * pct)}</strong>
          <span style="color:var(--muted);font-size:12px;display:block;">${standing?.participantName || "—"}</span>
        </span>`;
      payoutCard.appendChild(row);
    });
  } else {
    // Projected payouts
    payoutCard.innerHTML = `<div class="section-header">Projected Payouts</div>`;
    [
      { label: "🥇 Champion",   pct: 0.60 },
      { label: "🥈 Runner-Up",  pct: 0.25 },
      { label: "🥉 Third Place",pct: 0.15 },
    ].forEach(({ label, pct }) => {
      const row = document.createElement("div");
      row.className = "payout-row";
      row.innerHTML = `
        <span>${label}</span>
        <span style="color:var(--green);font-weight:600;">R${Math.round(potTotal * pct)}</span>`;
      payoutCard.appendChild(row);
    });
  }
  container.appendChild(payoutCard);

  // ── Participants + elimination status ────────────────────────────────────────
  const standingsCard = card();
  standingsCard.style.marginTop = "12px";
  standingsCard.innerHTML = `<div class="section-header">Standings</div>`;

  participants.forEach(p => {
    const teams = Object.entries(p.teams || {}).map(([key, t]) => ({ key, ...t }));
    const aliveTeams = teams.filter(t => !eliminatedNames.has(t.name.toLowerCase()));
    const isOut = teams.length > 0 && aliveTeams.length === 0;

    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:flex-start;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);gap:10px;";
    row.innerHTML = `
      <div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1px;${isOut ? 'opacity:0.4;text-decoration:line-through;' : ''}">${p.name}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:5px;">
          ${["big","smaller","underdog"].map(key => {
            const t = p.teams?.[key];
            if (!t) return "";
            const elim = eliminatedNames.has(t.name.toLowerCase());
            return `<span class="team-chip ${key}${elim ? " eliminated" : ""}">${t.flag} ${t.name}</span>`;
          }).join("")}
        </div>
      </div>
      <div style="color:${isOut ? "var(--error)" : "var(--green)"};font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:1px;white-space:nowrap;margin-top:4px;">
        ${isOut ? "OUT" : `${aliveTeams.length}/3 alive`}
      </div>`;
    standingsCard.appendChild(row);
  });

  container.appendChild(standingsCard);

  // ── Admin: elimination controls ──────────────────────────────────────────────
  if (isAdmin) {
    renderEliminationPanel(container, participants, eliminated, eliminatedNames, pool);
    renderFinalStandingsPanel(container, participants, pool, potTotal);
  }
}

function renderEliminationPanel(container, participants, eliminated, eliminatedNames, pool) {
  const panel = card();
  panel.style.marginTop = "12px";
  panel.innerHTML = `<div class="section-header">Mark Team Eliminated</div>`;

  // Build list of all assigned teams that aren't eliminated yet
  const allTeams = [];
  participants.forEach(p => {
    Object.entries(p.teams || {}).forEach(([key, team]) => {
      if (!eliminatedNames.has(team.name.toLowerCase())) {
        allTeams.push({ participantName: p.name, participantId: p.id, tierKey: key, team });
      }
    });
  });

  if (allTeams.length === 0) {
    panel.innerHTML += `<p style="color:var(--muted);font-size:13px;">All teams have been eliminated.</p>`;
  } else {
    const select = document.createElement("select");
    select.style.cssText = "background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-family:Outfit,sans-serif;font-size:14px;width:100%;outline:none;margin-bottom:10px;";
    select.innerHTML = `<option value="">Select a team...</option>`;
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
      await updateDoc(doc(db, "pool", "main"), {
        eliminatedTeams: arrayUnion({
          name:            entry.team.name,
          flag:            entry.team.flag,
          tier:            entry.tierKey,
          participantName: entry.participantName,
          eliminatedAt:    new Date().toISOString()
        })
      });
      // Reload
      const { renderPot } = await import("./pot.js");
      renderPot(container, true);
    });

    panel.appendChild(select);
    panel.appendChild(elimBtn);
  }

  container.appendChild(panel);
}

function renderFinalStandingsPanel(container, participants, pool, potTotal) {
  const finalStandings = pool.finalStandings || {};
  if (finalStandings.champion) return; // Already set

  const panel = card();
  panel.style.marginTop = "12px";
  panel.innerHTML = `<div class="section-header">Set Final Standings (end of tournament)</div>`;

  // Collect all assigned teams for dropdowns
  const allTeamOptions = [];
  participants.forEach(p => {
    Object.entries(p.teams || {}).forEach(([key, team]) => {
      allTeamOptions.push({ participantName: p.name, tierKey: key, team });
    });
  });

  function makeSelect(id, label) {
    const wrapper = document.createElement("div");
    wrapper.style.marginBottom = "10px";
    wrapper.innerHTML = `<label style="color:var(--muted);font-size:12px;display:block;margin-bottom:4px;">${label}</label>`;
    const sel = document.createElement("select");
    sel.id = id;
    sel.style.cssText = "background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-family:Outfit,sans-serif;font-size:14px;width:100%;outline:none;";
    sel.innerHTML = `<option value="">Select team...</option>`;
    allTeamOptions.forEach((entry, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = `${entry.team.flag} ${entry.team.name} (${entry.participantName})`;
      sel.appendChild(opt);
    });
    wrapper.appendChild(sel);
    return wrapper;
  }

  panel.appendChild(makeSelect("standing-champion",   "🥇 World Cup Champion"));
  panel.appendChild(makeSelect("standing-runnerup",   "🥈 Runner-Up"));
  panel.appendChild(makeSelect("standing-third",      "🥉 Third Place"));

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

    const mk = (entry) => ({
      teamName:        entry.team.name,
      flag:            entry.team.flag,
      participantName: entry.participantName
    });

    await updateDoc(doc(db, "pool", "main"), {
      "finalStandings.champion":  mk(allTeamOptions[c]),
      "finalStandings.runnerUp":  mk(allTeamOptions[ru]),
      "finalStandings.thirdPlace":mk(allTeamOptions[tp])
    });

    const { renderPot } = await import("./pot.js");
    renderPot(container, true);
  });

  panel.appendChild(saveBtn);
  container.appendChild(panel);
}

function card() {
  const d = document.createElement("div");
  d.className = "card";
  return d;
}
```

- [ ] **Step 2: Test pot tab**

After running the draw, click the Pot tab. You should see:
- Total pot: R100 × N participants
- Projected payouts (R60/R25/R15 for 1 participant, scales with N)
- All participants with their teams
- As admin: a dropdown to mark teams as eliminated, final standings panel

---

## Task 9: GitHub Pages deploy

- [ ] **Step 1: Add GitHub Pages domain to Firebase authorized domains**

Firebase Console → Authentication → Settings → Authorized domains → Add domain:
```
usama147.github.io
```

- [ ] **Step 2: Create GitHub repo and push**

```bash
cd "/Users/usamagierdien/Desktop/Fifa Pot"
git init
git add index.html css/ js/
git commit -m "feat: initial FifaPot app"
git branch -M main
git remote add origin https://github.com/usama147/fifa-pot.git
git push -u origin main
```

- [ ] **Step 3: Enable GitHub Pages**

On GitHub: repo → Settings → Pages → Source: **Deploy from branch** → Branch: `main` / `/ (root)` → Save.

Wait ~2 minutes. The app will be live at:
```
https://usama147.github.io/fifa-pot/
```

- [ ] **Step 4: Verify live deployment**

Open `https://usama147.github.io/fifa-pot/` in an incognito window.
1. Auth screen loads.
2. Create an account with a test email.
3. Pool, Matches, Pot tabs all render without errors.
4. Sign in as `usama@brandesign.co.za` → Admin tab visible.

---

## Self-Review

**Spec coverage:**
- ✅ Email/password auth (login, signup, forgot password)
- ✅ Admin = `usama@brandesign.co.za` only — hardcoded in security rules + `config.js`
- ✅ Viewers can sign up and see pool data
- ✅ Admin adds participants + runs draw
- ✅ Draw locked after run
- ✅ Admin edits teams/tiers before draw
- ✅ Pool view: all participants + their 3 teams
- ✅ Match Board: ESPN API, 60s refresh, pool team highlighting
- ✅ Pot Tracker: elimination marking, pot total, projected payouts, final standings
- ✅ R100 flat buy-in (no per-tier elimination cost)
- ✅ GitHub Pages deploy
- ✅ 48 correct 2026 World Cup teams in right tiers (Scotland ↔ Bosnia-Herzegovina swapped)
- ✅ Design system: Bebas Neue / Outfit / IBM Plex Mono, dark theme, tier accent colours

**Placeholder scan:** No TBDs, no "handle edge cases", all code blocks are complete.

**Type consistency:** `tierKey` values are consistently `"big"`, `"smaller"`, `"underdog"` throughout all files. `pool/main` document path used consistently. `POOL_REF()` pattern used in `admin.js` only; `pot.js` and `pool.js` use inline `doc(db, "pool", "main")` — both are correct.
