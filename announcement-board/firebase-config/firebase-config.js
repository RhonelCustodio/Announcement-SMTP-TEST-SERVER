/**
 * ─────────────────────────────────────────────────────────────
 *  FIREBASE WEB APP CONFIG  —  ⚠️ PASTE YOUR OWN VALUES BELOW ⚠️
 * ─────────────────────────────────────────────────────────────
 *
 *  Where to get these:
 *    1. https://console.firebase.google.com  →  Create a project
 *    2. Project overview  →  ⚙ General  →  Your apps  →  </> Web app  (add one)
 *    3. Copy the `firebaseConfig` object it shows you and paste the
 *       values into the matching keys below.
 *    4. Build  →  Firestore Database  →  Create database
 *       (start in "production mode", then apply the rules from README.md)
 *
 *  Until `projectId` is changed from the placeholder, the site automatically
 *  runs in DEMO MODE (announcements are kept in localStorage), so you can
 *  click around and style things before wiring up Firebase.
 * ─────────────────────────────────────────────────────────────
 */
export const firebaseConfig = {
  apiKey: "AIzaSyDicj2vqrIlEGTX_SHT3YDKBw02CsFpKgI",
  authDomain: "grocery-listing-2ad38.firebaseapp.com",
  projectId: "grocery-listing-2ad38",
  storageBucket: "grocery-listing-2ad38.firebasestorage.app",
  messagingSenderId: "499057133312",
  appId: "1:499057133312:web:2cfd3e3dc8c417170795e5"
};

/** Name of the Firestore collection that holds the announcements. */
export const ANNOUNCEMENTS_COLLECTION = "announcements";

/** True once the placeholders above have been replaced with real values. */
export function isFirebaseConfigured() {
  const required = ["apiKey", "authDomain", "projectId"];
  return required.every((key) => {
    const value = firebaseConfig[key];
    return typeof value === "string" && value.length > 0 && !value.startsWith("YOUR_");
  });
}
