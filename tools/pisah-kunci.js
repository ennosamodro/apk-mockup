// Memisahkan kunci jawaban dari materi LMS.
//   node tools/pisah-kunci.js            -> perbarui materi di index.html + gas/Kunci.gs
//   node tools/pisah-kunci.js --awal     -> sekali saja: bikin index.html + app.js dari sumber
// Sumber (berisi kunci jawaban) ada di sumber/lms-pac1-asli.html dan TIDAK di-push.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "sumber", "lms-pac1-asli.html");
const awal = process.argv.includes("--awal");

const src = fs.readFileSync(SRC, "utf8");
const lines = src.split("\n");
const iData = lines.findIndex(l => l.startsWith("const PAC1 = "));
if (iData < 0) throw new Error("Baris 'const PAC1 = ' tidak ketemu di sumber");
const P = JSON.parse(lines[iData].slice("const PAC1 = ".length).replace(/;\s*$/, ""));

// 1) Kunci untuk server
const kunci = { pass: P.program.pass, modul: {} };
P.modules.forEach(m => {
  kunci.modul[m.id] = { week: m.week, a: m.quiz.map(q => q.a), w: m.quiz.map(q => q.w || "") };
});
fs.mkdirSync(path.join(ROOT, "gas"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "gas", "Kunci.gs"),
  "// DIBUAT OTOMATIS oleh tools/pisah-kunci.js — jangan diedit manual, jangan di-push.\n" +
  "const KUNCI = " + JSON.stringify(kunci, null, 1) + ";\n");

// 2) Materi tanpa kunci untuk browser
const bersih = JSON.parse(JSON.stringify(P));
bersih.modules.forEach(m => m.quiz.forEach(q => { delete q.a; delete q.w; }));
const dataLine = "const PAC1 = " + JSON.stringify(bersih) + ";";

const OUT = path.join(ROOT, "index.html");
if (awal) {
  const iApp = lines.findIndex((l, i) => i > iData && l.trim() === "(function(){");
  if (iApp < 1 || lines[iApp - 1].trim() !== "<script>") throw new Error("Blok script aplikasi tidak ketemu");
  const appEnd = lines.lastIndexOf("</script>");
  fs.writeFileSync(path.join(ROOT, "app.js"), lines.slice(iApp, appEnd).join("\n") + "\n");
  const head = lines.slice(0, iApp - 1);
  head[iData] = dataLine;
  fs.writeFileSync(OUT, head.join("\n") + '\n<script src="app.js"></script>\n</body>\n</html>\n');
} else {
  const cur = fs.readFileSync(OUT, "utf8").split("\n");
  const j = cur.findIndex(l => l.startsWith("const PAC1 = "));
  if (j < 0) throw new Error("Baris PAC1 tidak ketemu di index.html");
  cur[j] = dataLine;
  fs.writeFileSync(OUT, cur.join("\n"));
}

// 3) Pastikan tidak ada kunci yang bocor
const out = fs.readFileSync(OUT, "utf8");
if (/"a":\d/.test(out.split("\n").find(l => l.startsWith("const PAC1 = ")))) throw new Error("Masih ada kunci di index.html!");
console.log("OK:", P.modules.length, "modul,", P.modules.reduce((s, m) => s + m.quiz.length, 0), "soal. Kunci -> gas/Kunci.gs");
