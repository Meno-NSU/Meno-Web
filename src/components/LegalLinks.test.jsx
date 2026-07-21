import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LegalLinks from './LegalLinks.jsx';

function renderLinks() {
    return render(
        <MemoryRouter>
            <LegalLinks />
        </MemoryRouter>,
    );
}

describe('LegalLinks', () => {
    it('renders links to the three legal routes', () => {
        const { container } = renderLinks();
        const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
        expect(hrefs).toEqual(expect.arrayContaining(['/privacy', '/terms', '/consent']));
    });

    it('renders exactly three links, each with a non-empty label', () => {
        const { container } = renderLinks();
        const links = [...container.querySelectorAll('a')];
        expect(links).toHaveLength(3);
        for (const a of links) {
            expect(a.textContent.trim().length).toBeGreaterThan(0);
        }
    });
});
