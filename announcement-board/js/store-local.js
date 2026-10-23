/**
 * store-local.js — DEMO MODE. Same interface as store-firestore.js, but it
 * keeps announcements in localStorage so the board is fully clickable before
 * (or without) Firebase keys. Data lives only in this browser.
 */
const KEY = "announcement-board:demo";
const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function write(rows) {
  localStorage.setItem(KEY, JSON.stringify(rows));
  emit();
}

function emit() {
  const rows = sorted(read());
  listeners.forEach((fn) => fn(rows));
}

function sorted(rows) {
  return [...rows].sort(
    (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt - a.createdAt
  );
}

function seedIfEmpty() {
  if (read().length) return;
  const day = 86_400_000;
  const now = Date.now();
  write([
    {
      id: "demo-1",
      title: "Board is live — demo mode",
      body:
        "Nothing is wired to Firestore yet because the keys in firebase-config/firebase-config.js are still placeholders.\n\nPost, edit, pin and delete freely: everything you do here is saved in localStorage so you can check the layout. Follow README.md to connect your project — the board then reads and writes the `announcements` collection instead, no code changes needed.",
      category: "general",
      priority: "normal",
      author: "Webmaster",
      pinned: true,
      imageUrl: "",
      link: "",
      eventDate: "",
      expiresAt: "",
      createdAt: now,
      updatedAt: now,
      pending: false,
    },
    {
      id: "demo-2",
      title: "Summer Supply Sale — 3 days only",
      body:
        "Up to 40% off notebooks, pens and art sets at the main store.\nCash, GCash and bank transfer accepted. Senior citizen discount applies on all items.",
      category: "deadline",
      priority: "high",
      author: "Purchase Office",
      pinned: false,
      imageUrl: "",
      link: "",
      eventDate: new Date(now + 2 * day).toISOString().slice(0, 10),
      expiresAt: new Date(now + 5 * day).toISOString().slice(0, 10),
      createdAt: now - day,
      updatedAt: 0,
      pending: false,
    },
    {
      id: "demo-3",
      title: "Aircon servicing — store closed 9AM–1PM",
      body: "Routine maintenance on Friday morning. Chat support stays open.",
      category: "closing",
      priority: "urgent",
      author: "Facilities",
      pinned: false,
      imageUrl: "",
      link: "",
      eventDate: new Date(now + day).toISOString().slice(0, 10),
      expiresAt: "",
      createdAt: now - 2 * day,
      updatedAt: 0,
      pending: false,
    },
  ]);
}

export function subscribe(onData, onError) {
  try {
    seedIfEmpty();
  } catch (error) {
    // Private-mode Safari can throw on setItem — surface it like Firestore does.
    onError?.(error);
    return () => {};
  }
  listeners.add(onData);
  onData(sorted(read()));
  const crossTab = (e) => {
    if (e.key === KEY) listeners.forEach((fn) => fn(sorted(read())));
  };
  window.addEventListener("storage", crossTab);
  return () => {
    listeners.delete(onData);
    window.removeEventListener("storage", crossTab);
  };
}

// (onError is accepted by subscribe() for interface parity but never called:
//  localStorage can't reject.)

export async function create(data) {
  const rows = read();
  const id = `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  rows.unshift({ ...data, id, createdAt: Date.now(), updatedAt: 0, pending: false });
  write(rows);
  return id;
}

export async function update(id, patch) {
  write(read().map((row) => (row.id === id ? { ...row, ...patch, updatedAt: Date.now() } : row)));
  return id;
}

export async function togglePinned(id, pinned) {
  return update(id, { pinned });
}

export async function remove(id) {
  write(read().filter((row) => row.id !== id));
  return id;
}

export async function getById(id) {
  return read().find((row) => row.id === id) || null;
}

export async function getByCategory(category) {
  return sorted(read()).filter((row) => row.category === category);
}

export async function purgeOlderThan(olderThanMs) {
  const rows = read();
  const keep = rows.filter((row) => row.createdAt >= olderThanMs);
  write(keep);
  return rows.length - keep.length;
}
