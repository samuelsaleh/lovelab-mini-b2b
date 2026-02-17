'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Get initial mobile state - returns false during SSR, checks window on client
 */
function getInitialMobile() {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768
}

/**
 * Get initial tablet state
 */
function getInitialTablet() {
  if (typeof window === 'undefined') return false
  return window.innerWidth >= 768 && window.innerWidth < 1024
}

/**
 * React hook that returns true if viewport width < 768px.
 * Updates on window resize (debounced) and orientation change.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(getInitialMobile)

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
  const [isTablet, setIsTablet] = useState(getInitialTablet)

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
