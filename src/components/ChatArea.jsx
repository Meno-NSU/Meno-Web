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
function parseThinkBlocks(raw) {
    const segments = [];
    const regex = /<think>([\s\S]*?)<\/think>/gi;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(raw)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: 'text', content: raw.slice(lastIndex, match.index) });
        }
        segments.push({ type: 'think', content: match[1].trim() });
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < raw.length) {
        segments.push({ type: 'text', content: raw.slice(lastIndex) });
    }
    return segments;
}

function ThinkBlock({ content }) {
    const [open, setOpen] = useState(false);

    return (
        <div className={`think-block ${open ? 'open' : ''}`}>
            <button className="think-summary" onClick={() => setOpen(o => !o)}>
                <Brain size={14} className="think-icon" />
                <span>Размышляю…</span>
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
export default function ChatArea({ messages, isGenerating, onSendMessage, kbs, selectedKb, onKbChange, modelsAvailable }) {
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
                        <MessageBubble key={index} message={msg} />
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

    // Parse think blocks out of raw content
    const segments = parseThinkBlocks(message.content || '');

    return (
        <div className="message-wrapper assistant">
            <div className="message-content">
                <div className="message-markdown prose">
                    {segments.map((seg, i) =>
                        seg.type === 'think' ? (
                            <ThinkBlock key={i} content={seg.content} />
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
