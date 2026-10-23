/**
 * ─────────────────────────────────────────────────────────────
 *  EMAILJS CONFIG  —  ⚠️ PASTE YOUR OWN VALUES BELOW ⚠️
 * ─────────────────────────────────────────────────────────────
 *
 *  Where to get these (takes ~3 minutes):
 *    1. https://emailjs.com  →  sign up (free plan = 200 emails/month)
 *    2. Account  →  API Keys  →  copy your **Public Key**   → publicKey
 *       ⚠️ do NOT paste the *Private* key here, this file ships to the browser
 *    3. Email Services  →  Add new service  →  Gmail  →  connect
 *       mprvtccntlocked@gmail.com  →  copy the **Service ID**
 *    4. Email Templates  →  Create a new template  →  copy the **Template ID**
 *       and paste the template body from README.md into it
 *       (the body must use these variables:
 *        {{to_email}} {{title}} {{category}} {{priority}} {{author}}
 *        {{posted_at}} {{body}} {{link}} )
 *    5. Template  →  "To Email" field: type  {{to_email}}   (or hard-code the
 *       address below and delete the variable)
 *
 *  Leave a value as its placeholder and that step is skipped gracefully —
 *  posting still works, the app just shows "Email not sent (EmailJS not
 *  configured)" instead of blowing up.
 * ─────────────────────────────────────────────────────────────
 */
export const emailJsConfig = {
  publicKey: "pF6AWbQXGD9MJtIJk",
  serviceId: "service_rxondnn",
  templateId: "template_vjuienl",

  /** Where the "new announcement" notification is delivered. */
  recipientEmail: "mprvtccntlocked@gmail.com",

  /** Where the "from name" comes from. */
  senderName: "Announcement Board",

  /** Also email when an announcement is edited / removed. */
  notifyOnUpdate: false,
  notifyOnDelete: false,

  /** Extra CC addresses (optional). */
  cc: [],
};

/** True once the three EmailJS ids above have been filled in. */
export function isEmailJsConfigured() {
  const required = ["publicKey", "serviceId", "templateId"];
  return required.every((key) => {
    const value = emailJsConfig[key];
    return typeof value === "string" && value.length > 0 && !value.startsWith("YOUR_");
  });
}
