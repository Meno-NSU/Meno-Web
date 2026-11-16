import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ThumbsUp, ThumbsDown, ThumbsUpFill, ThumbsDownFill, SendHorizontal, Loader } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import { clearFeedback, submitFeedback } from '../services/api.js';
import { clickThumb, feedbackEntry, listenFeedback, retrySave, sendComment, watchFeedback } from '../services/feedbackSync.js';
import FeedbackStatus, { THANKS_MS } from './FeedbackStatus.jsx';
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
//
// What the person sees of the save: the chosen thumb fills at once and pulses
// while the server does not have that rating yet; once it has the final choice, the
// thanks shows under the thumbs for a few seconds (not for taking a rating
// back). A comment keeps its box, the Send button spinning, until it is on the
// server; then it folds into «Отзыв отправлен.» with «Изменить». A failed save
// puts the thumbs back and says so with «Повторить» — except the 404 (the
// conversation belongs to another profile), where retrying cannot help.
export default function MessageFeedback({ message, chatId, setChats }) {
    const { t } = useTranslation();
    const entry = feedbackEntry(`${chatId}|${message.completionId}`, message.feedback || null);
    const watch = useCallback((onChange) => watchFeedback(entry, onChange), [entry]);
    // A forgotten entry reads as changed, so the control renders again and takes the fresh one.
    const { feedback, saved, saving, unsent } = useSyncExternalStore(watch, () => entry.view);
    const [commentDraft, setCommentDraft] = useState(() => entry.wanted?.comment || entry.kept || '');
    const [editingComment, setEditingComment] = useState(false);
    const [thanks, setThanks] = useState(false);
    // { key, canRetry } of the last failed save; the key is translated at render time.
    const [error, setError] = useState(null);
    const textareaRef = useRef(null);
    const thanksTimerRef = useRef(null);

    useEffect(() => () => clearTimeout(thanksTimerRef.current), []);

    useEffect(() => listenFeedback(entry, (event) => {
        if (event.type === 'saved') {
            setError(null);
            clearTimeout(thanksTimerRef.current);
            setThanks(event.thank);
            if (event.thank) thanksTimerRef.current = setTimeout(() => setThanks(false), THANKS_MS);
        } else if (event.type === 'failed') {
            console.warn('Feedback not recorded:', event.error);
            clearTimeout(thanksTimerRef.current);
            setThanks(false);
            const notYours = event.error?.httpStatus === 404;
            setError({
                key: notYours ? 'feedbackNotYours' : (event.what === 'comment' ? 'feedbackCommentNotSaved' : 'feedbackNotSaved'),
                canRetry: !notYours,
            });
        }
    }), [entry]);

    // The comment folds into «Отзыв отправлен.» once the server has it (and it is not being edited).
    const commentSent = Boolean(feedback?.comment) && !unsent && !editingComment
        && (saved?.comment ?? null) === feedback.comment;
    const showEditor = Boolean(feedback) && !commentSent;

    // Grow with the text; the CSS max-height (40vh) caps it and overflow-y scrolls.
    useLayoutEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [commentDraft, feedback, showEditor]);

    // «Изменить» puts the caret into the reopened comment.
    useEffect(() => {
        if (editingComment) textareaRef.current?.focus();
    }, [editingComment]);

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
        confirm: (confirmed) => setChats((prev) => prev.map((chat) => {
            if (chat.id !== chatId) return chat;
            return {
                ...chat,
                messages: chat.messages.map((m) => (
                    m?.completionId === message.completionId ? { ...m, feedback: confirmed } : m
                )),
            };
        })),
    };

    // A new choice replaces whatever the last save said.
    const startOver = () => {
        setError(null);
        clearTimeout(thanksTimerRef.current);
        setThanks(false);
    };

    const handleThumb = (value) => {
        startOver();
        clickThumb(entry, value, io);
    };

    const handleSendComment = () => {
        if (sendComment(entry, commentDraft.trim(), io)) {
            startOver();
            setEditingComment(false);
        }
    };

    const handleRetry = () => {
        startOver();
        retrySave(entry, io);
    };

    const thumb = (value) => {
        const active = feedback?.value === value;
        const Icon = value === 'up' ? (active ? ThumbsUpFill : ThumbsUp) : (active ? ThumbsDownFill : ThumbsDown);
        return (
            <Tooltip text={t(value === 'up' ? 'tipFeedbackGood' : 'tipFeedbackBad')} side="top" align="left">
                <button
                    className={`feedback-btn ${value === 'down' ? 'down' : ''} ${active ? 'active' : ''} ${active && saving && saved?.value !== value ? 'saving' : ''}`}
                    onClick={() => handleThumb(value)}
                    aria-label={t(value === 'up' ? 'feedbackGoodTitle' : 'feedbackBadTitle')}
                    aria-pressed={active}
                    type="button"
                >
                    <Icon size={14} />
                </button>
            </Tooltip>
        );
    };

    const commentInFlight = saving && unsent;

    return (
        <div className="message-feedback">
            <div className="feedback-thumbs" aria-busy={saving || undefined}>
                {thumb('up')}
                {thumb('down')}
            </div>

            {showEditor && (
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
                            // A reopened comment left unchanged folds back into «Отзыв отправлен».
                            onBlur={() => {
                                if (editingComment && commentDraft.trim() === (feedback.comment || '')) {
                                    setEditingComment(false);
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
                        aria-busy={commentInFlight || undefined}
                        type="button"
                    >
                        {commentInFlight ? <Loader size={14} className="feedback-spinner" /> : <SendHorizontal size={14} />}
                    </button>
                </div>
            )}

            <FeedbackStatus
                send={{ thanks: thanks && Boolean(feedback), error, retry: handleRetry }}
                settled={commentSent ? t('feedbackCommentSent') : null}
            >
                {commentSent && (
                    <button
                        type="button"
                        className="feedback-comment-edit"
                        onClick={() => {
                            setCommentDraft(feedback.comment || '');
                            setEditingComment(true);
                        }}
                    >
                        {t('feedbackCommentEdit')}
                    </button>
                )}
            </FeedbackStatus>
        </div>
    );
}
