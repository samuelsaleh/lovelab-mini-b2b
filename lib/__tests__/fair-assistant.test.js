import { buildGreeting } from '@/lib/fair-assistant/greeting';
import { computeLeadHash } from '@/lib/fair-assistant/schemas';
import { renderFairOutreachEmail } from '@/lib/fair-assistant/email-shell';
import { languagesForCountry } from '@/lib/fair-assistant/languages';

describe('fair-assistant greeting', () => {
  test('uses Hi, when first name missing', () => {
    expect(buildGreeting('', 'en')).toBe('Hi,');
    expect(buildGreeting(null, 'en')).toBe('Hi,');
  });

  test('uses first name when present', () => {
    expect(buildGreeting('Marco', 'en')).toBe('Hi Marco,');
    expect(buildGreeting('Marco', 'it')).toBe('Ciao Marco,');
  });
});

describe('fair-assistant lead hash', () => {
  test('is stable for same identity', () => {
    const a = computeLeadHash({ email: 'a@b.com', firstName: 'Marco', lastName: 'Rossi', company: 'ACME' });
    const b = computeLeadHash({ email: 'a@b.com', firstName: 'Marco', lastName: 'Rossi', company: 'ACME' });
    expect(a).toBe(b);
  });
});

describe('fair-assistant languages', () => {
  test('Belgium gets French and Dutch', () => {
    expect(languagesForCountry('Belgium')).toEqual(['fr', 'nl']);
  });
});

describe('fair-assistant email shell', () => {
  test('renders branded html with product links', () => {
    const html = renderFairOutreachEmail({
      siteUrl: 'https://app.example.com',
      greeting: 'Hi,',
      headline: 'Great meeting you',
      paragraph1: 'Thank you for visiting us.',
      paragraph2: '',
      signoff: 'Alberto',
      products: [
        { label: 'CUTY', imageUrl: 'https://app.example.com/cuty.png', href: 'https://lovelab.be/collections/cuty/010' },
        { label: 'TRIPLY', imageUrl: 'https://app.example.com/triply.png', href: 'https://lovelab.be/collections/multi/three/mix' },
        { label: 'MATCHY', imageUrl: 'https://app.example.com/matchy.png', href: 'https://lovelab.be/collections/matchy/pear' },
        { label: 'CUBIX', imageUrl: 'https://app.example.com/cubix.png', href: 'https://lovelab.be/collections/cube/product' },
      ],
    });

    expect(html).toContain('lovelab.be/collections/cuty/010');
    expect(html).toContain('lovelab.be/collections/matchy/pear');
    expect(html).toContain('Hi,');
    expect(html).toContain('Great meeting you');
  });
});

describe('fair-assistant country → language routing', () => {
  test('native country names on business cards route to their own language', () => {
    // Exact strings OCR returned from real cards at the fair.
    expect(languagesForCountry('Deutschland')).toEqual(['de']);
    expect(languagesForCountry('DE')).toEqual(['de']);
    expect(languagesForCountry('Italia')).toEqual(['it']);
    expect(languagesForCountry('España')).toEqual(['es']);
    expect(languagesForCountry('Polska')).toEqual(['pl']);
    expect(languagesForCountry('Nederland')).toEqual(['nl']);
    expect(languagesForCountry('Belgique')).toEqual(['fr', 'nl']);
    expect(languagesForCountry('Suisse')).toEqual(['de', 'fr']);
    expect(languagesForCountry('日本')).toEqual(['ja']);
  });

  test('English names and blanks keep working', () => {
    expect(languagesForCountry('Germany')).toEqual(['de']);
    expect(languagesForCountry('germany')).toEqual(['de']);
    expect(languagesForCountry('')).toEqual(['en']);
    expect(languagesForCountry('Not Available')).toEqual(['en']);
    expect(languagesForCountry('Narnia')).toEqual(['en']);
  });
});

describe('fair-assistant greetings cover every supported language', () => {
  test('no language silently falls back to English', () => {
    expect(buildGreeting('Piotr', 'pl')).toBe('Dzień dobry Piotr,');
    expect(buildGreeting('Susanne', 'de')).toBe('Hallo Susanne,');
    expect(buildGreeting('Yuki', 'ja')).toBe('Yuki様');
    expect(buildGreeting('', 'pl')).toBe('Dzień dobry,');
    expect(buildGreeting('Ali', 'tr')).toBe('Merhaba Ali,');
  });
});
