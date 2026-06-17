import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import SurveyModal from './SurveyModal.jsx';

function renderSurvey({ isOpen = true, onAnswer = vi.fn(), onSkip = vi.fn() } = {}) {
    return render(<SurveyModal isOpen={isOpen} onAnswer={onAnswer} onSkip={onSkip} />);
}

describe('SurveyModal', () => {
    it('renders nothing when closed', () => {
        renderSurvey({ isOpen: false });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it.each([
        ['yes', /^да$|^yes$/i],
        ['maybe', /возможно|maybe/i],
        ['no', /^нет$|^no$/i],
    ])('reports %s when its button is clicked', (expected, label) => {
        const onAnswer = vi.fn();
        renderSurvey({ onAnswer });
        fireEvent.click(screen.getByText(label, { selector: '.survey-answer' }));
        expect(onAnswer).toHaveBeenCalledWith(expected);
    });

    it('reports an explicit skip from the skip link', () => {
        const onSkip = vi.fn();
        renderSurvey({ onSkip });
        fireEvent.click(screen.getByText(/пропустить|skip/i, { selector: '.survey-skip' }));
        expect(onSkip).toHaveBeenCalled();
    });

    it('treats Escape as a skip', () => {
        const onSkip = vi.fn();
        renderSurvey({ onSkip });
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onSkip).toHaveBeenCalled();
    });
});
