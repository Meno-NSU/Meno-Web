import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, Lock, Check, Circle, Schedule, CloudOff } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import Tooltip from './Tooltip.jsx';
import { MENON_10, describeEntry, groupByVersion, versionName, isUsable, isAvailable } from '../services/versions.js';
import './VersionPicker.css';

function StatusIcon({ state }) {
    if (state === 'rate_limited') return <Schedule size={12} />;
    if (state === 'unreachable') return <CloudOff size={12} />;
    return <Circle size={9} />; // available
}

function formatUntil(untilIso) {
    if (!untilIso) return null;
    const until = new Date(untilIso);
    const diffMin = Math.round((until.getTime() - Date.now()) / 60000);
    if (diffMin <= 0) return 'soon';
    const hh = String(until.getHours()).padStart(2, '0');
    const mm = String(until.getMinutes()).padStart(2, '0');
    return `until ${hh}:${mm} (~${diffMin} min)`;
}

function ModelItem({ model, selected, onSelect, onRequireAuth, autoFocus }) {
    const { t } = useTranslation();
    const available = isAvailable(model);
    // The backend marks OpenRouter models requires_auth for anonymous callers
    // and rejects chat requests against them — clicking one opens the auth
    // modal instead of selecting an unusable model.
    const requiresAuth = Boolean(model.requires_auth);
    // A status without `until` has no time part: join only the parts that are there.
    const until = formatUntil(model.status?.until);
    const stateLabel = model.status?.state === 'rate_limited'
        ? ['Rate-limited', until].filter(Boolean).join(' ')
        : model.status?.state === 'unreachable'
            ? ['Unreachable', until].filter(Boolean).join(' ')
            : null;
    return (
        <button
            className={`model-dropdown-item ${selected ? 'active' : ''} ${!available ? 'disabled' : ''} ${requiresAuth ? 'locked' : ''}`}
            onClick={() => {
                if (!available) return;
                if (requiresAuth) {
                    onRequireAuth?.();
                    return;
                }
                onSelect(model.id);
            }}
            disabled={!available}
            type="button"
            title={requiresAuth ? t('modelRequiresAuth') : stateLabel || ''}
            autoFocus={autoFocus}
        >
            <span className="model-status-icon">
                {requiresAuth ? <Lock size={12} className="model-item-lock" /> : <StatusIcon state={model.status?.state} />}
            </span>
            <span className="model-item-name">{describeEntry(model).llmName}</span>
            {selected && <span className="model-item-check"><Check size={16} /></span>}
            {requiresAuth && <span className="model-item-state">{t('signIn')}</span>}
            {!requiresAuth && stateLabel && <span className="model-item-state">{stateLabel}</span>}
        </button>
    );
}

function ModelGroup({ title, items, selectedModel, focusId, onSelect, onRequireAuth }) {
    if (items.length === 0) return null;
    return (
        <div className="model-dropdown-group">
            {title && (
                <div className="model-dropdown-group-header">
                    <span>{title}</span>
                </div>
            )}
            {items.map(m => (
                <ModelItem
                    key={m.id}
                    model={m}
                    selected={m.id === selectedModel}
                    autoFocus={m.id === focusId}
                    onSelect={onSelect}
                    onRequireAuth={onRequireAuth}
                />
            ))}
        </div>
    );
}

function AllFreeModelsExpander({ items, selectedModel, onSelect, onRequireAuth }) {
    const [open, setOpen] = useState(false);
    if (items.length === 0) return null;
    return (
        <div className="model-dropdown-group">
            <button
                className="model-dropdown-group-expander"
                onClick={() => setOpen(!open)}
                type="button"
            >
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>All free models ({items.length})</span>
            </button>
            {open && items.map(m => (
                <ModelItem key={m.id} model={m} selected={m.id === selectedModel} onSelect={onSelect} onRequireAuth={onRequireAuth} />
            ))}
        </div>
    );
}

function VersionRow({ name, group, current, currentModelName, onChoose, autoFocus }) {
    const { t } = useTranslation();
    const unavailable = group.entries.every(m => !isAvailable(m));
    const single = group.entries.length === 1;
    return (
        <button
            className={`model-dropdown-item version-row ${current ? 'active' : ''} ${unavailable ? 'disabled' : ''}`}
            onClick={onChoose}
            disabled={unavailable}
            type="button"
            autoFocus={autoFocus}
        >
            <span className="version-row-name">{name}</span>
            {current && <span className="version-row-model">{currentModelName}</span>}
            {unavailable && <span className="model-item-state">{t('versionUnavailable')}</span>}
            {!unavailable && !single && <ChevronRight size={16} className="version-row-chevron" />}
            {!unavailable && single && current && <span className="model-item-check"><Check size={16} /></span>}
        </button>
    );
}

export default function VersionPicker({ models, selectedModel, onSelect, onRequireAuth, onOpen }) {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [openStandId, setOpenStandId] = useState(null); // null = step 1
    // The version whose step 2 was just left: its row takes focus back in step 1.
    const [returnStandId, setReturnStandId] = useState(null);
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const hintId = useId();

    // The one way the menu closes. Escape and a choice hand focus back to the
    // trigger, so keyboard users are not dropped on the page body; an outside
    // click leaves focus where the user clicked.
    const close = useCallback((focusTrigger = false) => {
        setIsOpen(false);
        setOpenStandId(null);
        setReturnStandId(null);
        if (focusTrigger) triggerRef.current?.focus();
    }, []);

    useEffect(() => {
        if (!isOpen) return undefined;
        const onMouseDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) close();
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape') close(true);
        };
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isOpen, close]);

    const hasModels = models.length > 0;
    const groups = groupByVersion(models);
    const currentEntry = models.find(m => m.id === selectedModel);
    const current = currentEntry ? describeEntry(currentEntry) : null;
    const currentGroup = current && groups.find(g => g.standId === current.standId);
    // A refreshed list may drop the open version: go back to step 1 for good, so the
    // version coming back in a later list does not reopen a stale step 2.
    const openGroup = groups.find(g => g.standId === openStandId) ?? null;
    if (openStandId !== null && !openGroup) setOpenStandId(null);

    const handleSelect = (id) => {
        onSelect(id);
        close(true);
    };
    const handleRequireAuth = () => {
        close(true);
        onRequireAuth?.();
    };
    const handleChoose = (group) => {
        if (group.entries.length > 1) {
            setOpenStandId(group.standId);
            return;
        }
        const only = group.entries[0];
        if (only.requires_auth) handleRequireAuth();
        else handleSelect(only.id);
    };
    const handleBack = () => {
        setReturnStandId(openStandId);
        setOpenStandId(null);
    };

    // Entries inside the collapsed «All free models» expander are not rendered,
    // so they cannot take focus.
    const isShown = (group, m) => !(group.standId === MENON_10 && m.provider === 'openrouter' && !m.featured);
    let focusId = null;
    if (openGroup && openGroup.standId !== current?.standId && current) {
        const same = openGroup.entries.find(m => describeEntry(m).llmId === current.llmId);
        if (same && isUsable(same) && isAvailable(same) && isShown(openGroup, same)) focusId = same.id;
    }

    const renderModels = (group) => {
        const common = { selectedModel, focusId, onSelect: handleSelect, onRequireAuth: handleRequireAuth };
        if (group.standId !== MENON_10) {
            return <ModelGroup items={group.entries} {...common} />;
        }
        return (
            <>
                <ModelGroup items={group.entries.filter(m => m.provider !== 'openrouter')} {...common} />
                <ModelGroup
                    title={t('modelGroupOther')}
                    items={group.entries.filter(m => m.provider === 'openrouter' && m.featured)}
                    {...common}
                />
                <AllFreeModelsExpander
                    items={group.entries.filter(m => !isShown(group, m))}
                    selectedModel={selectedModel}
                    onSelect={handleSelect}
                    onRequireAuth={handleRequireAuth}
                />
            </>
        );
    };

    // The accessible name is what the trigger shows (version · model); the tooltip
    // sentence describes it.
    const triggerName = !hasModels
        ? t('noModelsAvailable')
        : current ? `${versionName(currentGroup, t)} · ${current.llmName}` : t('model');

    return (
        <div className="model-dropdown" ref={rootRef}>
            <Tooltip text={t('tipModelSelect')} align="left" id={hintId}>
                <button
                    ref={triggerRef}
                    className={`model-dropdown-trigger ${!hasModels ? 'no-models' : ''}`}
                    onClick={() => {
                        if (isOpen) {
                            close();
                            return;
                        }
                        setIsOpen(true);
                        onOpen?.();
                    }}
                    type="button"
                    aria-label={triggerName}
                    aria-describedby={hintId}
                    aria-haspopup="true"
                    aria-expanded={isOpen}
                >
                    {!hasModels && <AlertCircle size={16} className="no-models-icon" />}
                    <span className="model-dropdown-label">
                        {!hasModels ? t('noModelsAvailable') : current ? (
                            <>
                                <span className="version-trigger-version">{versionName(currentGroup, t)}</span>
                                <span className="version-trigger-model">{current.llmName}</span>
                            </>
                        ) : t('model')}
                    </span>
                    <ChevronDown size={16} className={`model-dropdown-chevron ${isOpen ? 'open' : ''}`} />
                </button>
            </Tooltip>

            {isOpen && (
                <div className="model-dropdown-menu">
                    {!hasModels ? (
                        <div className="model-dropdown-item no-models-hint">{t('noModelsAvailable')}</div>
                    ) : openGroup ? (
                        <>
                            {/* Named by the visible version name (label in name); the
                                purpose is the title. Takes focus unless a model does. */}
                            <button
                                className="version-back"
                                onClick={handleBack}
                                title={t('versionBack')}
                                type="button"
                                autoFocus={!focusId}
                            >
                                <ChevronRight size={16} className="version-back-icon" />
                                <span>{versionName(openGroup, t)}</span>
                            </button>
                            <div className="model-dropdown-hint">{t('modelDropdownHint')}</div>
                            {renderModels(openGroup)}
                        </>
                    ) : (
                        <>
                            <div className="model-dropdown-hint">{t('versionHint')}</div>
                            {groups.map(g => (
                                <VersionRow
                                    key={g.standId}
                                    name={versionName(g, t)}
                                    group={g}
                                    current={g.standId === current?.standId}
                                    currentModelName={current?.llmName}
                                    onChoose={() => handleChoose(g)}
                                    autoFocus={g.standId === returnStandId}
                                />
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
