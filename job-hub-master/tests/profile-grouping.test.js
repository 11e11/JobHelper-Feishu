import { describe, expect, it } from 'vitest';
import { groupProfileFields, getTrailingGroupNumber, suggestedCustomFieldLabel } from '../lib/profile-grouping.js';

describe('resume profile visual grouping', () => {
  it('does not treat CET4 and CET6 as experience group numbers', () => {
    const category = { id: 'skills', fields: [
      { label: '编程语言', value: 'python, java' },
      { label: 'CET6成绩', value: '533' },
      { label: 'CET4成绩', value: '634' }
    ] };
    const groups = groupProfileFields(category);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeNull();
    expect(groups[0].fields).toHaveLength(3);
  });

  it('keeps an unnumbered custom education field in the current education card', () => {
    const category = { id: 'education', fields: [
      { label: '学校1', value: '湖南大学' },
      { label: '学位1', value: '硕士研究生' },
      { label: '专业1', value: '计算机技术专业' },
      { label: '教育类型', value: '全日制' },
      { label: '荣誉1', value: '' },
      { label: '新字段', value: '' }
    ] };
    const groups = groupProfileFields(category);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('湖南大学');
    expect(groups[0].fields.map(field => field.label)).toContain('教育类型');
  });

  it('uses only a trailing number and suggests the current experience number', () => {
    expect(getTrailingGroupNumber('CET6成绩')).toBe(0);
    expect(getTrailingGroupNumber('学校2')).toBe(2);
    expect(suggestedCustomFieldLabel({ id: 'education', fields: [{ label: '学校2' }] })).toBe('新字段2');
  });
});
