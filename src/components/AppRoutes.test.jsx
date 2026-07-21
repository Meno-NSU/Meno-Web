import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../App.jsx', () => ({ default: () => <div data-testid="app">app</div> }));
vi.mock('./LegalPage.jsx', () => ({
    default: ({ kind }) => <div data-testid="legal-page" data-kind={kind}>page</div>,
}));

import AppRoutes from './AppRoutes.jsx';

function renderAt(path) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
        </MemoryRouter>,
    );
}

describe('AppRoutes', () => {
    it.each([
        ['/privacy', 'privacy_policy'],
        ['/consent', 'personal_data_consent'],
        ['/terms', 'terms_of_use'],
    ])('routes %s to the legal page with kind %s', (path, kind) => {
        renderAt(path);
        expect(screen.getByTestId('legal-page').getAttribute('data-kind')).toBe(kind);
        expect(screen.queryByTestId('app')).toBeNull();
    });

    it('routes the root path to the app', () => {
        renderAt('/');
        expect(screen.getByTestId('app')).toBeTruthy();
        expect(screen.queryByTestId('legal-page')).toBeNull();
    });

    it('routes any other path to the app', () => {
        renderAt('/whatever/chat');
        expect(screen.getByTestId('app')).toBeTruthy();
    });
});
