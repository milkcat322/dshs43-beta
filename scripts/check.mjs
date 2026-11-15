// 프론트 파일을 고친 뒤 확인합니다:  node scripts/check.mjs
//   1. js/ 파일마다 문법 (node --check)
//   2. js/ 는 전역 스코프를 함께 쓰므로, 같은 이름을 두 번(다른 파일 포함) 선언하지 않았는지
//   3. init(); 이 js/main.js 에 정확히 한 번만 있는지
//   4. index.html 이 읽는 css/ · js/ 파일이 실제로 있고, 폴더의 파일이 빠짐없이 index.html 과 sw.js 의 SHELL 에 적혀 있는지
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const errors = [];

const html = read("index.html");
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
const styles = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
const shell = [...read("sw.js").matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);

// 4. 파일 목록
for (const f of [...scripts, ...styles]) {
  if (!fs.existsSync(path.join(root, f))) errors.push(`index.html 이 읽는 ${f} 이 없습니다`);
  if (!shell.includes(f)) errors.push(`sw.js 의 SHELL 에 ${f} 이 없습니다`);
}
for (const d of ["css", "js"]) {
  for (const f of fs.readdirSync(path.join(root, d))) {
    if (![...scripts, ...styles].includes(`${d}/${f}`)) errors.push(`${d}/${f} 을 index.html 이 읽지 않습니다`);
  }
}

// 1. 문법
const jsFiles = scripts.filter((s) => s.startsWith("js/"));
for (const f of jsFiles) {
  try { execFileSync(process.execPath, ["--check", path.join(root, f)], { stdio: "pipe" }); }
  catch (e) { errors.push(`${f} 문법 오류\n${String(e.stderr || e.message).trim()}`); }
}

// 2. 맨 바깥(0열)에서 선언한 이름이 겹치는지. 함수 안의 선언은 들여쓰기가 있어 세지 않습니다.
const seen = new Map();
for (const f of [...jsFiles, "config.js", "updates.js"]) {
  read(f).split(/\r?\n/).forEach((line, i) => {
    const m = line.match(/^(?:async\s+)?(?:function\*?|const|let|var|class)\s+([\w$]+)/);
    if (!m) return;
    if (seen.has(m[1])) errors.push(`${m[1]} 을 두 번 선언했습니다: ${seen.get(m[1])} 와 ${f}:${i + 1}`);
    else seen.set(m[1], `${f}:${i + 1}`);
  });
}

// 3. init();
const inits = jsFiles.flatMap((f) => read(f).split(/\r?\n/).filter((l) => l === "init();").map(() => f));
if (inits.length !== 1 || inits[0] !== "js/main.js") errors.push(`init(); 은 js/main.js 에 한 번만 있어야 합니다 (지금: ${inits.join(", ") || "없음"})`);
if (jsFiles[jsFiles.length - 1] !== "js/main.js") errors.push("index.html 에서 js/main.js 를 맨 마지막에 읽어야 합니다");

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`문제 없음: css ${styles.length}개 · js ${jsFiles.length}개, 맨 바깥 이름 ${seen.size}개`);
