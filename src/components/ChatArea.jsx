import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Bot, ChevronDown, Brain, Loader, CheckCircle, ExternalLink } from 'lucide-react';
import { useTranslation } from '../i18n.js';
import ChatInput from './ChatInput.jsx';
import MessageFeedback from './MessageFeedback.jsx';
import { buildArenaHistories, arenaTurnIndex } from '../services/arenaHistory.js';
import './ChatArea.css';

// ── Loading phrases ──────────────────────────────────────────────────────────
// Phrases now live in `src/i18n.js` (key `loadingPhrases`) and follow the
// active language — see useTranslation().
function LoadingPhrase() {
    const { t, lang } = useTranslation();
    const phrases = (Array.isArray(t('loadingPhrases')) && t('loadingPhrases').length > 0)
        ? t('loadingPhrases')
        : ['…'];
    const [index, setIndex] = useState(() => Math.floor(Math.random() * phrases.length));
    const [visible, setVisible] = useState(true);

    // Reset index when the language switches so we don't briefly index past
    // the new language's array bounds (the two language arrays may differ
    // in length down the road).
    useEffect(() => {
        setIndex(Math.floor(Math.random() * phrases.length));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lang]);

    useEffect(() => {
        const cycle = setInterval(() => {
            setVisible(false);
            setTimeout(() => {
                setIndex(prev => {
                    if (phrases.length <= 1) return 0;
                    let next;
                    do { next = Math.floor(Math.random() * phrases.length); }
                    while (next === prev);
                    return next;
                });
                setVisible(true);
            }, 400); // fade-out duration before swap
        }, 2600);
        return () => clearInterval(cycle);
    }, [phrases.length]);

    return (
        <div className={`loading-phrase ${visible ? 'visible' : 'hidden'}`}>
            {phrases[Math.min(index, phrases.length - 1)]}
        </div>
    );
}

// All inline links rendered from model output must open in a new tab —
// otherwise tapping one inside an in-progress arena round navigates the SPA
// away from the chat, kills both streams, and surfaces as
// "voting unavailable — try again". `noreferrer` keeps referrer info out
// of arbitrary third-party URLs.
const MARKDOWN_COMPONENTS = {
    // eslint-disable-next-line no-unused-vars
    a: ({ node, ...props }) => (
        <a {...props} target="_blank" rel="noopener noreferrer" />
    ),
};

// ── Think block parser ───────────────────────────────────────────────────────
/**
 * Splits a raw content string into an array of segments:
 *   { type: 'think', content: string, streaming?: boolean }
 *   { type: 'text',  content: string }
 *
 * During streaming, an unclosed <think> tag produces a segment with
 * streaming=true so the UI can render it as an open, live thinking block.
 */
function parseThinkBlocks(raw, thinkTime, isStreaming = false) {
    const segments = [];
    const regex = /<think>([\s\S]*?)<\/think>/gi;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(raw)) !== null) {
        if (match.index > lastIndex) {
            const before = raw.slice(lastIndex, match.index).trim();
            if (before) segments.push({ type: 'text', content: before });
        }
        segments.push({ type: 'think', content: match[1].trim(), thinkTime, streaming: false });
        lastIndex = regex.lastIndex;
    }
    // Handle remaining content after last closed </think>
    const remainder = raw.slice(lastIndex);
    if (remainder) {
        // Check for an unclosed <think> tag (streaming in progress)
        const openIdx = remainder.indexOf('<think>');
        if (openIdx !== -1) {
            const before = remainder.slice(0, openIdx).trim();
            if (before) segments.push({ type: 'text', content: before });
            const thinkContent = remainder.slice(openIdx + 7); // after '<think>'
            segments.push({ type: 'think', content: thinkContent.trim(), thinkTime: null, streaming: isStreaming });
        } else {
            const trimmed = remainder.trim();
            if (trimmed) segments.push({ type: 'text', content: trimmed });
        }
    }
    return segments;
}

function ThinkBlock({ content, thinkTime, streaming }) {
    const [manualToggle, setManualToggle] = useState(null);
    const { t } = useTranslation();

    // Auto-open while streaming, auto-collapse when done; user can override
    const isOpen = manualToggle !== null ? manualToggle : streaming;

    const label = streaming
        ? t('thinking')
        : (thinkTime && thinkTime > 0
            ? t('thoughtFor').replace('{time}', thinkTime)
            : t('thinking'));

    return (
        <div className={`think-block ${isOpen ? 'open' : ''}`}>
            <button className="think-summary" onClick={() => setManualToggle(prev => prev !== null ? !prev : !isOpen)}>
                <Brain size={14} className="think-icon" />
                <span>{label}</span>
                <ChevronDown size={14} className="think-chevron" />
            </button>
            {isOpen && (
                <div className="think-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                        {content}
                    </ReactMarkdown>
                </div>
            )}
        </div>
    );
}

// ── Agent pipeline stages block ──────────────────────────────────────────────

function formatDuration(ms) {
    if (ms == null) return '';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function AgentThinkingBlock({ stages, summary, thinkingContent }) {
    const [manualToggle, setManualToggle] = useState(null);
    const { t } = useTranslation();

    // Complete ONLY when summary arrives (backend sends it after everything is done)
    const isComplete = summary !== null;
    const hasRunning = stages.some((s) => s.status === 'running');

    // Auto mode: open while running, closed when complete. Manual overrides.
    const isOpen = manualToggle !== null ? manualToggle : !isComplete;

    if (!stages || stages.length === 0) return null;

    const totalMs = summary?.totalMs
        ?? stages.reduce((sum, s) => sum + (s.durationMs || 0), 0);

    // Header: show current running stage name, or total time when complete
    const runningStage = stages.find((s) => s.status === 'running');
    let headerLabel;
    if (isComplete) {
        headerLabel = t('agentThoughtFor').replace('{time}', (totalMs / 1000).toFixed(1));
    } else if (runningStage) {
        headerLabel = t(`stage_${runningStage.stage}`) || runningStage.stage;
    } else {
        headerLabel = t('agentProcessing');
    }

    return (
        <div className={`agent-thinking-block ${isOpen ? 'open' : ''} ${isComplete ? 'complete' : ''}`}>
            <button
                className="agent-thinking-summary"
                onClick={() => setManualToggle((prev) => (prev !== null ? !prev : !isOpen))}
            >
                {isComplete
                    ? <CheckCircle size={14} className="agent-thinking-icon complete" />
                    : <Loader size={14} className="agent-thinking-icon spinning" />
                }
                <span className={hasRunning && !isOpen ? 'agent-header-shimmer' : ''}>
                    {headerLabel}
                </span>
                <ChevronDown size={14} className="agent-thinking-chevron" />
            </button>
            {isOpen && (
                <div className="agent-thinking-stages">
                    {stages.map((s, i) => (
                        <div key={i} className={`agent-stage-row ${s.status}`}>
                            <span className="agent-stage-icon">
                                {s.status === 'running'
                                    ? <Loader size={12} className="spinning" />
                                    : s.status === 'complete'
                                        ? <Check size={12} />
                                        : s.status === 'failed'
                                            ? <span style={{ color: '#ef4444' }}>!</span>
                                            : <span>-</span>
                                }
                            </span>
                            <span className="agent-stage-label">
                                {t(`stage_${s.stage}`) || s.stage}
                            </span>
                            {s.status === 'running' && (
                                <span className="agent-stage-shimmer">
                                    <LoadingPhrase />
                                </span>
                            )}
                            {s.durationMs != null && (
                                <span className="agent-stage-duration">
                                    {formatDuration(s.durationMs)}
                                </span>
                            )}
                        </div>
                    ))}
                    {stages.filter(s => s.status === 'complete' && s.detail).map((s, i) => (
                        <StageDetail key={`detail-${i}`} detail={s.detail} stage={s.stage} />
                    ))}
                    {thinkingContent && (
                        <div className="agent-thinking-content">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                                {thinkingContent}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function StageDetail({ detail, stage }) {
    if (!detail || typeof detail !== 'object') return null;

    const lines = [];

    if (stage === 'abbreviation_expansion' && detail.expanded && detail.expanded !== detail.original) {
        lines.push(detail.expanded);
    }
    if (stage === 'anaphora_resolution' && detail.resolved_query) {
        lines.push(detail.resolved_query);
    }
    if (stage === 'query_rewrite') {
        if (detail.resolved_coreferences) lines.push(`Запрос: ${detail.resolved_coreferences}`);
        if (Array.isArray(detail.search_queries) && detail.search_queries.length > 0) {
            detail.search_queries.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
        }
    }
    if (stage === 'retrieval') {
        const parts = [];
        if (detail.chunks_found != null) parts.push(`${detail.chunks_found} чанков`);
        if (detail.multilingual) parts.push(`multilingual: ${detail.multilingual}`);
        if (detail.russian) parts.push(`russian: ${detail.russian}`);
        if (detail.bm25) parts.push(`BM25: ${detail.bm25}`);
        if (parts.length) lines.push(parts.join(' · '));
    }
    if (stage === 'fusion' && detail.candidates != null) {
        lines.push(`${detail.candidates} кандидатов после объединения`);
    }
    if (stage === 'rerank' && detail.kept != null) {
        lines.push(`Отобрано топ-${detail.kept} из ${detail.candidates || '?'}`);
    }
    if (stage === 'context_assembly') {
        const parts = [];
        if (detail.sources != null) parts.push(`${detail.sources} источников`);
        if (detail.context_tokens != null) parts.push(`~${detail.context_tokens} токенов`);
        if (parts.length) lines.push(parts.join(', '));
    }

    if (lines.length === 0) return null;

    return (
        <div className="agent-stage-detail-block">
            {lines.map((line, i) => (
                <div key={i} className="agent-stage-detail-line">{line}</div>
            ))}
        </div>
    );
}

// ── Main ChatArea ────────────────────────────────────────────────────────────
export default function ChatArea({ messages, isGenerating, onSendMessage, kbs, selectedKb, onKbChange, modelsAvailable, chatId, setChats, voteIsPending }) {
    const { t } = useTranslation();
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Snap to the bottom ONLY when a new message appears (user submit or
    // assistant placeholder added). Don't follow streaming token-by-token —
    // the previous `[messages, isGenerating]` deps re-fired on every chunk
    // update and yanked the viewport away from anything the user was reading
    // mid-generation. `messages.length` only changes when the chat actually
    // grows by an entry; in-place content updates during streaming leave
    // length untouched and so the scroll position stays where the user put it.
    useEffect(() => {
        scrollToBottom();
    }, [messages.length]);

    const isEmpty = messages.length === 0;

    return (
        <div className={`chat-container ${isEmpty ? 'empty-state' : ''}`}>
            {!isEmpty && (
                <div className="chat-messages">
                    {messages.map((msg, index) => {
                        if (msg.isArena) {
                            // Find the user question that preceded this arena response
                            let questionIndex = -1;
                            let question = '';
                            for (let i = index - 1; i >= 0; i--) {
                                if (messages[i].role === 'user') {
                                    questionIndex = i;
                                    question = messages[i].content || '';
                                    break;
                                }
                            }
                            // history_len_* must reflect the conversation BEFORE this turn's
                            // user question, so we slice up to (but not including) questionIndex.
                            const messagesBeforeRound = questionIndex >= 0
                                ? messages.slice(0, questionIndex)
                                : messages.slice(0, index);
                            return <ArenaMessageBubble key={index} message={msg} chatId={chatId} setChats={setChats} isGenerating={isGenerating} question={question} messagesBeforeRound={messagesBeforeRound} />;
                        }
                        return <MessageBubble key={index} message={msg} chatId={chatId} setChats={setChats} />;
                    })}

                    {isGenerating && (() => {
                        const lastMsg = messages[messages.length - 1];
                        // Arena bubbles render their own per-column spinner
                        // (one inside the "A" column and one inside the "B"
                        // column). The top-level fallback below otherwise
                        // produced a THIRD spinner outside the two columns
                        // because `lastMsg.content` and `agentStages` are
                        // both empty on the arena wrapper — content lives in
                        // arenaData.{a,b}, which this check doesn't look at.
                        if (lastMsg?.isArena) return null;
                        const hasStages = lastMsg?.agentStages?.length > 0;
                        const hasContent = lastMsg?.content?.length > 0;
                        if (hasStages || hasContent) return null;
                        return (
                            <div className="message-wrapper assistant generating">
                                <div className="message-content">
                                    <LoadingPhrase />
                                </div>
                            </div>
                        );
                    })()}

                    <div ref={messagesEndRef} />
                </div>
            )}

            {isEmpty && (
                <div className="empty-chat-hero">
                    <div className="empty-chat-icon">
                        <Bot size={56} />
                    </div>
                    <h2>{t("emptyTitle")}</h2>
                    <p>{t("emptySubtitle")}</p>
                </div>
            )}

            <div className={`chat-input-wrapper ${isEmpty ? 'centered' : ''}`}>
                <ChatInput
                    onSend={onSendMessage}
                    disabled={isGenerating || voteIsPending}
                    modelsAvailable={modelsAvailable}
                    kbs={kbs}
                    selectedKb={selectedKb}
                    onKbChange={onKbChange}
                    voteIsPending={voteIsPending}
                />
            </div>
        </div>
    );
}

// ── Sources block ────────────────────────────────────────────────────────────
function SourcesBlock({ sources }) {
    const { t } = useTranslation();
    if (!sources || sources.length === 0) return null;
    return (
        <div className="sources-block">
            <div className="sources-header">{t('sources')}</div>
            <ul className="sources-list">
                {sources.map((s, i) => (
                    <li key={i}>
                        <ExternalLink size={12} className="sources-link-icon" />
                        <a href={s.source_url} target="_blank" rel="noopener noreferrer">
                            {s.document_title || s.source_url}
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ message, chatId, setChats }) {
    const isUser = message.role === 'user';
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (isUser) {
        return (
            <div className="message-wrapper user">
                <div className="message-bubble-user">
                    <div className="message-text">{message.content}</div>
                </div>
            </div>
        );
    }

    // Parse think blocks out of raw content, passing along thinkTime
    const segments = parseThinkBlocks(message.content || '', message.thinkTime, message.isStreaming);
    const effectiveModelId = message.responseModelId || message.requestModelId;

    return (
        <div className="message-wrapper assistant">
            <div className="message-content">
                {message.agentStages?.length > 0 && (
                    <AgentThinkingBlock
                        stages={message.agentStages}
                        summary={message.agentSummary || null}
                        thinkingContent={message.thinkingContent || ''}
                    />
                )}
                <div className="message-markdown prose">
                    {segments.map((seg, i) =>
                        seg.type === 'think' ? (
                            <ThinkBlock key={i} content={seg.content} thinkTime={seg.thinkTime} streaming={seg.streaming} />
                        ) : (
                            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                                {seg.content}
                            </ReactMarkdown>
                        )
                    )}
                </div>

                {message.sources?.length > 0 && <SourcesBlock sources={message.sources} />}

                <div className="message-footer">
                    <div className="message-actions-bar">
                        <button className="copy-btn" onClick={handleCopy} title="Copy message">
                            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                        </button>
                        {/* Thumbs need the completion id the backend attaches
                            feedback to — it lands on the message only after a
                            response finishes streaming. */}
                        {message.completionId && !message.isStreaming && (
                            <MessageFeedback message={message} chatId={chatId} setChats={setChats} />
                        )}
                    </div>
                    {effectiveModelId && (
                        <span className="message-model-label">{effectiveModelId}</span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Arena Message bubble ─────────────────────────────────────────────────────
export function ArenaMessageBubble({ message, chatId, setChats, isGenerating, question, messagesBeforeRound }) {
    const { t } = useTranslation();
    const { arenaData } = message;
    const [voting, setVoting] = useState(false);
    const [activeDot, setActiveDot] = useState(0);
    const scrollRef = useRef(null);
    const [hintVisible, setHintVisible] = useState(true);
    // Synchronous guard: setState is async (state updates are batched, the
    // closure-captured `voting` stays false across rapid clicks within the
    // same microtask). A ref's `.current` reads/writes synchronously, so this
    // closes the race where a spammed click sneaks in before React re-renders
    // the disabled button. Reset to false on POST failure to permit retry.
    const submittedRef = useRef(false);

    useEffect(() => {
        if (!hintVisible) return;
        const t = setTimeout(() => setHintVisible(false), 1500);
        return () => clearTimeout(t);
    }, [hintVisible]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onScroll = () => {
            const idx = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
            setActiveDot(Math.max(0, Math.min(1, idx)));
            setHintVisible(false);    // <- added line
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    // The arena round is only meaningful when BOTH sides actually produced a
    // response from a real model. If a side died (substitution exhausted or
    // any pre-stream error during streaming) its `model` stays null — voting
    // in that state would either poison the Elo store or hit the backend's
    // VoteRequest min_length=1 guard with a 422.
    const bothSidesReady = Boolean(arenaData?.a?.model && arenaData?.b?.model);
    const canVote = !arenaData.voted && !isGenerating && bothSidesReady;

    const handleVote = async (winner) => {
        // Sync ref guard — wins the race against rapid clicks. `voting` from
        // useState lags by a render cycle and is unreliable here.
        if (submittedRef.current) return;
        if (arenaData.voted || voting) return;
        if (!bothSidesReady) {
            console.warn('Arena vote suppressed: one or both sides have no model.');
            return;
        }
        submittedRef.current = true;
        setVoting(true);

        // Stable bubble id (assigned at creation in App.jsx). Used in BOTH
        // setChats calls below so the success-path update finds the bubble
        // regardless of how many times the message object reference was
        // replaced by intervening optimistic updates. Previously we matched
        // by `m === message` which broke after the first setChats and caused
        // `voted: true` to never land — that bug let users spam-vote.
        const bubbleId = arenaData.bubbleId;
        if (!bubbleId) {
            // Legacy bubble (older session with no id). Block voting entirely
            // rather than risk the silent-no-op bug.
            console.error('Arena vote refused: bubble has no bubbleId.');
            submittedRef.current = false;
            setVoting(false);
            return;
        }
        const updateBubble = (patch) => setChats(prev => prev.map(c => {
            if (c.id !== chatId) return c;
            return {
                ...c,
                messages: c.messages.map(m => (
                    m?.isArena && m?.arenaData?.bubbleId === bubbleId
                        ? { ...m, arenaData: { ...m.arenaData, ...patch } }
                        : m
                )),
            };
        }));

        // Reveal names immediately (optimistic) — even if the POST fails, the
        // user has already seen the identities and hiding them again would
        // feel like a glitch. But DON'T mark `voted: true` yet — that gates
        // the vote buttons, and we want the user to be able to retry if the
        // POST fails. We finalise `voted: true` only after a successful POST.
        updateBubble({ namesRevealed: true, winner });

        const turnIndex = arenaTurnIndex(messagesBeforeRound || []);
        const { historyA, historyB } = buildArenaHistories(messagesBeforeRound || []);
        const historyLenA = historyA.length;
        const historyLenB = historyB.length;

        try {
            const resp = await fetch('/v1/arena/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model_a: arenaData.a.model,
                    kb_a: arenaData.a.kb,
                    model_b: arenaData.b.model,
                    kb_b: arenaData.b.kb,
                    winner,
                    response_a: arenaData.a.content || '',
                    response_b: arenaData.b.content || '',
                    question: question || '',
                    session_id: chatId || '',
                    turn_index: turnIndex,
                    history_len_a: historyLenA,
                    history_len_b: historyLenB,
                }),
            });
            if (!resp.ok) throw new Error(`Vote POST ${resp.status}`);
            // Vote recorded: finalise voted=true so the bubble locks in.
            updateBubble({ voted: true, winner });
        } catch (e) {
            console.error('Vote failed:', e);
            // Allow retry — but keep names revealed (no rollback of
            // namesRevealed/winner) so the UI doesn't visually flicker.
            submittedRef.current = false;
            if (typeof window !== 'undefined') {
                // No toast library is wired up yet — fall back to console.warn so
                // the user can notice in devtools. Replace with a real toast when
                // one lands in the project.
                console.warn('Arena vote not recorded; please vote again to retry.');
            }
        } finally {
            setVoting(false);
        }
    };

    const segmentsA = parseThinkBlocks(arenaData.a.content || '', arenaData.a.thinkTime, arenaData.a.isStreaming);
    const segmentsB = parseThinkBlocks(arenaData.b.content || '', arenaData.b.thinkTime, arenaData.b.isStreaming);

    // Apply primary colors to the voted column if a/b — only after vote is
    // finalised (voted===true) so a failed POST doesn't leave phantom highlighting.
    const bgA = arenaData.voted && arenaData.winner === 'a' ? 'rgba(var(--primary-rgb), 0.1)' : 'transparent';
    const borderA = arenaData.voted && arenaData.winner === 'a' ? '2px solid var(--primary)' : '1px solid var(--border)';
    const bgB = arenaData.voted && arenaData.winner === 'b' ? 'rgba(var(--primary-rgb), 0.1)' : 'transparent';
    const borderB = arenaData.voted && arenaData.winner === 'b' ? '2px solid var(--primary)' : '1px solid var(--border)';

    return (
        <div className="message-wrapper assistant arena" style={{ maxWidth: '100%', marginBottom: '2rem' }}>
            <div className="arena-container">
                <div className="arena-dots" aria-hidden="true">
                    <span className={`arena-dot ${activeDot === 0 ? 'active' : ''}`} />
                    <span className={`arena-dot ${activeDot === 1 ? 'active' : ''}`} />
                    {hintVisible && <span className="arena-swipe-hint">{t('arenaSwipeHint')}</span>}
                </div>
                <div className="arena-scroll" ref={scrollRef}>
                <div className="arena-column a" style={{ flex: 1, backgroundColor: bgA, border: borderA, borderRadius: '12px', padding: '1rem', overflowX: 'auto', display: 'flex', flexDirection: 'column' }}>
                    <div className="arena-header" style={{ marginBottom: '1rem', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{(arenaData.voted || arenaData.namesRevealed) ? `A: ${arenaData.a.model} (${arenaData.a.kb})` : 'Model A'}</span>
                        {arenaData.voted && arenaData.winner === 'a' && <span style={{ color: 'var(--primary)' }}>🏆 Winner</span>}
                    </div>
                    <div className="message-markdown prose" style={{ flex: 1, paddingBottom: isGenerating ? '2rem' : '0' }}>
                        {segmentsA.map((seg, i) =>
                            seg.type === 'think' ? (
                                <ThinkBlock key={i} content={seg.content} thinkTime={seg.thinkTime} streaming={seg.streaming} />
                            ) : (
                                <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{seg.content}</ReactMarkdown>
                            )
                        )}
                        {arenaData.a.isStreaming && <LoadingPhrase />}
                    </div>
                    {canVote && (
                        <div className="arena-vote-primary">
                            <button className="vote-btn vote-btn-primary" onClick={() => handleVote('a')} disabled={voting}>
                                {t('arenaVoteLeftBetter')}
                            </button>
                        </div>
                    )}
                </div>

                <div className="arena-column b" style={{ flex: 1, backgroundColor: bgB, border: borderB, borderRadius: '12px', padding: '1rem', overflowX: 'auto', display: 'flex', flexDirection: 'column' }}>
                    <div className="arena-header" style={{ marginBottom: '1rem', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{(arenaData.voted || arenaData.namesRevealed) ? `B: ${arenaData.b.model} (${arenaData.b.kb})` : 'Model B'}</span>
                        {arenaData.voted && arenaData.winner === 'b' && <span style={{ color: 'var(--primary)' }}>🏆 Winner</span>}
                    </div>
                    <div className="message-markdown prose" style={{ flex: 1, paddingBottom: isGenerating ? '2rem' : '0' }}>
                        {segmentsB.map((seg, i) =>
                            seg.type === 'think' ? (
                                <ThinkBlock key={i} content={seg.content} thinkTime={seg.thinkTime} streaming={seg.streaming} />
                            ) : (
                                <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{seg.content}</ReactMarkdown>
                            )
                        )}
                        {arenaData.b.isStreaming && <LoadingPhrase />}
                    </div>
                    {canVote && (
                        <div className="arena-vote-primary">
                            <button className="vote-btn vote-btn-primary" onClick={() => handleVote('b')} disabled={voting}>
                                {t('arenaVoteRightBetter')}
                            </button>
                        </div>
                    )}
                </div>
                </div>
            </div>

            {!arenaData.voted && !isGenerating && !bothSidesReady && (
                <div
                    className="arena-round-invalid"
                    style={{
                        marginTop: '1rem',
                        padding: '0.75rem 1rem',
                        borderRadius: '0.5rem',
                        background: 'rgba(var(--warning-rgb, 220, 130, 0), 0.1)',
                        border: '1px solid rgba(var(--warning-rgb, 220, 130, 0), 0.4)',
                        textAlign: 'center',
                        fontSize: '0.9rem',
                    }}
                >
                    {t('arenaRoundIncomplete')}
                </div>
            )}

            {canVote && (
                <div className="arena-vote-secondary" style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
                    <button className="vote-btn vote-btn-secondary" onClick={() => handleVote('tie')} disabled={voting}>{t('arenaVoteTie')}</button>
                    <button className="vote-btn vote-btn-secondary" onClick={() => handleVote('both_bad')} disabled={voting}>{t('arenaVoteBothBad')}</button>
                </div>
            )}
        </div>
    );
}
