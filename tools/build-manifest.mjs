// Writes lectures/index.json — the list of PDFs the web app loads on every device.
// Run after adding, removing or renaming files in lectures/:
//
//   node tools/build-manifest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lectures');
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const MAX = 100 * 1024 * 1024;   // GitHub rejects files over 100 MB

const files = fs.readdirSync(DIR)
  .filter((f) => /\.pdf$/i.test(f))
  .sort(collator.compare)
  .map((file) => ({ file, size: fs.statSync(path.join(DIR, file)).size }));

const big = files.filter((f) => f.size > MAX);
if (big.length) {
  console.error('ไฟล์ใหญ่เกิน 100 MB (GitHub ไม่รับ):\n' + big.map((f) => '  ' + f.file).join('\n'));
  process.exit(1);
}

fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify(files, null, 1) + '\n');
const mb = files.reduce((s, f) => s + f.size, 0) / 1e6;
console.log(`lectures/index.json: ${files.length} ไฟล์, ${mb.toFixed(0)} MB`);
