/**
 * Simple in-memory rate limiter for API routes.
 * Uses a sliding window approach per IP address.
 * 
 * Note: This resets on server restart and is per-instance.
 * For production with multiple instances, use Redis/Upstash.
 */

const rateLimitMap = new Map()

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, data] of rateLimitMap) {
    if (now - data.windowStart > data.windowMs * 2) {
      rateLimitMap.delete(key)
    }
  }
}, 5 * 60 * 1000)

/**
 * @param {Request} request
 * @param {object} options
 * @param {number} options.maxRequests - Max requests per window
 * @param {number} options.windowMs - Window size in milliseconds
 * @param {string} [options.prefix] - Prefix for the rate limit key (e.g. route name)
 * @returns {{ success: boolean, remaining: number, reset: number }}
 */
export function rateLimit(request, { maxRequests = 30, windowMs = 60_000, prefix = '' } = {}) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') ||
             'unknown'
  
  const key = `${prefix}:${ip}`
  const now = Date.now()

  let data = rateLimitMap.get(key)

  if (!data || now - data.windowStart > windowMs) {
    data = { windowStart: now, count: 0, windowMs }
    rateLimitMap.set(key, data)
  }

  data.count++

  const remaining = Math.max(0, maxRequests - data.count)
  const reset = data.windowStart + windowMs

  return {
    success: data.count <= maxRequests,
    remaining,
    reset,
  }
}

/**
 * Helper that returns a NextResponse if rate limited, or null if OK.
 */
export function checkRateLimit(request, options) {
  const result = rateLimit(request, options)
  if (!result.success) {
    const { NextResponse } = require('next/server')
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((result.reset - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }
  return null
}
