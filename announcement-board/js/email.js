/**
 * email.js — EmailJS notifications for the announcement board.
 *
 * Fired after an announcement is written to Firestore *successfully*, so an
 * email never lies about a post that failed.
 *
 * Two transports, tried in order:
 *   1. official @emailjs/browser SDK (ESM from jsDelivr)
 *   2. EmailJS REST endpoint (https://api.emailjs.com/api/v1.0/email/send)
 *      — used if the CDN is blocked; no SDK needed.
 *
 * Only the Public Key goes to the browser. Never paste the Private Key here.
 */
import { emailJsConfig, isEmailJsConfigured } from "../firebase-config/email-config.js";

const EMAILJS_SDK_URL = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/+esm";
const EMAILJS_REST_URL = "https://api.emailjs.com/api/v1.0/email/send";

/** Deep link back to a single poster on the board. */
function permalink(id) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/a/${id}`;
}

function formatDate(value) {
  const ms = Number(value);
  if (!ms) return "just now";
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Template params — these are the {{curly}} placeholders your EmailJS
 * template body should contain (README.md §5 has a ready-to-paste template).
 */
export function buildTemplateParams(kind, ann) {
  return {
    to_email: emailJsConfig.recipientEmail,
    cc: (emailJsConfig.cc || []).join(","),
    subject:
      kind === "created"
        ? `📌 New announcement: ${ann.title}`
        : kind === "updated"
          ? `✏️ Announcement edited: ${ann.title}`
          : `🗑️ Announcement removed: ${ann.title}`,
    action: kind,
    title: ann.title,
    body: ann.body,
    category: ann.category,
    priority: ann.priority,
    author: ann.author || "—",
    pinned: ann.pinned ? "yes" : "no",
    event_date: ann.eventDate || "—",
    expires_at: ann.expiresAt || "—",
    posted_at: formatDate(ann.createdAt),
    link: permalink(ann.id),
    board_url: `${window.location.origin}${window.location.pathname}`,
    to_name: "Announcements desk",
  };
}

/** Should this event be emailed at all? (create always; edit/delete optional) */
function enabledFor(kind) {
  if (kind === "created") return true;
  if (kind === "updated") return Boolean(emailJsConfig.notifyOnUpdate);
  if (kind === "deleted") return Boolean(emailJsConfig.notifyOnDelete);
  return false;
}

async function sendViaSdk({ publicKey, serviceId, templateId }, params) {
  const mod = await import(/* @vite-ignore */ EMAILJS_SDK_URL);
  const emailjs = mod.default ?? mod;
  emailjs.init?.({ publicKey });
  const res = await emailjs.send(serviceId, templateId, params, { publicKey });
  return res?.status ?? res;
}

async function sendViaRest({ publicKey, serviceId, templateId }, params) {
  const res = await fetch(EMAILJS_REST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: params,
    }),
  });
  if (!res.ok) {
    const details = await res.text();
    throw new Error(
      `EmailJS REST ${res.status}${details ? `: ${details}` : ""}`
    );
  }
  return res.status;
}

/**
 * Notify the desk that an announcement changed.
 * @returns {Promise<{ok: boolean, skipped?: boolean, reason?: string}>}
 *   Never throws — a broken email config must not block posting.
 */
export async function notifyAnnouncement(kind, ann) {
  if (!enabledFor(kind)) return { ok: false, skipped: true, reason: "disabled in email-config.js" };
  if (!isEmailJsConfigured()) {
    return { ok: false, skipped: true, reason: "EmailJS not configured (placeholders)" };
  }
  const creds = emailJsConfig;
  const params = buildTemplateParams(kind, ann);
  try {
    await sendViaSdk(creds, params);
    return { ok: true, via: "emailjs-sdk", to: creds.recipientEmail };
  } catch (sdkError) {
    try {
      await sendViaRest(creds, params);
      return { ok: true, via: "emailjs-rest", to: creds.recipientEmail };
    } catch (restError) {
      console.error("[email] EmailJS failed", sdkError, restError);
      return {
        ok: false,
        reason: String(restError?.message || restError || "EmailJS request failed"),
      };
    }
  }
}
