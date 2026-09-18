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
 * `preview` says which of the two is looking, and the screens use it to say so
 * out loud. It does not gate anything: an earlier version disabled every write
 * in preview, on the principle that each company should enter its own half of
 * the record. The principle is right and still holds once IGI are live — but
 * applied before they had a login it left Sam unable to test their half at all,
 * and a portal whose buttons do nothing cannot be handed over with confidence.
 *
 * So the preview writes for real, through the same actions IGI's own routes
 * call, and every row records who acted. When Sam records production it says
 * Sam recorded it — which is the truth, and is what somebody wants to find
 * later when they ask where a figure came from.
 */
const IgiPortalContext = createContext({ base: '/api/igi-portal', preview: false })

export function IgiPortalProvider({ base, preview, children }) {
  return (
    <IgiPortalContext.Provider value={{ base, preview }}>
      {children}
    </IgiPortalContext.Provider>
  )
}

export function useIgiPortal() {
  return useContext(IgiPortalContext)
}
