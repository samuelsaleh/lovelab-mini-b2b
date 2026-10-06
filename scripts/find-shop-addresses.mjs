#!/usr/bin/env node
/**
 * Find street addresses for shops that only have a name and a city.
 *
 * Built for the 199 clients imported from Salesforce on 4 March 2026, which
 * came over with no street. Each shop costs one Perplexity Search request
 * (up to five queries, billed once). Nothing is written to the database:
 * the output is a JSON file of candidates for a person to review.
 *
 * Usage:
 *   node --env-file=.env scripts/find-shop-addresses.mjs shops.json out.json [--only-ids=1,2,3] [--limit=20] [--fast]
 *
 * shops.json: [{ "id": 1, "name": "Bijouterie X", "city": "Lyon", "country": "France" }, ...]
 * out.json:   one entry per shop with queries, results, candidates and best.
 *
 * The key is PERPLEXITY_API_KEY from the environment. Never put it on the
 * command line (see .claude/skills/api-credentials).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { findShopAddress } from '../lib/shops/findShopAddress.js'

const args = process.argv.slice(2)
const positional = args.filter((a) => !a.startsWith('--'))
const flag = (name) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return undefined
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : true
}

const [inputPath, outputPath] = positional
if (!inputPath || !outputPath) {
  console.error('Usage: node --env-file=.env scripts/find-shop-addresses.mjs shops.json out.json [--only-ids=1,2] [--limit=N] [--fast]')
  process.exit(2)
}
if (!process.env.PERPLEXITY_API_KEY) {
  console.error('PERPLEXITY_API_KEY is not set. Create one at https://console.perplexity.ai and put it in .env, then run with node --env-file=.env.')
  process.exit(2)
}

const shops = JSON.parse(readFileSync(inputPath, 'utf8'))
const onlyIds = flag('only-ids') ? new Set(String(flag('only-ids')).split(',').map((s) => s.trim())) : null
const limit = flag('limit') ? Number(flag('limit')) : Infinity
const fast = Boolean(flag('fast'))

const previous = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, 'utf8')) : []
const done = new Map(previous.map((e) => [String(e.shop.id), e]))

const todo = shops
  .filter((s) => !onlyIds || onlyIds.has(String(s.id)))
  .filter((s) => !done.has(String(s.id)))
  .slice(0, limit)

console.log(`${todo.length} shops to search (${done.size} already in ${outputPath})`)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let found = 0
for (const [i, shop] of todo.entries()) {
  try {
    const entry = await findShopAddress(shop, { maxResults: 8, searchType: fast ? 'fast' : undefined })
    done.set(String(shop.id), entry)
    if (entry.best) found += 1
    console.log(`${i + 1}/${todo.length} ${shop.name} — ${entry.best ? `${entry.best.street}, ${entry.best.postcode} ${entry.best.city} (${entry.best.score})` : `${entry.candidates.length} candidates, none convincing`}`)
  } catch (err) {
    console.error(`${i + 1}/${todo.length} ${shop.name} — failed: ${err.message}`)
    done.set(String(shop.id), { shop, queries: [], results: [], candidates: [], best: null, error: err.message })
    if (err.status === 401) { console.error('The key was refused (401). Check PERPLEXITY_API_KEY.'); break }
  }
  writeFileSync(outputPath, JSON.stringify([...done.values()], null, 1))
  await sleep(400)
}

console.log(`done: ${found} of ${todo.length} shops have a convincing address candidate; results in ${outputPath}`)
