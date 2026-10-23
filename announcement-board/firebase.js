/**
 * firebase.js — Firebase + Firestore entry point (verbatim setup from the brief).
 *
 * ⚠️ This module is loaded *dynamically* by js/app.js and only when
 *    `isFirebaseConfigured()` is true. That way the board still boots (in
 *    demo mode) before your keys are pasted in, and there is exactly one
 *    initialized app + one `db` for the whole site — importing `initializeApp`
 *    twice would throw "App named '[DEFAULT]' already exists".
 *
 * Everything the rest of the app needs from Firestore is re-exported here.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { firebaseConfig, ANNOUNCEMENTS_COLLECTION } from "./firebase-config/firebase-config.js";
import { emailJsConfig } from "./firebase-config/email-config.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  deleteDoc,
  updateDoc,
  getDocs,
  getDoc,
  where,
  limit,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/** The one collection this site reads/writes. */
const announcementsCol = collection(db, ANNOUNCEMENTS_COLLECTION);

export {
  app,
  db,
  firebaseConfig,
  emailJsConfig,
  ANNOUNCEMENTS_COLLECTION,
  announcementsCol,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  deleteDoc,
  updateDoc,
  getDocs,
  getDoc,
  where,
  limit,
  serverTimestamp,
  writeBatch,
};
