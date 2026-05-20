export async function triggerN8nCardWebhook({ driveFileId, mimeType = 'image/jpeg', batchId, imageId }) {
  const url = process.env.FAIR_N8N_WEBHOOK_URL;
  if (!url) {
    throw new Error('FAIR_N8N_WEBHOOK_URL is not configured');
  }

  const secret = process.env.FAIR_WEBHOOK_SECRET;
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['X-Fair-Auth'] = secret;

  const body = {
    body: {
      id: driveFileId,
      mimeType,
    },
    batchId,
    imageId,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`n8n webhook failed (${res.status}): ${text}`);
  }

  return res.json().catch(() => ({}));
}

export async function triggerN8nSendWebhook({ batchId }) {
  const url = process.env.FAIR_N8N_SEND_WEBHOOK_URL;
  if (!url) {
    throw new Error('FAIR_N8N_SEND_WEBHOOK_URL is not configured');
  }

  const secret = process.env.FAIR_WEBHOOK_SECRET;
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['X-Fair-Auth'] = secret;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ batchId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`n8n send webhook failed (${res.status}): ${text}`);
  }

  return res.json().catch(() => ({}));
}
