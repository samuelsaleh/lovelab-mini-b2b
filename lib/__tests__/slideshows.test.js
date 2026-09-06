/**
 * Fair slideshow manifest tests.
 *
 * The player trusts `count` to build frame URLs — if the manifest and the
 * files on disk drift, the booth screen shows broken images at a fair with no
 * one able to fix it. These tests pin the contract and check the actual frames
 * exist under public/.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  SLIDESHOWS,
  slidePaths,
  findSlideshow,
  INTERVAL_OPTIONS,
  DEFAULT_INTERVAL_SECONDS,
} from '../slideshows'

describe('slideshow manifest', () => {
  test('every deck has a unique id, a title and at least one frame', () => {
    const ids = SLIDESHOWS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    SLIDESHOWS.forEach((s) => {
      expect(s.title).toBeTruthy()
      expect(s.dir.startsWith('/slideshows/')).toBe(true)
      expect(s.count).toBeGreaterThan(0)
    })
  })

  test('slidePaths builds zero-padded, in-order frame URLs', () => {
    const show = { dir: '/slideshows/demo', count: 11 }
    const paths = slidePaths(show)
    expect(paths).toHaveLength(11)
    expect(paths[0]).toBe('/slideshows/demo/slide-01.jpg')
    expect(paths[10]).toBe('/slideshows/demo/slide-11.jpg')
  })

  test('slidePaths is empty for a missing or countless deck', () => {
    expect(slidePaths(null)).toEqual([])
    expect(slidePaths({ dir: '/slideshows/x' })).toEqual([])
  })

  test('findSlideshow resolves known ids and rejects unknown ones', () => {
    expect(findSlideshow('lifestyle')?.id).toBe('lifestyle')
    expect(findSlideshow('nope')).toBeNull()
  })

  test('the default interval is one of the offered options', () => {
    expect(INTERVAL_OPTIONS).toContain(DEFAULT_INTERVAL_SECONDS)
    expect(DEFAULT_INTERVAL_SECONDS).toBe(10)
  })

  test.each(SLIDESHOWS.map((s) => [s.id, s]))(
    'every frame declared by "%s" exists under public/',
    (_id, show) => {
      slidePaths(show).forEach((p) => {
        expect(fs.existsSync(path.join(process.cwd(), 'public', p))).toBe(true)
      })
    }
  )

  test.each(SLIDESHOWS.filter((s) => s.source).map((s) => [s.id, s.source]))(
    'the source PDF for "%s" is downloadable from public/',
    (_id, source) => {
      expect(fs.existsSync(path.join(process.cwd(), 'public', source))).toBe(true)
    }
  )

  test('the manifest count matches the frames actually on disk', () => {
    SLIDESHOWS.forEach((show) => {
      const dir = path.join(process.cwd(), 'public', show.dir)
      const onDisk = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg'))
      expect(onDisk).toHaveLength(show.count)
    })
  })
})
