import { describe, it, expect } from 'vitest';

import { isCappedSample } from './frameRate.js';

const frames = (ms, n) => Array.from({ length: n }, () => ms);

describe('frameRate cap detection (isCappedSample)', () => {
    it('flags a 30fps cap (~33ms frames)', () => {
        expect(isCappedSample(frames(33.4, 12))).toBe(true);
    });

    it('passes a normal 60Hz display (~16.7ms frames)', () => {
        expect(isCappedSample(frames(16.7, 12))).toBe(false);
    });

    it('passes a 120Hz display (~8.3ms frames)', () => {
        expect(isCappedSample(frames(8.3, 12))).toBe(false);
    });

    it('shrugs off isolated spikes on a healthy display (median, not max)', () => {
        // 60Hz with two long frames from unrelated main-thread work.
        expect(isCappedSample([16.7, 16.7, 180, 16.7, 16.7, 16.7, 90, 16.7, 16.7, 16.7, 16.7, 16.7])).toBe(false);
    });

    it('ignores an arbitrary first delta (sampling starts mid-vsync)', () => {
        expect(isCappedSample([3.1, ...frames(16.7, 11)])).toBe(false);
        expect(isCappedSample([160, ...frames(16.7, 11)])).toBe(false);
    });

    it('refuses to judge from too few frames', () => {
        expect(isCappedSample(frames(33.4, 3))).toBe(false);
    });
});
