// ================================================================
// JobHub — 全局常量
// af_ 前缀 = 简历填充    |    jt_ 前缀 = 投递追踪
// ================================================================

export const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

// ---------- Storage Keys ----------
export const STORAGE_KEYS = {
  // 简历填充
  profiles:       'af_profiles',        // storage.local：多份简历
  activeProfileId:'af_activeProfileId',  // storage.local：当前激活的简历 id

  // 投递追踪
  config:         'jt_config',           // storage.local：飞书凭证 + 字段映射
  history:        'jt_history',          // storage.local：本地投递历史
  draft:          'jt_draft',            // storage.session：侧边栏表单草稿
  token:          'jt_token',             // storage.session：tenant_access_token 缓存
  pendingContext: 'jt_pending_context',   // storage.local：跨导航投递检测上下文
  syncQueue:      'jt_sync_queue',        // storage.local：待同步任务
  reviewDraft:    'jt_review_draft'       // storage.local：待用户补全草稿
};

export const GITHUB_REPO_URL = 'https://github.com/Zheyi-D/job-hub';
export const HISTORY_LIMIT = 500;

// ---------- 默认空简历模板 ----------
export function createEmptyProfile(name) {
  return {
    id: crypto.randomUUID(),
    name: name || '我的简历',
    categories: [
      { id: 'basic',      name: '基本信息', icon: '👤',
        fields: [
          { label: '姓名', value: '' },
          { label: '手机', value: '' },
          { label: '邮箱', value: '' },
          { label: '城市', value: '' },
          { label: '现居住地址', value: '' },
          { label: '户籍地址', value: '' },
          { label: '籍贯', value: '' },
          { label: '邮政编码', value: '' },
          { label: '性别', value: '' },
          { label: '出生日期', value: '' },
          { label: '政治面貌', value: '' },
          { label: '民族', value: '' },
          { label: '身份证号码', value: '' },
          { label: '身高', value: '' },
          { label: '体重', value: '' },
          { label: 'GitHub', value: '' },
          { label: '个人主页', value: '' },
          { label: '作品集', value: '' }
          ,{ label: '自我介绍（逐项确认）', value: '' }
        ] },
      { id: 'education',  name: '教育背景', icon: '🎓',
        fields: [
          { label: '学校1', value: '' }, { label: '学位1', value: '' },
          { label: '专业1', value: '' }, { label: '教育类型1', value: '' }, { label: '入学时间1', value: '' }, { label: '毕业时间1', value: '' },
          { label: 'GPA 1', value: '' }, { label: '荣誉1', value: '' },
          { label: '课程1', value: '' },
          { label: '学校2', value: '' }, { label: '学位2', value: '' },
          { label: '专业2', value: '' }, { label: '教育类型2', value: '' }, { label: '入学时间2', value: '' }, { label: '毕业时间2', value: '' },
          { label: 'GPA 2', value: '' }, { label: '荣誉2', value: '' },
          { label: '课程2', value: '' }
        ] },
      { id: 'internship', name: '实习经历', icon: '💼',
        fields: [
          { label: '公司1', value: '' }, { label: '岗位1', value: '' },
          { label: '时间1', value: '' }, { label: '描述1', value: '' },
          { label: '公司2', value: '' }, { label: '岗位2', value: '' },
          { label: '时间2', value: '' }, { label: '描述2', value: '' },
          { label: '公司3', value: '' }, { label: '岗位3', value: '' },
          { label: '时间3', value: '' }, { label: '描述3', value: '' }
        ] },
      { id: 'project',    name: '项目经历', icon: '🚀',
        fields: [
          { label: '项目1', value: '' }, { label: '角色1', value: '' },
          { label: '描述1', value: '' },
          { label: '项目2', value: '' }, { label: '角色2', value: '' },
          { label: '描述2', value: '' },
          { label: '项目3', value: '' }, { label: '角色3', value: '' },
          { label: '描述3', value: '' }
        ] },
      { id: 'campus',     name: '校园经历', icon: '📚',
        fields: [
          { label: '组织/活动1', value: '' }, { label: '角色1', value: '' },
          { label: '描述1', value: '' },
          { label: '组织/活动2', value: '' }, { label: '角色2', value: '' },
          { label: '描述2', value: '' }
        ] },
      { id: 'skills',     name: '技能 & 其他', icon: '🛠️',
        fields: [
          { label: '编程语言', value: '' },
          { label: '工具/框架', value: '' },
          { label: '语言能力', value: '' },
          { label: '英语等级', value: '' },
          { label: 'CET4成绩', value: '' },
          { label: 'CET6成绩', value: '' },
          { label: '证书', value: '' },
          { label: '兴趣爱好', value: '' }
        ] }
      ,{ id: 'preferences', name: '求职偏好（逐项确认）', icon: '🎯',
        fields: [
          { label: '求职方向', value: '' },
          { label: '信息来源', value: '' },
          { label: '期望城市', value: '' },
          { label: '是否接受调剂', value: '' },
          { label: '是否接受其他岗位', value: '' },
          { label: '期望薪资', value: '' },
          { label: '是否有亲属任职', value: '' },
          { label: '是否签署竞业协议', value: '' }
        ] }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// ---------- 飞书字段映射 ----------
export const DEFAULT_FIELD_MAP = {
  idempotencyKey: '投递标识', company: '公司', jobName: '岗位名称',
  jobId: '岗位编号', jobDirection: '岗位方向', workLocation: '工作地点',
  officialUrl: '官网链接', jd: 'JD', stage: '当前阶段', result: '当前结果',
  submittedAt: '投递时间', account: '投递账号', applicationId: '申请编号',
  resumeVersion: '简历版本', updatedAt: '最后更新时间'
};

// 沿用 JobHub 原始必填语义：六个默认列中备注可选，其余五列阻断同步。
export const REQUIRED_FIELDS = ['company', 'jobName', 'submittedAt', 'officialUrl', 'stage'];
export const EXPECTED_FIELD_TYPES = {
  idempotencyKey: 1, company: 1, jobName: 1, jobId: 1,
  jobDirection: 3, workLocation: 1, officialUrl: 15, jd: 1,
  stage: 3, result: 3, submittedAt: 5, account: 1, applicationId: 1,
  resumeVersion: 1, updatedAt: 5
};

export const WRITABLE_RECORD_KEYS = Object.freeze(Object.keys(DEFAULT_FIELD_MAP));
export const JOB_DIRECTION_OPTIONS = ['数据','算法','测试','后端开发','产品','其他','客户端','前端开发'];
export const STAGE_OPTIONS = ['已拒绝','Offer','HR面','笔试','准备投递','待评估','等待结果','已放弃','二面','已投递','一面','三面','测评'];
export const RESULT_OPTIONS = ['已完成','已放弃','待参加','未开始','待通知','未通过','已取消','已通过'];

export const FIELD_TYPE_NAMES = {
  1: '文本', 2: '数字', 3: '单选', 4: '多选', 5: '日期', 7: '复选框',
  11: '人员', 13: '电话号码', 15: '超链接', 17: '附件', 18: '单向关联',
  20: '公式', 21: '双向关联', 22: '地理位置', 23: '群组',
  1001: '创建时间', 1002: '最后更新时间', 1003: '创建人', 1004: '修改人', 1005: '自动编号'
};

export const STATUS_OPTIONS = [
  ...STAGE_OPTIONS
];

// ---------- 看板配色（Neo-Brutalist 纯色） ----------
export const DASHBOARD_COLORS = {
  applied:    '#3366ff',   // 已投递 — 蓝
  testing:    '#ffcc00',   // 测评/笔试 — 黄
  interview:  '#7b2fbe',   // 面试中 — 紫
  offer:      '#00d4aa',   // Offer — 绿
  rejected:   '#555555',   // 已挂/已拒绝 — 灰
  cardTotal:  '#000000',   // 总投递卡片 — 黑底白字
  cardActive: '#ffcc00',   // 进行中卡片 — 黄
  cardInterview: '#7b2fbe',// 面试中卡片 — 紫
  cardOffer:  '#00d4aa'    // Offer卡片 — 绿
};

// ---------- 面试相关状态 ----------
export const INTERVIEW_STATUSES = new Set(['一面', '二面', '三面', 'HR面']);
export const CLOSED_STATUSES = new Set(['已挂', '已拒绝', 'Offer']);
