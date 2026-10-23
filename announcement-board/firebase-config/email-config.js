export const emailJsConfig = {
  publicKey: "pF6AWbQXGD9MJtIJk",
  serviceId: "service_rxondnn",
  templateId: "template_terbnak",

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
