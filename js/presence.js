// js/presence.js
import { db } from "./config.js";
import {
  doc, setDoc, deleteDoc, collection, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const HEARTBEAT_MS = 30_000;
const STALE_MS     = 90_000; // 3× heartbeat before considered gone

let _interval = null;
let _unsub    = null;
let _uid      = null;

export function initPresence(user) {
  if (_uid === user.uid) return; // already tracking this user
  _uid = user.uid;

  const ref   = doc(db, "presence", _uid);
  const write = () => setDoc(ref, { lastSeen: Date.now() }, { merge: true });

  write();
  _interval = setInterval(write, HEARTBEAT_MS);
  window.addEventListener("beforeunload", _remove);

  // Real-time count of active sessions
  _unsub = onSnapshot(collection(db, "presence"), snap => {
    const now    = Date.now();
    const online = snap.docs.filter(d => {
      const t = d.data().lastSeen;
      return typeof t === "number" && (now - t) < STALE_MS;
    }).length;
    _render(online);
  });
}

export function cleanupPresence() {
  clearInterval(_interval); _interval = null;
  if (_unsub) { _unsub(); _unsub = null; }
  window.removeEventListener("beforeunload", _remove);
  _remove();
}

function _remove() {
  if (_uid) {
    deleteDoc(doc(db, "presence", _uid));
    _uid = null;
  }
}

function _render(count) {
  const pill  = document.getElementById("online-pill");
  const label = document.getElementById("online-count");
  if (!pill || !label) return;
  label.textContent = count;
  pill.style.opacity = "1";
}
