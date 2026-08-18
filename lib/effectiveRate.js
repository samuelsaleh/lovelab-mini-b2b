/**
 * One commission-rate rule for every screen and write path.
 *
 * A personal agent rate is an explicit override when it is greater than zero.
 * Otherwise the agent inherits the organization's default rate. Zero/null on
 * both sides means no commission is configured.
 */
export function resolveEffectiveRate(profile = {}, organization = {}) {
  const personalRate = Number(profile?.commission_rate);
  if (Number.isFinite(personalRate) && personalRate > 0) {
    return { rate: personalRate, source: 'agent' };
  }

  const organizationRate = Number(organization?.commission_rate);
  if (Number.isFinite(organizationRate) && organizationRate > 0) {
    return { rate: organizationRate, source: 'organization' };
  }

  return { rate: 0, source: 'none' };
}
