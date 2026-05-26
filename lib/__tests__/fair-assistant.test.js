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
