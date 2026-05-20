// Ensure localStorage is available before any modules are collected.
// Node v25 exposes a native localStorage only when --localstorage-file is
// supplied with a valid path; when the path is absent the object exists but
// its methods throw.  This shim runs before any module-level code (e.g.
// i18n.js line 96) that calls localStorage.getItem.
if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
    const store = {};
    Object.defineProperty(globalThis, 'localStorage', {
        value: {
            getItem: (k) => store[k] ?? null,
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; },
            clear: () => { Object.keys(store).forEach(k => delete store[k]); },
        },
        writable: true,
        configurable: true,
    });
}

// @testing-library/react auto-cleanup relies on afterEach being globally
// available.  With globals:false we wire it up manually.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => { cleanup(); });
