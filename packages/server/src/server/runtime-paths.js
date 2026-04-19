import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const SERVER_DIR = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(SERVER_DIR, '..');

function resolveRuntimeRoot() {
  const overrideDir = process.env.BOSS_AI_DATA_DIR?.trim();
  if (overrideDir) {
    return path.resolve(overrideDir);
  }

  if (process.platform === 'win32') {
    const baseDir = process.env.LOCALAPPDATA || process.env.APPDATA;
    if (baseDir) {
      return path.join(baseDir, 'BossAI', 'server');
    }
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'BossAI', 'server');
  }

  const xdgDataHome = process.env.XDG_DATA_HOME?.trim();
  if (xdgDataHome) {
    return path.join(xdgDataHome, 'boss-ai-server');
  }

  return path.join(os.homedir(), '.local', 'share', 'boss-ai-server');
}

const runtimeRoot = resolveRuntimeRoot();

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

export function getRuntimeRoot() {
  return ensureDir(runtimeRoot);
}

export function getRuntimePath(...segments) {
  return path.join(getRuntimeRoot(), ...segments);
}

export function getLegacyPackagePath(...segments) {
  return path.join(PACKAGE_ROOT, ...segments);
}

export function migrateLegacyFile(relativePath) {
  const targetPath = getRuntimePath(relativePath);
  if (fs.existsSync(targetPath)) {
    return targetPath;
  }

  const legacyPath = getLegacyPackagePath(relativePath);
  if (!fs.existsSync(legacyPath)) {
    return targetPath;
  }

  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(legacyPath, targetPath);
  return targetPath;
}

export function getMidsceneRunDirName() {
  return path.join(getRuntimeRoot(), 'midscene_run');
}
