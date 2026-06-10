// js/auth.js
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { auth, db } from "./config.js";

export function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signup(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  // Save user profile so admin can see who has signed up
  await setDoc(doc(db, "users", cred.user.uid), {
    name: displayName,
    email,
    uid: cred.user.uid,
    joinedAt: serverTimestamp()
  });
  return cred.user;
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
