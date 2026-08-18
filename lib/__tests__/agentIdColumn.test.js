describe('documentsHaveAgentIdColumn', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('returns true when the schema probe succeeds', async () => {
    const limit = jest.fn().mockResolvedValue({ error: null })
    const client = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({ limit })),
      })),
    }
    const { documentsHaveAgentIdColumn } = require('../agentIdColumn')

    await expect(documentsHaveAgentIdColumn(client)).resolves.toBe(true)
    expect(limit).toHaveBeenCalledWith(1)
  })

  it('returns false when the database reports a missing column', async () => {
    const client = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          limit: jest.fn().mockResolvedValue({ error: { message: 'column does not exist' } }),
        })),
      })),
    }
    const { documentsHaveAgentIdColumn } = require('../agentIdColumn')

    await expect(documentsHaveAgentIdColumn(client)).resolves.toBe(false)
  })

  it('degrades safely when a lightweight client has no limit method', async () => {
    const client = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({})),
      })),
    }
    const { documentsHaveAgentIdColumn } = require('../agentIdColumn')

    await expect(documentsHaveAgentIdColumn(client)).resolves.toBe(false)
  })

  it('degrades safely when the schema probe throws', async () => {
    const client = {
      from: jest.fn(() => {
        throw new Error('client unavailable')
      }),
    }
    const { documentsHaveAgentIdColumn } = require('../agentIdColumn')

    await expect(documentsHaveAgentIdColumn(client)).resolves.toBe(false)
  })
})
