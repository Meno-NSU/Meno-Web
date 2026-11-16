import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOneShotSend } from './useOneShotSend.js';
import { THANKS_MS } from './FeedbackStatus.jsx';

function deferred() {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
}

const setup = () => renderHook(() => useOneShotSend({ failedKey: 'failed', notYoursKey: 'notYours' }));

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('useOneShotSend', () => {
    it('goes idle → pending → sent, and thanks only once the write resolved', async () => {
        const { result } = setup();
        expect(result.current.status).toBe('idle');
        const d = deferred();

        let run;
        act(() => { run = result.current.run(() => d.promise, { tag: 'tie' }); });
        expect(result.current.status).toBe('pending');
        expect(result.current.pending).toBe(true);
        expect(result.current.tag).toBe('tie');
        expect(result.current.thanks).toBe(false);

        await act(async () => { d.resolve(); await run; });
        expect(result.current.status).toBe('sent');
        expect(result.current.pending).toBe(false);
        expect(result.current.thanks).toBe(true);
        expect(result.current.error).toBeNull();
    });

    it('drops the thanks after THANKS_MS, keeping the sent status', async () => {
        vi.useFakeTimers();
        const { result } = setup();
        await act(async () => { await result.current.run(() => Promise.resolve()); });
        expect(result.current.thanks).toBe(true);
        act(() => { vi.advanceTimersByTime(THANKS_MS - 1); });
        expect(result.current.thanks).toBe(true);
        act(() => { vi.advanceTimersByTime(1); });
        expect(result.current.thanks).toBe(false);
        expect(result.current.status).toBe('sent');
    });

    it('fails with a retryable error and no thanks; retry re-runs the same write', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { result } = setup();
        const write = vi.fn()
            .mockRejectedValueOnce(Object.assign(new Error('Boom'), { httpStatus: 500 }))
            .mockResolvedValueOnce(undefined);

        await act(async () => { await result.current.run(write, { tag: 'a' }); });
        expect(result.current.status).toBe('failed');
        expect(result.current.thanks).toBe(false);
        expect(result.current.error).toEqual({ key: 'failed', canRetry: true });
        expect(result.current.tag).toBe('a');

        await act(async () => { await result.current.retry(); });
        expect(write).toHaveBeenCalledTimes(2);
        expect(result.current.status).toBe('sent');
        expect(result.current.error).toBeNull();
        expect(result.current.thanks).toBe(true);
    });

    it('explains a 404 (another profile owns the chat) and offers no retry', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { result } = setup();
        await act(async () => {
            await result.current.run(() => Promise.reject(Object.assign(new Error('Not found'), { httpStatus: 404 })));
        });
        expect(result.current.error).toEqual({ key: 'notYours', canRetry: false });
    });

    it('ignores a second write while one is in flight (no duplicate sends)', async () => {
        const { result } = setup();
        const d = deferred();
        const first = vi.fn(() => d.promise);
        const second = vi.fn(() => Promise.resolve());

        let a;
        let b;
        act(() => {
            // Two clicks in the same tick: both see the same render's `run`.
            a = result.current.run(first);
            b = result.current.run(second);
        });
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).not.toHaveBeenCalled();
        await act(async () => { d.resolve(); await a; });
        expect(await b).toBe(false);
        expect(result.current.status).toBe('sent');
    });

    it('refuses any write after a confirmed one', async () => {
        const { result } = setup();
        const write = vi.fn(() => Promise.resolve());
        await act(async () => { await result.current.run(write); });
        await act(async () => { await result.current.run(write); });
        expect(write).toHaveBeenCalledTimes(1);
    });
});
