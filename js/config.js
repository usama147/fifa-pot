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

// ── API-Football (api-sports.io) ─────────────────────────────────────────────
export const API_FOOTBALL_KEY = "69018ddd7e785e47912bdd4cda1c45af";
export const STANDINGS_URL    = "https://v3.football.api-sports.io/standings?league=1&season=2026";
