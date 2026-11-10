import { useState, useRef, useEffect } from 'react';
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
    const stateLabel = model.status?.state === 'rate_limited'
        ? `Rate-limited ${formatUntil(model.status.until)}`
        : model.status?.state === 'unreachable'
            ? `Unreachable ${formatUntil(model.status.until)}`
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

function VersionRow({ name, group, current, currentModelName, onChoose }) {
    const { t } = useTranslation();
    const unavailable = group.entries.every(m => !isAvailable(m));
    const single = group.entries.length === 1;
    return (
        <button
            className={`model-dropdown-item version-row ${current ? 'active' : ''} ${unavailable ? 'disabled' : ''}`}
            onClick={onChoose}
            disabled={unavailable}
            type="button"
        >
            <span className="version-row-name">{name}</span>
            {current && !single && <span className="version-row-model">{currentModelName}</span>}
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
    const rootRef = useRef(null);

    const close = () => {
        setIsOpen(false);
        setOpenStandId(null);
    };

    useEffect(() => {
        if (!isOpen) return undefined;
        const onMouseDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) {
                setIsOpen(false);
                setOpenStandId(null);
            }
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
                setOpenStandId(null);
            }
        };
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isOpen]);

    const hasModels = models.length > 0;
    const groups = groupByVersion(models);
    const currentEntry = models.find(m => m.id === selectedModel);
    const current = currentEntry ? describeEntry(currentEntry) : null;
    const currentGroup = current && groups.find(g => g.standId === current.standId);
    // A refreshed list may drop the open version: fall back to step 1.
    const openGroup = groups.find(g => g.standId === openStandId) ?? null;

    const handleSelect = (id) => {
        onSelect(id);
        close();
    };
    const handleRequireAuth = () => {
        close();
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

    let focusId = null;
    if (openGroup && openGroup.standId !== current?.standId && current) {
        const same = openGroup.entries.find(m => describeEntry(m).llmId === current.llmId);
        if (same && isUsable(same) && isAvailable(same)) focusId = same.id;
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
                    items={group.entries.filter(m => m.provider === 'openrouter' && !m.featured)}
                    selectedModel={selectedModel}
                    onSelect={handleSelect}
                    onRequireAuth={handleRequireAuth}
                />
            </>
        );
    };

    return (
        <div className="model-dropdown" ref={rootRef}>
            <Tooltip text={t('tipModelSelect')} align="left">
                <button
                    className={`model-dropdown-trigger ${!hasModels ? 'no-models' : ''}`}
                    onClick={() => {
                        const willOpen = !isOpen;
                        setIsOpen(willOpen);
                        setOpenStandId(null);
                        if (willOpen) onOpen?.();
                    }}
                    type="button"
                    aria-label={t('tipModelSelect')}
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
                            <button
                                className="version-back"
                                onClick={() => setOpenStandId(null)}
                                aria-label={t('versionBack')}
                                type="button"
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
                                />
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
