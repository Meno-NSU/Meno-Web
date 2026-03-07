import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Bot } from 'lucide-react';
import { useTranslation } from '../i18n.js';
import ChatInput from './ChatInput.jsx';
import './ChatArea.css';

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
                                <div className="typing-indicator">
                                    <span></span><span></span><span></span>
                                </div>
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

    // Assistant: full-width article-style
    return (
        <div className="message-wrapper assistant">
            <div className="message-content">
                <div className="message-markdown prose">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                    </ReactMarkdown>
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
