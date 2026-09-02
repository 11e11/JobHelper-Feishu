function normalized(value) {
  return String(value || '').toLowerCase().replace(/[\s:：*＊()（）【】\[\]_-]+/g, '');
}

/** Select an ordinary page field only when a user's sidebar label identifies it uniquely. */
export function findExplicitFieldTarget(fields, requestedLabel) {
  const wanted = normalized(requestedLabel).replace(/\d+$/, '');
  if (!wanted) return { target: null, reason: 'empty-label' };
  const candidates = (fields || []).filter(field => {
    if (field.policy === 'never') return false;
    const pageLabel = normalized(field.requiredLabel || field.label);
    return pageLabel === wanted || pageLabel.includes(wanted) || wanted.includes(pageLabel);
  });
  if (candidates.length === 1) return { target: candidates[0], reason: null };
  return { target: null, reason: candidates.length ? 'ambiguous' : 'not-found' };
}
