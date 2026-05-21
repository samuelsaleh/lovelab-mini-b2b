import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireFairAdmin } from '@/lib/fair-assistant/server';

const PACKSHOT_ROOT = path.join(process.cwd(), 'public', 'Packshot Folder');
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_PER_GROUP = 60; // keep payload reasonable

// Walk a directory recursively, collecting image files. Returns an array of
// { name, url } where url is the public path (e.g. "/Packshot Folder/Cuty/.../foo.png").
async function walkImages(dir, relativeFromPublic) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.join(relativeFromPublic, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkImages(abs, rel);
      out.push(...nested);
    } else if (IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
      // URL-encode each segment but preserve the slashes.
      const urlPath = '/' + rel.split(path.sep).map(encodeURIComponent).join('/');
      out.push({ name: entry.name.replace(/\.[^.]+$/, ''), url: urlPath });
    }
    if (out.length >= MAX_PER_GROUP) break;
  }
  return out.slice(0, MAX_PER_GROUP);
}

export async function GET(request) {
  const rateLimitRes = checkRateLimit(request, { maxRequests: 30, prefix: 'fair-images' });
  if (rateLimitRes) return rateLimitRes;

  const auth = await requireFairAdmin();
  if (auth.error) return auth.error;

  let collections;
  try {
    collections = await fs.readdir(PACKSHOT_ROOT, { withFileTypes: true });
  } catch {
    return NextResponse.json({ groups: [] });
  }

  const groups = [];
  for (const entry of collections) {
    if (!entry.isDirectory()) continue;
    const collectionPath = path.join(PACKSHOT_ROOT, entry.name);
    const relFromPublic = path.join('Packshot Folder', entry.name);
    const images = await walkImages(collectionPath, relFromPublic);
    if (images.length === 0) continue;
    groups.push({
      id: entry.name.toLowerCase().replace(/\s+/g, '-'),
      label: entry.name,
      count: images.length,
      images,
    });
  }

  // Sort biggest groups first so users see Cuty / Multi / Shapy etc. up top.
  groups.sort((a, b) => b.count - a.count);

  return NextResponse.json({ groups });
}
