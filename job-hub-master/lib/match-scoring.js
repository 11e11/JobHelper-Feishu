// 岗位匹配评分扩展点。阶段一、二默认且强制使用 DisabledMatchScorer。
export class JobExtractor {
  extract(root = document) { return { title: root.title || '', description: '' }; }
}

export class DisabledMatchScorer {
  async score() { return disabledScore(); }
}

export class RuleBasedMatchScorer {
  async score() { return disabledScore('rule-based-placeholder'); }
}

export class LLMMatchScorer {
  async score() { throw new Error('LLMMatchScorer 仅为未来接口占位，当前禁止网络调用'); }
}

export class LocalModelMatchScorer {
  async score() { throw new Error('LocalModelMatchScorer 仅为未来接口占位，当前未配置本地模型'); }
}

export function disabledScore(provider = 'disabled') {
  return { score: 0, confidence: 0, matchedRequirements: [], missingRequirements: [], riskFlags: [], explanation: '', provider };
}

export const defaultMatchScorer = new DisabledMatchScorer();
