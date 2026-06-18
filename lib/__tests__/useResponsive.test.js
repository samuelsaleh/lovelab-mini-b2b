/**
 * useResponsive — the single breakpoint hook that drives the entire
 * mobile/iPad overhaul (sidebar drawers, card-vs-table switches, stacked
 * grids). Every phase depends on it returning the right flags, so the
 * iPhone (390) / iPad portrait (820) / desktop (1280) boundaries are pinned.
 *
 * Breakpoints:
 *   mobile  : < 768
 *   tablet  : 768 – 1023
 *   desktop : >= 1024
 *   compact : mobile || tablet  (< 1024)
 */

import { renderHook } from '@testing-library/react'
import { useResponsive } from '../useIsMobile'

function setWidth(w) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w })
}

describe('useResponsive — breakpoint flags', () => {
  it('iPhone (390px) → mobile + compact', () => {
    setWidth(390)
    const { result } = renderHook(() => useResponsive())
    expect(result.current).toEqual({ isMobile: true, isTablet: false, isDesktop: false, isCompact: true })
  })

  it('iPad portrait (820px) → tablet + compact (NOT desktop)', () => {
    setWidth(820)
    const { result } = renderHook(() => useResponsive())
    expect(result.current).toEqual({ isMobile: false, isTablet: true, isDesktop: false, isCompact: true })
  })

  it('iPad landscape / small laptop boundary (1024px) → desktop, not compact', () => {
    setWidth(1024)
    const { result } = renderHook(() => useResponsive())
    expect(result.current).toEqual({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false })
  })

  it('desktop (1280px) → desktop only', () => {
    setWidth(1280)
    const { result } = renderHook(() => useResponsive())
    expect(result.current).toEqual({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false })
  })

  it('767/768 boundary is handled (767 = mobile, 768 = tablet)', () => {
    setWidth(767)
    const a = renderHook(() => useResponsive())
    expect(a.result.current.isMobile).toBe(true)
    expect(a.result.current.isTablet).toBe(false)

    setWidth(768)
    const b = renderHook(() => useResponsive())
    expect(b.result.current.isMobile).toBe(false)
    expect(b.result.current.isTablet).toBe(true)
  })
})
