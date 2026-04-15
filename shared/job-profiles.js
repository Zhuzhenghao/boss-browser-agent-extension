function createSlugSegment(value, fallback = 'job-profile') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

export function createJobProfileId(title = '') {
  return `job-${Date.now()}-${createSlugSegment(title, 'profile')}`;
}

export const JOB_PROFILE_FIELD_LABELS = {
  title: '岗位名称',
  recruitmentInfo: '招聘信息',
  responsibilities: '职责要求',
  requirements: '硬性要求',
  preferredQualifications: '加分项',
  candidatePersona: '人员画像',
  dealBreakers: '禁忌条件',
  keywords: '关键词',
  rejectionMessage: '不匹配回复语',
  notes: '备注',
};

export function createEmptyJobProfile(partial = {}) {
  const now = new Date().toISOString();
  const title = String(partial.title || '').trim();

  return {
    id: String(partial.id || createJobProfileId(title)).trim(),
    title,
    enabled: partial.enabled !== false,
    autoInspection: partial.autoInspection === true,
    inspectionInterval: Number(partial.inspectionInterval) || 60,
    lastInspectionAt: String(partial.lastInspectionAt || '').trim(),
    recruitmentInfo: String(partial.recruitmentInfo || '').trim(),
    responsibilities: String(partial.responsibilities || '').trim(),
    requirements: String(partial.requirements || '').trim(),
    preferredQualifications: String(partial.preferredQualifications || '').trim(),
    candidatePersona: String(partial.candidatePersona || '').trim(),
    dealBreakers: String(partial.dealBreakers || '').trim(),
    keywords: Array.isArray(partial.keywords)
      ? partial.keywords.map(item => String(item || '').trim()).filter(Boolean)
      : String(partial.keywords || '')
        .split(/[\n,，、]/)
        .map(item => item.trim())
        .filter(Boolean),
    rejectionMessage: String(partial.rejectionMessage || '').trim(),
    notes: String(partial.notes || '').trim(),
    createdAt: String(partial.createdAt || now),
    updatedAt: String(partial.updatedAt || now),
  };
}

export function normalizeJobProfile(profile) {
  return createEmptyJobProfile(profile);
}

export function normalizeJobProfiles(profiles) {
  if (!Array.isArray(profiles)) {
    return [];
  }

  return profiles.map(normalizeJobProfile);
}

export function getJobProfileMissingFields(profile) {
  const normalized = normalizeJobProfile(profile);
  const checks = [
    ['title', normalized.title],
    ['recruitmentInfo', normalized.recruitmentInfo],
    ['responsibilities', normalized.responsibilities],
    ['requirements', normalized.requirements],
    ['candidatePersona', normalized.candidatePersona],
    ['dealBreakers', normalized.dealBreakers],
  ];

  return checks
    .filter(([, value]) => !String(value || '').trim())
    .map(([key]) => ({
      key,
      label: JOB_PROFILE_FIELD_LABELS[key] || key,
    }));
}

export function getDefaultJobProfiles() {
  return [
    createEmptyJobProfile({
      title: '示例岗位：前端开发工程师',
      recruitmentInfo: '社招，3-5 年经验，本科及以上，Base 上海，负责中后台业务系统。',
      responsibilities: '负责核心业务前端页面开发；推动组件化、工程化和性能优化；与产品、设计、后端协作落地需求。',
      requirements: '熟悉 React 或 Vue3、TypeScript、工程化体系；有复杂表单、权限、工作流类系统经验；具备独立交付能力。',
      preferredQualifications: '有招聘、HR SaaS、CRM、数据中台等 ToB 业务经验优先；有组件库或低代码经验优先。',
      candidatePersona: '沟通顺畅、逻辑清晰、执行稳定，面对业务复杂度时能主动抽象问题并推动落地。',
      dealBreakers: '频繁短期跳槽且项目沉淀薄弱；只有切图/活动页经验；缺少中后台或复杂业务系统经验；技术栈严重不匹配。',
      keywords: ['React', 'Vue3', 'TypeScript', '中后台', '复杂业务', '组件化'],
      rejectionMessage: '感谢沟通，您的背景很优秀，但和当前岗位的核心经验要求暂时不太匹配。',
      notes: '这是示例模板，建议先复制一份再按真实岗位修改。',
    }),
  ];
}

export function buildTargetProfileFromJobProfile(profile) {
  const normalized = normalizeJobProfile(profile);
  const sections = [
    `岗位名称：${normalized.title || '未命名岗位'}`,
    normalized.recruitmentInfo ? `招聘信息：\n${normalized.recruitmentInfo}` : '',
    normalized.responsibilities ? `职责要求：\n${normalized.responsibilities}` : '',
    normalized.requirements ? `硬性要求：\n${normalized.requirements}` : '',
    normalized.preferredQualifications ? `加分项：\n${normalized.preferredQualifications}` : '',
    normalized.candidatePersona ? `人员画像：\n${normalized.candidatePersona}` : '',
    normalized.dealBreakers ? `禁忌条件：\n${normalized.dealBreakers}` : '',
    normalized.keywords.length ? `关键词：${normalized.keywords.join('、')}` : '',
    '',
    '筛选要求：',
    '1. 优先依据硬性要求和禁忌条件判断是否匹配。',
    '2. 如果候选人经历与岗位名称相近，但核心职责、产出层级或业务类型明显不符，判为不匹配。',
    '3. 如果简历信息不足以确认硬性条件是否满足，默认谨慎处理，不要因为模糊表述直接判定匹配。',
    '4. 如果命中禁忌条件，即使其他部分尚可，也优先判为不匹配。',
    '5. 输出判断时尽量引用候选人的具体经历作为依据。',
  ].filter(Boolean);

  return sections.join('\n\n');
}
