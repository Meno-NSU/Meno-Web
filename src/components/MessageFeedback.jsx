import { useLayoutEffect, useRef, useState } from 'react';
import { ThumbsUp, ThumbsDown, Check, SendHorizontal } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import { clearFeedback, submitFeedback } from '../services/api.js';
import Tooltip from './Tooltip.jsx';
import './MessageFeedback.css';

const COMMENT_MAX_LENGTH = 20000;
const COMMENT_COUNTER_THRESHOLD = 18000;

// 👍/👎 + optional comment on a completed assistant message. The backend
// upserts by (completion_id, session_id): re-clicking the active thumb clears
// the feedback, switching thumbs overwrites it, and sending a comment re-posts
// the current value with the comment attached.
export default function MessageFeedback({ message, chatId, setChats }) {
    const { t } = useTranslation();
    const [pending, setPending] = useState(false);
    const [commentDraft, setCommentDraft] = useState(message.feedback?.comment || '');
    const [justSent, setJustSent] = useState(false);
    // Only the 404 (conversation owned by another profile — see api.js buildError,
    // which is where the thrown Error gets its httpStatus) gets an explanation here.
    // Any other failure keeps its pre-existing behavior: logged, silent to the user.
    const [errorNotice, setErrorNotice] = useState(null);

    const feedback = message.feedback || null;
    const textareaRef = useRef(null);

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

    const handleThumb = async (value) => {
        if (pending) return;
        setPending(true);
        setErrorNotice(null);
        try {
            if (feedback?.value === value) {
                await clearFeedback({ completionId: message.completionId, sessionId: chatId });
                patchFeedback(null);
                setCommentDraft('');
            } else {
                const comment = feedback?.comment || null;
                await submitFeedback({ completionId: message.completionId, sessionId: chatId, value, comment });
                patchFeedback({ value, comment });
            }
        } catch (e) {
            console.warn('Feedback not recorded:', e);
            if (e?.httpStatus === 404) {
                setErrorNotice(t('feedbackNotYours'));
            }
        } finally {
            setPending(false);
        }
    };

    const handleSendComment = async () => {
        const comment = commentDraft.trim();
        if (pending || !feedback || !comment || comment === (feedback.comment || '')) return;
        setPending(true);
        setErrorNotice(null);
        try {
            await submitFeedback({
                completionId: message.completionId,
                sessionId: chatId,
                value: feedback.value,
                comment,
            });
            patchFeedback({ ...feedback, comment });
            setJustSent(true);
            setTimeout(() => setJustSent(false), 2000);
        } catch (e) {
            console.warn('Feedback comment not recorded:', e);
            if (e?.httpStatus === 404) {
                setErrorNotice(t('feedbackNotYours'));
            }
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="message-feedback">
            <div className="feedback-thumbs">
                <Tooltip text={t('tipFeedbackGood')} side="top" align="left">
                    <button
                        className={`feedback-btn ${feedback?.value === 'up' ? 'active' : ''}`}
                        onClick={() => handleThumb('up')}
                        disabled={pending}
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
                        disabled={pending}
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
                            disabled={pending}
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
                        disabled={pending || !commentDraft.trim() || commentDraft.trim() === (feedback.comment || '')}
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
