const DEFAULT_SENDER = 'alberto@love-lab.com';
const DEFAULT_NOTIFICATION_RECIPIENTS = ['alberto@love-lab.com', 'dionne@love-lab.com'];

export function getSenderEmail() {
  return process.env.SENDER_EMAIL || DEFAULT_SENDER;
}

export function getSenderFrom(name = 'LoveLab B2B') {
  return `${name} <${getSenderEmail()}>`;
}

export function getOrderNotificationRecipients() {
  const envVal = process.env.ORDER_NOTIFICATION_EMAILS;
  if (envVal) return envVal.split(',').map(e => e.trim()).filter(Boolean);
  return DEFAULT_NOTIFICATION_RECIPIENTS;
}
