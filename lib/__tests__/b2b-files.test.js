/**
 * @jest-environment node
 *
 * The B2B resource lists are hardcoded paths into public/. A typo there does
 * not fail a build — it 404s the agent's download and silently drops the
 * attachment from the email to the client. So every declared path is checked
 * against the real filesystem, and against the allowlist the send route uses.
 */

import fs from 'fs';
import path from 'path';
import {
  ALL_B2B_FILES,
  B2B_RESOURCE_GROUPS,
  BRAND_DOCUMENT_FILES,
  CATALOGUE_FILES,
  EAN_FILES,
  PRICE_LIST_FILES,
  findB2BFileByPath,
} from '../b2b-files.js';
import { ALLOWED_RESOURCE_PATH_RE } from '../publicAssetHref.js';

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const CATALOGUES_DIR = path.join(PUBLIC_DIR, 'catalogues');

function cataloguePdfsOnDisk(directory = CATALOGUES_DIR) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return cataloguePdfsOnDisk(absolute);
    if (!entry.name.toLowerCase().endsWith('.pdf')) return [];
    return [`/${path.relative(PUBLIC_DIR, absolute).split(path.sep).join('/')}`];
  });
}

describe('B2B resource files', () => {
  test.each(ALL_B2B_FILES.map((f) => [f.path, f.name]))('%s exists in public/', (p) => {
    expect(fs.existsSync(path.join(PUBLIC_DIR, p))).toBe(true);
  });

  test('every declared path passes the send-route allowlist', () => {
    const rejected = ALL_B2B_FILES.filter((f) => !ALLOWED_RESOURCE_PATH_RE.test(f.path));
    expect(rejected.map((f) => f.path)).toEqual([]);
  });

  test('paths are unique, so a selection can never resolve to two files', () => {
    const paths = ALL_B2B_FILES.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  test('findB2BFileByPath resolves a declared file and rejects anything else', () => {
    const first = ALL_B2B_FILES[0];
    expect(findB2BFileByPath(first.path)).toEqual(first);
    expect(findB2BFileByPath('/Price Lists/does-not-exist.pdf')).toBeNull();
    expect(findB2BFileByPath('')).toBeNull();
  });

  test('every catalogue PDF on disk is registered and no stale record remains', () => {
    expect(CATALOGUE_FILES.map((file) => file.path).sort()).toEqual(cataloguePdfsOnDisk().sort());
    expect(CATALOGUE_FILES).toHaveLength(8);
    expect(CATALOGUE_FILES.some((file) => file.path.endsWith('/EN_LoveLab_B2B_Catalogue.pdf')))
      .toBe(false);
  });
});

describe('price lists', () => {
  test('all three lists are offered: 2025, 2026 and the October revision', () => {
    expect(PRICE_LIST_FILES.map((f) => f.name)).toEqual([
      'Pricelist_LoveLab_2025.pdf',
      'Pricelist_LoveLab_2026.pdf',
      'Pricelist_LoveLab_2026_October.pdf',
    ]);
  });

  test('the Fair Assistant picker exposes the same price lists as the home page', () => {
    const group = B2B_RESOURCE_GROUPS.find((g) => g.id === 'pricelists');
    expect(group.files).toBe(PRICE_LIST_FILES);
  });

  test('the flat lookup covers every group (packs resolve dynamically)', () => {
    expect(ALL_B2B_FILES).toEqual([
      ...CATALOGUE_FILES,
      ...PRICE_LIST_FILES,
      ...EAN_FILES,
      ...BRAND_DOCUMENT_FILES,
    ]);
  });
});
