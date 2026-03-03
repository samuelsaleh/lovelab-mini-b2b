/**
 * Commission calculator — evaluates agent_commission_config JSON against an order.
 *
 * Supported config types:
 *   flat:     { type: "flat", rate: 12 }
 *   tiered:   { type: "tiered", tiers: [{ upTo: 50000, rate: 10 }, { rate: 15 }] }
 *   category: { type: "category", rates: { CUBIX: 12, CUTY: 10 }, default: 8 }
 *   complex:  { type: "complex", description: "..." }  — returns null (needs human review)
 *
 * Falls back to flatRate if config is absent or unrecognised.
 *
 * @param {number} orderTotal  - Total order amount in EUR
 * @param {object|null} config - agent_commission_config JSON
 * @param {number} flatRate    - Fallback flat commission_rate (0–100)
 * @param {object} [meta]      - Optional order metadata { collections: [string], yearToDateRevenue: number }
 * @returns {{ amount: number, rate: number, source: string }}
 */
export function calculateCommission(orderTotal, config, flatRate, meta = {}) {
  const total = Number(orderTotal) || 0;

  if (!config || !config.type) {
    const rate = Number(flatRate) || 0;
    return { amount: round(total * rate / 100), rate, source: 'flat_rate' };
  }

  switch (config.type) {
    case 'flat': {
      const rate = Number(config.rate) || 0;
      return { amount: round(total * rate / 100), rate, source: 'contract_flat' };
    }

    case 'tiered': {
      const tiers = Array.isArray(config.tiers) ? config.tiers : [];
      const ytd = Number(meta?.yearToDateRevenue) || 0;
      // Find which tier the cumulative revenue falls into
      const cumulative = ytd + total;
      let applicableTier = tiers[tiers.length - 1]; // default to last tier
      for (const tier of tiers) {
        if (tier.upTo != null && cumulative <= Number(tier.upTo)) {
          applicableTier = tier;
          break;
        }
      }
      const rate = Number(applicableTier?.rate) || Number(flatRate) || 0;
      return { amount: round(total * rate / 100), rate, source: 'contract_tiered' };
    }

    case 'category': {
      // Use per-collection rate if collections metadata is available
      const collections = meta?.collections || [];
      const rates = config.rates || {};
      const defaultRate = Number(config.default) || Number(flatRate) || 0;

      if (collections.length === 0) {
        return { amount: round(total * defaultRate / 100), rate: defaultRate, source: 'contract_category_default' };
      }

      // Weighted average: each collection gets equal share of the order
      const sharePerCollection = total / collections.length;
      let totalAmount = 0;
      for (const col of collections) {
        const colRate = Number(rates[col] ?? defaultRate);
        totalAmount += sharePerCollection * colRate / 100;
      }
      const effectiveRate = total > 0 ? (totalAmount / total) * 100 : defaultRate;
      return { amount: round(totalAmount), rate: round(effectiveRate, 4), source: 'contract_category' };
    }

    case 'complex':
    default: {
      // Cannot calculate automatically — fall back to flat rate
      const rate = Number(flatRate) || 0;
      return { amount: round(total * rate / 100), rate, source: 'flat_rate_fallback' };
    }
  }
}

function round(n, decimals = 2) {
  return Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals);
}
