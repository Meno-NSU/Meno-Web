import { useState, useRef, useEffect } from 'react';
import { SendHorizontal, Database } from 'lucide-react';
import { useTranslation } from '../i18n.js';
import './ChatInput.css';

export default function ChatInput({ onSend, disabled, kbs = [], selectedKb = '', onKbChange }) {
    const { t } = useTranslation();
    const [input, setInput] = useState('');
    const textareaRef = useRef(null);

    const handleInput = (e) => {
        setInput(e.target.value);

        // Auto-resize textarea
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (input.trim() && !disabled) {
            onSend(input.trim());
            setInput('');

            // Reset textarea height
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    useEffect(() => {
        // Focus input on mount
        textareaRef.current?.focus();
    }, []);

    return (
        <div className="input-container">
            <form onSubmit={handleSubmit} className="input-form">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    placeholder={t("placeholder")}
                    className="chat-textarea"
                    rows={1}
                    disabled={disabled}
                />

                <div className="input-actions-right">
                    {kbs.length > 0 && (
                        <div className="kb-selector-wrapper">
                            <select
                                className="kb-selector"
                                value={selectedKb}
                                onChange={(e) => onKbChange && onKbChange(e.target.value)}
                                title={t("knowledgeBase")}
                            >
                                {kbs.map(kb => (
                                    <option key={kb.id} value={kb.id}>{kb.name || kb.id}</option>
                                ))}
                            </select>
                            <Database size={16} className="kb-icon" />
                        </div>
                    )}
                    <button
                        type="submit"
                        className={`send-btn ${input.trim() && !disabled ? 'active' : ''}`}
                        disabled={!input.trim() || disabled}
                        title="Send message"
                    >
                        <SendHorizontal size={20} />
                    </button>
                </div>
            </form>
            <div className="input-footer">
                {t("disclaimer")}
            </div>
        </div>
    );
}
