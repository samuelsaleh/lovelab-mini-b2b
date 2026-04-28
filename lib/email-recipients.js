// Client-facing email copy recipients must stay hidden from customers.
// Resend exposes `cc` in the delivered message headers, so audit copies use bcc.
export const RESOURCES_HIDDEN_COPY_RECIPIENTS = ['albertosaleh@gmail.com'];

export const ORDER_HIDDEN_COPY_RECIPIENTS = [
  'dionne@love-lab.com',
  'elie@love-lab.com',
  'albertosaleh@gmail.com',
];

export const ORDER_REPLY_TO_RECIPIENTS = ['dionne@love-lab.com', 'elie@love-lab.com'];

export function withHiddenCopyRecipients(payload, recipients) {
  const hiddenRecipients = Array.isArray(recipients)
    ? recipients.filter(Boolean)
    : [];

  if (hiddenRecipients.length === 0) return payload;

  return {
    ...payload,
    bcc: hiddenRecipients,
  };
}
