import mammoth from 'mammoth';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { generateText } from 'ai';
import { z } from 'zod';
import {
  createEmptyJobProfile,
  getJobProfileMissingFields,
} from '../../../shared/job-profiles.js';
import { createTextLanguageModel } from '../agents/services/language-model.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  trimValues: true,
});

function importLog(message, extra) {
  if (extra === undefined) {
    console.log(`[job-import] ${message}`);
    return;
  }
  console.log(`[job-import] ${message}`, extra);
}

function importLogBlock(title, content) {
  console.log(`[job-import] ${title}\n${String(content || '')}\n[job-import] ${title}结束`);
}

function ensureBuffer(contentBase64) {
  if (Buffer.isBuffer(contentBase64)) {
    return contentBase64;
  }
  return Buffer.from(String(contentBase64 || ''), 'base64');
}

function ensureTextArray(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(ensureTextArray);
  }
  if (typeof value === 'object') {
    return Object.values(value).flatMap(ensureTextArray);
  }
  return [String(value)];
}

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function parseJsonFromText(text) {
  const content = String(text || '').trim();
  if (!content) {
    throw new Error('模型未返回内容');
  }

  try {
    return JSON.parse(content);
  } catch {
    const codeBlockMatch = content.match(/```json\s*([\s\S]*?)```/i) || content.match(/```\s*([\s\S]*?)```/i);
    if (codeBlockMatch?.[1]) {
      return JSON.parse(codeBlockMatch[1].trim());
    }

    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(content.slice(firstBrace, lastBrace + 1));
    }

    throw new Error('模型返回的内容不是合法 JSON');
  }
}

async function generateJson({ schema, prompt }) {
  importLogBlock('发送给模型的提示词', prompt);
  const { text } = await generateText({
    model: createTextLanguageModel(),
    prompt,
  });

  importLogBlock('模型原始返回', text);

  const parsed = parseJsonFromText(text);
  return schema.parse(parsed);
}

async function extractPdfText(buffer) {
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = (content.items || [])
      .map(item => item?.str || '')
      .join(' ')
      .trim();
    if (text) {
      pages.push(`第 ${pageNumber} 页\n${text}`);
    }
  }

  return pages.join('\n\n');
}

async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return normalizeWhitespace(result.value);
}

async function extractXlsxText(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheets = workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
    const lines = rows
      .map(row => (Array.isArray(row) ? row.filter(Boolean).join(' | ') : ''))
      .filter(Boolean);
    return lines.length ? `工作表：${name}\n${lines.join('\n')}` : '';
  }).filter(Boolean);

  return sheets.join('\n\n');
}

async function extractPptxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  const slides = [];
  for (let index = 0; index < slideFiles.length; index += 1) {
    const xml = await zip.file(slideFiles[index])?.async('string');
    if (!xml) {
      continue;
    }
    const parsed = parser.parse(xml);
    const text = ensureTextArray(parsed)
      .filter(item => item && item !== '[object Object]')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) {
      slides.push(`第 ${index + 1} 页\n${text}`);
    }
  }

  return slides.join('\n\n');
}

async function extractPlainText(buffer) {
  return normalizeWhitespace(buffer.toString('utf8'));
}

async function extractFileText(file) {
  const filename = String(file?.filename || '').trim();
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  const buffer = ensureBuffer(file?.contentBase64);
  importLog(`开始提取文件文本: ${filename || '未命名文件'} (${extension || 'unknown'})`);

  if (!buffer.length) {
    throw new Error(`文件 ${filename || '未命名文件'} 内容为空`);
  }

  switch (extension) {
    case 'pdf': {
      const text = await extractPdfText(buffer);
      importLog(`完成文件提取: ${filename}`, { textLength: text.length });
      return { filename, text };
    }
    case 'docx': {
      const text = await extractDocxText(buffer);
      importLog(`完成文件提取: ${filename}`, { textLength: text.length });
      return { filename, text };
    }
    case 'xlsx':
    case 'xls':
    case 'csv': {
      const text = await extractXlsxText(buffer);
      importLog(`完成文件提取: ${filename}`, { textLength: text.length });
      return { filename, text };
    }
    case 'pptx': {
      const text = await extractPptxText(buffer);
      importLog(`完成文件提取: ${filename}`, { textLength: text.length });
      return { filename, text };
    }
    case 'txt':
    case 'md':
    case 'json': {
      const text = await extractPlainText(buffer);
      importLog(`完成文件提取: ${filename}`, { textLength: text.length });
      return { filename, text };
    }
    default:
      throw new Error(`暂不支持解析 ${filename || '该文件'}，请上传 PDF、DOCX、XLSX、XLS、CSV、PPTX、TXT 或 MD`);
  }
}

const importedJobProfileSchema = z.object({
  title: z.string().default(''),
  recruitmentInfo: z.string().default(''),
  responsibilities: z.string().default(''),
  requirements: z.string().default(''),
  preferredQualifications: z.string().default(''),
  candidatePersona: z.string().default(''),
  dealBreakers: z.string().default(''),
  keywords: z.array(z.string()).default([]),
  notes: z.string().default(''),
});

function buildSourceText(extractedFiles) {
  return extractedFiles
    .map(file => `文件：${file.filename}\n${file.text}`)
    .join('\n\n====================\n\n')
    .slice(0, 50000);
}

async function structureJobProfileWithModel({ extractedFiles, existingProfile }) {
  const sourceText = buildSourceText(extractedFiles);

  importLog('开始调用大模型整理 JD 字段', {
    sourceLength: sourceText.length,
  });
  
  const object = await generateJson({
    schema: importedJobProfileSchema,
    prompt: `
你是资深招聘运营，请从材料中提取信息并整理成结构化 JD 表单。
你必须返回严格的 JSON 对象，所有字段都要能被 JSON 解析。
除了 JSON，不要输出任何解释、前言、备注或 markdown。

字段定义：
- title: 岗位名称
- recruitmentInfo: 招聘基础信息，比如地点、年限、汇报线、团队背景、学历、编制、薪资等
- responsibilities: 主要职责
- requirements: 硬性要求，必须满足的经验和能力
- preferredQualifications: 加分项
- candidatePersona: 理想候选人的人员画像
- dealBreakers: 禁忌条件，不符合时优先淘汰
- keywords: 5-12 个关键词
- notes: 其余补充说明

要求：
1. 只能根据材料和已有岗位信息整理，不要脑补。
2. 优先使用材料中的原始意思，整理成适合直接落表单的中文。
3. 如果某项没有足够依据，就留空。
4. 对 responsibilities / requirements / preferredQualifications / candidatePersona / dealBreakers 这几个字段，尽量写成结构清晰的短段落或分行要点。
5. keywords 请提炼 5-12 个真正有筛选价值的词，不要泛化。
6. notes 用来放补充背景、来源说明、仍需核实的信息，保持克制，不要重复其他字段。

已有岗位信息：
${JSON.stringify(existingProfile || {}, null, 2)}

材料原文：
${sourceText}
    `.trim(),
  });

  importLog('完成 JD 字段整理', {
    title: object.title,
    keywordCount: Array.isArray(object.keywords) ? object.keywords.length : 0,
  });
  return object;
}

export async function importJobProfileFromFiles({ files, existingProfile }) {
  const normalizedFiles = Array.isArray(files) ? files : [];
  if (!normalizedFiles.length) {
    throw new Error('请至少上传一个文件');
  }

  importLog('收到岗位资料导入请求', {
    fileCount: normalizedFiles.length,
    files: normalizedFiles.map(file => file?.filename || 'unknown'),
  });

  const extractedFiles = [];
  for (const file of normalizedFiles) {
    extractedFiles.push(await extractFileText(file));
  }

  importLogBlock(
    '提取后的文件原文',
    extractedFiles
      .map(file => `文件：${file.filename}\n${file.text}`)
      .join('\n\n====================\n\n'),
  );

  const structured = await structureJobProfileWithModel({
    extractedFiles,
    existingProfile,
  });

  const profile = createEmptyJobProfile({
    ...existingProfile,
    ...structured,
    notes: normalizeWhitespace(structured.notes),
  });

  const missingFields = getJobProfileMissingFields(profile);

  importLog('岗位资料导入完成', {
    title: profile.title,
    missingFields: missingFields.map(item => item.label),
  });

  return {
    profile,
    sourceFiles: extractedFiles.map(file => ({
      filename: file.filename,
      textLength: file.text.length,
      preview: file.text.slice(0, 300),
    })),
    missingFields,
  };
}
