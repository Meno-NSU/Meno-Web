import { useEffect, useRef, useState } from 'react';
import { X } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import './AuthModal.css';

// Thin gate: the card mounts fresh on every open, so all form state starts
// from its useState initials — no reset-on-open effect needed.
export default function AuthModal({ isOpen, onClose, login, register }) {
    if (!isOpen) return null;
    return <AuthModalCard onClose={onClose} login={login} register={register} />;
}

function AuthModalCard({ onClose, login, register }) {
    const { t } = useTranslation();
    const [mode, setMode] = useState('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [nickname, setNickname] = useState('');
    const [error, setError] = useState(null);
    const [pending, setPending] = useState(false);
    const emailRef = useRef(null);

    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    useEffect(() => {
        emailRef.current?.focus();
    }, [mode]);

    const switchMode = (next) => {
        setMode(next);
        setError(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (pending) return;
        setPending(true);
        setError(null);
        try {
            if (mode === 'login') {
                await login(email.trim(), password);
            } else {
                await register(email.trim(), password, nickname.trim() || null);
            }
            onClose();
        } catch (err) {
            setError(err?.message || t('error'));
            setPending(false);
        }
    };

    return (
        <div
            className="auth-overlay"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="auth-card"
                role="dialog"
                aria-modal="true"
                aria-label={mode === 'login' ? t('signIn') : t('authRegisterTitle')}
            >
                <div className="auth-card-header">
                    <h2 className="auth-title">{mode === 'login' ? t('signIn') : t('authRegisterTitle')}</h2>
                    <button
                        className="btn-icon auth-close"
                        onClick={onClose}
                        title={t('authClose')}
                        aria-label={t('authClose')}
                        type="button"
                    >
                        <X size={20} />
                    </button>
                </div>

                <p className="auth-why">{t('authWhy')}</p>

                <div className="auth-tabs" role="tablist">
                    <button
                        role="tab"
                        aria-selected={mode === 'login'}
                        className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
                        onClick={() => switchMode('login')}
                        type="button"
                    >
                        {t('signIn')}
                    </button>
                    <button
                        role="tab"
                        aria-selected={mode === 'register'}
                        className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
                        onClick={() => switchMode('register')}
                        type="button"
                    >
                        {t('authRegisterTitle')}
                    </button>
                </div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <label className="auth-field">
                        <span className="auth-label">{t('authEmail')}</span>
                        <input
                            ref={emailRef}
                            className="auth-input"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={pending}
                        />
                    </label>
                    <label className="auth-field">
                        <span className="auth-label">{t('authPassword')}</span>
                        <input
                            className="auth-input"
                            type="password"
                            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                            required
                            // Mirrors the backend policy: register enforces >= 8 chars,
                            // login accepts anything non-empty (old/short passwords must
                            // still be able to sign in).
                            minLength={mode === 'register' ? 8 : 1}
                            maxLength={128}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={pending}
                        />
                        {mode === 'register' && <span className="auth-hint">{t('authPasswordHint')}</span>}
                    </label>
                    {mode === 'register' && (
                        <label className="auth-field">
                            <span className="auth-label">{t('authNickname')}</span>
                            <input
                                className="auth-input"
                                type="text"
                                maxLength={64}
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                disabled={pending}
                            />
                            <span className="auth-hint">{t('authNicknameHint')}</span>
                        </label>
                    )}

                    {error && (
                        <div className="auth-error" role="alert">
                            {error}
                        </div>
                    )}

                    <button className="btn-primary auth-submit" type="submit" disabled={pending}>
                        {pending ? '…' : mode === 'login' ? t('authSubmitSignIn') : t('authSubmitRegister')}
                    </button>

                    {mode === 'register' && (
                        <p className="auth-consent-notice">
                            {t('authConsentNoticePrefix')}{' '}
                            <a href="/terms" target="_blank" rel="noopener noreferrer">{t('consentReadTerms')}</a>
                            {' '}{t('authConsentNoticeAnd')}{' '}
                            <a href="/privacy" target="_blank" rel="noopener noreferrer">{t('consentReadPrivacy')}</a>.
                        </p>
                    )}
                </form>

                <button
                    className="auth-switch"
                    type="button"
                    onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                >
                    {mode === 'login' ? t('authSwitchToRegister') : t('authSwitchToSignIn')}
                </button>
            </div>
        </div>
    );
}
