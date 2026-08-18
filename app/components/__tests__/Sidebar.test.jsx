/**
 * Sidebar unit tests
 *
 * Covers:
 *   - Renders all nav items
 *   - Active item has aria-current="page"
 *   - onSelect is called when non-href item is clicked
 *   - Mobile drawer hidden when isOpen=false, visible when true
 *   - Collapse toggle calls onToggleCollapse
 *   - Desktop collapsed mode shows icons only (no label text)
 *   - Role-gating: items list is filtered before being passed in
 */

import { render, screen, fireEvent } from '@testing-library/react'

// Sidebar imports useRouter — mock it
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

import Sidebar from '../Sidebar'

const ITEMS = [
  { id: 'home',      label: 'Home' },
  { id: 'builder',   label: 'Builder' },
  { id: 'documents', label: 'Documents' },
]

describe('Sidebar — desktop', () => {
  it('renders all items', () => {
    render(<Sidebar items={ITEMS} activeId="home" onSelect={jest.fn()} />)
    expect(screen.getByTestId('sidebar-item-home')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-item-builder')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-item-documents')).toBeInTheDocument()
  })

  it('marks active item with aria-current="page"', () => {
    render(<Sidebar items={ITEMS} activeId="builder" onSelect={jest.fn()} />)
    expect(screen.getByTestId('sidebar-item-builder')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('sidebar-item-home')).not.toHaveAttribute('aria-current')
  })

  it('calls onSelect with item id when clicked', () => {
    const onSelect = jest.fn()
    render(<Sidebar items={ITEMS} activeId="home" onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('sidebar-item-documents'))
    expect(onSelect).toHaveBeenCalledWith('documents')
  })

  it('collapse toggle calls onToggleCollapse', () => {
    const onToggleCollapse = jest.fn()
    render(<Sidebar items={ITEMS} activeId="home" onSelect={jest.fn()} onToggleCollapse={onToggleCollapse} collapsed={false} />)
    fireEvent.click(screen.getByTestId('sidebar-collapse-toggle'))
    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
  })

  it('does not render collapse toggle if onToggleCollapse is not provided', () => {
    render(<Sidebar items={ITEMS} activeId="home" onSelect={jest.fn()} />)
    expect(screen.queryByTestId('sidebar-collapse-toggle')).not.toBeInTheDocument()
  })

  it('role-gating: only renders items passed in', () => {
    const agentItems = [
      { id: 'home',      label: 'Home' },
      { id: 'documents', label: 'Documents' },
    ]
    render(<Sidebar items={agentItems} activeId="home" onSelect={jest.fn()} />)
    expect(screen.queryByTestId('sidebar-item-builder')).not.toBeInTheDocument()
    expect(screen.getByTestId('sidebar-item-home')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-item-documents')).toBeInTheDocument()
  })
})

describe('Sidebar — grouped items (submenus)', () => {
  const GROUPED = [
    { id: 'dashboard', label: 'Dashboard', href: '/admin' },
    {
      id: 'people',
      label: 'People',
      children: [
        { id: 'agents',     label: 'Agents',     href: '/admin/agents' },
        { id: 'assistants', label: 'Assistants', href: '/admin/assistants' },
      ],
    },
  ]

  it('renders the group header and hides children while closed', () => {
    render(<Sidebar items={GROUPED} activeId="dashboard" onSelect={jest.fn()} />)
    expect(screen.getByTestId('sidebar-group-people')).toBeInTheDocument()
    expect(screen.queryByTestId('sidebar-item-agents')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sidebar-item-assistants')).not.toBeInTheDocument()
  })

  it('clicking the group header expands and collapses the children', () => {
    render(<Sidebar items={GROUPED} activeId="dashboard" onSelect={jest.fn()} />)
    const header = screen.getByTestId('sidebar-group-people')
    fireEvent.click(header)
    expect(screen.getByTestId('sidebar-item-agents')).toBeInTheDocument()
    expect(header).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(header)
    expect(screen.queryByTestId('sidebar-item-agents')).not.toBeInTheDocument()
    expect(header).toHaveAttribute('aria-expanded', 'false')
  })

  it('auto-opens the group that contains the active page', () => {
    render(<Sidebar items={GROUPED} activeId="assistants" onSelect={jest.fn()} />)
    expect(screen.getByTestId('sidebar-item-assistants')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('sidebar-item-agents')).toBeInTheDocument()
  })

  it('collapsed desktop mode flattens groups so every page keeps an icon', () => {
    render(<Sidebar items={GROUPED} activeId="dashboard" onSelect={jest.fn()} collapsed onToggleCollapse={jest.fn()} />)
    expect(screen.queryByTestId('sidebar-group-people')).not.toBeInTheDocument()
    expect(screen.getByTestId('sidebar-item-agents')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-item-assistants')).toBeInTheDocument()
  })

  it('mobile: toggling a group does NOT close the drawer, picking a child does', () => {
    const onClose = jest.fn()
    render(<Sidebar mobile items={GROUPED} activeId="dashboard" onSelect={jest.fn()} isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('sidebar-group-people'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('sidebar-item-agents'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('Sidebar — mobile drawer', () => {
  it('renders backdrop when isOpen=true', () => {
    render(<Sidebar mobile items={ITEMS} activeId="home" onSelect={jest.fn()} isOpen={true} onClose={jest.fn()} />)
    expect(screen.getByTestId('sidebar-backdrop')).toBeInTheDocument()
  })

  it('does NOT render backdrop when isOpen=false', () => {
    render(<Sidebar mobile items={ITEMS} activeId="home" onSelect={jest.fn()} isOpen={false} onClose={jest.fn()} />)
    expect(screen.queryByTestId('sidebar-backdrop')).not.toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = jest.fn()
    render(<Sidebar mobile items={ITEMS} activeId="home" onSelect={jest.fn()} isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('sidebar-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose after item is selected', () => {
    const onClose = jest.fn()
    render(<Sidebar mobile items={ITEMS} activeId="home" onSelect={jest.fn()} isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('sidebar-item-documents'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
