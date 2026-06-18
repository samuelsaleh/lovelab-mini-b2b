'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * React hook that returns true if viewport width < 768px.
 * Initial state is false so server and first client render match (avoids hydration error).
 * Updates on window resize (debounced) and orientation change.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  const check = useCallback(() => {
    setIsMobile(window.innerWidth < 768)
  }, [])

  useEffect(() => {
    check() // Initial check to sync after hydration

    let timer
    const debouncedCheck = () => {
      clearTimeout(timer)
      timer = setTimeout(check, 120)
    }
    
    window.addEventListener('resize', debouncedCheck)
    // Orientation change: add small delay for iOS to settle
    const orientCheck = () => setTimeout(check, 100)
    window.addEventListener('orientationchange', orientCheck)
    
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', debouncedCheck)
      window.removeEventListener('orientationchange', orientCheck)
    }
  }, [check])

  return isMobile
}

/**
 * React hook that returns true if viewport width >= 768 and < 1024.
 */
export function useIsTablet() {
  const [isTablet, setIsTablet] = useState(false)

  const check = useCallback(() => {
    setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024)
  }, [])

  useEffect(() => {
    check()

    let timer
    const debouncedCheck = () => {
      clearTimeout(timer)
      timer = setTimeout(check, 120)
    }
    
    window.addEventListener('resize', debouncedCheck)
    const orientCheck = () => setTimeout(check, 100)
    window.addEventListener('orientationchange', orientCheck)
    
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', debouncedCheck)
      window.removeEventListener('orientationchange', orientCheck)
    }
  }, [check])

  return isTablet
}

/**
 * Unified responsive hook. Returns a stable object describing the current
 * viewport class. `isCompact` (mobile OR tablet, i.e. < 1024px) is the key
 * flag screens use to stack columns, collapse sidebars into drawers, and
 * switch wide tables to card lists on both phones and iPad portrait.
 *
 * Breakpoints:
 *   mobile  : < 768px
 *   tablet  : 768px – 1023px
 *   desktop : >= 1024px
 *
 * Initial SSR/first-render state is desktop (all false except isDesktop) so
 * server and client markup match and there is no hydration mismatch; the real
 * value is applied on mount.
 */
export function useResponsive() {
  const [state, setState] = useState({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isCompact: false,
  })

  const check = useCallback(() => {
    const w = window.innerWidth
    const isMobile = w < 768
    const isTablet = w >= 768 && w < 1024
    setState({
      isMobile,
      isTablet,
      isDesktop: w >= 1024,
      isCompact: isMobile || isTablet,
    })
  }, [])

  useEffect(() => {
    check()

    let timer
    const debouncedCheck = () => {
      clearTimeout(timer)
      timer = setTimeout(check, 120)
    }

    window.addEventListener('resize', debouncedCheck)
    const orientCheck = () => setTimeout(check, 100)
    window.addEventListener('orientationchange', orientCheck)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', debouncedCheck)
      window.removeEventListener('orientationchange', orientCheck)
    }
  }, [check])

  return state
}
