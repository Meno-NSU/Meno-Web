import { describe, it, expect, beforeEach } from 'vitest';

import { hasSeenArenaIntro, markArenaIntroSeen, ARENA_INTRO_SEEN_FLAG } from './arenaIntro.js';

describe('arenaIntro seen-flag', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('is unseen by default', () => {
        expect(hasSeenArenaIntro()).toBe(false);
    });

    it('is seen after marking', () => {
        markArenaIntroSeen();
        expect(hasSeenArenaIntro()).toBe(true);
        expect(localStorage.getItem(ARENA_INTRO_SEEN_FLAG)).toBe('1');
    });
});
