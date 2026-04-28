import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ORDER_HIDDEN_COPY_RECIPIENTS,
  RESOURCES_HIDDEN_COPY_RECIPIENTS,
  withHiddenCopyRecipients,
} from '../../lib/email-recipients.js';

test('withHiddenCopyRecipients uses bcc, never visible cc, for audit recipients', () => {
  const payload = withHiddenCopyRecipients({
    from: 'LoveLab <elie@love-lab.com>',
    to: ['client@example.com'],
    subject: 'Documents from LoveLab',
  }, RESOURCES_HIDDEN_COPY_RECIPIENTS);

  assert.deepEqual(payload.to, ['client@example.com']);
  assert.deepEqual(payload.bcc, ['albertosaleh@gmail.com']);
  assert.equal(Object.hasOwn(payload, 'cc'), false);
});

test('order audit recipients remain hidden from customers', () => {
  const payload = withHiddenCopyRecipients({
    to: ['client@example.com'],
    reply_to: ['dionne@love-lab.com', 'elie@love-lab.com'],
  }, ORDER_HIDDEN_COPY_RECIPIENTS);

  assert.deepEqual(payload.bcc, [
    'dionne@love-lab.com',
    'elie@love-lab.com',
    'albertosaleh@gmail.com',
  ]);
  assert.equal(Object.hasOwn(payload, 'cc'), false);
});
