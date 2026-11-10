import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, within } from '@testing-library/react';
import VersionPicker from './VersionPicker.jsx';
import { setLanguage } from '../i18n.js';

const entry = (id, standId, standName, llmId, llmName, extra = {}) => ({
    id, provider: 'vllm', stand_id: standId, stand_name: standName, llm_id: llmId, llm_name: llmName, ...extra,
});

const V10 = [
    entry('meno-lite', 'menon-1.0', 'Менон 1.0', 'meno-lite', 'meno-lite'),
    entry('gemma-4-12B-it', 'menon-1.0', 'Менон 1.0', 'gemma-4-12B-it', 'Gemma 4 12B'),
];
const V11 = [
    entry('meno-lite@menon-1.1', 'menon-1.1', 'Менон 1.1', 'meno-lite', 'meno-lite'),
    entry('gemma-4-12B-it@menon-1.1', 'menon-1.1', 'Менон 1.1', 'gemma-4-12B-it', 'Gemma 4 12B'),
];
const PROD = [...V10, ...V11];

function setup(props = {}) {
    const onSelect = vi.fn();
    const onRequireAuth = vi.fn();
    const onOpen = vi.fn();
    const all = { models: PROD, selectedModel: 'meno-lite', onSelect, onRequireAuth, onOpen, ...props };
    const utils = render(<VersionPicker {...all} />);
    const open = () => fireEvent.click(utils.container.querySelector('.model-dropdown-trigger'));
    const menu = () => within(document.querySelector('.model-dropdown-menu'));
    return { ...utils, onSelect, onRequireAuth, onOpen, open, menu };
}

afterEach(() => setLanguage('ru'));

describe('VersionPicker', () => {
    it('shows the version and the model in the trigger', () => {
        const { container } = setup({ selectedModel: 'gemma-4-12B-it@menon-1.1' });
        expect(container.querySelector('.version-trigger-version').textContent).toBe('Менон 1.1');
        expect(container.querySelector('.version-trigger-model').textContent).toBe('Gemma 4 12B');
    });

    it('opens on the list of versions and calls onOpen', () => {
        const { open, onOpen } = setup();
        open();
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Версия')).toBeTruthy();
        const rows = document.querySelectorAll('.version-row');
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain('Менон 1.0');
        expect(rows[0].textContent).toContain('meno-lite');
        expect(rows[1].textContent).toBe('Менон 1.1');
        expect(document.querySelector('.model-item-name')).toBeNull();
    });

    it('goes to the models of a version and back', () => {
        const { open, menu } = setup();
        open();
        fireEvent.click(menu().getByText('Менон 1.1'));
        expect(menu().getByText('Модель')).toBeTruthy();
        expect(menu().getByText('meno-lite')).toBeTruthy();
        expect(menu().getByText('Gemma 4 12B')).toBeTruthy();
        expect(document.querySelector('.version-back').textContent).toBe('Менон 1.1');
        fireEvent.click(document.querySelector('.version-back'));
        expect(document.querySelectorAll('.version-row')).toHaveLength(2);
    });

    it('selects a model and closes the menu', () => {
        const { open, onSelect, menu } = setup();
        open();
        fireEvent.click(menu().getByText('Менон 1.1'));
        fireEvent.click(menu().getByText('Gemma 4 12B'));
        expect(onSelect).toHaveBeenCalledWith('gemma-4-12B-it@menon-1.1');
        expect(document.querySelector('.model-dropdown-menu')).toBeNull();
    });

    it('selects the only model of a version at once', () => {
        const cag = { id: 'lite@cag', provider: 'external', stand_id: 'cag', stand_name: 'CAG', llm_id: 'lite', llm_name: 'meno-lite' };
        const { open, onSelect } = setup({ models: [...PROD, cag] });
        open();
        fireEvent.click(screen.getByText('CAG'));
        expect(onSelect).toHaveBeenCalledWith('lite@cag');
    });

    it('disables a version whose models are all unavailable', () => {
        const down = { status: { state: 'unreachable' } };
        const ragu = [
            entry('a@ragu', 'ragu', 'RAGU', 'a', 'a', down),
            entry('b@ragu', 'ragu', 'RAGU', 'b', 'b', down),
        ];
        const { open, onSelect, onRequireAuth } = setup({ models: [...PROD, ...ragu] });
        open();
        const row = screen.getByText('RAGU').closest('button');
        expect(row.disabled).toBe(true);
        expect(row.textContent).toContain('недоступна');
        fireEvent.click(row);
        expect(onSelect).not.toHaveBeenCalled();
        expect(onRequireAuth).not.toHaveBeenCalled();
    });

    it('asks to sign in for a locked one-model version', () => {
        const lab = { id: 'x@lab', provider: 'external', stand_id: 'lab', stand_name: 'Лаб', llm_id: 'x', llm_name: 'x', requires_auth: true };
        const { open, onSelect, onRequireAuth } = setup({ models: [...PROD, lab] });
        open();
        fireEvent.click(screen.getByText('Лаб'));
        expect(onRequireAuth).toHaveBeenCalledTimes(1);
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('resets to the list of versions after Escape', () => {
        const { open } = setup();
        open();
        fireEvent.click(screen.getByText('Менон 1.1'));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(document.querySelector('.model-dropdown-menu')).toBeNull();
        open();
        expect(document.querySelectorAll('.version-row')).toHaveLength(2);
    });

    it('names the built-in versions in English and keeps stand names', () => {
        setLanguage('en');
        const cag = { id: 'lite@cag', provider: 'external', stand_id: 'cag', stand_name: 'CAG', llm_id: 'lite', llm_name: 'lite' };
        const { open, menu } = setup({ models: [...PROD, cag] });
        open();
        expect(menu().getByText('Version')).toBeTruthy();
        expect(menu().getByText('Meno 1.0')).toBeTruthy();
        expect(menu().getByText('Meno 1.1')).toBeTruthy();
        expect(menu().getByText('CAG')).toBeTruthy();
    });

    it('keeps OpenRouter models inside Менон 1.0', () => {
        const models = [
            { id: 'local', provider: 'vllm', display_name: 'Local' },
            { id: 'or/demo', provider: 'openrouter', featured: true, display_name: 'OR Demo' },
            { id: 'or/free', provider: 'openrouter', featured: false, display_name: 'OR Free' },
        ];
        const { open, menu } = setup({ models, selectedModel: 'local' });
        open();
        fireEvent.click(menu().getByText('Менон 1.0'));
        expect(menu().getByText('Другие модели')).toBeTruthy();
        expect(menu().getByText('OR Demo')).toBeTruthy();
        expect(menu().getByText('All free models (1)')).toBeTruthy();
    });

    it('returns to the versions when the open version disappears', () => {
        const { open, rerender, onSelect, onRequireAuth, onOpen } = setup();
        open();
        fireEvent.click(screen.getByText('Менон 1.1'));
        rerender(<VersionPicker models={V10} selectedModel="meno-lite" onSelect={onSelect} onRequireAuth={onRequireAuth} onOpen={onOpen} />);
        expect(document.querySelectorAll('.version-row')).toHaveLength(1);
        expect(document.querySelector('.version-back')).toBeNull();
    });

    it('labels a selection that is not listed, and an empty list', () => {
        const a = setup({ selectedModel: 'gone' });
        expect(a.container.querySelector('.model-dropdown-label').textContent).toBe('Модель');
        a.unmount();
        const b = setup({ models: [], selectedModel: '' });
        const trigger = b.container.querySelector('.model-dropdown-trigger');
        expect(trigger.className).toContain('no-models');
        expect(trigger.textContent).toContain('Нет доступных моделей');
    });

    it('focuses the same model in the version being opened', () => {
        const { open, menu } = setup({ selectedModel: 'gemma-4-12B-it' });
        open();
        fireEvent.click(menu().getByText('Менон 1.1'));
        expect(document.activeElement).toBe(menu().getByText('Gemma 4 12B').closest('button'));
    });
});
