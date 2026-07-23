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
