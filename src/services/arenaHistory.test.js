import { describe, it, expect } from 'vitest';
import { buildArenaHistories, arenaTurnIndex } from './arenaHistory.js';

describe('buildArenaHistories', () => {
  it('returns empty histories for an empty chat', () => {
    const { historyA, historyB } = buildArenaHistories([]);
    expect(historyA).toEqual([]);
    expect(historyB).toEqual([]);
  });

  it('mirrors user turns into both branches', () => {
    const messages = [
      { role: 'user', content: 'q1' },
    ];
    const { historyA, historyB } = buildArenaHistories(messages);
    expect(historyA).toEqual([{ role: 'user', content: 'q1' }]);
    expect(historyB).toEqual([{ role: 'user', content: 'q1' }]);
  });

  it('merges branches after a winner vote', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        isArena: true,
        arenaData: {
          a: { model: 'm-a', content: 'A1' },
          b: { model: 'm-b', content: 'B1' },
          voted: true,
          winner: 'a',
        },
      },
    ];
    const { historyA, historyB } = buildArenaHistories(messages);
    expect(historyA).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'A1' },
    ]);
    expect(historyB).toEqual(historyA);
  });

  it('splits branches on tie', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        isArena: true,
        arenaData: {
          a: { model: 'm-a', content: 'A1' },
          b: { model: 'm-b', content: 'B1' },
          voted: true,
          winner: 'tie',
        },
      },
    ];
    const { historyA, historyB } = buildArenaHistories(messages);
    expect(historyA[1]).toEqual({ role: 'assistant', content: 'A1' });
    expect(historyB[1]).toEqual({ role: 'assistant', content: 'B1' });
  });

  it('splits branches on both_bad the same way as tie', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        isArena: true,
        arenaData: {
          a: { model: 'm-a', content: 'A1' },
          b: { model: 'm-b', content: 'B1' },
          voted: true,
          winner: 'both_bad',
        },
      },
    ];
    const { historyA, historyB } = buildArenaHistories(messages);
    expect(historyA[1].content).toBe('A1');
    expect(historyB[1].content).toBe('B1');
  });

  it('skips arena rounds that are still pending a vote', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        isArena: true,
        arenaData: {
          a: { model: 'm-a', content: 'A1' },
          b: { model: 'm-b', content: 'B1' },
          voted: false,
          winner: null,
        },
      },
    ];
    const { historyA, historyB } = buildArenaHistories(messages);
    expect(historyA).toEqual([{ role: 'user', content: 'q1' }]);
    expect(historyB).toEqual([{ role: 'user', content: 'q1' }]);
  });

  it('handles a chain of mixed votes: a → tie → b', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant', isArena: true,
        arenaData: { a: { content: 'A1' }, b: { content: 'B1' }, voted: true, winner: 'a' },
      },
      { role: 'user', content: 'q2' },
      {
        role: 'assistant', isArena: true,
        arenaData: { a: { content: 'A2' }, b: { content: 'B2' }, voted: true, winner: 'tie' },
      },
      { role: 'user', content: 'q3' },
      {
        role: 'assistant', isArena: true,
        arenaData: { a: { content: 'A3' }, b: { content: 'B3' }, voted: true, winner: 'b' },
      },
    ];
    const { historyA, historyB } = buildArenaHistories(messages);
    // After turn 1 (a wins): both = [q1, A1]
    // After turn 2 (tie): A=[q1, A1, q2, A2], B=[q1, A1, q2, B2]
    // After turn 3 (b wins): both = [q1, A1, q2, B2, q3, B3]
    expect(historyA).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'B2' },
      { role: 'user', content: 'q3' },
      { role: 'assistant', content: 'B3' },
    ]);
    expect(historyB).toEqual(historyA);
  });
});

describe('arenaTurnIndex', () => {
  it('is 0 for an empty chat', () => {
    expect(arenaTurnIndex([])).toBe(0);
  });

  it('counts voted arena rounds', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', isArena: true, arenaData: { voted: true, winner: 'a', a: { content: '' }, b: { content: '' } } },
      { role: 'user', content: 'q2' },
      { role: 'assistant', isArena: true, arenaData: { voted: true, winner: 'tie', a: { content: '' }, b: { content: '' } } },
    ];
    expect(arenaTurnIndex(messages)).toBe(2);
  });

  it('does not count a still-pending arena round', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', isArena: true, arenaData: { voted: false, winner: null, a: { content: '' }, b: { content: '' } } },
    ];
    expect(arenaTurnIndex(messages)).toBe(0);
  });
});
