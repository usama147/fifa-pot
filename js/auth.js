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
