import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  register,
  patchPrivacySettings,
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

describe('App — a signed-in user with no stored history can still send', () => {
  it('has a chat to send into after signing in with an empty history', async () => {
    // Returning signed-in user (stored token verified on mount), no conversations
    // on the server. Before the fix serverChats stayed [], so activeChatId was
    // null and handleSendMessage returned silently — the send never fired.
    getAuthToken.mockReturnValue('tok-existing');
    fetchMe.mockResolvedValue({ id: 'u1', email: 'demo@nsu.ru', nickname: 'Demo' });
    fetchConversations.mockResolvedValue([]);
    sendChatMessage.mockResolvedValue({});

    const { container } = render(<App />);

    await waitFor(() => expect(fetchConversations).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('.chat-textarea')).toBeTruthy());

    fireEvent.change(container.querySelector('.chat-textarea'), {
      target: { value: 'Первый вопрос после логина' },
    });
    fireEvent.submit(container.querySelector('.input-form'));

    await waitFor(() => expect(sendChatMessage).toHaveBeenCalledTimes(1));
  });
});

describe('App — registration is one consent to purposes 1-3', () => {
  it('records menoImprovement:true (source registration) once the consent box is checked', async () => {
    // The mandatory registration checkbox grants purposes 1-3 in one act, so the
    // improvement toggle (purpose 3) must start ON — this is the exact wire whose
    // previous `false` left the Settings toggle unchecked after accepting consent.
    getLegalDocuments.mockResolvedValue([{ kind: 'personal_data_consent', version: '2.0' }]);
    register.mockResolvedValue({
      token: 'tok-new',
      user: { id: 'u2', email: 'new@nsu.ru', nickname: null },
    });
    patchPrivacySettings.mockResolvedValue({});
    fetchConversations.mockResolvedValue([]);
    fetchConversation.mockResolvedValue({ turns: [] });

    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.auth-signin-btn')).toBeTruthy());

    fireEvent.click(container.querySelector('.auth-signin-btn'));
    fireEvent.click(container.querySelectorAll('.auth-tab')[1]); // register tab
    fireEvent.change(container.querySelector('.auth-card input[type="email"]'), {
      target: { value: 'new@nsu.ru' },
    });
    fireEvent.change(container.querySelector('.auth-card input[type="password"]'), {
      target: { value: 'secret123' },
    });
    fireEvent.click(container.querySelector('.auth-consent-check input[type="checkbox"]'));
    fireEvent.submit(container.querySelector('.auth-form'));

    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(patchPrivacySettings).toHaveBeenCalledWith(
        expect.objectContaining({
          documentVersion: '2.0',
          serviceAndHistory: true,
          menoImprovement: true,
          source: 'registration',
        }),
      ),
    );
  });
});

describe('App — an untouched first chat is not listed until it holds a message', () => {
  it('shows an empty sidebar (no deletable "New Conversation") for a fresh guest, while the composer still works', async () => {
    // Fresh guest: no stored chats. initData seeds a draft so the composer has a
    // target, but a never-sent draft must NOT appear in the list — before the first
    // message there is no conversation to show, and nothing to offer a delete on.
    getAuthToken.mockReturnValue(null);
    fetchMe.mockResolvedValue(null);

    const { container } = render(<App />);

    // Composer is live (the draft exists as the send target)...
    await waitFor(() => expect(container.querySelector('.chat-textarea')).toBeTruthy());
    // ...but the sidebar list is empty: no chat rows, no delete buttons, empty-state shown.
    expect(container.querySelector('.chat-list-item')).toBeNull();
    expect(container.querySelector('.delete-chat-btn')).toBeNull();
    expect(container.querySelector('.no-chats-msg')).toBeTruthy();
    // And no stray English "New Conversation" leaked into the UI.
    expect(screen.queryByText('New Conversation')).toBeNull();
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
    fireEvent.click(container.querySelector('.version-row'));
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
    // The model picked while loading stays, rather than the one the last answer came from (m1).
    expect(container.querySelector('.version-trigger-model').textContent).toBe('Model 2');
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

describe('App — the version picker follows the model list', () => {
  const backend = { provider: 'external', status: { state: 'available' } };
  const entry = (id, extra) => ({ id, display_name: id, ...backend, ...extra });

  it('keeps a chat in its version when its model goes away', async () => {
    localStorage.setItem('pickedModelId', 'a@menon-1.1');
    const c = entry('c', { stand_id: 'menon-1.0', stand_name: 'Menon 1.0', llm_id: 'c', llm_name: 'C' });
    const a = entry('a@menon-1.1', { stand_id: 'menon-1.1', stand_name: 'Menon 1.1', llm_id: 'a', llm_name: 'A' });
    const b = entry('b@menon-1.1', { stand_id: 'menon-1.1', stand_name: 'Menon 1.1', llm_id: 'b', llm_name: 'B' });
    fetchModels.mockResolvedValue({ models: [c, a, b], coreModelId: 'c' });
    refreshModels.mockResolvedValue({ models: [c, b], coreModelId: 'c' });

    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.version-trigger-model')?.textContent).toBe('A'));

    fireEvent.click(container.querySelector('.model-dropdown-trigger'));
    await waitFor(() => expect(container.querySelector('.version-trigger-model')?.textContent).toBe('B'));
    expect(container.querySelector('.version-trigger-version').textContent).toBe('Менон 1.1');
  });

  describe('after a reload, when the model a chat used is gone', () => {
    // Stored state only: a reload has no previous model list, so the version comes from
    // the `@` suffix — trusted because «menon-1.1» is a listed version.
    const v10 = entry('c', { stand_id: 'menon-1.0', stand_name: 'Menon 1.0', llm_id: 'c', llm_name: 'C' });
    const v11 = entry('a@menon-1.1', { stand_id: 'menon-1.1', stand_name: 'Menon 1.1', llm_id: 'a', llm_name: 'A' });
    const trigger = (container) => ({
      version: container.querySelector('.version-trigger-version')?.textContent,
      model: container.querySelector('.version-trigger-model')?.textContent,
    });

    beforeEach(() => {
      fetchModels.mockResolvedValue({ models: [v10, v11], coreModelId: 'c' });
      refreshModels.mockResolvedValue({ models: [v10, v11], coreModelId: 'c' });
      localStorage.setItem('pickedModelId', 'b@menon-1.1');
    });

    it('keeps a stored guest chat in its version', async () => {
      saveChats([{
        id: 'guest-1',
        title: 'Чат в 1.1',
        messages: [{ role: 'user', content: 'Привет' }],
        updatedAt: Date.now(),
        runtimeConfig: { modelId: 'b@menon-1.1', knowledgeBaseId: 'kb1', sessionId: 'guest-1' },
      }]);

      const { container } = render(<App />);
      await waitFor(() => expect(screen.getByText('Чат в 1.1')).toBeTruthy());
      await waitFor(() => expect(trigger(container).model).toBeTruthy());

      expect(trigger(container)).toEqual({ version: 'Менон 1.1', model: 'A' });
      expect(localStorage.getItem('pickedModelId')).toBe('b@menon-1.1'); // the pick is the person's: kept as made
    });

    it('starts a fresh visit in the version last picked', async () => {
      const { container } = render(<App />);
      await waitFor(() => expect(trigger(container).model).toBeTruthy());

      expect(trigger(container)).toEqual({ version: 'Менон 1.1', model: 'A' });
      expect(localStorage.getItem('pickedModelId')).toBe('b@menon-1.1');
    });

    it('opens a signed-in user\'s server chats in the version last picked', async () => {
      getAuthToken.mockReturnValue('tok-existing');
      fetchMe.mockResolvedValue({ id: 'u1', email: 'demo@nsu.ru', nickname: 'Demo' });
      fetchConversations.mockResolvedValue([
        { id: 'srv-1', preview: 'Чат с сервера', updated_at: '2026-07-20T00:00:00Z' },
      ]);
      fetchConversation.mockResolvedValue({ turns: [] });

      const { container } = render(<App />);
      await waitFor(() => expect(screen.getByText('Чат с сервера')).toBeTruthy());
      await waitFor(() => expect(trigger(container).model).toBeTruthy());

      expect(trigger(container)).toEqual({ version: 'Менон 1.1', model: 'A' });
      expect(localStorage.getItem('pickedModelId')).toBe('b@menon-1.1');
    });
  });

  // Without a pick of their own, a person's new chats start in the site's default, RAGU with Gemma. The key that
  // held the default (and every model a chat was opened in) as if picked is dropped, so the default reaches those who
  // came before it changed.
  describe('the default', () => {
    const v10 = entry('c', { stand_id: 'menon-1.0', stand_name: 'Menon 1.0', llm_id: 'c', llm_name: 'C' });
    const v11 = entry('gemma-4-12B-it@menon-1.1', {
      stand_id: 'menon-1.1', stand_name: 'Menon 1.1', llm_id: 'gemma-4-12B-it', llm_name: 'Gemma 4 12B',
    });
    const ragu = entry('gemma-4-12B-it@ragu', {
      stand_id: 'ragu', stand_name: 'RAGU v3k', llm_id: 'gemma-4-12B-it', llm_name: 'Gemma 4 12B',
    });
    const trigger = (container) => ({
      version: container.querySelector('.version-trigger-version')?.textContent,
      model: container.querySelector('.version-trigger-model')?.textContent,
    });
    const stored = (id, title, messages, updatedAt) => ({
      id, title, messages, updatedAt, runtimeConfig: { modelId: 'c', knowledgeBaseId: 'kb1', sessionId: id },
    });

    beforeEach(() => {
      fetchModels.mockResolvedValue({ models: [v10, v11, ragu], coreModelId: 'c' });
      refreshModels.mockResolvedValue({ models: [v10, v11, ragu], coreModelId: 'c' });
    });

    it('starts a first visit in RAGU with Gemma and stores no pick', async () => {
      const { container } = render(<App />);
      await waitFor(() => expect(trigger(container).model).toBeTruthy());

      expect(trigger(container)).toEqual({ version: 'RAGU v3k', model: 'Gemma 4 12B' });
      expect(localStorage.getItem('pickedModelId')).toBeNull();
    });

    it('moves a returning visitor\'s empty chat to it and keeps a chat with answers in its model', async () => {
      localStorage.setItem('lastUsedModelId', 'c');
      saveChats([
        stored('draft', '', [], 2000),
        stored('old', 'Старый разговор', [{ role: 'user', content: 'Привет' }], 1000),
      ]);

      const { container } = render(<App />);
      await waitFor(() => expect(trigger(container).model).toBeTruthy());
      expect(trigger(container)).toEqual({ version: 'RAGU v3k', model: 'Gemma 4 12B' });
      expect(localStorage.getItem('lastUsedModelId')).toBeNull();

      fireEvent.click(screen.getByText('Старый разговор'));
      await waitFor(() => expect(trigger(container).version).toBe('Менон 1.0'));
      expect(trigger(container).model).toBe('C');
    });

    it('starts a new chat in it from an old chat, and in the person\'s pick once they make one', async () => {
      saveChats([stored('old', 'Старый разговор', [{ role: 'user', content: 'Привет' }], 1000)]);

      const { container } = render(<App />);
      await waitFor(() => expect(trigger(container).version).toBe('Менон 1.0'));

      fireEvent.click(container.querySelector('.new-chat-btn-icon'));
      await waitFor(() => expect(trigger(container)).toEqual({ version: 'RAGU v3k', model: 'Gemma 4 12B' }));

      fireEvent.click(screen.getByText('Старый разговор'));
      await waitFor(() => expect(trigger(container).version).toBe('Менон 1.0'));
      fireEvent.click(container.querySelector('.model-dropdown-trigger'));
      const menu = () => within(container.querySelector('.model-dropdown-menu'));
      await waitFor(() => expect(menu().getByText('Менон 1.1')).toBeTruthy());
      fireEvent.click(menu().getByText('Менон 1.1')); // its only model: picked at once
      await waitFor(() => expect(trigger(container).version).toBe('Менон 1.1'));
      expect(localStorage.getItem('pickedModelId')).toBe('gemma-4-12B-it@menon-1.1');
    });
  });

  // A restored conversation continues where it left off: the picker shows the model of its
  // last answer, not the one used last in some other chat.
  it('opens a restored server chat in the model of its last answer', async () => {
    const v10 = entry('c', { stand_id: 'menon-1.0', stand_name: 'Menon 1.0', llm_id: 'c', llm_name: 'C' });
    const v11 = entry('a@menon-1.1', { stand_id: 'menon-1.1', stand_name: 'Menon 1.1', llm_id: 'a', llm_name: 'A' });
    const ragu = entry('r@ragu', { stand_id: 'ragu', stand_name: 'RAGU', llm_id: 'r', llm_name: 'R' });
    fetchModels.mockResolvedValue({ models: [v10, v11, ragu], coreModelId: 'c' });
    refreshModels.mockResolvedValue({ models: [v10, v11, ragu], coreModelId: 'c' });
    localStorage.setItem('pickedModelId', 'a@menon-1.1');
    getAuthToken.mockReturnValue('tok-existing');
    fetchMe.mockResolvedValue({ id: 'u1', email: 'demo@nsu.ru', nickname: 'Demo' });
    fetchConversations.mockResolvedValue([
      { id: 'srv-1', preview: 'Какое расписание?', updated_at: '2026-07-20T00:00:00Z' },
    ]);
    fetchConversation.mockResolvedValue({
      turns: [
        { kind: 'user', content: 'Какое расписание?', created_at: 'x' },
        { kind: 'answer', content: 'Ответ RAGU', model: 'r@ragu', request_id: 'run-1', sources: [], created_at: 'x' },
      ],
    });

    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText('Ответ RAGU')).toBeTruthy());
    await waitFor(() => expect(container.querySelector('.version-trigger-version')?.textContent).toBe('RAGU'));
    expect(container.querySelector('.version-trigger-model').textContent).toBe('R');
    expect(container.querySelector('.message-model-label').textContent).toBe('RAGU · R');
  });

  it('shows a model that turned unreachable after the menu refreshes', async () => {
    const m1 = { id: 'm1', display_name: 'Model 1', provider: 'vllm', status: { state: 'available' } };
    const m2 = { id: 'm2', display_name: 'Model 2', provider: 'vllm', status: { state: 'available' } };
    fetchModels.mockResolvedValue({ models: [m1, m2], coreModelId: 'm1' });
    refreshModels.mockResolvedValue({
      models: [m1, { ...m2, status: { state: 'unreachable' } }],
      coreModelId: 'm1',
    });

    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('.model-dropdown-trigger')).toBeTruthy());
    fireEvent.click(container.querySelector('.model-dropdown-trigger'));
    const row = await waitFor(() => {
      const found = [...container.querySelectorAll('.version-row')].find((r) => r.textContent.includes('Менон 1.0'));
      expect(found).toBeTruthy();
      return found;
    });
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByText('Model 2').closest('button').disabled).toBe(true));
  });
});
