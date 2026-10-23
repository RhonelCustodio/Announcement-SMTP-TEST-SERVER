/**
 * app.js — announcement board UI + Firestore glue.
 *
 * Boots in one of two modes:
 *   • FIRESTORE MODE — firebase-config/firebase-config.js is filled in.
 *     ../firebase.js (the brief's snippet) is dynamically imported and every
 *     post / edit / delete hits the `announcements` collection.
 *   • DEMO MODE — placeholders still present. Same UI, data in localStorage.
 *
 * After a *successful* write, js/email.js emails the desk through EmailJS.
 */
import { isFirebaseConfigured } from "../firebase-config/firebase-config.js";
import { emailJsConfig } from "../firebase-config/email-config.js";
import { isEmailJsConfigured } from "../firebase-config/email-config.js";
import { siteConfig, categoryMeta, priorityMeta } from "../firebase-config/site-config.js";
import { notifyAnnouncement } from "./email.js";

/* ───────────────────────────── helpers ───────────────────────────── */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Never interpolate user text into HTML unescaped. */
function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
  );
};

function safeUrl(url) {
  return /^https?:\/\//i.test(String(url || "")) ? String(url) : "";
}

function relTime(ms) {
  if (!ms) return "just now";
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function longDate(iso) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** `#/a/<id>` → the id, or "" when the URL carries no permalink. */
function idFromHash() {
  const match = location.hash.match(/^#\/a\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function isExpired(ann) {
  return Boolean(ann.expiresAt) && ann.expiresAt < todayISO();
}

/* ───────────────────────────── toasts ───────────────────────────── */

const toastHost = $("#toasts");

function toast(message, kind = "info", ttl = 5200) {
  const el = document.createElement("div");
  el.className = `toast toast--${kind}`;
  el.innerHTML = message;
  toastHost.append(el);
  const close = () => {
    el.classList.add("toast--out");
    setTimeout(() => el.remove(), 260);
  };
  el.addEventListener("click", close);
  setTimeout(close, ttl);
  return el;
}

/* ───────────────────────────── state ───────────────────────────── */

const ADMIN_KEY = "board:admin";

const state = {
  store: null,
  mode: "demo",
  items: [],
  filter: "all",
  search: "",
  showExpired: false,
  unlocked: false,
  editingId: null,
  unsubscribe: null,
  ready: false, // first snapshot received
  error: "", // last stream error, cleared by the next successful snapshot
};

function adminSessionValid() {
  try {
    const raw = sessionStorage.getItem(ADMIN_KEY);
    if (!raw) return false;
    const until = Number(JSON.parse(raw).until);
    if (Number.isFinite(until) && until > Date.now()) return true;
    sessionStorage.removeItem(ADMIN_KEY);
    return false;
  } catch {
    return false;
  }
}

function openAdmin(minutes) {
  sessionStorage.setItem(ADMIN_KEY, JSON.stringify({ until: Date.now() + minutes * 60000 }));
}

/* ───────────────────────────── boot ───────────────────────────── */

async function boot() {
  paintStaticCopy();
  buildChips();
  state.unlocked = adminSessionValid();

  if (isFirebaseConfigured()) {
    state.mode = "firestore";
    state.store = await import("./store-firestore.js");
  } else {
    state.store = await import("./store-local.js");
  }

  applyAdminUI();
  bindEvents();
  attachLiveQuery();
  handleHash();

  if (state.mode === "demo") {
    toast(
      "<strong>Demo mode.</strong> Paste your Firebase keys in " +
        "<code>firebase-config/firebase-config.js</code> to write to Firestore. " +
        "Posts are being saved in this browser only.",
      "warn",
      9000
    );
  }
  if (!isEmailJsConfigured()) {
    toast(
      "<strong>Email not wired yet.</strong> Add your EmailJS ids in " +
        "<code>firebase-config/email-config.js</code> and the desk "
        + `(${esc(emailJsConfig.recipientEmail)}) will be notified on every post.`,
      "warn",
      9000
    );
  }
}

function paintStaticCopy() {
  $("#orgName").textContent = siteConfig.orgName;
  $("#boardTitle").textContent = siteConfig.boardTitle;
  $("#tagline").textContent = siteConfig.tagline;
  $("#footerNote").textContent = siteConfig.footerNote;
  document.title = `${siteConfig.boardTitle} — ${siteConfig.orgName}`;
}

function buildChips() {
  const host = $("#chips");
  const chips = [{ id: "all", label: "Everything", color: "#efe6d2" }, ...siteConfig.categories];
  host.innerHTML = chips
    .map(
      (c) => `<button class="chip" data-cat="${c.id}" type="button">
        <span class="chip-dot" style="background:${esc(c.color)}"></span>${esc(c.label)}
      </button>`
    )
    .join("");
}

function attachLiveQuery() {
  state.unsubscribe?.();
  $("#board").hidden = true;
  $("#empty").hidden = true;
  $("#loading").hidden = false;
  state.unsubscribe = state.store.subscribe(
    (items) => {
      state.items = items;
      state.ready = true;
      state.error = "";
      render();
    },
    (error) => {
      state.ready = true;
      state.error = error?.code || error?.message || String(error);
      console.error("[board] read failed", error);
      render();
      toast(
        `<strong>${state.mode === "firestore" ? "Firestore" : "Local store"} refused the read.</strong><br>${esc(
          error?.message || error
        )}<br><span class="muted">Check the rules in README.md §4 and that the collection name matches.</span>`,
        "bad",
        12000
      );
    }
  );
}

/* ───────────────────────────── render ───────────────────────────── */

function visibleItems() {
  const needle = state.search.trim().toLowerCase();
  return state.items.filter((ann) => {
    if (state.filter !== "all" && ann.category !== state.filter) return false;
    if (!state.showExpired && isExpired(ann)) return false;
    if (!needle) return true;
    return `${ann.title} ${ann.body} ${ann.author} ${ann.category}`.toLowerCase().includes(needle);
  });
}

function render() {
  if (!state.ready) return;
  $("#loading").hidden = true;
  syncChips();
  const board = $("#board");
  const items = visibleItems();
  const expiredHidden = state.items.filter(isExpired).length;

  $("#count").textContent = `${items.length} poster${items.length === 1 ? "" : "s"}`;
  $("#expiredNote").hidden = !expiredHidden || state.showExpired;
  $("#expiredNote").textContent = `${expiredHidden} expired notice${expiredHidden === 1 ? "" : "s"} hidden`;
  renderStatus();

  if (!items.length) {
    board.innerHTML = "";
    board.hidden = true;
    $("#empty").hidden = false;
    $("#emptyTitle").textContent = state.error ? "Board unavailable" : "Nothing pinned yet";
    $("#emptyText").innerHTML = state.error
      ? `The board could not read the <code>${esc(
          state.mode === "firestore" ? "announcements collection" : "local store"
        )}</code>: <b>${esc(state.error)}</b><br /><span class="muted">Usually missing/blocked rules (README §4) or an unreachable project.</span>`
      : `No announcements match this view. Unlock <b>Admin</b> (top right) to post the first one — it lands in Firestore and an email goes to the desk.`;
    return;
  }
  $("#empty").hidden = true;
  board.hidden = false;
  board.innerHTML = items.map(cardHTML).join("");

  const fromHash = idFromHash();
  if (fromHash) highlight(fromHash);
}

function cardHTML(ann) {
  const cat = categoryMeta(ann.category);
  const pri = priorityMeta(ann.priority);
  const rot = ((hashCode(ann.id) % 7) - 3) * 0.45;
  const admin = state.unlocked;
  const urgent = ann.priority === "urgent" || ann.priority === "high";
  const when = ann.eventDate ? `<span class="meta-when">🗓 ${esc(longDate(ann.eventDate))}</span>` : "";
  const expires = ann.expiresAt
    ? `<span class="meta-exp ${isExpired(ann) ? "is-over" : ""}">⏳ ${
        isExpired(ann) ? "expired" : "until"
      } ${esc(ann.expiresAt)}</span>`
    : "";

  return `
  <article class="note ${ann.pinned ? "is-pinned" : ""} ${isExpired(ann) ? "is-expired" : ""} ${
    urgent ? "is-urgent" : ""
  }" data-id="${esc(ann.id)}" style="--rot:${rot.toFixed(2)}deg; --paper:${esc(cat.color)}">
    <span class="tack" aria-hidden="true"></span>
    <header class="note-top">
      <span class="tag">${esc(cat.label)}</span>
      ${pri.id !== "normal" ? `<span class="tag tag--pri">${esc(pri.label)}</span>` : ""}
      ${ann.pinned ? `<span class="tag tag--pin">📌 pinned</span>` : ""}
      <span class="note-time">${ann.pending ? "saving…" : esc(relTime(ann.createdAt))}</span>
    </header>
    <h2 class="note-title">${esc(ann.title)}</h2>
    ${ann.body ? `<div class="note-body">${esc(ann.body).replace(/\n/g, "<br>")}</div>` : ""}
    ${
      safeUrl(ann.imageUrl)
        ? `<div class="note-img"><img src="${esc(safeUrl(ann.imageUrl))}" alt="" loading="lazy" onerror="this.closest('.note-img').remove()"></div>`
        : ""
    }
    <footer class="note-foot">
      <span class="by">${ann.author ? esc(ann.author) : "Anonymous"}</span>
      ${when}${expires}
      ${
        safeUrl(ann.link)
          ? `<a class="more" href="${esc(safeUrl(ann.link))}" target="_blank" rel="noopener noreferrer">Details ↗</a>`
          : ""
      }
      <button class="permalink" type="button" title="Copy link to this notice">🔗</button>
    </footer>
    ${
      admin
        ? `<div class="note-admin">
             <button type="button" data-act="pin">${ann.pinned ? "Unpin" : "Pin"}</button>
             <button type="button" data-act="edit">Edit</button>
             <button type="button" data-act="dup">Duplicate</button>
             <button type="button" class="danger" data-act="del">Delete</button>
           </div>`
        : ""
    }
  </article>`;
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i += 1) h = (h << 5) - h + String(str).charCodeAt(i);
  return Math.abs(h);
}

function renderStatus() {
  const pill = $("#statusPill");
  const live = state.mode === "firestore";
  const email = isEmailJsConfigured();

  if (state.error) {
    pill.innerHTML =
      `<span class="dot dot--bad"></span>` +
      (live ? "Firestore" : "Storage") +
      ` error: <b>${esc(state.error)}</b> — ` +
      `<button class="linkbtn" id="retryBtn" type="button">retry</button>`;
    $("#retryBtn")?.addEventListener("click", () => {
      state.error = "";
      attachLiveQuery();
    });
    return;
  }

  pill.innerHTML =
    `<span class="dot ${live ? "dot--ok" : "dot--warn"}"></span>` +
    (live
      ? "Live · Firestore <code>announcements</code>"
      : "Demo mode · localStorage") +
    `<span class="sep">•</span>` +
    `<span class="dot ${email ? "dot--ok" : "dot--warn"}"></span>` +
    (email ? `EmailJS → ${esc(emailJsConfig.recipientEmail)}` : "EmailJS not configured");
}

function applyAdminUI() {
  document.body.classList.toggle("is-admin", state.unlocked);
  $("#adminBtn").innerHTML = state.unlocked ? "🔓 Admin <b>on</b>" : "🔒 Admin";
  $("#adminStrip").hidden = !state.unlocked;
}

/* ───────────────────────────── interactions ───────────────────────────── */

function bindEvents() {
  $("#chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.filter = state.filter === chip.dataset.cat ? "all" : chip.dataset.cat;
    syncChips();
    render();
  });

  $("#search").addEventListener("input", (e) => {
    state.search = e.target.value;
    render();
  });

  $("#expiredNote").addEventListener("click", () => {
    state.showExpired = true;
    render();
  });

  $("#board").addEventListener("click", onBoardClick);

  $("#adminBtn").addEventListener("click", () => {
    if (state.unlocked) {
      sessionStorage.removeItem(ADMIN_KEY);
      state.unlocked = false;
      applyAdminUI();
      render();
      toast("Admin locked.", "info", 2500);
    } else {
      openLogin();
    }
  });

  $("#newBtn").addEventListener("click", () => openComposer(null));
  $("#signoutBtn").addEventListener("click", () => $("#adminBtn").click());
  $("#purgeBtn").addEventListener("click", purgeOld);
  $("#testEmailBtn").addEventListener("click", testEmail);

  $("#composerForm").addEventListener("submit", onSubmit);
  $("#closeComposer").addEventListener("click", () => closeModal("#composer"));
  $("#closeLogin").addEventListener("click", () => closeModal("#login"));
  $("#loginForm").addEventListener("submit", onLogin);
  $$(".modal").forEach((m) => m.addEventListener("click", (e) => e.target === m && closeModal(`#${m.id}`)));
  $("#f-imageUrl").addEventListener("blur", previewImage);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal("#composer");
      closeModal("#login");
    }
    if (e.key?.toLowerCase() === "n" && state.unlocked && !$("#composer").open && !/input|textarea|select/i.test(e.target?.tagName || "")) {
      e.preventDefault();
      openComposer(null);
    }
  });

  window.addEventListener("hashchange", handleHash);
}

function syncChips() {
  $$("#chips .chip").forEach((c) => c.classList.toggle("is-on", c.dataset.cat === state.filter));
}

async function onBoardClick(e) {
  const card = e.target.closest(".note");
  if (!card) return;
  const ann = state.items.find((row) => row.id === card.dataset.id);
  if (!ann) return;

  if (e.target.closest(".permalink")) {
    const url = `${location.origin}${location.pathname}#/a/${ann.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied to this notice.", "good", 2500);
    } catch {
      prompt("Copy this link:", url);
    }
    return;
  }

  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act || !state.unlocked) return;

  if (act === "pin") {
    await run(`📌 ${ann.pinned ? "Unpinned" : "Pinned"}`, () => state.store.togglePinned(ann.id, !ann.pinned));
  }
  if (act === "edit") openComposer(ann);
  if (act === "dup") {
    const { id, createdAt, updatedAt, pending, ...data } = ann;
    await run("Duplicated", () => state.store.create({ ...data, title: `${data.title} (copy)` }));
  }
  if (act === "del") {
    if (!confirm(`Delete “${ann.title}”? This cannot be undone.`)) return;
    const ok = await run("🗑️ Deleted", () => state.store.remove(ann.id));
    if (ok) notifyAnnouncement("deleted", ann);
  }
}

/** Wrap a store mutation with error reporting; returns success. */
async function run(label, fn) {
  try {
    await fn();
    toast(`${label}.`, "good", 2600);
    return true;
  } catch (error) {
    console.error("[board]", error);
    toast(`<strong>Failed:</strong> ${esc(error?.message || error)}`, "bad", 8000);
    return false;
  }
}

function highlight(id) {
  const card = $(`.note[data-id="${CSS.escape(id)}"]`);
  if (!card) return;
  $$(".note.is-flash").forEach((n) => n.classList.remove("is-flash"));
  card.classList.add("is-flash");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function handleHash() {
  const id = idFromHash();
  if (!id) return;
  if (!state.items.some((a) => a.id === id) && state.store.getById) {
    const found = await state.store.getById(id).catch(() => null);
    if (found && !state.items.some((a) => a.id === found.id)) {
      state.items = [found, ...state.items];
      render();
    }
  }
  highlight(id);
}

/* ───────────────────────────── composer ───────────────────────────── */

function fillForm(ann) {
  const catOpts = siteConfig.categories
    .map((c) => `<option value="${c.id}">${esc(c.label)}</option>`)
    .join("");
  const priOpts = siteConfig.priorities
    .map((p) => `<option value="${p.id}">${esc(p.label)}</option>`)
    .join("");
  $("#f-category").innerHTML = catOpts;
  $("#f-priority").innerHTML = priOpts;

  $("#f-title").value = ann?.title ?? "";
  $("#f-body").value = ann?.body ?? "";
  $("#f-author").value = ann?.author ?? siteConfig.orgName;
  $("#f-category").value = ann?.category ?? "general";
  $("#f-priority").value = ann?.priority ?? "normal";
  $("#f-eventDate").value = ann?.eventDate ?? "";
  $("#f-expiresAt").value = ann?.expiresAt ?? "";
  $("#f-imageUrl").value = ann?.imageUrl ?? "";
  $("#f-link").value = ann?.link ?? "";
  $("#f-pinned").checked = Boolean(ann?.pinned);
  $("#f-notify").checked = true;
  $("#composerTitle").textContent = ann ? "Edit announcement" : "New announcement";
  $("#submitBtn").textContent = ann ? "Save changes" : "Post to board";
  previewImage();
}

function openComposer(ann) {
  state.editingId = ann?.id ?? null;
  fillForm(ann);
  $("#composer").showModal();
  setTimeout(() => $("#f-title").focus(), 60);
}

function closeModal(sel) {
  const dlg = $(sel);
  if (dlg?.open) dlg.close();
}

function previewImage() {
  const url = safeUrl($("#f-imageUrl").value.trim());
  const host = $("#imgPreview");
  host.innerHTML = url ? `<img src="${esc(url)}" alt="">` : "";
}

function collectForm() {
  return {
    title: $("#f-title").value.trim(),
    body: $("#f-body").value.trim(),
    category: $("#f-category").value,
    priority: $("#f-priority").value,
    author: $("#f-author").value.trim(),
    pinned: $("#f-pinned").checked,
    eventDate: $("#f-eventDate").value || "",
    expiresAt: $("#f-expiresAt").value || "",
    imageUrl: safeUrl($("#f-imageUrl").value.trim()),
    link: safeUrl($("#f-link").value.trim()),
  };
}

async function onSubmit(e) {
  e.preventDefault();
  const data = collectForm();
  if (!data.title || !data.body) {
    toast("A poster needs <strong>both</strong> a headline and body text.", "bad", 4000);
    return;
  }

  const submitBtn = $("#submitBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Posting…";

  const isEdit = Boolean(state.editingId);

  // Firestore queues a write while the socket is down — say so after 6s
  // instead of leaving the button spinning silently.
  const watchdog = setTimeout(() => {
    toast(
      "<strong>Still writing…</strong> Firestore has not acknowledged the commit. " +
        "Usually the tab is offline or the <code>projectId</code> in " +
        "<code>firebase-config/firebase-config.js</code> is unreachable. The write is " +
        "queued and will land when the connection recovers.",
      "warn",
      9000
    );
  }, 6000);

  try {
    let id;
    let saved;
    if (isEdit) {
      id = state.editingId;
      await state.store.update(id, data);
      saved = { ...data, id, createdAt: Date.now() };
    } else {
      id = await state.store.create(data);
      saved = { ...data, id, createdAt: Date.now() };
    }

    closeModal("#composer");
    toast(
      `<strong>${isEdit ? "Updated" : "Posted"}.</strong> Wrote to ` +
        (state.mode === "firestore" ? "Firestore ✓" : "demo storage ✓") +
        (isEdit ? "" : ` <span class="muted">· doc id <code>${esc(id)}</code></span>`),
      "good",
      5200
    );

    // 3. Only now — after the write succeeded — notify the desk by email.
    if ($("#f-notify").checked) {
      const pending = toast("📧 Emailing the desk…", "info", 4000);
      const res = await notifyAnnouncement(isEdit ? "updated" : "created", saved);
      pending.remove();
      if (res.ok) {
        toast(`📧 Email sent to <strong>${esc(emailJsConfig.recipientEmail)}</strong> via ${res.via}.`, "good", 6000);
      } else if (res.skipped) {
        toast(
          `📧 No email sent — <strong>${esc(res.reason)}</strong>. Setup steps are in README.md §5.`,
          "warn",
          9000
        );
      } else {
        toast(`📧 Email failed: ${esc(res.reason)}`, "bad", 9000);
      }
    }
  } catch (error) {
    console.error("[board] write failed", error);
    toast(
      `<strong>Could not save:</strong> ${esc(error?.message || error)}` +
        `<br><span class="muted">If it says "permission-denied", see README.md §4 (Firestore rules).</span>`,
      "bad",
      11000
    );
  } finally {
    clearTimeout(watchdog);
    submitBtn.disabled = false;
    submitBtn.textContent = isEdit ? "Save changes" : "Post to board";
  }
}

/* ───────────────────────────── admin odds & ends ───────────────────────────── */

function openLogin() {
  $("#loginError").textContent = "";
  $("#login").showModal();
  setTimeout(() => $("#pinInput").focus(), 60);
}

function onLogin(e) {
  e.preventDefault();
  const entered = $("#pinInput").value.trim();
  if (entered === String(siteConfig.adminPin)) {
    openAdmin(siteConfig.adminSessionMinutes);
    state.unlocked = true;
    applyAdminUI();
    render();
    closeModal("#login");
    $("#pinInput").value = "";
    toast("Admin unlocked — press <b>N</b> to post. 🔓", "good", 3500);
  } else {
    $("#loginError").textContent = "Wrong PIN. (It lives in firebase-config/site-config.js)";
    $("#pinInput").select();
  }
}

async function purgeOld() {
  const days = Number(prompt("Delete announcements older than how many days?", "30"));
  if (!Number.isFinite(days) || days <= 0) return;
  const cut = Date.now() - days * 86400000;
  const n = await state.store.purgeOlderThan(cut).catch((err) => {
    toast(`<strong>Purge failed:</strong> ${esc(err?.message || err)}`, "bad", 8000);
    return null;
  });
  if (n !== null) toast(`🧹 Removed ${n} announcement${n === 1 ? "" : "s"} older than ${days} days.`, "good");
}

async function testEmail() {
  const probe = {
    id: "test",
    title: "Test notification from the board",
    body: "If you can read this, EmailJS is configured correctly and the address in email-config.js is receiving mail.",
    category: "general",
    priority: "low",
    author: siteConfig.orgName,
    pinned: false,
    eventDate: "",
    expiresAt: "",
    createdAt: Date.now(),
  };
  const t = toast("📧 Sending test email…", "info", 4000);
  const res = await notifyAnnouncement("created", probe);
  t.remove();
  if (res.ok) toast(`📧 Test email sent to ${esc(emailJsConfig.recipientEmail)}.`, "good", 6000);
  else toast(`📧 ${esc(res.reason)} — finish README.md §3–§5 to enable it.`, "warn", 9000);
}

/* ───────────────────────────── go ───────────────────────────── */

boot().catch((error) => {
  console.error("[board] boot failed", error);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="fatal"><h2>Board failed to start</h2><pre>${esc(error?.stack || error)}</pre>
     <p class="muted">Most likely the Firebase CDN could not be reached, or the keys in
     firebase-config/firebase-config.js are malformed.</p></div>`
  );
});
