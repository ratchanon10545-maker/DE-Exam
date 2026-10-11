const $ = s => document.querySelector(s);
const SITE_BASE = (function () {
  const path = location.pathname.replace(/index\.html?$/, "").replace(/\/$/, "");
  return `${location.origin}${path || ""}`;
})();
const DEFAULT_QUESTION_FILES = [
  new URL("./questions/text.txt", `${SITE_BASE}/`).href,
  new URL("./questions/text2.txt", `${SITE_BASE}/`).href,
];
const FILE = DEFAULT_QUESTION_FILES[0];
let qs = [], idx = 0, answers = [], done = [];
let fileList = DEFAULT_QUESTION_FILES.filter(Boolean);
let currentFileIndex = 0;

function parse(raw) { const blocks = raw.replace(/^\uFEFF/, "").replace(/\r/g, "").trim().split(/\n\s*\n+/).filter(Boolean); if (!blocks.length) throw Error("ไฟล์ว่างเปล่า"); return blocks.map((block, i) => { let q = "", a = "", e = "", section = "", opts = []; for (const rawline of block.split("\n")) { let l = rawline.trim(), m; if (!l || l.startsWith("#")) continue; if ((m = l.match(/^Q(?:UESTION)?\s*:\s*(.*)$/i))) { q = m[1]; section = "q" } else if ((m = l.match(/^([A-J])\s*:\s*(.*)$/i))) { opts.push({ key: m[1].toUpperCase(), text: m[2] }); section = "o" } else if ((m = l.match(/^(?:ANSWER|เฉลย|คำตอบ)\s*:\s*(.*)$/i))) { a = m[1].trim().toUpperCase(); section = "a" } else if ((m = l.match(/^(?:EXPLANATION|อธิบาย|คำอธิบาย)\s*:\s*(.*)$/i))) { e = m[1]; section = "e" } else if (section === "q") q += "\n" + l; else if (section === "o" && opts.length) opts.at(-1).text += "\n" + l; else if (section === "e") e += "\n" + l } if (!q || opts.length < 2 || !opts.some(o => o.key === a)) throw Error(`ข้อ ${i + 1} มีข้อมูลไม่ครบหรือเฉลยไม่ตรงตัวเลือก`); return { q, opts, a, e } }) }

function normalizeFilePath(value) {
  const candidate = String(value || "").trim().replace(/\\/g, "/");
  if (!candidate) return "";
  try {
    if (/^https?:\/\//i.test(candidate)) return new URL(candidate).href;
    return new URL(candidate, window.location.href).href;
  } catch (err) {
    return candidate;
  }
}

function normalizeFileList(files) {
  return [...new Set((Array.isArray(files) ? files : [files]).map(normalizeFilePath).filter(Boolean))];
}

function getFileName(path) {
  const url = new URL(path || "./", window.location.href);
  return (url.pathname.split("/").filter(Boolean).at(-1) || "questions");
}

function updateFileSelector() {
  const selector = $("#fileSelect");
  const wrapper = $("#filePickerWrap");
  if (!selector || !wrapper) return;
  const showSelector = fileList.length > 1;
  wrapper.hidden = !showSelector;
  selector.replaceChildren();
  fileList.forEach((file, i) => {
    const option = document.createElement("option");
    option.value = file;
    option.textContent = getFileName(file);
    option.selected = i === currentFileIndex;
    selector.append(option);
  });
  if (fileList.length) selector.value = fileList[currentFileIndex] || fileList[0];
}

async function discoverQuestionFiles() {
  const explicitFiles = normalizeFileList(DEFAULT_QUESTION_FILES);
  const discovered = [];
  const isGitHubPages = /github\.io$/i.test(window.location.hostname) || /github\.io\//i.test(window.location.href);

  if (!isGitHubPages) {
    try {
      const directoryUrl = new URL("./questions/", window.location.href);
      const directoryRes = await fetch(directoryUrl, { cache: "no-store" });
      if (directoryRes.ok) {
        const html = await directoryRes.text();
        const matches = [...html.matchAll(/href=["']([^"']+)["']/gi)];
        for (const match of matches) {
          const href = match[1];
          const finalUrl = new URL(href, window.location.href).href;
          if (finalUrl.includes("/questions/")) {
            discovered.push(finalUrl);
          }
        }
      }
    } catch (err) {
      // Directory listing is unsupported on many static hosts, so we keep the explicit fallback list.
    }
  }

  const validFiles = discovered.filter(path => /\.(txt|md|json|csv)$/i.test(path));
  fileList = normalizeFileList([...explicitFiles, ...validFiles]);
  if (!fileList.length) fileList = explicitFiles.length ? explicitFiles : [normalizeFilePath(FILE)];
  if (currentFileIndex >= fileList.length) currentFileIndex = 0;
  updateFileSelector();
}

function cycleFile(step) {
  if (fileList.length <= 1) return;
  currentFileIndex = (currentFileIndex + step + fileList.length) % fileList.length;
  updateFileSelector();
  load();
}

async function load() {
  await discoverQuestionFiles();
  const activeFile = fileList[currentFileIndex] || FILE;
  $("#start").disabled = true;
  $("#status").textContent = `กำลังอ่าน ${activeFile}…`;
  updateFileSelector();
  try {
    let r = await fetch(activeFile, { cache: "no-store" });
    if (!r.ok) throw Error("ไม่พบไฟล์");
    qs = parse(await r.text());
    $("#status").textContent = `อ่านสำเร็จ พบข้อสอบ ${qs.length} ข้อ (ไฟล์: ${getFileName(activeFile)})`;
    $("#start").disabled = false;
  } catch (err) {
    $("#status").textContent = `อ่านข้อสอบไม่ได้ (${err.message}) กรุณาตรวจตำแหน่ง ${activeFile} และเปิดเว็บไซต์ผ่านเว็บเซิร์ฟเวอร์ ไม่ใช่ดับเบิลคลิก index.html`;
  }
}
function start() { answers = Array(qs.length).fill(null); done = Array(qs.length).fill(false); idx = 0; $("#setup").hidden = true; $("#result").hidden = true; $("#quiz").hidden = false; show() }
function show() { let q = qs[idx]; $("#counter").textContent = `ข้อ ${idx + 1} จาก ${qs.length}`; $("#answered").textContent = `ตอบแล้ว ${done.filter(Boolean).length} ข้อ`; $("#number").textContent = String(idx + 1).padStart(2, "0"); $("#question").textContent = q.q; $("#progress").style.width = `${(idx + 1) / qs.length * 100}%`; let list = $("#options"); list.replaceChildren(); q.opts.forEach(o => { let b = document.createElement("button"); b.className = "option"; b.type = "button"; if (done[idx]) { b.disabled = true; if (o.key === q.a) b.classList.add("good"); if (o.key === answers[idx] && o.key !== q.a) b.classList.add("bad") } else if (answers[idx] === o.key) b.classList.add("selected"); let k = document.createElement("span"); k.className = "key"; k.textContent = o.key; let t = document.createElement("span"); t.textContent = o.text; b.append(k, t); b.onclick = () => choose(o.key); list.append(b) }); let f = $("#feedback"); f.hidden = !done[idx]; f.className = ""; if (done[idx]) { let ok = answers[idx] === q.a, correct = q.opts.find(o => o.key === q.a); f.className = ok ? "good" : "bad"; f.textContent = (ok ? "✓ ถูกต้อง!" : "✕ ยังไม่ถูกต้อง") + `\nเฉลย: ${correct.key}. ${correct.text}` + (q.e ? `\nคำอธิบาย: ${q.e}` : "") } $("#prev").disabled = idx === 0; $("#next").hidden = idx === qs.length - 1; $("#submit").hidden = idx !== qs.length - 1 }
function choose(key) { if (done[idx]) return; answers[idx] = key; done[idx] = true; show() }
function submit() { let score = qs.filter((q, i) => answers[i] === q.a).length, p = Math.round(score / qs.length * 100); $("#quiz").hidden = true; $("#result").hidden = false; $("#score").textContent = `${score} / ${qs.length}`; $("#percent").textContent = `คะแนน ${p}%`; $("#scorebar").style.width = p + "%"; let rev = $("#review"); rev.replaceChildren(); qs.forEach((q, i) => { let d = document.createElement("article"); d.className = "review-item " + (answers[i] === q.a ? "good" : ""); let h = document.createElement("h3"); h.textContent = `${i + 1}. ${q.q}`; let p = document.createElement("p"); p.textContent = `คำตอบของคุณ: ${q.opts.find(o => o.key === answers[i])?.text || "ไม่ได้ตอบ"}`; let c = document.createElement("p"); c.textContent = `เฉลย: ${q.opts.find(o => o.key === q.a).key}. ${q.opts.find(o => o.key === q.a).text}`; d.append(h, p, c); if (q.e) { let e = document.createElement("p"); e.textContent = "คำอธิบาย: " + q.e; d.append(e) } rev.append(d) }) }
$("#start").onclick = start; 
$("#reload").onclick = () => cycleFile(1); 
// $("#prevFile").onclick = () => cycleFile(-1); 
// $("#nextFile").onclick = () => cycleFile(1); 
$("#fileSelect").onchange = (event) => { const index = fileList.indexOf(event.target.value); if (index >= 0) { currentFileIndex = index; updateFileSelector(); load(); } }; $("#prev").onclick = () => { if (idx > 0) { idx--; show() } }; $("#next").onclick = () => { if (idx < qs.length - 1) { idx++; show() } }; $("#submit").onclick = submit; $("#retry").onclick = start; $("#backToSetup").onclick = () => { $("#quiz").hidden = true; $("#result").hidden = true; $("#setup").hidden = false }; $("#back").onclick = () => { $("#result").hidden = true; $("#setup").hidden = false }; load();