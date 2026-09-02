import { describe, expect, it } from 'vitest';
import { findExplicitFieldTarget } from '../lib/explicit-field-target.js';

describe('explicit one-field fill targeting', () => {
  it('allows a unique ordinary field outside the automatic allowlist', () => {
    const field = { id: 'x', label: '教育类型 *', requiredLabel: '教育类型', policy: 'confirm' };
    expect(findExplicitFieldTarget([field], '教育类型').target).toBe(field);
  });

  it('never returns guarded controls or ambiguous matches', () => {
    expect(findExplicitFieldTarget([{ label: '验证码', policy: 'never' }], '验证码').reason).toBe('not-found');
    expect(findExplicitFieldTarget([{ label: '自定义项', policy: 'confirm' }, { label: '自定义项', policy: 'confirm' }], '自定义项').reason).toBe('ambiguous');
  });
});
