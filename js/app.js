// js/app.js
import { login, signup, logout, sendReset, onAuthChange } from "./auth.js";
import { ADMIN_EMAIL } from "./config.js";
import { initPresence, cleanupPresence } from "./presence.js";

// ── DOM refs ─────────────────────────────────────────────────────────────────
const authScreen = document.getElementById("auth-screen");
const appEl      = document.getElementById("app");
const loginForm  = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const forgotForm = document.getElementById("forgot-form");

// ── Auth form switching (animated) ───────────────────────────────────────────
function showAuthForm(name) {
  const target  = { login: loginForm, signup: signupForm, forgot: forgotForm }[name];
  const current = [loginForm, signupForm, forgotForm].find(f => f.style.display !== "none");

  if (current && current !== target) {
    gsap.to(current, {
      duration: 0.18, opacity: 0, y: -8,
      onComplete: () => {
        current.style.display = "none";
        gsap.set(current, { clearProps: "opacity,y" });
        target.style.display = "";
        gsap.from(target, { duration: 0.28, opacity: 0, y: 10, ease: "power2.out" });
      }
    });
  } else {
    loginForm.style.display  = name === "login"  ? "" : "none";
    signupForm.style.display = name === "signup" ? "" : "none";
    forgotForm.style.display = name === "forgot" ? "" : "none";
  }
}

document.getElementById("show-signup").addEventListener("click",  () => showAuthForm("signup"));
document.getElementById("show-forgot").addEventListener("click",  () => showAuthForm("forgot"));
document.getElementById("show-login").addEventListener("click",   () => showAuthForm("login"));
document.getElementById("show-login-2").addEventListener("click", () => showAuthForm("login"));

// ── Login ─────────────────────────────────────────────────────────────────────
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

// ── Signup ────────────────────────────────────────────────────────────────────
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

// ── Forgot password ───────────────────────────────────────────────────────────
forgotForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email  = document.getElementById("forgot-email").value.trim();
  const errEl  = document.getElementById("forgot-error");
  const succEl = document.getElementById("forgot-success");
  errEl.textContent = ""; succEl.textContent = "";
  try {
    await sendReset(email);
    succEl.textContent = "Reset email sent — check your inbox.";
  } catch (err) {
    errEl.textContent = friendlyAuthError(err.code);
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────
document.getElementById("logout-btn").addEventListener("click", () => logout());

// ── Auth state listener ───────────────────────────────────────────────────────
let tabsInitialised = false;
let appHasBeenShown = false;

onAuthChange((user) => {
  if (user) {
    const isAdmin   = user.email === ADMIN_EMAIL;
    const adminBtn  = document.getElementById("admin-tab-btn");
    const playersBtn = document.getElementById("players-tab-btn");
    document.getElementById("user-email-display").textContent = user.email;
    adminBtn.style.display   = isAdmin ? "" : "none";
    playersBtn.style.display = "";
    initPresence(user);

    // auth → app transition
    gsap.to(authScreen, {
      duration: 0.22, opacity: 0,
      onComplete: () => {
        authScreen.style.display = "none";
        gsap.set(authScreen, { clearProps: "opacity" });
        appEl.style.display = "";
        appHasBeenShown = true;

        // Cascade entrance
        const tl = gsap.timeline();
        tl.from(appEl,         { duration: 0.35, opacity: 0, ease: "power2.out" })
          .from("#app-header", { duration: 0.35, y: -20, opacity: 0, ease: "power3.out" }, "<0.04")
          .from("#tab-nav",    { duration: 0.35, y: -12, opacity: 0, ease: "power3.out" }, "<0.06")
          .from("main",        { duration: 0.4,  opacity: 0, y: 16,  ease: "power2.out" }, "<0.08")
          .call(() => initTabs(isAdmin));
      }
    });

  } else {
    cleanupPresence();
    if (appHasBeenShown) {
      // app → auth (logout)
      gsap.to(appEl, {
        duration: 0.22, opacity: 0,
        onComplete: () => {
          appEl.style.display = "none";
          gsap.set(appEl, { clearProps: "opacity" });
          tabsInitialised = false;
          clearAuthForms();
          authScreen.style.display = "";
          authScreen.style.opacity = "";
          gsap.from(".auth-card", { duration: 0.55, y: 32, opacity: 0, ease: "power3.out" });
          showAuthForm("login");
        }
      });
    } else {
      // initial page load, no user
      clearAuthForms();
      authScreen.style.opacity = "";
      gsap.set(".auth-card", { opacity: 0, y: 40 });
      gsap.to(".auth-card",  { duration: 0.7, opacity: 1, y: 0, ease: "power3.out", delay: 0.1 });
    }
  }
});

function clearAuthForms() {
  ["login-email","login-password","signup-name","signup-email","signup-password","forgot-email"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  ["login-error","signup-error","forgot-error","forgot-success"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });
  loginForm.querySelector("button[type=submit]").disabled = false;
  signupForm.querySelector("button[type=submit]").disabled = false;
}

// ── Tab navigation ─────────────────────────────────────────────────────────────
function initTabs(isAdmin) {
  if (tabsInitialised) return;
  tabsInitialised = true;

  const tabBtns  = document.querySelectorAll(".tab-btn");
  const tabViews = document.querySelectorAll(".tab-view");
  const tabNav   = document.getElementById("tab-nav");

  // ── Sliding indicator bar ───────────────────────────────────────────────────
  const indicator = document.createElement("div");
  indicator.id = "tab-indicator";
  tabNav.appendChild(indicator);

  let indicatorReady = false;

  function positionIndicator(btn, animate) {
    const navRect = tabNav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    if (btnRect.width === 0) return; // not laid out yet
    gsap.to(indicator, {
      duration: animate ? 0.32 : 0,
      x: btnRect.left - navRect.left,
      width: btnRect.width,
      ease: "power3.out"
    });
    indicatorReady = true;
  }

  // Position indicator after entrance animation settles
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const activeBtn = tabNav.querySelector(".tab-btn.active");
    if (activeBtn) positionIndicator(activeBtn, false);
  }));

  // ── Card stagger via MutationObserver ───────────────────────────────────────
  tabViews.forEach(view => {
    let debounce = null;
    new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const cards = [...view.querySelectorAll(
          ".card, .participant-card, .match-card"
        )].filter(c => !c.dataset.ga);

        if (cards.length === 0) return;
        cards.forEach(c => (c.dataset.ga = "1"));

        gsap.from(cards, {
          duration: 0.35,
          opacity: 0,
          y: 12,
          stagger: { amount: Math.min(0.25, cards.length * 0.045), from: "start" },
          ease: "power2.out",
          clearProps: "opacity,y"
        });
      }, 70);
    }).observe(view, { childList: true, subtree: true });
  });

  // ── Tab click handler ───────────────────────────────────────────────────────
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const target      = btn.dataset.tab;
      const currentView = document.querySelector(".tab-view.active");
      const newView     = document.getElementById(`tab-${target}`);

      if (currentView === newView) return;

      tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === target));
      positionIndicator(btn, true);

      if (currentView) {
        gsap.to(currentView, {
          duration: 0.16, opacity: 0,
          onComplete: () => {
            tabViews.forEach(v => {
              const show = v.id === `tab-${target}`;
              v.style.display = show ? "" : "none";
              v.classList.toggle("active", show);
              if (show) gsap.set(v, { clearProps: "opacity" });
            });
            gsap.from(newView, { duration: 0.3, opacity: 0, y: 14, ease: "power2.out" });
            onTabActivated(target, isAdmin);
          }
        });
      } else {
        newView.style.display = "";
        newView.classList.add("active");
        gsap.from(newView, { duration: 0.3, opacity: 0, y: 14, ease: "power2.out" });
        onTabActivated(target, isAdmin);
      }
    });
  });

  // Load default tab
  const poolView = document.getElementById("tab-pool");
  gsap.from(poolView, { duration: 0.35, opacity: 0, y: 16, ease: "power2.out", delay: 0.22 });
  onTabActivated("pool", isAdmin);
}

// ── Tab content loader ────────────────────────────────────────────────────────
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
  } else if (tab === "standings") {
    const { renderStandings } = await import("./standings.js");
    renderStandings(document.getElementById("tab-standings"), isAdmin);
  } else if (tab === "bracket") {
    const { renderBracket } = await import("./bracket.js");
    renderBracket(document.getElementById("tab-bracket"));
  } else if (tab === "players") {
    const { renderPlayers } = await import("./players.js");
    renderPlayers(document.getElementById("tab-players"));
  } else if (tab === "admin" && isAdmin) {
    const { renderAdmin } = await import("./admin.js");
    renderAdmin(document.getElementById("tab-admin"));
  }
}

// ── Error messages ────────────────────────────────────────────────────────────
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
