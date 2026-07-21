import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
    getPrivacySettings,
    patchPrivacySettings,
    getLegalDocument,
    getLegalDocuments,
} from './api.js';

beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function mockFetchOnce(body, { ok = true, status = 200 } = {}) {
    const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: async () => body });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

describe('getPrivacySettings', () => {
    it('GETs /v1/privacy/settings and maps snake_case to camelCase', async () => {
        const fetchMock = mockFetchOnce({ service_and_history: true, meno_improvement: false });
        const state = await getPrivacySettings();
        expect(fetchMock.mock.calls[0][0]).toBe('/v1/privacy/settings');
        expect((fetchMock.mock.calls[0][1]?.method) ?? 'GET').toBe('GET');
        expect(state).toEqual({ serviceAndHistory: true, menoImprovement: false });
    });

    it('throws carrying the HTTP status on a non-OK response', async () => {
        mockFetchOnce({ detail: 'auth required' }, { ok: false, status: 401 });
        await expect(getPrivacySettings()).rejects.toMatchObject({ httpStatus: 401 });
    });
});

describe('patchPrivacySettings', () => {
    it('PATCHes with a snake_case JSON body and maps the returned state', async () => {
        const fetchMock = mockFetchOnce({ service_and_history: true, meno_improvement: true });
        const state = await patchPrivacySettings({
            documentVersion: '1.0',
            serviceAndHistory: true,
            menoImprovement: true,
            source: 'first_run_gate',
        });
        const [url, opts] = fetchMock.mock.calls[0];
        expect(url).toBe('/v1/privacy/settings');
        expect(opts.method).toBe('PATCH');
        expect(opts.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(opts.body)).toEqual({
            document_version: '1.0',
            service_and_history: true,
            meno_improvement: true,
            source: 'first_run_gate',
        });
        expect(state).toEqual({ serviceAndHistory: true, menoImprovement: true });
    });

    it('throws carrying the HTTP status on a version conflict (409)', async () => {
        mockFetchOnce({ detail: 'outdated' }, { ok: false, status: 409 });
        await expect(
            patchPrivacySettings({ documentVersion: 'old', serviceAndHistory: true, menoImprovement: false }),
        ).rejects.toMatchObject({ httpStatus: 409 });
    });
});

describe('getLegalDocument', () => {
    it('GETs /v1/legal/documents/{kind} and maps effective_at → effectiveAt', async () => {
        const fetchMock = mockFetchOnce({
            kind: 'personal_data_consent',
            version: '1.0',
            url: '/consent',
            sha256: 'abc',
            effective_at: null,
            content: '# Согласие',
        });
        const doc = await getLegalDocument('personal_data_consent');
        expect(fetchMock.mock.calls[0][0]).toBe('/v1/legal/documents/personal_data_consent');
        expect(doc).toEqual({
            kind: 'personal_data_consent',
            version: '1.0',
            url: '/consent',
            sha256: 'abc',
            effectiveAt: null,
            content: '# Согласие',
        });
    });

    it('throws carrying the HTTP status on an unknown document (404)', async () => {
        mockFetchOnce({ detail: 'Unknown document.' }, { ok: false, status: 404 });
        await expect(getLegalDocument('nope')).rejects.toMatchObject({ httpStatus: 404 });
    });
});

describe('getLegalDocuments', () => {
    it('GETs /v1/legal/documents and returns the mapped documents array', async () => {
        const fetchMock = mockFetchOnce({
            documents: [
                { kind: 'privacy_policy', version: '1.0', url: '/privacy', sha256: 'a', effective_at: null },
                { kind: 'personal_data_consent', version: '1.0', url: '/consent', sha256: 'b', effective_at: null },
            ],
        });
        const docs = await getLegalDocuments();
        expect(fetchMock.mock.calls[0][0]).toBe('/v1/legal/documents');
        expect(docs).toHaveLength(2);
        expect(docs[1]).toEqual({
            kind: 'personal_data_consent',
            version: '1.0',
            url: '/consent',
            sha256: 'b',
            effectiveAt: null,
        });
    });
});
