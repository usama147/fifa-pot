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
    tabsInitialised = false;
    // Clear all form inputs (privacy)
    ["login-email","login-password","signup-name","signup-email","signup-password","forgot-email"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    // Clear messages
    ["login-error","signup-error","forgot-error","forgot-success"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = "";
    });
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
