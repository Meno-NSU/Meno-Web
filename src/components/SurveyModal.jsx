import { useEffect } from 'react';
import { X, RateReview, Check, Loader } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import { useOneShotSend } from './useOneShotSend.js';
import FeedbackStatus from './FeedbackStatus.jsx';
import './SurveyModal.css';

// How long the thanks stays in the card before the modal closes itself.
export const SURVEY_THANKS_MS = 3000;

const ANSWERS = [
    ['yes', 'surveyYes'],
    ['maybe', 'surveyMaybe'],
    ['no', 'surveyNo'],
];

// One-question end-of-session survey ("would you use Meno again for similar
// questions?"). An answer waits for the server in the card: `onAnswer(answer)` returns the
// request's promise; the pressed answer spins, then the card thanks and closes itself after
// SURVEY_THANKS_MS (`onClose`), or shows a short error with «Повторить». Before any answer,
// every way out reports something — Esc / backdrop / the X / «Пропустить» send an explicit
// 'skipped' (`onSkip`): the backend distinguishes "didn't care" from "never asked". Once an
// answer was given, the same ways out only close (`onClose`), never a skip over the answer.
export default function SurveyModal({ isOpen, onAnswer, onSkip, onClose }) {
    const { t } = useTranslation();
    const send = useOneShotSend({ failedKey: 'surveySendFailed', notYoursKey: 'surveyNotYours' });
    const answered = send.status !== 'idle';
    const dismiss = answered ? onClose : onSkip;

    useEffect(() => {
        if (!isOpen) return undefined;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') dismiss?.();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, dismiss]);

    useEffect(() => {
        if (send.status !== 'sent') return undefined;
        const timer = setTimeout(() => onClose?.(), SURVEY_THANKS_MS);
        return () => clearTimeout(timer);
    }, [send.status, onClose]);

    if (!isOpen) return null;

    const answer = (value) => send.run(() => Promise.resolve(onAnswer(value)), { tag: value });

    return (
        <div
            className="survey-overlay"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) dismiss?.();
            }}
        >
            <div className="survey-card" role="dialog" aria-modal="true" aria-label={t('surveyQuestion')}>
                <button
                    className="btn-icon survey-close"
                    onClick={dismiss}
                    title={t(answered ? 'surveyClose' : 'surveySkip')}
                    aria-label={t(answered ? 'surveyClose' : 'surveySkip')}
                    type="button"
                >
                    <X size={18} />
                </button>
                {send.status === 'sent' ? (
                    <div className="survey-thanks" role="status">
                        <div className="survey-emoji sent" aria-hidden="true"><Check size={30} /></div>
                        <p className="survey-question">{t('feedbackThanks')}</p>
                    </div>
                ) : (
                    <>
                        <div className="survey-emoji" aria-hidden="true"><RateReview size={30} /></div>
                        <h3 className="survey-question">{t('surveyQuestion')}</h3>
                        <div className="survey-answers">
                            {ANSWERS.map(([value, key]) => {
                                const inFlight = send.pending && send.tag === value;
                                return (
                                    <button
                                        key={value}
                                        className={`survey-answer ${value}`}
                                        onClick={() => answer(value)}
                                        disabled={send.pending}
                                        aria-busy={inFlight || undefined}
                                        type="button"
                                    >
                                        {inFlight ? <Loader size={16} className="feedback-spinner survey-answer-spinner" /> : null}
                                        {t(key)}
                                    </button>
                                );
                            })}
                        </div>
                        <FeedbackStatus send={send} className="centered survey-status" />
                        {!answered && (
                            <button className="survey-skip" onClick={onSkip} type="button">
                                {t('surveySkip')}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
