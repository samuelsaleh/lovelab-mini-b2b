/**
 * @jest-environment node
 */
const { readJson, UPDATING_MESSAGE } = require('../readJson')

test('parses a JSON body', async () => {
  expect(await readJson(new Response(JSON.stringify({ events: [1] })))).toEqual({ events: [1] })
})

test('an empty body is an empty object', async () => {
  expect(await readJson(new Response(''))).toEqual({})
})

test("a text page from a restarting server becomes a sentence a person can act on", async () => {
  const res = new Response('The deployment is in progress, please retry in a minute.', { status: 503, headers: { 'content-type': 'text/html' } })
  const out = await readJson(res)
  expect(out.notJson).toBe(true)
  expect(out.error).toBe(UPDATING_MESSAGE)
  expect(out.error).toMatch(/your order is still on this screen/)
  expect(out.serverSaid).toBe('The deployment is in progress, please retry in a minute.')
})
