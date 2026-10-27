const $ = (id) => document.getElementById(id);
const DEFAULT_MODEL = { anthropic: "claude-sonnet-4-5", openai: "gpt-5" };
let results = {}, current = null;

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

/* ---------- settings ---------- */
const saved = JSON.parse(localStorage.getItem("ats-settings") || "{}");
for (const k of ["provider", "model", "lang", "style", "pages"]) if (saved[k]) $(k).value = saved[k];
if (saved.apiKey) { $("apiKey").value = saved.apiKey; $("remember").checked = true; }
$("provider").addEventListener("change", () => { $("model").value = DEFAULT_MODEL[$("provider").value]; });

function saveSettings() {
  const s = { provider: $("provider").value, model: $("model").value, lang: $("lang").value,
              style: $("style").value, pages: $("pages").value };
  if ($("remember").checked) s.apiKey = $("apiKey").value;
  localStorage.setItem("ats-settings", JSON.stringify(s));
}

/* ---------- file reading ---------- */
async function readFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "pdf") {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const c = await page.getTextContent();
      let lastY = null;
      for (const it of c.items) {
        if (lastY !== null && Math.abs(it.transform[5] - lastY) > 2) text += "\n";
        text += it.str; lastY = it.transform[5];
      }
      text += "\n\n";
    }
    return text.trim();
  }
  if (ext === "docx") {
    const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value.trim();
  }
  return (await file.text()).trim();
}

function wireDrop(inputId, labelId, targetId) {
  const input = $(inputId), label = $(labelId), drop = input.parentElement;
  const handle = async (file) => {
    if (!file) return;
    label.textContent = `Reading ${file.name}…`;
    try {
      $(targetId).value = await readFile(file);
      label.textContent = `✓ ${file.name} — check the extracted text below`;
    } catch (e) {
      label.textContent = `Could not read ${file.name}: ${e.message}. Paste the text instead.`;
    }
  };
  input.addEventListener("change", () => handle(input.files[0]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); handle(e.dataTransfer.files[0]); });
}
wireDrop("cvFile", "cvLabel", "cvText");
wireDrop("jdFile", "jdLabel", "jdText");

/* ---------- JD fetch (often blocked by CORS) ---------- */
$("fetchJd").addEventListener("click", async () => {
  const url = $("jdUrl").value.trim();
  if (!url) return status("Enter a link first.", "err");
  status("Fetching…");
  try {
    const r = await fetch(url);
    const html = await r.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,nav,footer,header").forEach((n) => n.remove());
    const text = doc.body.innerText.replace(/\n{3,}/g, "\n\n").trim();
    if (text.length < 300) throw new Error("page loads its content with scripts");
    $("jdText").value = text;
    status("JD fetched. Check it is complete.", "ok");
  } catch (e) {
    status(`The site blocked fetching (${e.message}). Paste the JD text, or leave the link and keep web search on.`, "err");
  }
});

/* ---------- AI calls ---------- */
async function callAnthropic(key, model, prompt, web) {
  const body = { model, max_tokens: 16000, messages: [{ role: "user", content: prompt }] };
  if (web) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || r.statusText);
  return j.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

async function callOpenAI(key, model, prompt, web) {
  const body = { model, input: prompt };
  if (web) body.tools = [{ type: "web_search" }];
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || r.statusText);
  if (j.output_text) return j.output_text;
  return (j.output || []).flatMap((o) => o.content || [])
    .filter((c) => c.type === "output_text").map((c) => c.text).join("");
}

/* ---------- parsing + display ---------- */
function parse(text) {
  const out = {};
  const re = /^===\s*([A-Z_]+)\s*===\s*$/gm;
  const marks = [...text.matchAll(re)];
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    out[m[1]] = text.slice(m.index + m[0].length, end).trim();
  });
  if (!marks.length) out.RAW = text;
  return out;
}

function clean(s) { return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s*/gm, ""); }

function show(key) {
  current = key;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.k === key));
  $("out").textContent = results[key] || "(empty)";
}

function render() {
  const tabs = $("tabs"); tabs.innerHTML = "";
  const list = [...SECTIONS, ["RAW", "Full output"]].filter(([k]) => results[k]);
  for (const [k, label] of list) {
    const b = document.createElement("button");
    b.className = "tab ghost"; b.dataset.k = k; b.textContent = label;
    b.onclick = () => show(k);
    tabs.appendChild(b);
  }
  $("results").classList.remove("hidden");
  show(results.FIT ? "FIT" : list[0][0]);
}

function fileBase() {
  const m = (results.FILE_NAMES || "").match(/[\w\-]+_(CV|Resume)[\w\-]*/i);
  return m ? m[0].replace(/\.(pdf|docx?)$/i, "") : "Application";
}

function download(name, content, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("copyBtn").onclick = async () => {
  await navigator.clipboard.writeText(results[current] || "");
  $("copyBtn").textContent = "Copied ✓";
  setTimeout(() => ($("copyBtn").textContent = "Copy"), 1500);
};
$("dlTxt").onclick = () => download(`${current}_${fileBase()}.txt`, results[current], "text/plain");
$("dlDoc").onclick = () => {
  const esc = (results[current] || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<html><head><meta charset="utf-8"></head><body style="font-family:Calibri,Arial;font-size:11pt;white-space:pre-wrap">${esc}</body></html>`;
  download(`${current}_${fileBase()}.doc`, html, "application/msword");
};

function status(msg, cls = "") { const s = $("status"); s.className = "status " + cls; s.innerHTML = msg; }

/* ---------- run ---------- */
$("run").addEventListener("click", async () => {
  const cv = $("cvText").value.trim(), jd = $("jdText").value.trim(), jdUrl = $("jdUrl").value.trim();
  const key = $("apiKey").value.trim(), provider = $("provider").value, model = $("model").value.trim();
  const web = $("web").checked;
  if (!cv) return status("Add your CV first.", "err");
  if (!jd && !(jdUrl && web)) return status("Paste the JD text, or give a link with web search on.", "err");
  if (!key) return status("Enter your API key.", "err");
  saveSettings();

  const prompt = buildPrompt({ cv, jd, jdUrl, lang: $("lang").value, style: $("style").value,
                               pages: $("pages").value, extra: $("extra").value.trim(), web });
  $("run").disabled = true;
  const t0 = Date.now();
  const timer = setInterval(() => status(`<span class="spin"></span>Deep-dive analysis running… ${Math.round((Date.now() - t0) / 1000)}s (usually 1–4 min)`), 1000);
  try {
    const text = provider === "anthropic"
      ? await callAnthropic(key, model, prompt, web)
      : await callOpenAI(key, model, prompt, web);
    results = parse(text);
    for (const k of ["CV", "COVER_LETTER"]) if (results[k]) results[k] = clean(results[k]);
    results.RAW = text;
    render();
    const n = SECTIONS.filter(([k]) => results[k]).length;
    status(`Done: ${n} of ${SECTIONS.length} sections. Review everything before you submit.`, n === SECTIONS.length ? "ok" : "err");
  } catch (e) {
    status(`Error: ${e.message}`, "err");
  } finally {
    clearInterval(timer);
    $("run").disabled = false;
  }
});
