import { withTimeout } from '../withTimeout';

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('resolves with the inner value when the promise settles first', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000);
    expect(result).toBe('ok');
  });

  test('rejects with a TimeoutError when the promise never settles', async () => {
    // A promise that never resolves — simulates a stalled html2canvas render.
    const neverResolves = new Promise(() => {});
    const p = withTimeout(neverResolves, 5000, 'PDF generation timed out on this device.');

    // Attach the assertion BEFORE advancing timers so the rejection is handled.
    const assertion = expect(p).rejects.toMatchObject({
      name: 'TimeoutError',
      isTimeout: true,
      message: 'PDF generation timed out on this device.',
    });

    jest.advanceTimersByTime(5000);
    await assertion;
  });

  test('uses a default message when none is provided', async () => {
    const p = withTimeout(new Promise(() => {}), 1000);
    const assertion = expect(p).rejects.toThrow(/timed out after 1000ms/);
    jest.advanceTimersByTime(1000);
    await assertion;
  });

  test('propagates a rejection from the inner promise (not swallowed by timeout)', async () => {
    const boom = Promise.reject(new Error('boom'));
    await expect(withTimeout(boom, 1000)).rejects.toThrow('boom');
  });

  test('does not time out when inner promise resolves just before the deadline', async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve('done'), 900));
    const p = withTimeout(slow, 1000);
    jest.advanceTimersByTime(900);
    await expect(p).resolves.toBe('done');
  });

  test('passes the promise through unchanged when ms is invalid (<= 0)', async () => {
    await expect(withTimeout(Promise.resolve('x'), 0)).resolves.toBe('x');
    await expect(withTimeout(Promise.resolve('y'), -10)).resolves.toBe('y');
    await expect(withTimeout(Promise.resolve('z'), NaN)).resolves.toBe('z');
  });

  test('clears the timer after the inner promise resolves (no dangling timeout)', async () => {
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    await withTimeout(Promise.resolve('ok'), 1000);
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
