'use client'

import { createContext, useContext } from 'react'

/**
 * Who is looking at IGI's portal, and therefore where its data comes from.
 *
 * IGI themselves read `/api/igi-portal/*`, running as their own user so that
 * row level security — not JavaScript — is the thing standing between two
 * companies. A LoveLab admin has no IGI policies and would see an empty portal,
 * so they read `/api/igi/preview/*` instead, which answers the same screens
 * from the same builders in lib/igi/portalViews.js.
 *
 * `readOnly` is the more important half. Reading IGI's screens is fair: Sam
 * needs to know what he is asking of another company. Typing on their behalf is
 * not — the record only stays worth something to both sides while each side
 * enters its own half. So in preview the write controls are disabled here, and
 * there is deliberately no preview equivalent of the write routes to call.
 */
const IgiPortalContext = createContext({ base: '/api/igi-portal', readOnly: false })

export function IgiPortalProvider({ base, readOnly, children }) {
  return (
    <IgiPortalContext.Provider value={{ base, readOnly }}>
      {children}
    </IgiPortalContext.Provider>
  )
}

export function useIgiPortal() {
  return useContext(IgiPortalContext)
}
