import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Check, SendHorizontal } from 'lucide-react';
import { useTranslation } from '../i18n.js';
import { clearFeedback, submitFeedback } from '../services/api.js';
import './MessageFeedback.css';

// 👍/👎 + optional comment on a completed assistant message. The backend
// upserts by (completion_id, session_id): re-clicking the active thumb clears
// the feedback, switching thumbs overwrites it, and sending a comment re-posts
// the current value with the comment attached.
export default function MessageFeedback({ message, chatId, setChats }) {
    const { t } = useTranslation();
    const [pending, setPending] = useState(false);
    const [commentDraft, setCommentDraft] = useState(message.feedback?.comment || '');
    const [justSent, setJustSent] = useState(false);

    const feedback = message.feedback || null;

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
        } finally {
            setPending(false);
        }
    };

    const handleSendComment = async () => {
        const comment = commentDraft.trim();
        if (pending || !feedback || !comment || comment === (feedback.comment || '')) return;
        setPending(true);
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
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="message-feedback">
            <div className="feedback-thumbs">
                <button
                    className={`feedback-btn ${feedback?.value === 'up' ? 'active' : ''}`}
                    onClick={() => handleThumb('up')}
                    disabled={pending}
                    title={t('feedbackGoodTitle')}
                    aria-label={t('feedbackGoodTitle')}
                    aria-pressed={feedback?.value === 'up'}
                    type="button"
                >
                    <ThumbsUp size={14} />
                </button>
                <button
                    className={`feedback-btn down ${feedback?.value === 'down' ? 'active' : ''}`}
                    onClick={() => handleThumb('down')}
                    disabled={pending}
                    title={t('feedbackBadTitle')}
                    aria-label={t('feedbackBadTitle')}
                    aria-pressed={feedback?.value === 'down'}
                    type="button"
                >
                    <ThumbsDown size={14} />
                </button>
            </div>

            {feedback && (
                <div className="feedback-comment-row">
                    <input
                        className="feedback-comment-input"
                        type="text"
                        maxLength={2000}
                        placeholder={t('feedbackCommentPlaceholder')}
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSendComment();
                        }}
                        disabled={pending}
                    />
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
