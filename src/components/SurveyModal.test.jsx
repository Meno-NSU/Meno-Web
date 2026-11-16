import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import SurveyModal, { SURVEY_THANKS_MS } from './SurveyModal.jsx';

function renderSurvey({ isOpen = true, onAnswer = vi.fn(), onSkip = vi.fn(), onClose = vi.fn() } = {}) {
    return render(<SurveyModal isOpen={isOpen} onAnswer={onAnswer} onSkip={onSkip} onClose={onClose} />);
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

const THANKS = 'Спасибо, что помогаете сделать Менона лучше!';
const yesBtn = () => screen.getByText(/^да$|^yes$/i, { selector: '.survey-answer' });

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

describe('SurveyModal confirmation', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('waits for the server, thanks, and closes itself without a click', async () => {
        vi.useFakeTimers();
        const d = deferred();
        const onAnswer = vi.fn(() => d.promise);
        const onClose = vi.fn();
        const onSkip = vi.fn();
        renderSurvey({ onAnswer, onClose, onSkip });

        fireEvent.click(yesBtn());

        expect(yesBtn().getAttribute('aria-busy')).toBe('true');
        expect([...document.querySelectorAll('.survey-answer')].every((b) => b.disabled)).toBe(true);
        expect(screen.queryByText(THANKS)).toBeNull();

        await act(async () => { d.resolve({}); });

        expect(screen.getByRole('status').textContent).toContain(THANKS);
        expect(document.querySelector('.survey-answer')).toBeNull();
        expect(onClose).not.toHaveBeenCalled();

        act(() => { vi.advanceTimersByTime(SURVEY_THANKS_MS); });
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSkip).not.toHaveBeenCalled();
    });

    it('shows an error with a retry and no thanks when the answer fails; the retry re-sends it', async () => {
        const onAnswer = vi.fn()
            .mockRejectedValueOnce(Object.assign(new Error('Boom'), { httpStatus: 500 }))
            .mockResolvedValueOnce({});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        renderSurvey({ onAnswer });

        await act(async () => { fireEvent.click(yesBtn()); });

        expect(screen.getByText('Не удалось отправить ответ.')).toBeTruthy();
        expect(screen.queryByText(THANKS)).toBeNull();
        expect(yesBtn().disabled).toBe(false);

        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Повторить' })); });

        expect(onAnswer).toHaveBeenCalledTimes(2);
        expect(onAnswer).toHaveBeenLastCalledWith('yes');
        expect(screen.getByText(THANKS)).toBeTruthy();
    });

    it('explains the ownership refusal (404) without a retry', async () => {
        const onAnswer = vi.fn().mockRejectedValueOnce(Object.assign(new Error('Not found'), { httpStatus: 404 }));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        renderSurvey({ onAnswer });

        await act(async () => { fireEvent.click(yesBtn()); });

        expect(screen.getByText(/принадлежит другому профилю/i)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
    });

    it('sends one answer for repeated clicks', async () => {
        const d = deferred();
        const onAnswer = vi.fn(() => d.promise);
        renderSurvey({ onAnswer });

        const yes = yesBtn();
        fireEvent.click(yes);
        fireEvent.click(yes);
        fireEvent.click(screen.getByText(/^нет$|^no$/i, { selector: '.survey-answer' }));
        await act(async () => { d.resolve({}); });

        expect(onAnswer).toHaveBeenCalledTimes(1);
    });

    it('once answered, Escape just closes: it never reports a skip over the answer', async () => {
        const d = deferred();
        const onSkip = vi.fn();
        const onClose = vi.fn();
        renderSurvey({ onAnswer: vi.fn(() => d.promise), onSkip, onClose });

        fireEvent.click(yesBtn());
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSkip).not.toHaveBeenCalled();
    });
});
