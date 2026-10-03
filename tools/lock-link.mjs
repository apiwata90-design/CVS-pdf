// Encrypts the Google Drive link with a password and writes the ciphertext into index.html.
// The plain link and the password are never written anywhere.
//
//   node tools/lock-link.mjs
//
// Asks for the link, then the password twice (hidden). Run again any time to change either.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { webcrypto as crypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const INDEX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const MARK = /\/\*LOCKED_LINK\*\/[\s\S]*?\/\*\/LOCKED_LINK\*\//;
const ITERATIONS = 600000;   // PBKDF2-SHA256, OWASP 2023 guidance; ~0.5 s on a phone

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.startsWith(question)) process.stdout.write(question); };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const b64 = (u8) => Buffer.from(u8).toString('base64');

async function deriveKey(pass, salt, usage) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass.normalize('NFC').trim()), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

const html = fs.readFileSync(INDEX, 'utf8');
if (!MARK.test(html)) { console.error('ไม่เจอจุด LOCKED_LINK ใน index.html'); process.exit(1); }

const link = (process.env.CVS_LINK || await ask('ลิงก์ Google Drive: ')).trim();
if (!/^https:\/\//.test(link)) { console.error('ลิงก์ต้องขึ้นต้นด้วย https://'); process.exit(1); }

let pass = process.env.CVS_LINK_PASS;   // for automated tests only
if (!pass) {
  pass = await ask('ตั้งรหัส (พิมพ์แล้วจะไม่เห็นตัวอักษร): ', true);
  const again = await ask('พิมพ์รหัสอีกครั้ง: ', true);
  if (pass !== again) { console.error('รหัสสองครั้งไม่ตรงกัน — ยังไม่ได้บันทึก'); process.exit(1); }
}
if (!pass.trim()) { console.error('รหัสว่าง — ยังไม่ได้บันทึก'); process.exit(1); }
if (pass.trim().length < 8) console.warn('คำเตือน: รหัสสั้นกว่า 8 ตัว คนที่ได้ไฟล์ไปอาจเดาได้');

const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(pass, salt, 'encrypt'), new TextEncoder().encode(link));

// round-trip check before writing
const back = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await deriveKey(pass, salt, 'decrypt'), enc);
if (new TextDecoder().decode(back) !== link) { console.error('ตรวจถอดรหัสไม่ผ่าน — ยังไม่ได้บันทึก'); process.exit(1); }

const blob = JSON.stringify({ n: ITERATIONS, s: b64(salt), i: b64(iv), c: b64(new Uint8Array(enc)) });
fs.writeFileSync(INDEX, html.replace(MARK, `/*LOCKED_LINK*/${blob}/*/LOCKED_LINK*/`));
console.log('บันทึกลิงก์ที่เข้ารหัสลง index.html แล้ว');
