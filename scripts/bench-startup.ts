/**
 * Local startup bench harness.
 *
 * Once the app exposes globalThis.__rutarPerfDump with the contract below,
 * run via tsx to dump the perf entries into `.perf/bench-startup.<timestamp>.json`
 * so we can diff numbers across commits.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PerfDump {
  marks: Array<{ name: string; startTime: number }>;
  measures: Array<{ name: string; duration: number; startTime: number }>;
}

async function collectFromAppHandle(): Promise<PerfDump> {
  const dump = (globalThis as { __rutarPerfDump?: PerfDump }).__rutarPerfDump;
  if (!dump) {
    throw new Error('No __rutarPerfDump on globalThis.');
  }
  return dump;
}

async function main() {
  const dump = await collectFromAppHandle().catch((error) => {
    console.error(error.message);
    return null;
  });
  if (!dump) {
    process.exitCode = 1;
    return;
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(scriptDir, '../.perf');
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  const isoDate = new Date().toISOString();
  const stamp = isoDate.replace(/[:.]/g, '-');
  const outPath = resolve(outDir, `bench-startup.${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(dump, null, 2), 'utf-8');
  console.log(`Wrote ${outPath}`);
  for (const measure of dump.measures) {
    console.log(`  ${measure.name.padEnd(36)} ${measure.duration.toFixed(2)}ms`);
  }
}

void main();
