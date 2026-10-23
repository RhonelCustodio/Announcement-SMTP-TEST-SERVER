/**
 * Branding + lightweight admin gate.
 * Everything here is public (it ships to the browser as-is), so the PIN is a
 * "hide the buttons from normal visitors" measure, NOT real security.
 * Real security = Firestore rules (see README.md §4) + Firebase Auth.
 */
export const siteConfig = {
  orgName: "Student Council",
  boardTitle: "Announcement Board",
  tagline: "All official notices — pinned here first.",
  footerNote: "Posted announcements are emailed to the office automatically.",

  /** PIN required to open the admin panel. Change this! */
  adminPin: "admin1234",

  /** Session lasts this long after unlock (minutes). */
  adminSessionMinutes: 60,

  /** Category chips + dropdown. Each maps to a pushpin colour. */
  categories: [
    { id: "general", label: "General", color: "#e8dcc3" },
    { id: "event", label: "Event", color: "#dbeade" },
    { id: "urgent", label: "Urgent", color: "#f7d9d4" },
    { id: "deadline", label: "Deadline", color: "#fdecc8" },
    { id: "lostfound", label: "Lost & Found", color: "#dfe6f5" },
    { id: "closing", label: "Store Closing", color: "#e9e2f2" },
  ],

  priorities: [
    { id: "low", label: "Low" },
    { id: "normal", label: "Normal" },
    { id: "high", label: "High" },
    { id: "urgent", label: "Urgent" },
  ],
};

export function categoryMeta(id) {
  return siteConfig.categories.find((c) => c.id === id) || siteConfig.categories[0];
}

export function priorityMeta(id) {
  return siteConfig.priorities.find((p) => p.id === id) || siteConfig.priorities[1];
}
