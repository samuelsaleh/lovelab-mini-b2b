/**
 * Shared test utilities for BuilderPage and CollectionConfig tests.
 */

import React from 'react'
import { render } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n'

/**
 * Renders a component wrapped in I18nProvider.
 */
export function renderWithI18n(ui, options = {}) {
  const Wrapper = ({ children }) => <I18nProvider>{children}</I18nProvider>
  return render(ui, { wrapper: Wrapper, ...options })
}

/**
 * Returns a minimal valid color config for testing.
 */
export function mockColorConfig(overrides = {}) {
  return {
    id: `cfg-${Math.random().toString(36).slice(2, 8)}`,
    colorName: 'White',
    caratIdx: 1,
    housing: 'Yellow',
    housingType: null,
    multiAttached: null,
    shape: null,
    size: 'M',
    cordType: null,
    thickness: null,
    qty: 1,
    priceOverride: null,
    ...overrides,
  }
}

/**
 * Returns a minimal valid builder line for testing.
 */
export function mockLine(overrides = {}) {
  return {
    uid: `line-${Math.random().toString(36).slice(2, 8)}`,
    collectionId: 'CUTY',
    colorConfigs: [],
    expanded: true,
    sameForAll: false,
    sharedSettings: {
      caratIdx: null, housing: null, housingType: null,
      multiAttached: null, shape: null, size: null, cordType: null, thickness: null, qty: null,
    },
    ...overrides,
  }
}
