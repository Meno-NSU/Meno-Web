import { useLayoutEffect, useRef, useState } from 'react';
import { ThumbsUp, ThumbsDown, Check, SendHorizontal } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import { clearFeedback, submitFeedback } from '../services/api.js';
import Tooltip from './Tooltip.jsx';
import './MessageFeedback.css';

const COMMENT_MAX_LENGTH = 20000;
const COMMENT_COUNTER_THRESHOLD = 18000;

const sameFeedback = (a, b) => (
    a === b || (Boolean(a) && Boolean(b) && a.value === b.value && (a.comment ?? null) === (b.comment ?? null))
);

// 👍/👎 + optional comment on a completed assistant message. The rating is the
// current opinion of the answer: re-clicking the active thumb clears it,
// switching thumbs replaces it, and the comment rides along. A click shows at
// once; the server is brought to the last choice by one request at a time, so
// fast clicking sends only where it ends up. Clearing a rating keeps what was
// written: rating again brings the comment back.
export default function MessageFeedback({ message, chatId, setChats }) {
    const { t } = useTranslation();
    const feedback = message.feedback || null;
    const [commentDraft, setCommentDraft] = useState(feedback?.comment || '');
    const [justSent, setJustSent] = useState(false);
    // Failures are explained: the 404 (conversation owned by another profile — see
    // api.js buildError, which is where the thrown Error gets its httpStatus) on its
    // own, anything else as "not saved", since the thumbs go back to what is saved.
    const [errorNotice, setErrorNotice] = useState(null);
    const textareaRef = useRef(null);

    // What the server holds, what the person chose last (already on screen), and
    // the last comment the server took, which outlives a cleared rating.
    const savedRef = useRef(feedback);
    const wantedRef = useRef(feedback);
    const lastCommentRef = useRef(feedback?.comment || null);
    const savingRef = useRef(false);

    // Grow with the text; the CSS max-height (40vh) caps it and overflow-y scrolls.
    useLayoutEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [commentDraft, feedback]);

    // Messages have no stable id of their own — the completion id is unique
    // per assistant response, so patch by it.
    const patchFeedback = (next) => {
        setChats((prev) => prev.map((chat) => {
            if (chat.id !== chatId) return chat;
            return {
                ...chat,
                messages: chat.messages.map((m) => (
                    m?.completionId === message.completionId ? { ...m, feedback: next } : m
                )),
            };
        }));
    };

    const flashSent = () => {
        setJustSent(true);
        setTimeout(() => setJustSent(false), 2000);
    };

    // One request at a time; a choice made meanwhile is picked up by the loop.
    const save = async () => {
        if (savingRef.current) return;
        savingRef.current = true;
        try {
            while (!sameFeedback(wantedRef.current, savedRef.current)) {
                const target = wantedRef.current;
                if (target) {
                    await submitFeedback({
                        completionId: message.completionId,
                        sessionId: chatId,
                        value: target.value,
                        comment: target.comment ?? null,
                    });
                } else {
                    await clearFeedback({ completionId: message.completionId, sessionId: chatId });
                }
                savedRef.current = target;
                if (target?.comment && target.comment !== lastCommentRef.current) {
                    lastCommentRef.current = target.comment;
                    flashSent();
                }
            }
        } catch (e) {
            console.warn('Feedback not recorded:', e);
            wantedRef.current = savedRef.current;
            patchFeedback(savedRef.current);
            setErrorNotice(t(e?.httpStatus === 404 ? 'feedbackNotYours' : 'feedbackNotSaved'));
        } finally {
            savingRef.current = false;
        }
    };

    const choose = (next) => {
        setErrorNotice(null);
        wantedRef.current = next;
        patchFeedback(next);
        save();
    };

    const handleThumb = (value) => {
        const current = wantedRef.current;
        choose(current?.value === value ? null : { value, comment: current?.comment ?? lastCommentRef.current });
    };

    const handleSendComment = () => {
        const comment = commentDraft.trim();
        const current = wantedRef.current;
        if (!current || !comment || comment === (current.comment || '')) return;
        choose({ ...current, comment });
    };

    return (
        <div className="message-feedback">
            <div className="feedback-thumbs">
                <Tooltip text={t('tipFeedbackGood')} side="top" align="left">
                    <button
                        className={`feedback-btn ${feedback?.value === 'up' ? 'active' : ''}`}
                        onClick={() => handleThumb('up')}
                        aria-label={t('feedbackGoodTitle')}
                        aria-pressed={feedback?.value === 'up'}
                        type="button"
                    >
                        <ThumbsUp size={14} />
                    </button>
                </Tooltip>
                <Tooltip text={t('tipFeedbackBad')} side="top" align="left">
                    <button
                        className={`feedback-btn down ${feedback?.value === 'down' ? 'active' : ''}`}
                        onClick={() => handleThumb('down')}
                        aria-label={t('feedbackBadTitle')}
                        aria-pressed={feedback?.value === 'down'}
                        type="button"
                    >
                        <ThumbsDown size={14} />
                    </button>
                </Tooltip>
            </div>

            {errorNotice && (
                <div className="feedback-error" role="alert">{errorNotice}</div>
            )}

            {feedback && (
                <div className="feedback-comment-row">
                    <div className="feedback-comment-field">
                        <textarea
                            ref={textareaRef}
                            className="feedback-comment-input"
                            rows={3}
                            maxLength={COMMENT_MAX_LENGTH}
                            placeholder={t('feedbackCommentPlaceholder')}
                            value={commentDraft}
                            onChange={(e) => setCommentDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    e.preventDefault();
                                    handleSendComment();
                                }
                            }}
                        />
                        {commentDraft.length > COMMENT_COUNTER_THRESHOLD && (
                            <span className="feedback-comment-counter">
                                {commentDraft.length} / {COMMENT_MAX_LENGTH}
                            </span>
                        )}
                    </div>
                    <button
                        className="feedback-comment-send"
                        onClick={handleSendComment}
                        disabled={!commentDraft.trim() || commentDraft.trim() === (feedback.comment || '')}
                        title={t('feedbackCommentSend')}
                        aria-label={t('feedbackCommentSend')}
                        type="button"
                    >
                        {justSent ? <Check size={14} /> : <SendHorizontal size={14} />}
                    </button>
                </div>
            )}
        </div>
    );
}
