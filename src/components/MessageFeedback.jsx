import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ThumbsUp, ThumbsDown, Check, SendHorizontal } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import { clearFeedback, submitFeedback } from '../services/api.js';
import { clickThumb, feedbackEntry, listenFeedback, sendComment, watchFeedback } from '../services/feedbackSync.js';
import Tooltip from './Tooltip.jsx';
import './MessageFeedback.css';

const COMMENT_MAX_LENGTH = 20000;
const COMMENT_COUNTER_THRESHOLD = 18000;

// 👍/👎 + optional comment on a completed assistant message. The rating is the
// current opinion of the answer: re-clicking the active thumb clears it,
// switching thumbs replaces it, and the comment rides along. A click shows at
// once; services/feedbackSync.js brings the server to it (fast clicking sends
// only where it ends up, every comment sent goes out) and stores on the message
// only what the server confirmed. Clearing a rating keeps what was written:
// rating again brings the comment back.
export default function MessageFeedback({ message, chatId, setChats }) {
    const { t } = useTranslation();
    const entry = feedbackEntry(`${chatId}|${message.completionId}`, message.feedback || null);
    const watch = useCallback((onChange) => watchFeedback(entry, onChange), [entry]);
    // A forgotten entry reads as changed, so the control renders again and takes the fresh one.
    const { feedback } = useSyncExternalStore(watch, () => entry.view);
    const [commentDraft, setCommentDraft] = useState(() => entry.wanted?.comment || entry.kept || '');
    const [justSent, setJustSent] = useState(false);
    // Failures are explained: the 404 (conversation owned by another profile — see
    // api.js buildError, which is where the thrown Error gets its httpStatus) on its
    // own, anything else as "not saved", since the thumbs go back to what is saved.
    const [errorNotice, setErrorNotice] = useState(null);
    const textareaRef = useRef(null);

    useEffect(() => {
        let timer = null;
        const stop = listenFeedback(entry, (event) => {
            if (event.type === 'sent') {
                setJustSent(true);
                clearTimeout(timer);
                timer = setTimeout(() => setJustSent(false), 2000);
            } else if (event.type === 'failed') {
                console.warn('Feedback not recorded:', event.error);
                const notSaved = event.what === 'comment' ? 'feedbackCommentNotSaved' : 'feedbackNotSaved';
                setErrorNotice(t(event.error?.httpStatus === 404 ? 'feedbackNotYours' : notSaved));
            }
        });
        return () => {
            stop();
            clearTimeout(timer);
        };
    }, [entry, t]);

    // Grow with the text; the CSS max-height (40vh) caps it and overflow-y scrolls.
    useLayoutEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [commentDraft, feedback]);

    // What the save loop needs. Messages have no stable id of their own — the
    // completion id is unique per assistant response, so patch by it.
    const io = {
        submit: ({ value, comment }, signal) => submitFeedback({
            completionId: message.completionId,
            sessionId: chatId,
            value,
            comment: comment ?? null,
            signal,
        }),
        clear: (signal) => clearFeedback({ completionId: message.completionId, sessionId: chatId, signal }),
        confirm: (saved) => setChats((prev) => prev.map((chat) => {
            if (chat.id !== chatId) return chat;
            return {
                ...chat,
                messages: chat.messages.map((m) => (
                    m?.completionId === message.completionId ? { ...m, feedback: saved } : m
                )),
            };
        })),
    };

    const handleThumb = (value) => {
        setErrorNotice(null);
        clickThumb(entry, value, io);
    };

    const handleSendComment = () => {
        if (sendComment(entry, commentDraft.trim(), io)) setErrorNotice(null);
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
