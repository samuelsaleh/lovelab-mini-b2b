export const RESOURCE_EMAIL_OVERRIDE_LIMITS = {
  subject: 200,
  greeting: 200,
  body: 4000,
  signoff: 200,
};

export function validateResourceEmailOverrides(body) {
  const raw = body && typeof body === 'object' ? body : {};
  const overrides = {};

  for (const [key, limit] of Object.entries(RESOURCE_EMAIL_OVERRIDE_LIMITS)) {
    const value = raw[key];
    if (typeof value !== 'string') continue;

    if (value.length > limit) {
      return {
        ok: false,
        field: key,
        limit,
        length: value.length,
        error: `${key} is too long (max ${limit} characters)`,
      };
    }

    overrides[key] = value;
  }

  return { ok: true, overrides };
}
