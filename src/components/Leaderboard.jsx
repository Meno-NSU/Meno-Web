import React, { useEffect, useState } from 'react';
import { Trophy, Users, X } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import { fetchContributorLeaderboard } from '../services/api.js';
import './Leaderboard.css';

// The contributor board is SEALED: `ContributorsTable` and `fetchContributorLeaderboard`
// are kept for a possible future, but there is no way in — no tab, no fetch, and the
// backend does not mount /v1/leaderboard either. It published nicknames and per-user
// activity to every visitor, which is распространение of personal data: art. 10.1 152-ФЗ
// requires its own separate consent, and the published Consent states that distribution
// is not part of it. Reviving it needs that consent plus matching Policy/Consent wording
// (see the legal package: G-9 / ИБ-22a) — flipping this flag alone is not enough.
const CONTRIBUTOR_BOARD_ENABLED = false;

function ArenaTable({ data }) {
    const { t } = useTranslation();
    return (
        <table className="leaderboard-table">
            <thead>
                <tr>
                    <th>{t('arenaRank')}</th>
                    <th>{t('arenaSetup')}</th>
                    <th>{t('arenaEloRating')}</th>
                    <th>{t('arenaWinRate')}</th>
                    <th>{t('arenaMatches')}</th>
                </tr>
            </thead>
            <tbody>
                {data.map((row, i) => (
                    <tr key={i} className={i < 3 ? `rank-${i + 1}` : ''}>
                        <td className="rank-col" data-label={t('arenaRank')}>#{i + 1}</td>
                        <td data-label={t('arenaSetup')}>
                            <div className="setup-name">{row.model}</div>
                            <div className="setup-kb" style={{fontSize: '0.85em', color: 'var(--text-2)'}}>{row.knowledge_base}</div>
                        </td>
                        <td className="elo-col" data-label={t('arenaEloRating')} style={{fontWeight: 'bold', color: 'var(--primary)'}}>{row.elo}</td>
                        <td data-label={t('arenaWinRate')}>{row.win_rate}%</td>
                        <td data-label={t('arenaMatches')}>{row.matches}</td>
                    </tr>
                ))}
                {data.length === 0 && (
                    <tr>
                        <td colSpan="5" className="empty-row" style={{textAlign: 'center', padding: '2rem'}}>{t('arenaNoBattles')}</td>
                    </tr>
                )}
            </tbody>
        </table>
    );
}

function ContributorsTable({ data }) {
    const { t } = useTranslation();
    return (
        <table className="leaderboard-table">
            <thead>
                <tr>
                    <th>{t('arenaRank')}</th>
                    <th>{t('contribNickname')}</th>
                    <th>{t('contribQuestions')}</th>
                    <th>{t('contribVotes')}</th>
                    <th>{t('contribFeedback')}</th>
                    <th>{t('contribTotal')}</th>
                </tr>
            </thead>
            <tbody>
                {data.map((row, i) => (
                    <tr key={i} className={i < 3 ? `rank-${i + 1}` : ''}>
                        <td className="rank-col" data-label={t('arenaRank')}>#{i + 1}</td>
                        <td data-label={t('contribNickname')}>
                            <div className="setup-name">{row.nickname || t('contribAnonymous')}</div>
                        </td>
                        <td data-label={t('contribQuestions')}>{row.questions}</td>
                        <td data-label={t('contribVotes')}>{row.votes}</td>
                        <td data-label={t('contribFeedback')}>{row.feedback}</td>
                        <td className="elo-col" data-label={t('contribTotal')} style={{fontWeight: 'bold', color: 'var(--primary)'}}>{row.total}</td>
                    </tr>
                ))}
                {data.length === 0 && (
                    <tr>
                        <td colSpan="6" className="empty-row" style={{textAlign: 'center', padding: '2rem'}}>{t('contribEmpty')}</td>
                    </tr>
                )}
            </tbody>
        </table>
    );
}

export default function Leaderboard({ onClose }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('models');  // 'contributors' is unreachable while sealed
    const [arenaData, setArenaData] = useState(null);        // null = not loaded yet
    const [contribData, setContribData] = useState(null);
    const [loading, setLoading] = useState(true);

    // Lazy-load per tab; data is kept after the first fetch so switching
    // back and forth doesn't refetch.
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (tab === 'models' && arenaData === null) {
                setLoading(true);
                try {
                    const res = await fetch('/v1/arena/leaderboard');
                    const json = await res.json();
                    if (!cancelled) setArenaData(json.data || []);
                } catch (e) {
                    console.error('Failed to fetch arena leaderboard', e);
                    if (!cancelled) setArenaData([]);
                } finally {
                    if (!cancelled) setLoading(false);
                }
            } else if (CONTRIBUTOR_BOARD_ENABLED && tab === 'contributors' && contribData === null) {
                setLoading(true);
                try {
                    const data = await fetchContributorLeaderboard();
                    if (!cancelled) setContribData(data);
                } catch (e) {
                    console.error('Failed to fetch contributor leaderboard', e);
                    if (!cancelled) setContribData([]);
                } finally {
                    if (!cancelled) setLoading(false);
                }
            } else {
                setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [tab, arenaData, contribData]);

    const isContrib = CONTRIBUTOR_BOARD_ENABLED && tab === 'contributors';

    return (
        <div className="leaderboard-container">
            {onClose && (
                <button
                    className="leaderboard-close-btn"
                    onClick={onClose}
                    title={t('closeLeaderboard')}
                    aria-label={t('closeLeaderboard')}
                >
                    <X size={20} />
                </button>
            )}
            <div className="leaderboard-header">
                {isContrib ? <Users size={48} className="trophy-icon" /> : <Trophy size={48} className="trophy-icon" />}
                <h1>{isContrib ? t('contribLeaderboardTitle') : t('arenaLeaderboardTitle')}</h1>
                <p>{isContrib ? t('contribLeaderboardDesc') : t('arenaLeaderboardDesc')}</p>
            </div>

            {CONTRIBUTOR_BOARD_ENABLED && (
            <div className="leaderboard-tabs" role="tablist">
                <button
                    role="tab"
                    aria-selected={!isContrib}
                    className={`leaderboard-tab ${!isContrib ? 'active' : ''}`}
                    onClick={() => setTab('models')}
                    type="button"
                >
                    {t('leaderboardTabModels')}
                </button>
                <button
                    role="tab"
                    aria-selected={isContrib}
                    className={`leaderboard-tab ${isContrib ? 'active' : ''}`}
                    onClick={() => setTab('contributors')}
                    type="button"
                >
                    {t('leaderboardTabContributors')}
                </button>
            </div>
            )}

            {loading ? (
                <div className="leaderboard-loading">{t('arenaLoading')}</div>
            ) : (
                // Keyed by tab: switching remounts the wrapper and plays the
                // tableTabIn fade.
                <div className="table-wrapper" key={tab}>
                    {isContrib
                        ? <ContributorsTable data={contribData || []} />
                        : <ArenaTable data={arenaData || []} />}
                </div>
            )}
        </div>
    );
}
