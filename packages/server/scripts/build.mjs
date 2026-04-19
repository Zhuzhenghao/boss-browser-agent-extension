import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const srcDir = path.join(packageRoot, 'src');
const distDir = path.join(packageRoot, 'dist');
const includedEntries = ['agents', 'server', 'shared', 'index.js'];
const excludedEntries = ['candidate-notes', 'midscene_run', 'screening-data'];

async function main() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  for (const entry of includedEntries) {
    const from = path.join(srcDir, entry);
    const to = path.join(distDir, entry);
    await fs.cp(from, to, { recursive: true });
  }

  for (const entry of excludedEntries) {
    await fs.rm(path.join(distDir, entry), { recursive: true, force: true });
  }

  console.log(
    `Copied ${includedEntries.join(', ')} from ${srcDir} -> ${distDir}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
