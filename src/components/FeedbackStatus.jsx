import { AlertCircle, Check, RotateCw } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import './FeedbackStatus.css';

// How long the thanks stays after a confirmed send. Only the thanks goes: the control's own
// settled state (the chosen thumb, «Отзыв отправлен», «Голос учтён») stays.
export const THANKS_MS = 6000;

// The lines under a feedback control (an answer's 👍/👎 and comment, an arena vote, the survey). After a confirmed send: a check,
// the control's settled text if it has one («Отзыв отправлен.», «Голос учтён: …»), and the
// thanks while it lasts — the thanks fades out shortly before THANKS_MS. `children` go at the
// end of that line (the «Изменить» of a sent comment). A settled text shows even with no send
// in this session (restored from the server). After a failed send: a short error and
// «Повторить», unless retrying cannot help. Nothing more while pending — the pressed control
// shows that itself. `send` is { thanks, error: { key, canRetry } | null, retry }.
// Inline-block, not the icons' default block: in a centred line (arena, survey) the icon flows
// with the text; in the default flex line it makes no difference.
const INLINE_ICON = { display: 'inline-block' };

export default function FeedbackStatus({ send, settled = null, className = '', children }) {
    const { t } = useTranslation();
    const showSent = Boolean(settled) || send.thanks;

    return (
        <>
            {showSent && (
                <div
                    className={`feedback-status sent ${settled ? '' : 'only-thanks'} ${className}`}
                    role="status"
                    style={{ '--feedback-thanks-out': `${THANKS_MS - 400}ms` }}
                >
                    <Check size={15} className="feedback-status-icon" style={INLINE_ICON} />
                    <span className="feedback-status-body">
                        {settled}
                        {settled && send.thanks ? ' ' : null}
                        {send.thanks && <span className="feedback-status-thanks">{t('feedbackThanks')}</span>}
                        {children}
                    </span>
                </div>
            )}
            {send.error && (
                <div className={`feedback-status error ${className}`} role="alert">
                    <AlertCircle size={15} className="feedback-status-icon" style={INLINE_ICON} />
                    <span className="feedback-status-body">
                        {t(send.error.key)}
                        {send.error.canRetry && (
                            <button type="button" className="feedback-status-retry" onClick={send.retry}>
                                <RotateCw size={13} />
                                {t('feedbackRetry')}
                            </button>
                        )}
                    </span>
                </div>
            )}
        </>
    );
}
