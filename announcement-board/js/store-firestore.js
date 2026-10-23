/**
 * store-firestore.js — all reads/writes to the `announcements` collection.
 *
 * Every Firestore symbol used here comes from ../firebase.js (the snippet in
 * the brief), so there is a single initialized app for the whole site.
 *
 * Document shape (Firestore doc in `announcements/<id>`):
 * {
 *   title:      string   — headline on the poster
 *   body:       string   — the announcement text (newlines preserved)
 *   category:   string   — id from siteConfig.categories
 *   priority:   string   — low | normal | high | urgent
 *   author:     string   — who posted it (club / office / store)
 *   pinned:     boolean  — stays at the top of the board
 *   imageUrl:   string   — optional poster image (http/https)
 *   link:       string   — optional "read more" url
 *   eventDate:  string|null — ISO date (yyyy-mm-dd) shown as "When"
 *   expiresAt:  string|null — ISO date after which the notice is faded out
 *   createdAt / updatedAt: Firestore Timestamp (serverTimestamp)
 * }
 */
import {
  db,
  ANNOUNCEMENTS_COLLECTION,
  announcementsCol,
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
} from "../firebase.js";

/** Convert a Firestore Timestamp | null | Date into a JS timestamp (ms). */
function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Normalize a Firestore doc into the flat object the UI renders. */
function normalize(snapshotDoc) {
  const d = snapshotDoc.data() || {};
  const created = toMillis(d.createdAt) || Date.now();
  return {
    id: snapshotDoc.id,
    title: d.title || "(untitled announcement)",
    body: d.body || "",
    category: d.category || "general",
    priority: d.priority || "normal",
    author: d.author || "",
    pinned: Boolean(d.pinned),
    imageUrl: /^https?:\/\//i.test(d.imageUrl || "") ? d.imageUrl : "",
    link: /^https?:\/\//i.test(d.link || "") ? d.link : "",
    eventDate: d.eventDate || "",
    expiresAt: d.expiresAt || "",
    createdAt: created,
    updatedAt: toMillis(d.updatedAt),
    pending: d.createdAt === null, // serverTimestamp not resolved yet
  };
}

/**
 * Live board. Sorted client-side afterwards (pinned first, then newest) so no
 * composite index is required; only the single-field `createdAt` index that
 * Firestore creates automatically.
 */
export function subscribe(onData, onError) {
  const q = query(announcementsCol, orderBy("createdAt", "desc"), limit(300));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(normalize);
      items.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
      onData(items);
    },
    (error) => onError?.(error)
  );
}

/** Create — returns the new document id (needed for the email + permalink). */
export async function create(data) {
  const ref = await addDoc(announcementsCol, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function update(id, patch) {
  await updateDoc(doc(db, ANNOUNCEMENTS_COLLECTION, id), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
  return id;
}

/** Toggle the pushpin without touching updatedAt's siblings. */
export async function togglePinned(id, pinned) {
  return update(id, { pinned });
}

export async function remove(id) {
  await deleteDoc(doc(db, ANNOUNCEMENTS_COLLECTION, id));
  return id;
}

/** Deep-link support: #/a/<id> loads a single announcement. */
export async function getById(id) {
  const snap = await getDoc(doc(db, ANNOUNCEMENTS_COLLECTION, id));
  return snap.exists() ? normalize(snap) : null;
}

/** Server-side filter — kept for category-specific views / API reuse. */
export async function getByCategory(category, max = 50) {
  const q = query(announcementsCol, where("category", "==", category), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map(normalize);
}

/** Batch-delete every announcement older than `olderThanMs` (max 400/run). */
export async function purgeOlderThan(olderThanMs) {
  const q = query(announcementsCol, where("createdAt", "<", new Date(olderThanMs)), limit(400));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}
