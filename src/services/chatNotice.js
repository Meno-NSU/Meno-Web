// Terminal non-content outcomes (a user stop or a failed request) as *localizable
// descriptors* rather than resolved strings. The string is produced at render time
// by formatNotice(t, notice), so it re-translates on every UI language switch and
// never overwrites the streamed answer content.
//
//   notice = { kind: 'stopped' | 'error', key: <i18nKey>, params?: {…} }

export function buildStopNotice() {
  return { kind: 'stopped', key: 'stopped' };
}

// Map a failed-request error to an error descriptor. Known codes keep their
// tailored keys; everything else falls back to the friendly botUnavailable stub.
export function buildErrorNotice(error, { load } = {}) {
  const code = error?.code;

  if (code === 'chat_timeout') {
    if (load && load.showLoad) {
      return { kind: 'error', key: 'overloadWithLoad', params: { n: load.count } };
    }
    return { kind: 'error', key: 'overloadBusy' };
  }

  if (code === 'model_rate_limited') {
    const until = error.until ? new Date(error.until) : null;
    const hh = until ? String(until.getHours()).padStart(2, '0') : '??';
    const mm = until ? String(until.getMinutes()).padStart(2, '0') : '??';
    const mins = until ? Math.max(0, Math.round((until.getTime() - Date.now()) / 60000)) : '?';
    return { kind: 'error', key: 'modelRateLimited', params: { hh, mm, mins } };
  }

  if (code === 'model_unreachable') {
    return { kind: 'error', key: 'modelUnreachable' };
  }

  if (code === 'core_model_unavailable') {
    return { kind: 'error', key: 'coreModelUnavailable' };
  }

  return { kind: 'error', key: 'botUnavailable' };
}

// Resolve a notice to a display string. `t` is injected so the same helper works
// reactively (React's t from useTranslation) and once-off (translateOnce).
export function formatNotice(t, notice) {
  if (!notice) return '';
  let text = t(notice.key);
  const params = notice.params || {};
  for (const [name, value] of Object.entries(params)) {
    text = text.split(`{${name}}`).join(String(value));
  }
  return text;
}
