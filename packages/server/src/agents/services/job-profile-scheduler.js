import { getDb } from './db.js';
import debug from 'debug';

const log = debug('boss-agent:scheduler');

let schedulerInterval = null;
let isRunning = false;

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getEnabledAutoInspectionProfiles() {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT *
      FROM job_profiles
      WHERE enabled = 1 AND auto_inspection = 1
      ORDER BY last_inspection_at ASC NULLS FIRST
    `)
    .all();

  return rows.map(row => ({
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
  }));
}

function updateLastInspectionTime(profileId) {
  const db = getDb();
  db.prepare(`
    UPDATE job_profiles
    SET last_inspection_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), profileId);
}

function shouldRunInspection(profile) {
  if (!profile.lastInspectionAt) {
    return true;
  }

  const lastTime = new Date(profile.lastInspectionAt).getTime();
  const now = Date.now();
  const intervalMs = profile.inspectionInterval * 60 * 1000;

  return now - lastTime >= intervalMs;
}

export async function checkAndCreateInspectionTasks(createTaskFn) {
  if (isRunning) {
    log('Scheduler already running, skipping...');
    return;
  }

  try {
    isRunning = true;
    const profiles = getEnabledAutoInspectionProfiles();
    log(`Found ${profiles.length} auto-inspection profiles`);

    for (const profile of profiles) {
      if (!shouldRunInspection(profile)) {
        log(`Profile ${profile.title} not due for inspection yet`);
        continue;
      }

      log(`Creating inspection task for profile: ${profile.title}`);
      
      try {
        await createTaskFn(profile);
        updateLastInspectionTime(profile.id);
        log(`Successfully created task for ${profile.title}`);
      } catch (error) {
        log(`Failed to create task for ${profile.title}:`, error);
      }
    }
  } catch (error) {
    log('Scheduler error:', error);
  } finally {
    isRunning = false;
  }
}

export function startScheduler(createTaskFn, checkIntervalMinutes = 5) {
  if (schedulerInterval) {
    log('Scheduler already started');
    return;
  }

  log(`Starting scheduler with ${checkIntervalMinutes} minute interval`);
  
  // 立即执行一次
  void checkAndCreateInspectionTasks(createTaskFn);
  
  // 定时执行
  schedulerInterval = setInterval(() => {
    void checkAndCreateInspectionTasks(createTaskFn);
  }, checkIntervalMinutes * 60 * 1000);
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    log('Scheduler stopped');
  }
}
