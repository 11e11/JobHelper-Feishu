const REPEATED_CATEGORY_IDS = new Set(['education', 'internship', 'project', 'campus']);

const GROUP_TITLE_PATTERNS = {
  education: /^(学校|院校)\s*\d+$/i,
  internship: /^(公司|单位)\s*\d+$/i,
  project: /^项目(?:名称)?\s*\d+$/i,
  campus: /^(组织(?:\/活动)?|活动)\s*\d+$/i
};

export function getTrailingGroupNumber(label) {
  const match = String(label || '').match(/(\d+)\s*$/);
  return match ? Number(match[1]) : 0;
}

/**
 * Group only repeatable resume sections. Digits that are part of a field's
 * meaning (for example CET4/CET6) must never create visual groups.
 * Unnumbered custom fields belong to the most recently seen experience.
 */
export function groupProfileFields(category) {
  const fields = Array.isArray(category?.fields) ? category.fields : [];
  if (!REPEATED_CATEGORY_IDS.has(category?.id)) {
    return fields.length ? [{ id: 0, fields: [...fields], label: null, titleField: null }] : [];
  }

  const groups = [];
  const groupsById = new Map();
  let current = null;

  for (const field of fields) {
    const numberedId = getTrailingGroupNumber(field?.label);
    if (numberedId > 0) {
      current = groupsById.get(numberedId);
      if (!current) {
        current = { id: numberedId, fields: [], label: null, titleField: null };
        groupsById.set(numberedId, current);
        groups.push(current);
      }
    } else if (!current) {
      current = { id: 0, fields: [], label: null, titleField: null };
      groups.push(current);
    }
    current.fields.push(field);
  }

  const titlePattern = GROUP_TITLE_PATTERNS[category.id];
  for (const group of groups) {
    if (group.id <= 0 || !titlePattern) continue;
    group.titleField = group.fields.find(field => titlePattern.test(String(field?.label || '').trim())) || null;
    group.label = String(group.titleField?.value || '').trim() || `第 ${group.id} 条`;
  }
  return groups;
}

export function suggestedCustomFieldLabel(category) {
  if (!REPEATED_CATEGORY_IDS.has(category?.id)) return '新字段';
  const maxGroup = Math.max(0, ...(category.fields || []).map(field => getTrailingGroupNumber(field.label)));
  return `新字段${maxGroup || 1}`;
}
