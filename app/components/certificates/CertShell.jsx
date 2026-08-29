'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '../AuthProvider'

/**
 * The certificate application's own chrome.
 *
 * This module is not a page inside the admin panel — it is a place you enter,
 * with its own sidebar, its own palette and its own way of naming things, so
 * that somebody spending an afternoon reconciling movements is not also
 * looking at fairs, agents and quotes. Everything here is scoped under
 * `.certapp` (see app/certificates/certificates.css) and touches nothing else.
 *
 * Both personas use it: LoveLab's seven screens and IGI's five. They differ
 * only in the nav they are handed and the name over it. The look is the same
 * on purpose — it is one tool seen from either side of the road, and it is
 * not the app either of them came from.
 *
 * Props:
 *   nav      — [{ g: 'Group name' } | { id, label, href, badge }]
 *   home     — where the logo goes, and the route that counts as the root
 *   brand    — whose space this is ("LoveLab", "IGI Antwerp")
 *   mark     — an image to use instead of the brand text, or null
 *   title    — the line under it, and the word in the top strip
 *   banner   — what the top strip says on the left
 *   status   — what the top strip says on the right (optional)
 *   exit     — { href, label } for the way out, or null (IGI has nowhere to go)
 */
export default function CertShell({ nav, home, brand, mark, title, banner, status, exit, children }) {
  const pathname = usePathname()
  const { user, profile, signOut } = useAuth()

  // The deepest href the current path sits under wins, so /visits/12 lights up
  // Visits rather than nothing.
  const activeHref = nav
    .filter((n) => n.href && (n.href === home ? pathname === home : pathname.startsWith(n.href)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <div className="certapp">
      <div className="banner">
        <b>{brand}</b>
        <span>{banner}</span>
        <span className="sp" />
        {status ? <span>{status}</span> : null}
      </div>

      <div className="app">
        <aside>
          <Link href={home} className="logo">
            {mark ? (
              // The PNG is dark artwork, so it is inverted to white for the
              // slate, exactly as PortalLayout.jsx does it. The file is square
              // with a lot of air around the wordmark; the stylesheet crops
              // that rather than guessing at margins.
              <img src={mark} alt={brand} style={{ filter: 'brightness(0) invert(1)' }} />
            ) : (
              brand
            )}
            <small>{title}</small>
          </Link>

          <nav className="nav" aria-label={`${title} sections`}>
            {nav.map((item, i) =>
              item.g ? (
                <div className="grp" key={`g${i}`}>{item.g}</div>
              ) : (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={item.href === activeHref ? 'page' : undefined}
                  data-testid={`nav-${item.id}`}
                >
                  {item.label}
                  {item.badge ? <span className="badge">{item.badge}</span> : null}
                </Link>
              ),
            )}
          </nav>

          <div className="side-foot">
            <div className="who">{profile?.full_name || user?.email}</div>
            {exit ? <Link href={exit.href}>{exit.label}</Link> : null}
            <a role="button" tabIndex={0} onClick={() => signOut()} data-testid="cert-sign-out">
              Sign out
            </a>
          </div>
        </aside>

        <main>{children}</main>
      </div>
    </div>
  )
}
