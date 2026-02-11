'use client'

import { useState, useEffect } from 'react'

/**
 * React hook that returns true if viewport width < 768px.
 * Updates on window resize and orientation change.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check() // Initial check
    
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  return isMobile
}

/**
 * React hook that returns true if viewport width >= 768 and < 1024.
 */
export function useIsTablet() {
  const [isTablet, setIsTablet] = useState(false)

  useEffect(() => {
    const check = () => setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024)
    check()
    
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  return isTablet
}
