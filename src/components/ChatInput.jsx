import { useState, useRef, useEffect } from 'react';
import { SendHorizontal, Stop, Database } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import './ChatInput.css';

export default function ChatInput({ onSend, onStop, generating = false, disabled, modelsAvailable = true, kbs = [], selectedKb = '', onKbChange, voteIsPending = false }) {
    const { t } = useTranslation();
    const [input, setInput] = useState('');
    const textareaRef = useRef(null);

    const isSendBlocked = !modelsAvailable;
    const isDisabled = disabled || isSendBlocked;

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
        if (input.trim() && !isDisabled) {
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
        if (!isSendBlocked) {
            textareaRef.current?.focus();
        }
    }, [isSendBlocked]);

    return (
        <div className="input-container">
            <form onSubmit={handleSubmit} className="input-form">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    placeholder={
                        isSendBlocked ? t('noModelsSendBlocked')
                        : voteIsPending ? t('arenaVotePromptPending')
                        : t('placeholder')
                    }
                    className="chat-textarea"
                    rows={1}
                    disabled={isDisabled}
                />

                <div className="input-actions-right">
                    {/* KB selector hidden while there's only one knowledge base —
                        it just takes space without offering a choice. Re-enable
                        once multiple KBs land by flipping this guard back to
                        `kbs.length > 0`. */}
                    {kbs.length > 1 && (
                        <div className="kb-selector-wrapper">
                            <select
                                className="kb-selector"
                                value={selectedKb}
                                onChange={(e) => onKbChange && onKbChange(e.target.value)}
                                title={t("knowledgeBase")}
                            >
                                {kbs.map(kb => (
                                    <option
                                        key={kb.id}
                                        value={kb.id}
                                        disabled={kb.available === false}
                                    >
                                        {kb.name || kb.id}{kb.available === false ? ` (${t('kbUnavailable')})` : ''}
                                    </option>
                                ))}
                            </select>
                            <Database size={16} className="kb-icon" />
                        </div>
                    )}

                    <div className="send-btn-wrapper">
                        {generating ? (
                            <button
                                type="button"
                                className="send-btn stop"
                                onClick={onStop}
                                title={t('stopWaiting')}
                                aria-label={t('stopWaiting')}
                            >
                                <Stop size={16} />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                className={`send-btn ${input.trim() && !isDisabled ? 'active' : ''}`}
                                disabled={!input.trim() || isDisabled}
                                title={isSendBlocked ? t('noModelsSendBlocked') : 'Send message'}
                            >
                                <SendHorizontal size={20} />
                            </button>
                        )}
                        {isSendBlocked && (
                            <div className="no-models-tooltip">{t('noModelsSendBlocked')}</div>
                        )}
                    </div>
                </div>
            </form>
            <div className="input-footer">
                <span className="input-disclaimer">{t("disclaimer")}</span>
            </div>
        </div>
    );
}
