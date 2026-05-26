import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';
// IMPORTANT: import the pre-generated manifest at module load. DO NOT use
// fs.readdir on public/Packshot Folder at runtime — Vercel's node-file-tracer
// follows fs paths and pulled the entire 3 GB packshot directory into this
// function's bundle, blowing the 250 MB serverless size limit.
// To refresh the manifest after adding new files:
//   node scripts/generate-packshot-manifest.js
import manifest from '@/lib/packshot-manifest.json';

// Friendly labels for the collection IDs the manifest uses.
const COLLECTION_LABELS = {
  CUTY:  'Cuty',
  CUBIX: 'Cubix',
  MULTI: 'Multi',
  M3:    'Multi · Three',
  M4:    'Multi · Four',
  M5:    'Multi · Five',
  MF:    'Matchy',
  SSF:   'Shapy Shine',
  SSPF:  'Shapy Sparkle',
};

const MAX_PER_GROUP = 80;

function buildGroups() {
  const groups = [];
  for (const [id, entries] of Object.entries(manifest || {})) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const images = entries.slice(0, MAX_PER_GROUP).map((e) => {
      const parts = [e.color, e.housing, e.shape, e.subgroup].filter(Boolean);
      const name = parts.length ? parts.join(' · ') : (e.url.split('/').pop()?.replace(/\.[^.]+$/, '') || 'image');
      return { name, url: e.url };
    });
    groups.push({
      id: id.toLowerCase(),
      label: COLLECTION_LABELS[id] || id,
      count: entries.length,
      images,
    });
  }
  groups.sort((a, b) => b.count - a.count);
  return groups;
}

// Compute once at module load — manifest is static.
const PRECOMPUTED_GROUPS = buildGroups();

export async function GET(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'fair-images' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  return NextResponse.json({ groups: PRECOMPUTED_GROUPS });
}
