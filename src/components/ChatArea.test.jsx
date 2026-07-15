import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
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
