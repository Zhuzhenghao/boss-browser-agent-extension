import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../agents/services/db.js';
import {
  getDefaultJobProfiles,
  normalizeJobProfile,
  normalizeJobProfiles,
} from '../shared/job-profiles.js';

const DATA_DIR = path.resolve(process.cwd(), 'screening-data');
const LEGACY_JOB_PROFILES_PATH = path.join(DATA_DIR, 'job-profiles.json');

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapRow(row) {
  if (!row) {
    return null;
  }

  return normalizeJobProfile({
    id: row.id,
    title: row.title,
    enabled: row.enabled === 1,
    autoInspection: row.auto_inspection === 1,
    inspectionInterval: row.inspection_interval || 60,
    lastInspectionAt: row.last_inspection_at,
    recruitmentInfo: row.recruitment_info,
    responsibilities: row.responsibilities,
    requirements: row.requirements,
    preferredQualifications: row.preferred_qualifications,
    candidatePersona: row.candidate_persona,
    dealBreakers: row.deal_breakers,
    keywords: parseJson(row.keywords_json, []),
    rejectionMessage: row.rejection_message,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function countJobProfiles() {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) AS count FROM job_profiles').get();
  return Number(row?.count || 0);
}

function writeProfile(profile) {
  const db = getDb();
  const normalized = normalizeJobProfile(profile);
  const now = new Date().toISOString();
  const createdAt = String(normalized.createdAt || now);
  const updatedAt = String(normalized.updatedAt || now);

  db.prepare(`
    INSERT INTO job_profiles (
      id, title, enabled, auto_inspection, inspection_interval, last_inspection_at,
      recruitment_info, responsibilities, requirements,
      preferred_qualifications, candidate_persona, deal_breakers, keywords_json,
      rejection_message, notes, created_at, updated_at
    ) VALUES (
      @id, @title, @enabled, @auto_inspection, @inspection_interval, @last_inspection_at,
      @recruitment_info, @responsibilities, @requirements,
      @preferred_qualifications, @candidate_persona, @deal_breakers, @keywords_json,
      @rejection_message, @notes, @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      enabled = excluded.enabled,
      auto_inspection = excluded.auto_inspection,
      inspection_interval = excluded.inspection_interval,
      last_inspection_at = excluded.last_inspection_at,
      recruitment_info = excluded.recruitment_info,
      responsibilities = excluded.responsibilities,
      requirements = excluded.requirements,
      preferred_qualifications = excluded.preferred_qualifications,
      candidate_persona = excluded.candidate_persona,
      deal_breakers = excluded.deal_breakers,
      keywords_json = excluded.keywords_json,
      rejection_message = excluded.rejection_message,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run({
    id: normalized.id,
    title: normalized.title,
    enabled: normalized.enabled ? 1 : 0,
    auto_inspection: normalized.autoInspection ? 1 : 0,
    inspection_interval: normalized.inspectionInterval || 60,
    last_inspection_at: normalized.lastInspectionAt || null,
    recruitment_info: normalized.recruitmentInfo,
    responsibilities: normalized.responsibilities,
    requirements: normalized.requirements,
    preferred_qualifications: normalized.preferredQualifications,
    candidate_persona: normalized.candidatePersona,
    deal_breakers: normalized.dealBreakers,
    keywords_json: JSON.stringify(normalized.keywords || []),
    rejection_message: normalized.rejectionMessage,
    notes: normalized.notes,
    created_at: createdAt,
    updated_at: updatedAt,
  });

  return readJobProfile(normalized.id);
}

let _migrated = false;
function ensureMigrated() {
  if (_migrated) return;
  _migrated = true;
  ensureMigrated();
}

function migrateLegacyJsonIfNeeded() {
  if (countJobProfiles() > 0) {
    return;
  }

  let initialProfiles = [];
  if (fs.existsSync(LEGACY_JOB_PROFILES_PATH)) {
    try {
      const content = fs.readFileSync(LEGACY_JOB_PROFILES_PATH, 'utf8');
      const parsed = JSON.parse(content);
      initialProfiles = normalizeJobProfiles(parsed?.profiles);
    } catch {
      initialProfiles = [];
    }
  }

  if (!initialProfiles.length) {
    initialProfiles = getDefaultJobProfiles();
  }

  for (const profile of initialProfiles) {
    writeProfile(profile);
  }
}

export function listJobProfiles() {
  ensureMigrated();
  const db = getDb();
  const rows = db.prepare(`
    SELECT *
    FROM job_profiles
    ORDER BY updated_at DESC, id DESC
  `).all();
  return rows.map(mapRow);
}

export function readJobProfile(id) {
  ensureMigrated();
  if (!id) {
    return null;
  }
  const db = getDb();
  const row = db.prepare(`
    SELECT *
    FROM job_profiles
    WHERE id = ?
  `).get(id);
  return mapRow(row);
}

export function saveJobProfile(profile) {
  ensureMigrated();
  return writeProfile(profile);
}

export function deleteJobProfile(id) {
  if (!id) {
    return false;
  }
  const db = getDb();
  const result = db.prepare(`
    DELETE FROM job_profiles
    WHERE id = ?
  `).run(id);
  return result.changes > 0;
}
