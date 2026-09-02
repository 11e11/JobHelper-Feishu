import { policyFor } from './dictionary';
import type { FieldMatch, FillPolicyKind, PolicyOverrides, ProfileKey } from './types';

export const HARD_FORBIDDEN_KINDS=new Set(['file','password','submit','button']);
export const POLICY_LABELS:Record<FillPolicyKind,string>={auto:'自动填写',confirm:'每次确认',forbidden:'禁止填写'};

export function effectivePolicy(match:FieldMatch,overrides:PolicyOverrides):FillPolicyKind{
 if(match.policy==='forbidden'||HARD_FORBIDDEN_KINDS.has(match.kind))return 'forbidden';
 return match.key?overrides[match.key]??policyFor(match.key,match.label):'confirm';
}

export function applyPolicyOverrides(matches:FieldMatch[],overrides:PolicyOverrides):FieldMatch[]{
 return matches.map(match=>({...match,policy:effectivePolicy(match,overrides)}));
}

export const CONFIGURABLE_KEYS:ProfileKey[]=['name','phone','email','idNumber','currentCity','gender','birthDate','politicalStatus','ethnicity','school','college','major','education','enrollmentDate','graduationDate','github','homepage','portfolio','jobDirection','source','expectedCity','acceptTransfer','acceptOtherRole','expectedSalary','relativeEmployed','nonCompete'];
