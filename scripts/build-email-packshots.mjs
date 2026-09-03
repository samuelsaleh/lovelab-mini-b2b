/**
 * Regenerate the email-sized packshots in public/email-packshots/.
 *
 * The outreach email used to point straight at the catalogue PNGs — 4096x4096,
 * 1-5.6 MB each, ~9.5 MB of images in every message. They are rendered in a
 * 200x200 tile, so this shipped roughly 300x more pixels than anyone sees, and
 * slow or blocked images at a fair mean the grid never appears at all.
 *
 * Run with:  node scripts/build-email-packshots.mjs
 * Requires:  python3 with Pillow (already used elsewhere in this repo's tooling)
 *
 * Keep SOURCES in sync with lib/fair-assistant/email-products.js.
 */
import { execFileSync } from 'node:child_process';

const SOURCES = {
  'cuty':          '/Packshot Folder/Cuty/Cuty RG/Cuty Single RG/Bordeaux_rose_gold_0_2ct_nylon-fyxk43.png',
  'triply':        '/Packshot Folder/Multi/Three/Three Detached/MIX/Gold_white_gold_0_15ct_nylon-qeh1d8.png',
  'riviera-eight': '/Packshot Folder/Iconix/Riviera Eight/Yellow Gold/Bordeaux_yellow_gold_0_1ct_silk-8vd823.png',
  'matchy':        '/Packshot Folder/Matchy/Pear/Pear Bezel/Matchy Pear YG/Navy_Blue_yellow_gold_0_3ct_nylon-zahvhu.png',
};

const py = `
from PIL import Image
import json, os, sys
sources = json.loads(sys.argv[1])
os.makedirs('public/email-packshots', exist_ok=True)
for slug, rel in sources.items():
    src = os.path.join('public', rel.lstrip('/'))
    im = Image.open(src)
    if im.mode in ('RGBA','LA','P'):
        im = im.convert('RGBA')
        bg = Image.new('RGB', im.size, (255,255,255))
        bg.paste(im, mask=im.split()[-1]); im = bg
    else:
        im = im.convert('RGB')
    w, h = im.size
    im = im.resize((600, max(1, round(h*600/w))), Image.LANCZOS)
    out = 'public/email-packshots/%s.jpg' % slug
    im.save(out, 'JPEG', quality=82, optimize=True, progressive=True)
    print('%-15s %6.1f KB  %s' % (slug, os.path.getsize(out)/1024, out))
`;
execFileSync('python3', ['-c', py, JSON.stringify(SOURCES)], { stdio: 'inherit' });
