import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))

import AdminEmployeesPage from '../page'

const employees = [
  { id: 'sam', full_name: 'Sam', email: 'sam@love-lab.com', role: 'admin', has_password_set: false, you: true },
  { id: 'emp-1', full_name: 'Christelle', email: 'christelle@love-lab.com', role: 'admin', has_password_set: true, you: false },
  { id: 'emp-2', full_name: '', email: 'new@love-lab.com', role: 'admin', has_password_set: false, you: false },
]

function mockFetch(handlers) {
  global.fetch = jest.fn(async (url, init = {}) => {
    const method = init.method || 'GET'
    const h = handlers.find((x) => x.method === method && x.url.test(String(url)))
    if (!h) throw new Error(`unexpected ${method} ${url}`)
    const { status = 200, body } = await h.reply(init)
    return { ok: status < 400, status, json: async () => body }
  })
}

afterEach(() => { delete global.fetch })

test('lists every employee, marks me, and offers actions on the others only', async () => {
  mockFetch([{ method: 'GET', url: /\/api\/employees$/, reply: async () => ({ body: { employees } }) }])
  render(<AdminEmployeesPage />)

  const rows = await screen.findAllByTestId('employee-row')
  expect(rows).toHaveLength(3)
  expect(within(rows[0]).getByText('you')).toBeInTheDocument()
  expect(within(rows[0]).queryByTestId('employee-remove')).toBeNull()
  expect(within(rows[0]).queryByTestId('employee-resend')).toBeNull()

  expect(within(rows[1]).getByText('Active')).toBeInTheDocument()
  expect(within(rows[1]).getByText('Reset Password')).toBeInTheDocument()
  expect(within(rows[2]).getByText('Invited')).toBeInTheDocument()
  expect(within(rows[2]).getByText('Resend Invite')).toBeInTheDocument()
})

test('the invite form posts name and email and shows the outcome', async () => {
  const posted = []
  mockFetch([
    { method: 'GET', url: /\/api\/employees$/, reply: async () => ({ body: { employees } }) },
    { method: 'POST', url: /\/api\/employees$/, reply: async (init) => {
      posted.push(JSON.parse(init.body))
      return { status: 201, body: { employee: { id: 'x', full_name: 'Alberto', email: 'alberto@love-lab.com' }, created: true } }
    } },
  ])
  render(<AdminEmployeesPage />)
  await screen.findAllByTestId('employee-row')

  fireEvent.click(screen.getByTestId('invite-employee'))
  fireEvent.change(screen.getByTestId('employee-name'), { target: { value: ' Alberto ' } })
  fireEvent.change(screen.getByTestId('employee-email'), { target: { value: 'Alberto@Love-Lab.com' } })
  fireEvent.click(screen.getByTestId('employee-send-invite'))

  await waitFor(() => expect(posted).toEqual([{ email: 'alberto@love-lab.com', full_name: 'Alberto' }]))
  expect(await screen.findByTestId('employee-notice')).toHaveTextContent('Invite sent to Alberto')
  expect(screen.queryByTestId('invite-employee-modal')).toBeNull()
})

test('the form shows the server\'s refusal instead of closing', async () => {
  mockFetch([
    { method: 'GET', url: /\/api\/employees$/, reply: async () => ({ body: { employees } }) },
    { method: 'POST', url: /\/api\/employees$/, reply: async () => ({ status: 409, body: { error: 'sam@love-lab.com is already an employee with full access' } }) },
  ])
  render(<AdminEmployeesPage />)
  await screen.findAllByTestId('employee-row')
  fireEvent.click(screen.getByTestId('invite-employee'))
  fireEvent.change(screen.getByTestId('employee-email'), { target: { value: 'sam@love-lab.com' } })
  fireEvent.click(screen.getByTestId('employee-send-invite'))
  expect(await screen.findByText(/already an employee/)).toBeInTheDocument()
  expect(screen.getByTestId('invite-employee-modal')).toBeInTheDocument()
})

test('remove asks for confirmation, then calls DELETE and reloads', async () => {
  const calls = []
  let list = employees
  mockFetch([
    { method: 'GET', url: /\/api\/employees$/, reply: async () => ({ body: { employees: list } }) },
    { method: 'DELETE', url: /\/api\/employees\/emp-1$/, reply: async () => {
      calls.push('delete'); list = employees.filter((e) => e.id !== 'emp-1')
      return { body: { message: 'Access removed.' } }
    } },
  ])
  render(<AdminEmployeesPage />)
  const rows = await screen.findAllByTestId('employee-row')
  fireEvent.click(within(rows[1]).getByTestId('employee-remove'))
  expect(calls).toEqual([])
  fireEvent.click(within(rows[1]).getByTestId('employee-remove-confirm'))
  await waitFor(() => expect(calls).toEqual(['delete']))
  await waitFor(() => expect(screen.getAllByTestId('employee-row')).toHaveLength(2))
  expect(screen.getByTestId('employee-notice')).toHaveTextContent('Christelle no longer has access')
})

test('resend sends a PUT with _resend', async () => {
  const bodies = []
  mockFetch([
    { method: 'GET', url: /\/api\/employees$/, reply: async () => ({ body: { employees } }) },
    { method: 'PUT', url: /\/api\/employees\/emp-2$/, reply: async (init) => { bodies.push(JSON.parse(init.body)); return { body: { message: 'A new temporary password was sent to new@love-lab.com.' } } } },
  ])
  render(<AdminEmployeesPage />)
  const rows = await screen.findAllByTestId('employee-row')
  fireEvent.click(within(rows[2]).getByTestId('employee-resend'))
  await waitFor(() => expect(bodies).toEqual([{ _resend: true }]))
  expect(await screen.findByTestId('employee-notice')).toHaveTextContent('new@love-lab.com')
})
