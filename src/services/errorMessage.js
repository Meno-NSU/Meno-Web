import { translateOnce } from '../i18n.js';

// Maps a failed-request error to a user-facing message. Specific, known codes
// keep their tailored messages; every other (unmapped) error returns a single
// friendly, localized fallback so users never see a raw backend string.
//
// Localized strings are resolved at error time and written into chat state once;
// they are not retroactively re-translated on a later language switch.
export function buildErrorMessage(error, { load } = {}) {
  if (error.code === 'chat_timeout') {
    if (load && load.showLoad) {
      return translateOnce('overloadWithLoad').replace('{n}', String(load.count));
    }
    return translateOnce('overloadBusy');
  }
  if (error.code === 'model_rate_limited') {
    const until = error.until ? new Date(error.until) : null;
    const hh = until ? String(until.getHours()).padStart(2, '0') : '??';
    const mm = until ? String(until.getMinutes()).padStart(2, '0') : '??';
    const mins = until ? Math.max(0, Math.round((until.getTime() - Date.now()) / 60000)) : null;
    return `⚠ Model is rate-limited until ${hh}:${mm}${mins !== null ? ` (~${mins} min)` : ''}. Try another model.`;
  }
  if (error.code === 'model_unreachable') {
    return `⚠ Model is currently unreachable. Try another model.`;
  }
  if (error.code === 'core_model_unavailable') {
    return `⚠ Internal RAG model unavailable — backend cannot run retrieval.`;
  }
  return translateOnce('botUnavailable');
}
