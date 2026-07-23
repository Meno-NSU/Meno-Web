import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App.jsx';
import { saveChats } from './store/chatStore.js';

// jsdom has no scrollIntoView; ChatArea's mount effect calls it on every chat
// switch to snap to the latest message.
Element.prototype.scrollIntoView = vi.fn();

// The whole surface App (transitively) imports from services/api.js, so every
// named export any file in the render tree destructures must exist here —
// App.jsx itself, plus authStore.js (fetchMe/getAuthToken/login/register/
// setAuthToken/updateNickname), ChatArea.jsx (submitArenaVote),
// MessageFeedback.jsx (submitFeedback/clearFeedback) and Leaderboard.jsx
// (fetchContributorLeaderboard) — the last is only ever imported, never
// rendered (currentView starts 'chat'), but the import itself must resolve.
vi.mock('./services/api.js', () => ({
  clearChatHistory: vi.fn(),
  ensureGuestSession: vi.fn(),
  fetchConversation: vi.fn(),
  fetchConversations: vi.fn(),
  fetchKnowledgeBases: vi.fn(),
  fetchModels: vi.fn(),
  refreshModels: vi.fn(),
  sendChatMessage: vi.fn(),
  recordArenaTurn: vi.fn(),
  fetchServiceStatus: vi.fn(),
  getPrivacySettings: vi.fn(),
  patchPrivacySettings: vi.fn(),
  getLegalDocuments: vi.fn(),
  deleteMyData: vi.fn(),
  deleteServerHistory: vi.fn(),
  setGuestToken: vi.fn(),
  submitSurvey: vi.fn(),
  clearFeedback: vi.fn(),
  submitFeedback: vi.fn(),
  submitArenaVote: vi.fn(),
  fetchContributorLeaderboard: vi.fn(),
  fetchMe: vi.fn(),
  getAuthToken: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  setAuthToken: vi.fn(),
  updateNickname: vi.fn(),
}));

// Real shouldShowSurvey draws from Math.random() (SURVEY_PROBABILITY = 0.1) — mocked so the
// end-of-session survey modal's appearance is deterministic wherever a test cares about it,
// and so no other test can flake the ~10% of the time a chat it leaves happens to qualify.
vi.mock('./services/surveyGate.js', () => ({
  shouldShowSurvey: vi.fn(),
}));

import {
  fetchModels,
  refreshModels,
  fetchKnowledgeBases,
  fetchConversations,
  fetchConversation,
  ensureGuestSession,
  getPrivacySettings,
  getLegalDocuments,
  getAuthToken,
  fetchMe,
  login,
  submitSurvey,
  sendChatMessage,
} from './services/api.js';
import { shouldShowSurvey } from './services/surveyGate.js';

const MODEL = { id: 'm1', display_name: 'Model 1', provider: 'vllm' };
const KB = { id: 'kb1', name: 'KB 1', available: true };

// Re-established before every test (not just `.mockClear()`, which would leave
// a previous test's `.mockImplementation`/`.mockResolvedValue` in place) so
// each test starts from the same known-good baseline regardless of run order.
function resetApiMocks() {
  ensureGuestSession.mockResolvedValue('guest-token');
  fetchModels.mockResolvedValue({ models: [MODEL], coreModelId: 'm1' });
  refreshModels.mockResolvedValue({ models: [MODEL], coreModelId: 'm1' });
  fetchKnowledgeBases.mockResolvedValue([KB]);
  fetchConversations.mockResolvedValue([]);
  fetchConversation.mockResolvedValue(null);
  // menoImprovement: true keeps the (unrelated) consent modal from popping up
  // and obscuring the assertions below.
  getPrivacySettings.mockResolvedValue({ serviceAndHistory: true, menoImprovement: true });
  getLegalDocuments.mockResolvedValue([]);
  getAuthToken.mockReturnValue(null);
  fetchMe.mockResolvedValue(null);
  login.mockResolvedValue({});
  submitSurvey.mockResolvedValue({});
  // Default false: a test that doesn't care about the survey must never have it pop up and
  // obscure its own assertions (see the comment on the vi.mock above).
  shouldShowSurvey.mockReturnValue(false);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  resetApiMocks();
});

function seedGuestChat() {
  saveChats([{
    id: 'guest-1',
    title: 'Локальный чат',
    messages: [{ role: 'user', content: 'Привет' }],
    updatedAt: Date.now(),
    runtimeConfig: { modelId: '', knowledgeBaseId: '', sessionId: 'guest-1' },
  }]);
}

describe('App — a signed-in identity replaces the visible chats, and signing out restores them', () => {
  it('shows the guest chat; signing in swaps in the server chats and hides the guest one; signing out brings it back', async () => {
    seedGuestChat();
    fetchConversations.mockResolvedValue([
      { id: 'srv-1', preview: 'Чат с сервера 1', updated_at: '2026-07-20T00:00:00Z' },
      { id: 'srv-2', preview: 'Чат с сервера 2', updated_at: '2026-07-19T00:00:00Z' },
    ]);
    fetchConversation.mockResolvedValue({ turns: [] });
    login.mockResolvedValue({
      token: 'tok-1',
      user: { id: 'u1', email: 'demo@nsu.ru', nickname: 'Demo' },
    });

    const { container } = render(<App />);

    // Guest: sees their own local chat.
    await waitFor(() => expect(screen.getByText('Локальный чат')).toBeTruthy());

    // Sign in through the real UI: SettingsBar's sign-in affordance opens
    // AuthModal; fill and submit the login form (defaults to the login tab).
    fireEvent.click(container.querySelector('.auth-signin-btn'));
    fireEvent.change(container.querySelector('.auth-card input[type="email"]'), {
      target: { value: 'demo@nsu.ru' },
    });
    fireEvent.change(container.querySelector('.auth-card input[type="password"]'), {
      target: { value: 'secret123' },
    });
    fireEvent.submit(container.querySelector('.auth-form'));

    // Signed in: the server's conversations replace the sidebar; the guest
    // chat is gone — hidden by chatsForIdentity, per the design.
    await waitFor(() => expect(screen.getByText('Чат с сервера 1')).toBeTruthy());
    expect(screen.getByText('Чат с сервера 2')).toBeTruthy();
    expect(screen.queryByText('Локальный чат')).toBeNull();

    // Sign out via SettingsBar's account menu.
    fireEvent.click(container.querySelector('.auth-chip'));
    fireEvent.click(container.querySelector('.auth-menu-item'));

    // Signed out: the guest's local chat is back — proving it was hidden,
    // not destroyed, and the server chats are gone from view again.
    await waitFor(() => expect(screen.getByText('Локальный чат')).toBeTruthy());
    expect(screen.queryByText('Чат с сервера 1')).toBeNull();
    expect(screen.queryByText('Чат с сервера 2')).toBeNull();
  });
});

describe('App — opening a not-yet-loaded conversation', () => {
  it('fetches its content exactly once, even across unrelated re-renders and updates to the same chat', async () => {
    // Two models so a mid-load model switch (below) has something to switch
    // to — both vllm so they render in the dropdown's default (unexpanded) group.
    const MODEL2 = { id: 'm2', display_name: 'Model 2', provider: 'vllm' };
    fetchModels.mockResolvedValue({ models: [MODEL, MODEL2], coreModelId: 'm1' });
    refreshModels.mockResolvedValue({ models: [MODEL, MODEL2], coreModelId: 'm1' });

    // A returning signed-in user: a stored token verified on mount, rather
    // than an interactive sign-in — exercises the cold-start path too.
    getAuthToken.mockReturnValue('tok-existing');
    fetchMe.mockResolvedValue({ id: 'u1', email: 'demo@nsu.ru', nickname: 'Demo' });
    fetchConversations.mockResolvedValue([
      { id: 'srv-1', preview: 'Chat One', updated_at: '2026-07-20T00:00:00Z' },
      { id: 'srv-2', preview: 'Chat Two', updated_at: '2026-07-19T00:00:00Z' },
    ]);

    // srv-1 is newest, so the "pick an active chat" effect auto-opens it —
    // let that resolve trivially. srv-2's fetch is held open under our
    // control so we can force re-renders while it's still in flight.
    let resolveSrv2;
    const srv2Promise = new Promise((resolve) => { resolveSrv2 = resolve; });
    fetchConversation.mockImplementation((id) => (
      id === 'srv-2' ? srv2Promise : Promise.resolve({ turns: [] })
    ));

    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText('Chat Two')).toBeTruthy());

    const callsForSrv2 = () => fetchConversation.mock.calls.filter(([id]) => id === 'srv-2').length;

    // Open the not-yet-loaded conversation.
    fireEvent.click(screen.getByText('Chat Two'));
    await waitFor(() => expect(callsForSrv2()).toBe(1));

    // While pending, the not-yet-loaded state is visible (see ChatArea's
    // isLoadingConversation) rather than the ordinary empty-chat welcome.
    expect(screen.getByText('Восстанавливаем историю чата…')).toBeTruthy();

    // Baseline: an App re-render with nothing to do with this chat (a plain
    // theme toggle, touching no chat state at all) must not refetch.
    const themeToggle = container.querySelector('.theme-toggle');
    fireEvent.click(themeToggle);
    fireEvent.click(themeToggle);
    expect(callsForSrv2()).toBe(1);

    // The actual regression guard: selecting a different model calls
    // setActiveChats on the ACTIVE chat (still srv-2, still loading) via
    // updateActiveChatRuntimeConfig — this genuinely produces a brand-new
    // serverChats array reference (updateChatById finds srv-2 and replaces
    // it), same as an unrelated chat's streamed token used to. Before this
    // was fixed, the load effect depended on that array directly and
    // restarted the fetch on every such change; it must now depend on the
    // loaded/not-loaded boolean instead and stay put.
    fireEvent.click(container.querySelector('.model-dropdown-trigger'));
    fireEvent.click(screen.getByText('Model 2'));
    expect(callsForSrv2()).toBe(1);

    resolveSrv2({
      turns: [
        { kind: 'user', content: 'Q2', created_at: 'x' },
        {
          kind: 'answer', content: 'A2', created_at: 'x', model: 'm1',
          request_id: 'r2', sources: [], feedback: null,
        },
      ],
    });

    await waitFor(() => expect(screen.getByText('A2')).toBeTruthy());
    expect(callsForSrv2()).toBe(1);
  });
});

describe('App — a signed-in user\'s conversation list fails to load', () => {
  it('shows a could-not-load notice instead of claiming the history is empty, and does not crash', async () => {
    // null (not []) is fetchConversations' failure signal — see services/api.js.
    fetchConversations.mockResolvedValue(null);
    login.mockResolvedValue({
      token: 'tok-1',
      user: { id: 'u1', email: 'demo@nsu.ru', nickname: 'Demo' },
    });

    const { container } = render(<App />);

    fireEvent.click(container.querySelector('.auth-signin-btn'));
    fireEvent.change(container.querySelector('.auth-card input[type="email"]'), {
      target: { value: 'demo@nsu.ru' },
    });
    fireEvent.change(container.querySelector('.auth-card input[type="password"]'), {
      target: { value: 'secret123' },
    });
    fireEvent.submit(container.querySelector('.auth-form'));

    // Would throw on summaries.map(...) if the null weren't guarded against.
    await waitFor(() => expect(screen.getByText(/Не удалось загрузить историю/i)).toBeTruthy());
    expect(screen.queryByText('Нет недавних чатов')).toBeNull();
  });

  it('clears the failure notice once a later load succeeds (sign out, sign back in)', async () => {
    fetchConversations.mockResolvedValueOnce(null);
    login.mockResolvedValue({
      token: 'tok-1',
      user: { id: 'u1', email: 'demo@nsu.ru', nickname: 'Demo' },
    });

    const { container } = render(<App />);

    fireEvent.click(container.querySelector('.auth-signin-btn'));
    fireEvent.change(container.querySelector('.auth-card input[type="email"]'), {
      target: { value: 'demo@nsu.ru' },
    });
    fireEvent.change(container.querySelector('.auth-card input[type="password"]'), {
      target: { value: 'secret123' },
    });
    fireEvent.submit(container.querySelector('.auth-form'));
    await waitFor(() => expect(screen.getByText(/Не удалось загрузить историю/i)).toBeTruthy());

    // Sign out, then back in — this time the fetch succeeds. A returning user who
    // reconnects must not still be told the earlier load failed.
    fireEvent.click(container.querySelector('.auth-chip'));
    fireEvent.click(container.querySelector('.auth-menu-item'));
    fetchConversations.mockResolvedValue([
      { id: 'srv-1', preview: 'Chat One', updated_at: '2026-07-20T00:00:00Z' },
    ]);
    fireEvent.click(container.querySelector('.auth-signin-btn'));
    fireEvent.change(container.querySelector('.auth-card input[type="email"]'), {
      target: { value: 'demo@nsu.ru' },
    });
    fireEvent.change(container.querySelector('.auth-card input[type="password"]'), {
      target: { value: 'secret123' },
    });
    fireEvent.submit(container.querySelector('.auth-form'));

    await waitFor(() => expect(screen.getByText('Chat One')).toBeTruthy());
    expect(screen.queryByText(/Не удалось загрузить историю/i)).toBeNull();
  });
});

describe('App — a chat action during token verification', () => {
  it('does not create a phantom local chat while a returning session is still verifying', async () => {
    // A returning signed-in user whose token verification we hold open —
    // auth.ready is false and isAuthenticated is (necessarily) also false,
    // exactly the window setActiveChats and visibleChats used to disagree on.
    getAuthToken.mockReturnValue('tok-existing');
    let resolveFetchMe;
    fetchMe.mockImplementation(() => new Promise((resolve) => { resolveFetchMe = resolve; }));
    fetchConversations.mockResolvedValue([
      { id: 'srv-1', preview: 'Server Chat', updated_at: '2026-07-20T00:00:00Z' },
    ]);
    fetchConversation.mockResolvedValue({ turns: [] });

    const { container } = render(<App />);

    // While verifying: visibleChats renders EMPTY_CHATS — not even the local
    // chat `initData` hydrates at mount — matching the shared-computer
    // protection the design describes.
    await waitFor(() => expect(screen.getByText('Нет недавних чатов')).toBeTruthy());

    // `initData`'s hydration of the local (guest) list runs regardless of
    // auth state and persists it via the saveChats effect — independent of
    // anything this test does. Let that settle first so the baseline below
    // isn't racing it: otherwise a "before" read taken too early would read
    // 0, and the hydration landing between the read and the click would look
    // exactly like a phantom chat from the click when it is not one.
    const storedCount = () => JSON.parse(localStorage.getItem('meno_core_chats') || '[]').length;
    await waitFor(() => expect(storedCount()).toBe(1));

    // Press "New Chat" during this window. Before setActiveChats was gated on
    // auth.ready, this routed on isAuthenticated alone (false — no user yet)
    // and wrote straight into `chats`, persisting a SECOND, guest chat to
    // localStorage that would then vanish the instant auth resolved and
    // rendering flipped to serverChats.
    fireEvent.click(container.querySelector('.new-chat-btn-icon'));
    expect(storedCount()).toBe(1);

    resolveFetchMe({ id: 'u1', email: 'demo@nsu.ru', nickname: 'Demo' });

    await waitFor(() => expect(screen.getByText('Server Chat')).toBeTruthy());
    expect(storedCount()).toBe(1);
  });
});

function seedAnsweredChat() {
  saveChats([{
    id: 'guest-1',
    title: 'Вопрос про НГУ',
    messages: [
      { role: 'user', content: 'Вопрос про НГУ' },
      { role: 'assistant', content: 'Ответ Менона', completionId: 'c1', isStreaming: false },
    ],
    updatedAt: Date.now(),
    runtimeConfig: { modelId: '', knowledgeBaseId: '', sessionId: 'guest-1' },
  }]);
}

describe('App — survey submission refused by ownership (404)', () => {
  it('shows the ownership refusal instead of staying silent, and still never nags twice', async () => {
    seedAnsweredChat();
    shouldShowSurvey.mockReturnValue(true);
    submitSurvey.mockRejectedValue(Object.assign(new Error('Not found'), { httpStatus: 404 }));

    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText('Ответ Менона')).toBeTruthy());

    // Leave the answered chat — fires the survey-on-leave effect for guest-1.
    fireEvent.click(container.querySelector('.new-chat-btn-icon'));
    await waitFor(() => expect(screen.getByText('Будете ли пользоваться Меноном для похожих вопросов?')).toBeTruthy());

    fireEvent.click(screen.getByText('Да'));

    // Never-nag-twice: the modal closes immediately, before the request resolves.
    await waitFor(() => expect(screen.queryByText('Будете ли пользоваться Меноном для похожих вопросов?')).toBeNull());
    await waitFor(() => expect(submitSurvey).toHaveBeenCalledTimes(1));

    // Back to guest-1: the refusal is now visible on the answer, not silently discarded.
    fireEvent.click(screen.getByText('Вопрос про НГУ'));
    await waitFor(() => expect(screen.getByText(/принадлежит другому профилю/i)).toBeTruthy());

    // Leaving guest-1 again must NOT reopen the survey — refused or not, it is surveyed.
    fireEvent.click(container.querySelector('.new-chat-btn-icon'));
    expect(screen.queryByText('Будете ли пользоваться Меноном для похожих вопросов?')).toBeNull();
  });

  it('does not attach a notice for a failure other than the ownership 404', async () => {
    seedAnsweredChat();
    shouldShowSurvey.mockReturnValue(true);
    submitSurvey.mockRejectedValue(Object.assign(new Error('Server error'), { httpStatus: 500 }));

    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText('Ответ Менона')).toBeTruthy());

    fireEvent.click(container.querySelector('.new-chat-btn-icon'));
    await waitFor(() => expect(screen.getByText('Будете ли пользоваться Меноном для похожих вопросов?')).toBeTruthy());
    fireEvent.click(screen.getByText('Да'));

    await waitFor(() => expect(screen.queryByText('Будете ли пользоваться Меноном для похожих вопросов?')).toBeNull());
    await waitFor(() => expect(submitSurvey).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Вопрос про НГУ'));
    expect(screen.queryByText(/принадлежит другому профилю/i)).toBeNull();
  });

  it('does not overwrite an existing notice on the last message with the survey refusal', async () => {
    // hadAnswer is satisfied by the FIRST answer (completionId 'c1'); the LAST message is a
    // second turn that already failed and is sitting there with its own notice + retry —
    // e.g. the user left without pressing "Retry". The survey notice must not clobber it.
    saveChats([{
      id: 'guest-1',
      title: 'Диалог с ошибкой',
      messages: [
        { role: 'user', content: 'Первый вопрос' },
        { role: 'assistant', content: 'Первый ответ', completionId: 'c1', isStreaming: false },
        { role: 'user', content: 'Второй вопрос' },
        {
          role: 'assistant', content: '', isStreaming: false, interrupted: true,
          notice: { kind: 'error', key: 'botUnavailable' }, retry: { userText: 'Второй вопрос' },
        },
      ],
      updatedAt: Date.now(),
      runtimeConfig: { modelId: '', knowledgeBaseId: '', sessionId: 'guest-1' },
    }]);
    shouldShowSurvey.mockReturnValue(true);
    submitSurvey.mockRejectedValue(Object.assign(new Error('Not found'), { httpStatus: 404 }));

    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText(/сейчас не в форме/i)).toBeTruthy());

    fireEvent.click(container.querySelector('.new-chat-btn-icon'));
    await waitFor(() => expect(screen.getByText('Будете ли пользоваться Меноном для похожих вопросов?')).toBeTruthy());
    fireEvent.click(screen.getByText('Да'));
    await waitFor(() => expect(screen.queryByText('Будете ли пользоваться Меноном для похожих вопросов?')).toBeNull());
    await waitFor(() => expect(submitSurvey).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Диалог с ошибкой'));
    await waitFor(() => expect(screen.getByText(/сейчас не в форме/i)).toBeTruthy());
    expect(screen.queryByText(/принадлежит другому профилю/i)).toBeNull();
  });
});

describe('App — continuing a restored chat that contains an arena round', () => {
  it('sends a content-bearing history instead of the raw arena message (422 regression)', async () => {
    // A signed-in, returning user (cold start, like the "not-yet-loaded
    // conversation" test above) whose one server conversation contains an
    // arena round — exactly conversationRestore.js's ArenaTurn shape.
    getAuthToken.mockReturnValue('tok-existing');
    fetchMe.mockResolvedValue({ id: 'u1', email: 'demo@nsu.ru', nickname: 'Demo' });
    fetchConversations.mockResolvedValue([
      { id: 'srv-1', preview: 'Первый вопрос', updated_at: '2026-07-20T00:00:00Z' },
    ]);
    fetchConversation.mockResolvedValue({
      turns: [
        { kind: 'user', content: 'Первый вопрос', created_at: 'x' },
        {
          kind: 'arena',
          content: 'Ответ A',
          created_at: 'x',
          winner: 'a',
          turn_index: 0,
          sides: [
            { key: 'a', model: 'm1', knowledge_base_id: 'kb1', content: 'Ответ A', sources: [] },
            { key: 'b', model: 'm2', knowledge_base_id: 'kb1', content: 'Ответ B', sources: [] },
          ],
        },
      ],
    });
    sendChatMessage.mockResolvedValue({});

    const { container } = render(<App />);
    // The restored arena bubble rendered — both answers are on screen.
    await waitFor(() => expect(screen.getByText('Ответ A')).toBeTruthy());
    expect(screen.getByText('Ответ B')).toBeTruthy();

    // Continue the chat with an ordinary message. isArenaMode defaults to
    // false (it never persists across a reload), so this goes down the
    // NORMAL send path — the one that used to forward the arena message
    // verbatim and 422 at the backend's ChatMessage schema.
    fireEvent.change(container.querySelector('.chat-textarea'), {
      target: { value: 'Продолжение разговора' },
    });
    fireEvent.submit(container.querySelector('.input-form'));

    await waitFor(() => expect(sendChatMessage).toHaveBeenCalledTimes(1));
    const { messages } = sendChatMessage.mock.calls[0][0];

    // The property that was violated: every outgoing message must carry a
    // content string — a raw arena message has none at the top level.
    expect(messages.every((m) => typeof m.content === 'string')).toBe(true);
    // Specifically: the voted (winner 'a') round collapsed to A's answer.
    expect(messages).toEqual([
      { role: 'user', content: 'Первый вопрос' },
      { role: 'assistant', content: 'Ответ A' },
      { role: 'user', content: 'Продолжение разговора' },
    ]);
  });
});
