import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeText } from './resume-service.js';

const CANDIDATE_NOTES_DIR = path.resolve(process.cwd(), 'candidate-notes');

function sanitizeFileName(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
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

  const fileName = `${sanitizeFileName(record.name)}.md`;
  const filePath = path.join(dateDir, fileName);
  const matched = record.matched === true;
  const decision = matched ? '符合' : '不符合';
  const reason = normalizeText(record.reason);
  const mismatchReason = matched ? '' : normalizeText(record.reason);
  const summary = normalizeText(record.resume?.summary);

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
