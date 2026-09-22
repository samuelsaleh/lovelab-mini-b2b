/**
 * Run `fn` over `items` with at most `limit` in flight, and stop picking up
 * new items once `deadlineAt` (epoch ms) has passed.
 *
 * Vercel functions have a ~10 s wall clock. A broadcast is time-boxed
 * instead of size-capped: the caller returns the items it never started as
 * `remaining`, and the client calls again until the queue is drained.
 * Results for items never started are `undefined`.
 */
export async function mapPoolWithDeadline(items, limit, deadlineAt, fn) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      if (Date.now() >= deadlineAt) return;
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
