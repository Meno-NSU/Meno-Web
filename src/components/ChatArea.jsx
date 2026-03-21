import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Bot, ChevronDown, Brain, Loader, CheckCircle } from 'lucide-react';
import { useTranslation } from '../i18n.js';
import ChatInput from './ChatInput.jsx';
import './ChatArea.css';

// ── Loading phrases ──────────────────────────────────────────────────────────
const LOADING_PHRASES = [
    'Думаю…',
    'Обращаюсь к мудрецам Академгородка…',
    'Сопоставляю факты из базы знаний…',
    'Ищу релевантные документы…',
    'Роюсь в библиотеке…',
    'Обрабатываю контекст…',
    'Взвешиваю гипотезы…',
    'Прогоняю через нейронные веса…',
    'Консультируюсь с источниками…',
    'Анализирую семантику вопроса…',
];

function LoadingPhrase() {
    const [index, setIndex] = useState(() => Math.floor(Math.random() * LOADING_PHRASES.length));
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const cycle = setInterval(() => {
            setVisible(false);
            setTimeout(() => {
                setIndex(prev => {
                    let next;
                    do { next = Math.floor(Math.random() * LOADING_PHRASES.length); }
                    while (next === prev);
                    return next;
                });
                setVisible(true);
            }, 400); // fade-out duration before swap
        }, 2600);
        return () => clearInterval(cycle);
    }, []);

    return (
        <div className={`loading-phrase ${visible ? 'visible' : 'hidden'}`}>
            {LOADING_PHRASES[index]}
        </div>
    );
}

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
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
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

    // Auto mode: open while running, closed when complete. Manual overrides.
    const isOpen = manualToggle !== null ? manualToggle : !isComplete;

    if (!stages || stages.length === 0) return null;

    const totalMs = summary?.totalMs
        ?? stages.reduce((sum, s) => sum + (s.durationMs || 0), 0);

    // Header: show current running stage, or total time when complete
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
                <span>{headerLabel}</span>
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
                            {s.durationMs != null && (
                                <span className="agent-stage-duration">
                                    {formatDuration(s.durationMs)}
                                </span>
                            )}
                            {s.detail && (
                                <StageDetail detail={s.detail} stage={s.stage} />
                            )}
                        </div>
                    ))}
                    {thinkingContent && (
                        <div className="agent-thinking-content">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
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

    const parts = [];

    if (stage === 'query_rewrite') {
        if (detail.resolved_coreferences) parts.push(detail.resolved_coreferences);
        if (Array.isArray(detail.search_queries) && detail.search_queries.length > 0) {
            parts.push(`Запросы: ${detail.search_queries.join(', ')}`);
        } else if (typeof detail.search_queries === 'number') {
            parts.push(`${detail.search_queries} запросов`);
        }
    }
    if (stage === 'abbreviation_expansion' && detail.expanded && detail.expanded !== detail.original) {
        parts.push(detail.expanded);
    }
    if (stage === 'anaphora_resolution' && detail.resolved_query) {
        parts.push(detail.resolved_query);
    }
    if (stage === 'retrieval') {
        if (detail.chunks_found != null) parts.push(`${detail.chunks_found} чанков`);
    }
    if (stage === 'fusion' && detail.candidates != null) {
        parts.push(`${detail.candidates} кандидатов`);
    }
    if (stage === 'rerank' && detail.kept != null) {
        parts.push(`топ-${detail.kept}`);
    }
    if (stage === 'context_assembly') {
        if (detail.sources != null) parts.push(`${detail.sources} источников`);
        if (detail.context_tokens != null) parts.push(`~${detail.context_tokens} токенов`);
    }

    if (parts.length === 0) return null;

    return (
        <span className="agent-stage-detail">
            {parts.join(' · ')}
        </span>
    );
}

// ── Main ChatArea ────────────────────────────────────────────────────────────
export default function ChatArea({ messages, isGenerating, onSendMessage, kbs, selectedKb, onKbChange, modelsAvailable, chatId, setChats }) {
    const { t } = useTranslation();
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isGenerating]);

    const isEmpty = messages.length === 0;

    return (
        <div className={`chat-container ${isEmpty ? 'empty-state' : ''}`}>
            {!isEmpty && (
                <div className="chat-messages">
                    {messages.map((msg, index) => {
                        if (msg.isArena) {
                            // Find the user question that preceded this arena response
                            let question = '';
                            for (let i = index - 1; i >= 0; i--) {
                                if (messages[i].role === 'user') {
                                    question = messages[i].content || '';
                                    break;
                                }
                            }
                            return <ArenaMessageBubble key={index} message={msg} chatId={chatId} setChats={setChats} isGenerating={isGenerating} question={question} />;
                        }
                        return <MessageBubble key={index} message={msg} />;
                    })}

                    {isGenerating && (() => {
                        const lastMsg = messages[messages.length - 1];
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
                    disabled={isGenerating}
                    modelsAvailable={modelsAvailable}
                    kbs={kbs}
                    selectedKb={selectedKb}
                    onKbChange={onKbChange}
                />
            </div>
        </div>
    );
}

// ── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ message }) {
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

                <div className="message-footer">
                    <div className="message-actions-bar">
                        <button className="copy-btn" onClick={handleCopy} title="Copy message">
                            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                        </button>
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
function ArenaMessageBubble({ message, chatId, setChats, isGenerating, question }) {
    const { t } = useTranslation();
    const { arenaData } = message;
    const [voting, setVoting] = useState(false);

    const handleVote = async (winner) => {
        if (arenaData.voted || voting) return;
        setVoting(true);
        try {
            await fetch('/v1/arena/vote', {
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
                })
            });
            // Update local state to mark as voted
            setChats(prev => prev.map(c => {
                if (c.id === chatId) {
                    const newMsgs = c.messages.map(m => {
                        if (m === message) {
                            return { ...m, arenaData: { ...m.arenaData, voted: true, winner } };
                        }
                        return m;
                    });
                    return { ...c, messages: newMsgs };
                }
                return c;
            }));
        } catch (e) {
            console.error('Vote failed:', e);
        } finally {
            setVoting(false);
        }
    };

    const segmentsA = parseThinkBlocks(arenaData.a.content || '', arenaData.a.thinkTime, arenaData.a.isStreaming);
    const segmentsB = parseThinkBlocks(arenaData.b.content || '', arenaData.b.thinkTime, arenaData.b.isStreaming);

    // Apply primary colors to the voted column if a/b
    const bgA = arenaData.winner === 'a' ? 'rgba(var(--primary-rgb), 0.1)' : 'transparent';
    const borderA = arenaData.winner === 'a' ? '2px solid var(--primary)' : '1px solid var(--border)';
    const bgB = arenaData.winner === 'b' ? 'rgba(var(--primary-rgb), 0.1)' : 'transparent';
    const borderB = arenaData.winner === 'b' ? '2px solid var(--primary)' : '1px solid var(--border)';

    return (
        <div className="message-wrapper assistant arena" style={{ maxWidth: '100%', marginBottom: '2rem' }}>
            <div className="arena-container" style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                <div className="arena-column a" style={{ flex: 1, backgroundColor: bgA, border: borderA, borderRadius: '12px', padding: '1rem', overflowX: 'auto', display: 'flex', flexDirection: 'column' }}>
                    <div className="arena-header" style={{ marginBottom: '1rem', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{arenaData.voted ? `A: ${arenaData.a.model} (${arenaData.a.kb})` : 'Model A'}</span>
                        {arenaData.winner === 'a' && <span style={{ color: 'var(--primary)' }}>🏆 Winner</span>}
                    </div>
                    <div className="message-markdown prose" style={{ flex: 1, paddingBottom: isGenerating ? '2rem' : '0' }}>
                        {segmentsA.map((seg, i) =>
                            seg.type === 'think' ? (
                                <ThinkBlock key={i} content={seg.content} thinkTime={seg.thinkTime} streaming={seg.streaming} />
                            ) : (
                                <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>{seg.content}</ReactMarkdown>
                            )
                        )}
                        {isGenerating && <LoadingPhrase />}
                    </div>
                    {!arenaData.voted && !isGenerating && (
                        <div className="arena-vote-primary">
                            <button className="vote-btn vote-btn-primary" onClick={() => handleVote('a')} disabled={voting}>
                                {t('arenaVoteLeftBetter')}
                            </button>
                        </div>
                    )}
                </div>
                
                <div className="arena-column b" style={{ flex: 1, backgroundColor: bgB, border: borderB, borderRadius: '12px', padding: '1rem', overflowX: 'auto', display: 'flex', flexDirection: 'column' }}>
                    <div className="arena-header" style={{ marginBottom: '1rem', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{arenaData.voted ? `B: ${arenaData.b.model} (${arenaData.b.kb})` : 'Model B'}</span>
                        {arenaData.winner === 'b' && <span style={{ color: 'var(--primary)' }}>🏆 Winner</span>}
                    </div>
                    <div className="message-markdown prose" style={{ flex: 1, paddingBottom: isGenerating ? '2rem' : '0' }}>
                        {segmentsB.map((seg, i) =>
                            seg.type === 'think' ? (
                                <ThinkBlock key={i} content={seg.content} thinkTime={seg.thinkTime} streaming={seg.streaming} />
                            ) : (
                                <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>{seg.content}</ReactMarkdown>
                            )
                        )}
                        {isGenerating && <LoadingPhrase />}
                    </div>
                    {!arenaData.voted && !isGenerating && (
                        <div className="arena-vote-primary">
                            <button className="vote-btn vote-btn-primary" onClick={() => handleVote('b')} disabled={voting}>
                                {t('arenaVoteRightBetter')}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {!arenaData.voted && !isGenerating && (
                <div className="arena-vote-secondary" style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
                    <button className="vote-btn vote-btn-secondary" onClick={() => handleVote('tie')} disabled={voting}>{t('arenaVoteTie')}</button>
                    <button className="vote-btn vote-btn-secondary" onClick={() => handleVote('both_bad')} disabled={voting}>{t('arenaVoteBothBad')}</button>
                </div>
            )}
        </div>
    );
}
