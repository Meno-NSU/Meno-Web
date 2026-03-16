import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { useTranslation } from '../i18n.js';
import './Leaderboard.css';

export default function Leaderboard() {
    const { t } = useTranslation();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const res = await fetch('/v1/arena/leaderboard');
                const json = await res.json();
                setData(json.data || []);
            } catch (e) {
                console.error("Failed to fetch leaderboard", e);
            } finally {
                setLoading(false);
            }
        };
        fetchLeaderboard();
    }, []);

    if (loading) return <div className="leaderboard-loading">{t('arenaLoading')}</div>;

    return (
        <div className="leaderboard-container">
            <div className="leaderboard-header">
                <Trophy size={48} className="trophy-icon" />
                <h1>{t('arenaLeaderboardTitle')}</h1>
                <p>{t('arenaLeaderboardDesc')}</p>
            </div>

            <div className="table-wrapper">
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
                                <td className="rank-col">#{i + 1}</td>
                                <td>
                                    <div className="setup-name">{row.model}</div>
                                    <div className="setup-kb" style={{fontSize: '0.85em', color: 'var(--text-2)'}}>{row.knowledge_base}</div>
                                </td>
                                <td className="elo-col" style={{fontWeight: 'bold', color: 'var(--primary)'}}>{row.elo}</td>
                                <td>{row.win_rate}%</td>
                                <td>{row.matches}</td>
                            </tr>
                        ))}
                        {data.length === 0 && (
                            <tr>
                                <td colSpan="5" className="empty-row" style={{textAlign: 'center', padding: '2rem'}}>{t('arenaNoBattles')}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
