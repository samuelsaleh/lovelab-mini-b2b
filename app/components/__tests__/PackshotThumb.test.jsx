import { optimizedPackshotSrc } from '../PackshotThumb';

describe('optimizedPackshotSrc', () => {
  test('routes a local packshot path through the Next image optimizer', () => {
    const src = '/Packshot%20Folder/Cubix/CUBIX%20WG%20/Black_white_gold_0_05ct_nylon-c4jp1l.png';
    const out = optimizedPackshotSrc(src, 56);
    // Must match the encoding that production accepted (5.3MB -> ~1KB):
    // encodeURIComponent of the already-%20-encoded manifest string.
    expect(out).toBe(
      `/_next/image?url=${encodeURIComponent(src)}&w=128&q=75`,
    );
    expect(out).toContain('%2FPackshot%2520Folder');
    expect(out).toContain('q=75');
  });

  test('snaps the requested width up to an allowed optimizer size', () => {
    // 40px display * 2 = 80 -> snaps up to 96
    expect(optimizedPackshotSrc('/a.png', 40)).toContain('&w=96&');
    // 56px * 2 = 112 -> snaps to 128
    expect(optimizedPackshotSrc('/a.png', 56)).toContain('&w=128&');
    // tiny size still floored at 64 -> w=64
    expect(optimizedPackshotSrc('/a.png', 10)).toContain('&w=64&');
  });

  test('leaves data URLs untouched', () => {
    const data = 'data:image/png;base64,iVBORw0KGgo=';
    expect(optimizedPackshotSrc(data, 40)).toBe(data);
  });

  test('leaves already-optimized URLs untouched (no double-wrapping)', () => {
    const already = '/_next/image?url=%2Fx.png&w=128&q=75';
    expect(optimizedPackshotSrc(already, 40)).toBe(already);
  });

  test('leaves external/absolute URLs untouched', () => {
    const ext = 'https://cdn.example.com/x.png';
    expect(optimizedPackshotSrc(ext, 40)).toBe(ext);
  });

  test('passes through nullish / non-string values', () => {
    expect(optimizedPackshotSrc(null, 40)).toBe(null);
    expect(optimizedPackshotSrc(undefined, 40)).toBe(undefined);
    expect(optimizedPackshotSrc('', 40)).toBe('');
  });
});
