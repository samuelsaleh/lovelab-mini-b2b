import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import CertShell from '../certificates/CertShell'
import { CERTIFICATE_NAV, IGI_NAV_ITEMS } from '@/lib/navItems'

let pathname = '/certificates'
jest.mock('next/navigation', () => ({ usePathname: () => pathname }))

const signOut = jest.fn()
jest.mock('../AuthProvider', () => ({
  useAuth: () => ({ user: { email: 'sam@love-lab.com' }, profile: { full_name: 'Sam' }, signOut }),
}))

function renderShell(props = {}) {
  return render(
    <CertShell
      nav={CERTIFICATE_NAV}
      home="/certificates"
      theme="lovelab"
      brand="LoveLab"
      title="Certificates"
      banner="every IGI movement, held once"
      exit={{ href: '/admin', label: '← Back to LoveLab' }}
      {...props}
    >
      <p>the page</p>
    </CertShell>,
  )
}

beforeEach(() => { pathname = '/certificates'; jest.clearAllMocks() })

describe('the certificate application shell', () => {
  it('carries its own chrome rather than the admin panel’s', () => {
    const { container } = renderShell()
    // Everything is scoped under .certapp — that scoping is what stops the
    // palette leaking into the rest of LoveLab.
    expect(container.querySelector('.certapp')).toBeInTheDocument()
    expect(screen.getByText('the page')).toBeInTheDocument()
  })

  it('wears LoveLab’s skin and LoveLab’s actual mark', () => {
    // The theme class is the only thing separating the two skins, so it is
    // worth asserting rather than assuming.
    const { container } = renderShell()
    expect(container.querySelector('.certapp.lovelab')).toBeInTheDocument()

    const logo = container.querySelector('aside .logo img')
    expect(logo).toHaveAttribute('src', '/logo.png')
    expect(logo).toHaveAttribute('alt', 'LoveLab')
    // Dark artwork on a plum bar has to be inverted or it disappears.
    expect(logo.style.filter).toBe('brightness(0) invert(1)')
  })

  it('shows the group headings, not just a flat list', () => {
    renderShell()
    for (const g of ['Overview', 'Every day', 'Money', 'Setup']) {
      expect(screen.getByText(g)).toBeInTheDocument()
    }
  })

  it('marks the screen you are on, and only that one', () => {
    renderShell()
    const current = screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Dashboard')
  })

  it('keeps a section lit while you are inside it', () => {
    // A visit's own page is still Visits — otherwise the sidebar goes blank
    // exactly when somebody is deepest into the work.
    pathname = '/certificates/visits/v9'
    renderShell()
    expect(screen.getByTestId('nav-visits')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-dashboard')).not.toHaveAttribute('aria-current')
  })

  it('lets an admin back out to LoveLab, and signs anybody out', () => {
    renderShell()
    expect(screen.getByText('← Back to LoveLab')).toHaveAttribute('href', '/admin')
    fireEvent.click(screen.getByTestId('cert-sign-out'))
    expect(signOut).toHaveBeenCalled()
  })

  it('gives IGI the same shell with no way out, and not LoveLab’s colours', () => {
    // IGI are another company. There is nowhere in this app for them to go
    // back to, so offering a door would be a lie — and the blue skin is how
    // they can tell at a glance that this screen is theirs, not LoveLab's.
    pathname = '/igi/stock'
    const { container } = render(
      <CertShell nav={IGI_NAV_ITEMS} home="/igi" brand="IGI Antwerp" title="LoveLab certificates" banner="what LoveLab are waiting on" exit={null}>
        <p>their page</p>
      </CertShell>,
    )
    expect(container.querySelector('.certapp')).toBeInTheDocument()
    expect(container.querySelector('.certapp.lovelab')).not.toBeInTheDocument()
    // Their own name, typed — not LoveLab's mark over an outside company's bench.
    expect(container.querySelector('aside .logo')).toHaveTextContent('IGI Antwerp')
    expect(container.querySelector('aside .logo img')).toBeNull()

    expect(screen.queryByText('← Back to LoveLab')).not.toBeInTheDocument()
    expect(screen.getByTestId('nav-igi-stock')).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/')).toHaveLength(0)
  })

  it('shows a count on a nav item when one is passed', () => {
    renderShell({ nav: [{ id: 'visits', label: 'Visits', href: '/certificates/visits', badge: 3 }] })
    expect(screen.getByTestId('nav-visits')).toHaveTextContent('3')
  })
})
