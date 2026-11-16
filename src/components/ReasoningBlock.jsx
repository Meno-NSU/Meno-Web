import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, Loader, CheckCircle, Check, Stop } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import { deriveReasoningStatus, formatDuration, hasReasoningBlock, stageDisplayStatus } from './reasoning.js';

// Links from model output open in a new tab so they never navigate the SPA
// away mid-stream (kills arena rounds). `noreferrer` keeps referrer private.
const MARKDOWN_COMPONENTS = {
  // eslint-disable-next-line no-unused-vars
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

// Rotating, gradient-shimmer status phrase (from i18n `loadingPhrases`).
export function LoadingPhrase() {
  const { t, lang } = useTranslation();
  const phrases = (Array.isArray(t('loadingPhrases')) && t('loadingPhrases').length > 0)
    ? t('loadingPhrases')
    : ['…'];
  const [index, setIndex] = useState(() => Math.floor(Math.random() * phrases.length));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setIndex(Math.floor(Math.random() * phrases.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    const cycle = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex(prev => {
          if (phrases.length <= 1) return 0;
          let next;
          do { next = Math.floor(Math.random() * phrases.length); }
          while (next === prev);
          return next;
        });
        setVisible(true);
      }, 400);
    }, 2600);
    return () => clearInterval(cycle);
  }, [phrases.length]);

  return (
    <div className={`loading-phrase ${visible ? 'visible' : 'hidden'}`}>
      {phrases[Math.min(index, phrases.length - 1)]}
    </div>
  );
}

function StageDetail({ detail, stage }) {
  if (!detail || typeof detail !== 'object') return null;

  const lines = [];

  if (stage === 'abbreviation_expansion' && detail.expanded && detail.expanded !== detail.original) {
    lines.push(detail.expanded);
  }
  if (stage === 'anaphora_resolution' && detail.resolved_query) {
    lines.push(detail.resolved_query);
  }
  if (stage === 'query_rewrite') {
    if (detail.resolved_coreferences) lines.push(`Запрос: ${detail.resolved_coreferences}`);
    if (Array.isArray(detail.search_queries) && detail.search_queries.length > 0) {
      detail.search_queries.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
    }
  }
  if (stage === 'retrieval') {
    const parts = [];
    if (detail.chunks_found != null) parts.push(`${detail.chunks_found} чанков`);
    if (detail.multilingual) parts.push(`multilingual: ${detail.multilingual}`);
    if (detail.russian) parts.push(`russian: ${detail.russian}`);
    if (detail.bm25) parts.push(`BM25: ${detail.bm25}`);
    if (parts.length) lines.push(parts.join(' · '));
  }
  if (stage === 'fusion' && detail.candidates != null) {
    lines.push(`${detail.candidates} кандидатов после объединения`);
  }
  if (stage === 'rerank' && detail.kept != null) {
    lines.push(`Отобрано топ-${detail.kept} из ${detail.candidates || '?'}`);
  }
  if (stage === 'context_assembly') {
    const parts = [];
    if (detail.sources != null) parts.push(`${detail.sources} источников`);
    if (detail.context_tokens != null) parts.push(`~${detail.context_tokens} токенов`);
    if (parts.length) lines.push(parts.join(', '));
  }

  if (lines.length === 0) return null;

  return (
    <div className="agent-stage-detail-block">
      {lines.map((line, i) => (
        <div key={i} className="agent-stage-detail-line">{line}</div>
      ))}
    </div>
  );
}

// A stage's name in the UI language; a stage this build has no name for (a new
// backend stage) gets a generic one instead of its raw key.
function stageLabel(t, stage) {
  const key = `stage_${stage}`;
  const label = t(key);
  return label && label !== key ? label : t('stage_other');
}

// One collapsible disclosure per assistant message: pipeline stages + model
// reasoning, collapsed by default in every state. Running shows the shimmer
// phrase as the header; done shows the elapsed time; errored stops the spinner.
// `pending`: the request is out and nothing has come back yet. The header shows the
// waiting phrase already, so the first stage fills the same header instead of a
// separate placeholder giving way to it (the answer jumped by the difference).
// `interrupted`: the answer ended early (stopped or failed); `stoppedByUser`: it was
// the person's stop, which the header then states itself; `elapsedMs`: how long it
// ran up to that end (see endedAfterMs), when known.
export function ReasoningBlock({ stages = [], summary = null, agentError = false, isStreaming = false, reasoning = '', interrupted = false, stoppedByUser = false, elapsedMs = null, pending = false }) {
  const [manualToggle, setManualToggle] = useState(null);
  const { t } = useTranslation();

  const hasReasoning = !!(reasoning && reasoning.trim());
  if (!hasReasoningBlock({ stages, reasoning, pending, isStreaming })) return null;

  const status = deriveReasoningStatus({ summary, agentError, isStreaming, interrupted: interrupted || stoppedByUser });
  const isOpen = manualToggle !== null ? manualToggle : false; // collapsed by default
  const totalMs = summary?.totalMs ?? stages.reduce((sum, s) => sum + (s.durationMs || 0), 0);
  // Once the answer is over no stage spins: see stageDisplayStatus.
  const shownStages = stages.map((s) => {
    const shown = stageDisplayStatus(s.status, status);
    return shown === s.status ? s : { ...s, status: shown };
  });

  let header;
  let icon;
  if (status === 'running') {
    header = <LoadingPhrase />;
    icon = <Loader size={14} className="agent-thinking-icon spinning" />;
  } else if (status === 'stopped') {
    // Calm, factual: no "!" and no lingering "processing…". A stop by the person is
    // stated here, once, with how long it ran (ChatArea then drops the notice's own
    // "Остановлено" and keeps only its Retry). A failure keeps the time; its notice
    // below says what went wrong. The time is the real one up to the end when the
    // message recorded it, else (older saved messages) the finished stages' time.
    const ranMs = elapsedMs ?? totalMs;
    const time = (ranMs / 1000).toFixed(1);
    let text = t('agentThoughtFor').replace('{time}', time);
    if (stoppedByUser) text = ranMs > 0 ? t('agentStoppedAfter').replace('{time}', time) : t('stopped');
    header = <span>{text}</span>;
    icon = <Stop size={13} className="agent-thinking-icon" style={{ color: 'var(--text-tertiary)' }} />;
  } else if (status === 'errored') {
    header = <span>{t('agentProcessing')}</span>;
    icon = <span className="agent-thinking-icon" style={{ color: 'var(--danger)' }}>!</span>;
  } else {
    header = <span>{t('agentThoughtFor').replace('{time}', (totalMs / 1000).toFixed(1))}</span>;
    icon = <CheckCircle size={14} className="agent-thinking-icon complete" />;
  }

  return (
    <div className={`agent-thinking-block ${isOpen ? 'open' : ''} ${status === 'done' ? 'complete' : ''} ${status === 'stopped' ? 'stopped' : ''}`}>
      <button
        className="agent-thinking-summary"
        onClick={() => setManualToggle((prev) => (prev !== null ? !prev : !isOpen))}
      >
        {icon}
        {header}
        <ChevronDown size={14} className="agent-thinking-chevron" />
      </button>
      {isOpen && (
        <div className="agent-thinking-stages">
          {shownStages.map((s, i) => (
            <div key={i} className={`agent-stage-row ${s.status}`}>
              <span className="agent-stage-icon">
                {s.status === 'running'
                  ? <Loader size={12} className="spinning" />
                  : s.status === 'complete'
                    ? <Check size={12} />
                    : s.status === 'failed'
                      ? <span style={{ color: 'var(--danger)' }}>!</span>
                      : s.status === 'interrupted'
                        ? <Stop size={12} />
                        : <span>-</span>}
              </span>
              <span className="agent-stage-label">{stageLabel(t, s.stage)}</span>
              {s.durationMs != null && (
                <span className="agent-stage-duration">{formatDuration(s.durationMs)}</span>
              )}
            </div>
          ))}
          {shownStages.filter(s => s.status === 'complete' && s.detail).map((s, i) => (
            <StageDetail key={`detail-${i}`} detail={s.detail} stage={s.stage} />
          ))}
          {hasReasoning && (
            <div className="agent-thinking-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                {reasoning}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
