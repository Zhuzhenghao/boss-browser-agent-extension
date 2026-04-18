import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { normalizeText } from './resume-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CANDIDATE_NOTES_DIR = path.resolve(__dirname, '../../candidate-notes');

function sanitizeFileName(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function buildFileName(record) {
  const namePart = sanitizeFileName(record?.name) || 'candidate';
  const idPart = sanitizeFileName(record?.candidateId)
    .replace(/^screening-\d+-[a-z0-9]+-candidate-/i, 'c-')
    .slice(-24);

  return idPart ? `${namePart}-${idPart}.md` : `${namePart}.md`;
}

export async function writeSingleCandidateMarkdown(record) {
  if (!record?.name) {
    return null;
  }

  const dateDir = path.join(
    CANDIDATE_NOTES_DIR,
    new Date().toISOString().slice(0, 10),
  );
  await fs.mkdir(dateDir, { recursive: true });

  const fileName = buildFileName(record);
  const filePath = path.join(dateDir, fileName);
  const matched = record.matched === true;
  const decision = matched ? '符合' : '不符合';
  const reason = normalizeText(record.reason);
  const mismatchReason = matched ? '' : normalizeText(record.reason);
  const summary = normalizeText(record.resume?.summary);
  const rawText = String(record.resume?.rawText || '').trim();
  const rawSections = record.resume?.rawSections || {};
  const resumeSegments = Array.isArray(record.resumeSegments) ? record.resumeSegments : [];

  const markdown = `# ${record.name}

- 文件名: ${fileName}
- 结论: ${decision}
- 是否符合: ${matched ? '是' : '否'}
- 原因: ${reason || (matched ? 'Agent 判定符合目标候选人特征。' : 'Agent 判定不符合目标候选人特征。')}
- 不符合的原因: ${mismatchReason || '无'}

## 简历摘要

${summary || '无'}

## 关键简历信息

\`\`\`json
${JSON.stringify(record.resume || {}, null, 2)}
\`\`\`

## 原始栏目文本

\`\`\`json
${JSON.stringify(rawSections, null, 2)}
\`\`\`

## 原始分屏文本

\`\`\`json
${JSON.stringify(resumeSegments, null, 2)}
\`\`\`

## 合并后的原始全文

${rawText || '无'}
`;

  await fs.writeFile(filePath, markdown, 'utf8');
  record.fileName = fileName;
  record.filePath = filePath;
  return {
    name: record.name,
    fileName,
    filePath,
    matched,
  };
}
