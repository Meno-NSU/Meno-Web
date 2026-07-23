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
} from './services/api.js';

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
