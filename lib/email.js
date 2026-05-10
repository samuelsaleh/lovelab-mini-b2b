const DEFAULT_SENDER = 'elie@love-lab.com';
const DEFAULT_NOTIFICATION_RECIPIENTS = ['alberto@love-lab.com', 'dionne@love-lab.com', 'elie@love-lab.com'];

export function getSenderEmail() {
  return process.env.SENDER_EMAIL || DEFAULT_SENDER;
}

// Friendly-from defaults to bare "LoveLab" — agents and clients recognize the
// brand, "B2B" is internal jargon they don't need to see in their inbox.
export function getSenderFrom(name = 'LoveLab') {
  return `${name} <${getSenderEmail()}>`;
}

export function getOrderNotificationRecipients() {
  const envVal = process.env.ORDER_NOTIFICATION_EMAILS;
  if (envVal) return envVal.split(',').map(e => e.trim()).filter(Boolean);
  return DEFAULT_NOTIFICATION_RECIPIENTS;
}
