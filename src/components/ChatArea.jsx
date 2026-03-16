import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Bot, ChevronDown, Brain } from 'lucide-react';
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
 *   { type: 'think', content: string }
 *   { type: 'text',  content: string }
 */
function parseThinkBlocks(raw, thinkTime) {
    const segments = [];
    const regex = /<think>([\s\S]*?)<\/think>/gi;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(raw)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: 'text', content: raw.slice(lastIndex, match.index) });
        }
        segments.push({ type: 'think', content: match[1].trim(), thinkTime });
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < raw.length) {
        segments.push({ type: 'text', content: raw.slice(lastIndex) });
    }
    return segments;
}

function ThinkBlock({ content, thinkTime }) {
    const [open, setOpen] = useState(false);
    const { t } = useTranslation();

    // Determine label: "Размышляю..." (Thinking...) if no time, else "Думал X секунд" (Thought for X seconds)
    const label = thinkTime && thinkTime > 0 
        ? t('thoughtFor').replace('{time}', thinkTime)
        : t('thinking');

    return (
        <div className={`think-block ${open ? 'open' : ''}`}>
            <button className="think-summary" onClick={() => setOpen(o => !o)}>
                <Brain size={14} className="think-icon" />
                <span>{label}</span>
                <ChevronDown size={14} className="think-chevron" />
            </button>
            {open && (
                <div className="think-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {content}
                    </ReactMarkdown>
                </div>
            )}
        </div>
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
                    {messages.map((msg, index) => (
                        msg.isArena 
                          ? <ArenaMessageBubble key={index} message={msg} chatId={chatId} setChats={setChats} isGenerating={isGenerating} />
                          : <MessageBubble key={index} message={msg} />
                    ))}

                    {isGenerating && (
                        <div className="message-wrapper assistant generating">
                            <div className="message-content">
                                <LoadingPhrase />
                            </div>
                        </div>
                    )}

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
    const segments = parseThinkBlocks(message.content || '', message.thinkTime);

    return (
        <div className="message-wrapper assistant">
            <div className="message-content">
                <div className="message-markdown prose">
                    {segments.map((seg, i) =>
                        seg.type === 'think' ? (
                            <ThinkBlock key={i} content={seg.content} thinkTime={seg.thinkTime} />
                        ) : (
                            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                                {seg.content}
                            </ReactMarkdown>
                        )
                    )}
                </div>

                <div className="message-actions-bar">
                    <button className="copy-btn" onClick={handleCopy} title="Copy message">
                        {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Arena Message bubble ─────────────────────────────────────────────────────
function ArenaMessageBubble({ message, chatId, setChats, isGenerating }) {
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
                    winner
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

    const segmentsA = parseThinkBlocks(arenaData.a.content || '', arenaData.a.thinkTime);
    const segmentsB = parseThinkBlocks(arenaData.b.content || '', arenaData.b.thinkTime);

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
                                <ThinkBlock key={i} content={seg.content} thinkTime={seg.thinkTime} />
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
                                <ThinkBlock key={i} content={seg.content} thinkTime={seg.thinkTime} />
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
