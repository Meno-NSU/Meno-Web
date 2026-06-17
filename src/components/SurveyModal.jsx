import { useEffect } from 'react';
import { X, RateReview } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import './SurveyModal.css';

// One-question end-of-session survey ("would you use Meno again for similar
// questions?"). Every way out reports something: an answer button sends
// yes/maybe/no, while Esc / backdrop / the X all send an explicit 'skipped' —
// the backend distinguishes "didn't care" from "never asked".
export default function SurveyModal({ isOpen, onAnswer, onSkip }) {
    const { t } = useTranslation();

    useEffect(() => {
        if (!isOpen) return undefined;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') onSkip();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onSkip]);

    if (!isOpen) return null;

    return (
        <div
            className="survey-overlay"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onSkip();
            }}
        >
            <div className="survey-card" role="dialog" aria-modal="true" aria-label={t('surveyQuestion')}>
                <button
                    className="btn-icon survey-close"
                    onClick={onSkip}
                    title={t('surveySkip')}
                    aria-label={t('surveySkip')}
                    type="button"
                >
                    <X size={18} />
                </button>
                <div className="survey-emoji" aria-hidden="true"><RateReview size={30} /></div>
                <h3 className="survey-question">{t('surveyQuestion')}</h3>
                <div className="survey-answers">
                    <button className="survey-answer yes" onClick={() => onAnswer('yes')} type="button">
                        {t('surveyYes')}
                    </button>
                    <button className="survey-answer maybe" onClick={() => onAnswer('maybe')} type="button">
                        {t('surveyMaybe')}
                    </button>
                    <button className="survey-answer no" onClick={() => onAnswer('no')} type="button">
                        {t('surveyNo')}
                    </button>
                </div>
                <button className="survey-skip" onClick={onSkip} type="button">
                    {t('surveySkip')}
                </button>
            </div>
        </div>
    );
}
