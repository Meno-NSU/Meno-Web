import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import ChatArea from './ChatArea.jsx';
import { setLanguage } from '../i18n.js';

// jsdom doesn't implement scrollIntoView; ChatArea's mount effect calls it via
// scrollToBottom() to snap to the latest message. Stub it so render() doesn't
// throw — this file is the first direct render test of ChatArea.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => { cleanup(); setLanguage('ru'); });

const baseProps = {
  isGenerating: false,
  onSendMessage: () => {},
  onRetry: vi.fn(),
  onStop: () => {},
  kbs: [],
  selectedKb: '',
  onKbChange: () => {},
  modelsAvailable: true,
  chatId: 'c1',
  setChats: () => {},
  voteIsPending: false,
};

const stopped = (content) => ({
  role: 'assistant', content, interrupted: true,
  notice: { kind: 'stopped', key: 'stopped' }, retry: { userText: 'q' },
});

describe('ChatArea — stop / retry', () => {
  it('shows "Остановлено", keeps streamed content, and offers one Retry (last only)', () => {
    const messages = [{ role: 'user', content: 'q' }, stopped('partial answer')];
    const { getAllByText, getByText } = render(<ChatArea {...baseProps} messages={messages} />);
    expect(getByText('Остановлено')).toBeTruthy();
    expect(getByText('partial answer')).toBeTruthy();
    expect(getAllByText('Повторить запрос')).toHaveLength(1);
  });

  it('never shows Retry on a message that is not the last', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      stopped('older interrupted'),   // not last → no retry
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'clean answer' },
    ];
    const { queryByText } = render(<ChatArea {...baseProps} messages={messages} />);
    expect(queryByText('Повторить запрос')).toBeNull();
  });

  it('the stopped row carries no "!" glyph', () => {
    const messages = [{ role: 'user', content: 'q' }, stopped('')];
    const { queryByText } = render(<ChatArea {...baseProps} messages={messages} />);
    expect(queryByText('!')).toBeNull();
  });
});

describe('ChatArea — a chat whose content has not loaded yet', () => {
  // A signed-in chat restored from a server conversation summary carries
  // `messages: null` until its content is fetched (see chatFromSummary /
  // App.jsx). This must render as the empty state, not crash.
  it('renders the empty state instead of crashing when messages is null', () => {
    expect(() => render(<ChatArea {...baseProps} messages={null} />)).not.toThrow();
  });

  // App.jsx computes `activeChatStillLoading` and must thread it in as
  // `isLoadingConversation` — without a distinct visible state, a restored
  // conversation looks exactly like a brand-new empty chat: the user can type
  // and send into it before the fetch resolves, the optimistic append lands
  // first, and (per the load effect's `messages === null` guard) the fetch
  // then never re-fires — the restored history is lost for that session.
  it('shows a loading state instead of the empty-chat hero, and disables the input', () => {
    const { getByText, queryByText, container } = render(
      <ChatArea {...baseProps} messages={null} isLoadingConversation />,
    );
    expect(getByText('Восстанавливаем историю чата…')).toBeTruthy();
    expect(queryByText('Что хотите узнать об НГУ?')).toBeNull();
    expect(container.querySelector('.chat-textarea').disabled).toBe(true);
    expect(container.querySelector('.send-btn').disabled).toBe(true);
  });

  it('still shows the ordinary empty-chat hero, with a live input, when not loading', () => {
    const { getByText, container } = render(
      <ChatArea {...baseProps} messages={[]} isLoadingConversation={false} />,
    );
    expect(getByText('Что хотите узнать об НГУ?')).toBeTruthy();
    expect(container.querySelector('.chat-textarea').disabled).toBe(false);
  });
});

describe('ChatArea — answer labels', () => {
  // The label under an answer names the version and the model the way the picker does,
  // never the raw id («gemma-4-12B-it@ragu»).
  it('labels an answer «version · model», not by its raw id', () => {
    const models = [{ id: 'gemma-4-12B-it@ragu', provider: 'external', stand_id: 'ragu', stand_name: 'RAGU', llm_id: 'gemma-4-12B-it', llm_name: 'Gemma 4 12B' }];
    const { container } = render(
      <ChatArea {...baseProps} models={models} messages={[
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'a', responseModelId: 'gemma-4-12B-it@ragu' },
      ]} />,
    );
    expect(container.querySelector('.message-model-label').textContent).toBe('RAGU · Gemma 4 12B');
  });

  it('labels an answer whose model is no longer listed by its id suffix', () => {
    const { container } = render(
      <ChatArea {...baseProps} models={[]} messages={[
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'a', responseModelId: 'gemma-4-12B-it@menon-1.1' },
      ]} />,
    );
    expect(container.querySelector('.message-model-label').textContent).toBe('Менон 1.1 · gemma-4-12B-it');
  });
});

describe('ChatArea — copy buttons', () => {
  it('offers to copy the question', () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    const { getByLabelText } = render(<ChatArea {...baseProps} messages={[{ role: 'user', content: 'Есть ли общежитие?' }]} />);
    fireEvent.click(getByLabelText('Скопировать вопрос'));
    expect(writeText).toHaveBeenCalledWith('Есть ли общежитие?');
  });

  it('shows no copy-answer button while the answer is still streaming', () => {
    const messages = [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'нача', isStreaming: true }];
    const { queryByLabelText } = render(<ChatArea {...baseProps} isGenerating messages={messages} />);
    expect(queryByLabelText('Скопировать ответ')).toBeNull();
  });

  it('shows no copy-answer button when there is no answer text', () => {
    const messages = [{ role: 'user', content: 'q' }, {
      role: 'assistant', content: '', interrupted: true,
      notice: { kind: 'error', key: 'botUnavailable' }, retry: { userText: 'q' },
    }];
    const { queryByLabelText } = render(<ChatArea {...baseProps} messages={messages} />);
    expect(queryByLabelText('Скопировать ответ')).toBeNull();
  });

  it('copies a finished answer without its reasoning', () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    const messages = [{ role: 'user', content: 'q' }, { role: 'assistant', content: '<think>скрыто</think>Ответ.' }];
    const { getByLabelText } = render(<ChatArea {...baseProps} messages={messages} />);
    fireEvent.click(getByLabelText('Скопировать ответ'));
    expect(writeText).toHaveBeenCalledWith('Ответ.');
  });
});

describe('ChatArea — a failed answer', () => {
  const failed = (content = '') => ({
    role: 'assistant', content, interrupted: true,
    agentStages: [{ stage: 'query_rewrite', status: 'complete', durationMs: 300 }, { stage: 'prepare', status: 'failed' }],
    notice: { kind: 'error', key: 'botUnavailable' }, retry: { userText: 'q' },
  });

  it('shows a friendly notice and no pipeline stages when nothing was answered', () => {
    const { container, getByText } = render(<ChatArea {...baseProps} messages={[{ role: 'user', content: 'q' }, failed()]} />);
    expect(container.querySelector('.agent-thinking-block')).toBeNull();
    expect(container.textContent).not.toMatch(/stage_|Переформулировка/);
    expect(getByText(/технические работы/)).toBeTruthy();
  });

  it('puts Retry under the notice text, not beside it', () => {
    const { container } = render(<ChatArea {...baseProps} messages={[{ role: 'user', content: 'q' }, failed()]} />);
    const retry = container.querySelector('.retry-btn');
    expect(retry).toBeTruthy();
    expect(retry.closest('.message-notice-actions')).toBeTruthy();
  });

  it('keeps a partly streamed answer and still offers Retry', () => {
    const { getByText, container } = render(<ChatArea {...baseProps} messages={[{ role: 'user', content: 'q' }, failed('Начало ответа')]} />);
    expect(getByText('Начало ответа')).toBeTruthy();
    expect(container.querySelector('.retry-btn')).toBeTruthy();
  });
});

describe('ChatArea — answer markdown', () => {
  it('opens links of the answer in a new tab', () => {
    const messages = [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'См. [сайт](https://www.nsu.ru/).' }];
    const { container } = render(<ChatArea {...baseProps} messages={messages} />);
    const a = container.querySelector('.message-markdown a');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
  });

  it('puts a table in its own horizontal scroller so the page does not scroll sideways', () => {
    const table = '| a | b |\n|---|---|\n| 1 | 2 |';
    const messages = [{ role: 'user', content: 'q' }, { role: 'assistant', content: table }];
    const { container } = render(<ChatArea {...baseProps} messages={messages} />);
    expect(container.querySelector('.message-markdown .table-scroll > table')).toBeTruthy();
  });
});

describe('ChatArea — mobile layout rules', () => {
  const css = readFileSync('src/components/ChatArea.css', 'utf-8');
  const feedbackCss = readFileSync('src/components/MessageFeedback.css', 'utf-8');

  it('never scrolls the message list sideways', () => {
    const rule = css.match(/\.chat-messages \{[^}]*\}/)[0];
    expect(rule).toMatch(/overflow-x:\s*hidden/);
  });

  it('gives the feedback box a 16px font on touch screens so iOS does not zoom in', () => {
    expect(feedbackCss).toMatch(/@media \(hover: none\)[^{]*\{[^@]*\.feedback-comment-input\s*\{[^}]*font-size:\s*16px/);
  });

  it('shows the message actions on touch screens, where there is no hover', () => {
    expect(css).toMatch(/@media \(hover: none\)[^{]*\{[^@]*\.message-actions-bar[^{]*\{[^}]*opacity:\s*1/);
  });
});

describe('ChatArea — waiting for the first stage', () => {
  it('shows the waiting phrase in the same header the stages then fill, not in a separate block', () => {
    const waiting = [{ role: 'user', content: 'q' }, { role: 'assistant', content: '', isStreaming: true, agentStages: [] }];
    const { container, rerender } = render(<ChatArea {...baseProps} isGenerating messages={waiting} />);
    expect(container.querySelector('.message-wrapper.generating')).toBeNull();
    const header = container.querySelector('.agent-thinking-summary');
    expect(header?.querySelector('.loading-phrase')).toBeTruthy();

    const staged = [waiting[0], { ...waiting[1], agentStages: [{ stage: 'retrieval', status: 'running' }] }];
    rerender(<ChatArea {...baseProps} isGenerating messages={staged} />);
    expect(container.querySelector('.agent-thinking-summary')).toBe(header);
  });
});

describe('ChatArea — a stopped answer has one status', () => {
  const cutAtSearch = [
    { stage: 'query_rewrite', status: 'complete', durationMs: 300 },
    { stage: 'retrieval', status: 'running', durationMs: null },
  ];
  const lastAnswer = (container) => [...container.querySelectorAll('.message-wrapper.assistant')].at(-1);

  it('says "Остановлено" once — in the block header, with the time — and keeps Retry', () => {
    const messages = [{ role: 'user', content: 'q' }, { ...stopped(''), agentStages: cutAtSearch }];
    const { container } = render(<ChatArea {...baseProps} messages={messages} />);
    const answer = lastAnswer(container);
    expect(answer.textContent.match(/Остановлено/g)).toHaveLength(1);
    expect(answer.querySelector('.agent-thinking-summary').textContent).toBe('Остановлено · 0.3 с');
    expect(answer.querySelector('.message-notice-icon')).toBeNull(); // no second stop square
    expect(answer.querySelectorAll('.retry-btn')).toHaveLength(1);
    expect(answer.querySelector('.spinning')).toBeNull();
  });

  it('the same with a partly streamed answer', () => {
    const generating = [...cutAtSearch.slice(0, 1), { stage: 'generation', status: 'running', durationMs: null }];
    const messages = [{ role: 'user', content: 'q' }, { ...stopped('Начало ответа'), agentStages: generating }];
    const { container, getByText } = render(<ChatArea {...baseProps} messages={messages} />);
    const answer = lastAnswer(container);
    expect(getByText('Начало ответа')).toBeTruthy();
    expect(answer.querySelector('.agent-thinking-summary').textContent).toBe('Остановлено · 0.3 с');
    expect(answer.textContent.match(/Остановлено/g)).toHaveLength(1);
    expect(answer.querySelector('.message-notice-icon')).toBeNull();
    expect(answer.querySelectorAll('.retry-btn')).toHaveLength(1);
  });

  it('an older stopped answer, with no Retry, leaves no empty notice behind', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      { ...stopped('older'), agentStages: cutAtSearch },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'clean answer' },
    ];
    const { container } = render(<ChatArea {...baseProps} messages={messages} />);
    const older = container.querySelectorAll('.message-wrapper.assistant')[0];
    expect(older.querySelector('.message-notice')).toBeNull();
    expect(older.textContent.match(/Остановлено/g)).toHaveLength(1);
  });

  it('keeps the "Остановлено" notice when stopped before any stage (no block to say it)', () => {
    const messages = [{ role: 'user', content: 'q' }, stopped('')];
    const { container } = render(<ChatArea {...baseProps} messages={messages} />);
    const answer = lastAnswer(container);
    expect(answer.querySelector('.agent-thinking-block')).toBeNull();
    expect(answer.querySelector('.message-notice-text').textContent).toBe('Остановлено');
    expect(answer.querySelectorAll('.retry-btn')).toHaveLength(1);
  });

  it('a normally finished answer keeps its time header and has no notice', () => {
    const messages = [{ role: 'user', content: 'q' }, {
      role: 'assistant', content: 'Ответ.',
      agentStages: [{ stage: 'query_rewrite', status: 'complete', durationMs: 300 }], agentSummary: { totalMs: 4500 },
    }];
    const { container } = render(<ChatArea {...baseProps} messages={messages} />);
    const answer = lastAnswer(container);
    expect(answer.querySelector('.agent-thinking-summary').textContent).toBe('Обработка заняла 4.5 сек');
    expect(answer.querySelector('.message-notice')).toBeNull();
    expect(answer.textContent).not.toMatch(/Остановлено/);
  });

  it('a partly answered failure keeps the time header and the notice text, and never says "Остановлено"', () => {
    const messages = [{ role: 'user', content: 'q' }, {
      role: 'assistant', content: 'Начало ответа', interrupted: true, agentStages: cutAtSearch,
      notice: { kind: 'error', key: 'botUnavailable' }, retry: { userText: 'q' },
    }];
    const { container } = render(<ChatArea {...baseProps} messages={messages} />);
    const answer = lastAnswer(container);
    expect(answer.querySelector('.agent-thinking-summary').textContent).toBe('Обработка заняла 0.3 сек');
    expect(answer.querySelector('.message-notice-text').textContent).toMatch(/технические работы/);
    expect(answer.textContent).not.toMatch(/Остановлено/);
    expect(answer.querySelector('.spinning')).toBeNull();
    expect(answer.querySelectorAll('.retry-btn')).toHaveLength(1);
  });
});

describe('ChatArea — the real time a stopped answer ran', () => {
  const stages = [
    { stage: 'query_rewrite', status: 'complete', durationMs: 300 },
    { stage: 'generation', status: 'running', durationMs: null },
  ];

  it('shows the time from the request to the stop, recorded on the message', () => {
    const messages = [{ role: 'user', content: 'q' }, {
      ...stopped('Начало ответа'), agentStages: stages, thinkStartTime: 1_000_000, endedAt: 1_004_100,
    }];
    const { container } = render(<ChatArea {...baseProps} messages={messages} />);
    expect(container.querySelector('.agent-thinking-summary').textContent).toBe('Остановлено · 4.1 с');
  });

  it('keeps the finished-stages time for an older saved message without the stop moment', () => {
    const messages = [{ role: 'user', content: 'q' }, { ...stopped('Начало ответа'), agentStages: stages, thinkStartTime: 1_000_000 }];
    const { container } = render(<ChatArea {...baseProps} messages={messages} />);
    expect(container.querySelector('.agent-thinking-summary').textContent).toBe('Остановлено · 0.3 с');
  });
});
