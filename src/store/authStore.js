import { useCallback, useEffect, useState } from 'react';

import { fetchMe, getAuthToken, login as apiLogin, register as apiRegister, setAuthToken, updateNickname as apiUpdateNickname } from '../services/api.js';

// Single source of auth state. Call once (in App) and pass the result down —
// the token persists in localStorage (via the api client) so login survives reloads.
export function useAuth() {
    const [user, setUser] = useState(null);
    // No stored token → nothing to restore, ready immediately.
    const [ready, setReady] = useState(() => !getAuthToken());

    useEffect(() => {
        if (!getAuthToken()) {
            return undefined;
        }
        let cancelled = false;
        fetchMe()
            .then((u) => { if (!cancelled) setUser(u); })
            .catch(() => { setAuthToken(null); }) // stale/invalid token → drop it
            .finally(() => { if (!cancelled) setReady(true); });
        return () => { cancelled = true; };
    }, []);

    const login = useCallback(async (email, password) => {
        const { token, user: u } = await apiLogin({ email, password });
        setAuthToken(token);
        setUser(u);
        return u;
    }, []);

    const register = useCallback(async (email, password, nickname) => {
        const { token, user: u } = await apiRegister({ email, password, nickname });
        setAuthToken(token);
        setUser(u);
        return u;
    }, []);

    const logout = useCallback(() => {
        setAuthToken(null);
        setUser(null);
    }, []);

    const updateNickname = useCallback(async (nickname) => {
        const u = await apiUpdateNickname(nickname);
        setUser(u);
        return u;
    }, []);

    return { user, ready, isAuthenticated: !!user, login, register, logout, updateNickname };
}
