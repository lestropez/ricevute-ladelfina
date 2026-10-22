"use strict";
const C = window.APP_CONFIG;
const $ = s => document.querySelector(s);
const SCOPES = ["Files.ReadWrite", "User.Read"];

// ---------- IndexedDB ----------
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("ricevute", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("queue", { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function qAll() {
  const d = await db();
  return new Promise(r => { const q = d.transaction("queue").objectStore("queue").getAll(); q.onsuccess = () => r(q.result.sort((a, b) => a.added - b.added || a.id.localeCompare(b.id))); });
}
async function qPut(it) { const d = await db(); return new Promise(r => { const tx = d.transaction("queue", "readwrite"); tx.objectStore("queue").put(it); tx.oncomplete = r; }); }
async function qDel(id) { const d = await db(); return new Promise(r => { const tx = d.transaction("queue", "readwrite"); tx.objectStore("queue").delete(id); tx.oncomplete = r; }); }

// ---------- Persona ----------
let person = C.persons[0];
try { person = localStorage.getItem("person") || person; } catch (e) {}
function drawPersons() {
  $("#persons").innerHTML = "";
  C.persons.forEach(p => {
    const b = document.createElement("button"); b.textContent = p; if (p === person) b.className = "on";
    b.onclick = () => { person = p; try { localStorage.setItem("person", p); } catch (e) {} drawPersons(); };
    $("#persons").appendChild(b);
  });
}

// ---------- Data dello scatto ----------
function pad(n) { return String(n).padStart(2, "0"); }
function stamp(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "_" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); }
async function exifDate(blob) {
  try {
    if (!/jpe?g/i.test(blob.type)) return null;
    const v = new DataView(await blob.slice(0, 131072).arrayBuffer());
    if (v.getUint16(0) !== 0xFFD8) return null;
    let o = 2;
    while (o < v.byteLength - 4) {
      const m = v.getUint16(o), len = v.getUint16(o + 2);
      if (m === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) {
        const t = o + 10, le = v.getUint16(t) === 0x4949;
        const u16 = p => v.getUint16(t + p, le), u32 = p => v.getUint32(t + p, le);
        const readIfd = (p, want) => {
          const n = u16(p);
          for (let i = 0; i < n; i++) {
            const e = p + 2 + i * 12, tag = u16(e);
            if (tag === want) return u32(e + 8);
          }
          return null;
        };
        const ifd0 = u32(4);
        const exifPtr = readIfd(ifd0, 0x8769);
        let off = exifPtr != null ? readIfd(exifPtr, 0x9003) : null;
        if (off == null) off = readIfd(ifd0, 0x0132);
        if (off == null) return null;
        let s = ""; for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(t + off + i));
        const m2 = s.match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/);
        return m2 ? m2.slice(1).join("").replace(/^(\d{8})/, "$1_") : null;
      }
      o += 2 + len;
    }
  } catch (e) {}
  return null;
}
async function shotStamp(it) {
  const ex = await exifDate(it.blob); if (ex) return ex;
  const m = (it.name || "").match(/(20\d{6})[_-]?(\d{6})/); if (m) return m[1] + "_" + m[2];
  return stamp(new Date(it.lastModified || it.added));
}
function cleanNote(s) { return (s || "").trim().replace(/[\\/:*?"<>|#%]+/g, "").replace(/\s+/g, "-").slice(0, 40); }
function ext(it) {
  const m = (it.name || "").match(/\.([a-z0-9]{2,5})$/i); if (m) return m[1].toLowerCase();
  return it.type === "application/pdf" ? "pdf" : it.type === "image/png" ? "png" : "jpg";
}

// ---------- Griglia ----------
const urls = new Map();
async function draw() {
  const items = await qAll();
  let lastPag = ""; try { lastPag = localStorage.getItem("pag") || ""; } catch (e) {}
  for (const it of items) if (!it.person) { it.person = person; if (it.pag === undefined) it.pag = lastPag; await qPut(it); }
  $("#empty").classList.toggle("hidden", items.length > 0);
  $("#send").disabled = !items.some(i => i.status !== "ok");
  $("#send").textContent = items.length ? `Invia a OneDrive (${items.length})` : "Invia a OneDrive";
  const g = $("#grid"); g.innerHTML = "";
  for (const it of items) {
    const el = document.createElement("div"); el.className = "item";
    let prev;
    if (/^image\//.test(it.type) && !/heic/i.test(it.type)) {
      if (!urls.has(it.id)) urls.set(it.id, URL.createObjectURL(it.blob));
      prev = `<img src="${urls.get(it.id)}" alt="">`;
    } else if (/pdf/i.test(it.type) || /\.pdf$/i.test(it.name || "")) {
      prev = `<canvas class="pdfc" width="96" height="140"></canvas><div class="fname">${(it.name || "").replace(/</g, "&lt;")}</div>`;
    } else prev = `<div class="pdf">${ext(it).toUpperCase()}</div>`;
    const badge = it.status === "up" ? '<span class="badge b-up">invio…</span>' :
      it.status === "err" ? '<span class="badge b-err">errore</span>' : "";
    const q = s => (s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const cat = C.categories.find(c => c.label === it.cat);
    const opts = `<option value="">Categoria…</option>` + C.categories.map(c =>
      `<option${c.label === it.cat ? " selected" : ""}>${c.label}</option>`).join("");
    el.innerHTML = `<div class="thumb">${prev}${badge}</div><button class="x" title="Rimuovi">×</button>
      <div class="meta"><span class="who">${it.person} ⇄</span>
      <select class="cat">${opts}</select>
      <input class="chi${cat && cat.conChi ? "" : " hidden"}" placeholder="Con chi / per quale cliente" value="${q(it.conChi)}">
      <select class="pag"><option value="">Pagato con… (facoltativo)</option>${(C.payments || []).map(p => `<option${p === it.pag ? " selected" : ""}>${p}</option>`).join("")}</select>
      <input class="pagAltro${it.pag === "Altro" ? "" : " hidden"}" placeholder="Specifica il pagamento" value="${q(it.pagAltro)}">
      <input class="note" placeholder="Nota (facoltativa)" value="${q(it.note)}"></div>`;
    el.querySelector(".x").onclick = async () => { await qDel(it.id); draw(); };
    const th = el.querySelector(".thumb");
    th.onclick = () => apriAnteprima(it);
    const cv = el.querySelector("canvas.pdfc");
    if (cv) miniaturaPdf(it.blob, cv);
    el.querySelector(".who").onclick = async () => {
      const i = C.persons.indexOf(it.person); it.person = C.persons[(i + 1) % C.persons.length]; await qPut(it); draw();
    };
    el.querySelector(".cat").onchange = async e => {
      it.cat = e.target.value; await qPut(it);
      const c = C.categories.find(x => x.label === it.cat), chi = el.querySelector(".chi");
      chi.classList.toggle("hidden", !(c && c.conChi)); if (c && c.conChi) chi.focus();
    };
    el.querySelector(".chi").oninput = async e => { it.conChi = e.target.value; await qPut(it); };
    el.querySelector(".pag").onchange = async e => {
      it.pag = e.target.value; await qPut(it); try { localStorage.setItem("pag", it.pag); } catch (x) {}
      const pa = el.querySelector(".pagAltro"); pa.classList.toggle("hidden", it.pag !== "Altro"); if (it.pag === "Altro") pa.focus();
    };
    el.querySelector(".pagAltro").oninput = async e => { it.pagAltro = e.target.value; await qPut(it); };
    el.querySelector(".note").oninput = async e => { it.note = e.target.value; await qPut(it); };
    g.appendChild(el);
  }
}

// ---------- Anteprima (foto e PDF) ----------
const PDFJS = "./";
let pdfjsP = null;
function pdfjs() {
  if (!pdfjsP) pdfjsP = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = PDFJS + "pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; res(window.pdfjsLib); };
    s.onerror = () => { pdfjsP = null; rej(new Error("pdf.js non caricato")); }; document.head.appendChild(s);
  });
  return pdfjsP;
}
async function renderPagina(pdf, n, canvas, larghezza) {
  const p = await pdf.getPage(n); const v1 = p.getViewport({ scale: 1 });
  const sc = larghezza / v1.width * (window.devicePixelRatio || 1); const v = p.getViewport({ scale: sc });
  canvas.width = v.width; canvas.height = v.height; canvas.style.width = larghezza + "px";
  await p.render({ canvasContext: canvas.getContext("2d"), viewport: v }).promise;
}
async function miniaturaPdf(blob, canvas) {
  try { const L = await pdfjs(); const pdf = await L.getDocument({ data: await blob.arrayBuffer() }).promise;
    await renderPagina(pdf, 1, canvas, 96); canvas.style.height = "auto"; } catch (e) { /* resta il riquadro */ }
}
async function apriAnteprima(it) {
  const ov = document.createElement("div"); ov.className = "viewer";
  ov.innerHTML = `<div class="vbar"><span>${(it.name || "").replace(/</g, "&lt;")}</span><button>Chiudi</button></div><div class="vbody"></div>`;
  ov.querySelector("button").onclick = () => ov.remove(); document.body.appendChild(ov);
  const body = ov.querySelector(".vbody"); const W = Math.min(window.innerWidth - 16, 900);
  if (/^image\//.test(it.type)) { const im = document.createElement("img"); im.src = URL.createObjectURL(it.blob); body.appendChild(im); return; }
  try {
    const L = await pdfjs(); const pdf = await L.getDocument({ data: await it.blob.arrayBuffer() }).promise;
    for (let n = 1; n <= Math.min(pdf.numPages, 10); n++) { const c = document.createElement("canvas"); body.appendChild(c); await renderPagina(pdf, n, c, W); }
    if (pdf.numPages > 10) body.insertAdjacentHTML("beforeend", `<p>… altre ${pdf.numPages - 10} pagine</p>`);
  } catch (e) { body.innerHTML = "<p>Anteprima non disponibile: " + e.message + "</p>"; }
}

// ---------- Microsoft login ----------
const msal = new window.msal.PublicClientApplication({
  auth: { clientId: C.clientId, authority: C.authority, redirectUri: location.origin + location.pathname.replace(/index\.html$/, "") },
  cache: { cacheLocation: "localStorage" }
});
let account = null;
function setAcct() { $("#acct").textContent = account ? account.username.split("@")[0] : "Accedi"; }
async function initAuth() {
  await msal.initialize();
  const r = await msal.handleRedirectPromise().catch(e => { log("Accesso: " + e.message); return null; });
  account = (r && r.account) || msal.getAllAccounts()[0] || null;
  setAcct();
}
async function token() {
  if (!account) { await msal.loginRedirect({ scopes: SCOPES, prompt: "select_account" }); throw new Error("redirect"); }
  try { return (await msal.acquireTokenSilent({ scopes: SCOPES, account })).accessToken; }
  catch (e) { await msal.acquireTokenRedirect({ scopes: SCOPES, account }); throw new Error("redirect"); }
}
$("#acct").onclick = async () => {
  if (C.clientId.startsWith("INSERIRE")) return alertLog("App non ancora configurata (manca il Client ID).");
  if (!account) return msal.loginRedirect({ scopes: SCOPES, prompt: "select_account" });
  if (confirm("Disconnettere " + account.username + "?")) { await msal.logoutRedirect({ account }); }
};

// ---------- Graph ----------
const G = "https://graph.microsoft.com/v1.0";
async function gfetch(path, opt = {}, tk) {
  const r = await fetch(G + path, { ...opt, headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json", ...(opt.headers || {}) } });
  if (!r.ok && r.status !== 404) throw new Error(`Graph ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}
const enc = p => p.split("/").map(encodeURIComponent).join("/");
let docsId = null; const folderCache = {};
async function ensureFolder(rel, tk) {
  if (folderCache[rel]) return folderCache[rel];
  if (!docsId) {
    const d = await (await gfetch("/me/drive/special/documents", {}, tk)).json(); docsId = d.id;
  }
  let parent = docsId, cur = "";
  for (const seg of rel.split("/")) {
    cur = cur ? cur + "/" + seg : seg;
    if (folderCache[cur]) { parent = folderCache[cur].id; continue; }
    let r = await gfetch(`/me/drive/items/${parent}:/${enc(seg)}`, {}, tk);
    let it;
    if (r.status === 404) {
      r = await gfetch(`/me/drive/items/${parent}/children`, { method: "POST", body: JSON.stringify({ name: seg, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }) }, tk);
      it = await r.json();
    } else it = await r.json();
    folderCache[cur] = it; parent = it.id;
  }
  return folderCache[rel];
}
async function upload(it, tk) {
  const folder = await ensureFolder(C.baseFolder + "/" + it.person, tk);
  const cat = C.categories.find(c => c.label === it.cat);
  const chi = cat && cat.conChi ? cleanNote(it.conChi) : "";
  const when = await shotStamp(it);
  const base = `${when}_${it.person}${cat ? "_" + cat.code : ""}${chi ? "_" + chi : ""}`;
  const fname = `${base}.${ext(it)}`;
  const s = await (await gfetch(`/me/drive/items/${folder.id}:/${enc(fname)}:/createUploadSession`,
    { method: "POST", body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }) }, tk)).json();
  const size = it.blob.size, CH = 320 * 1024 * 10;
  let res;
  for (let start = 0; start < size; start += CH) {
    const end = Math.min(start + CH, size);
    res = await fetch(s.uploadUrl, { method: "PUT", headers: { "Content-Range": `bytes ${start}-${end - 1}/${size}` }, body: it.blob.slice(start, end) });
    if (!res.ok) throw new Error(`Upload ${res.status}`);
  }
  const done = await res.json();
  // scheda con i dati inseriti al momento dello scatto (stesso nome, .json)
  const info = { file: done.name, persona: it.person, categoria: it.cat || "", conChi: (cat && cat.conChi) ? (it.conChi || "") : "",
    note: it.note || "", pagamento: it.pag === "Altro" ? ("Altro: " + (it.pagAltro || "")) : (it.pag || ""), dataScatto: when, inviato: new Date().toISOString(), nomeOriginale: it.name || "" };
  const jn = done.name.replace(/\.[^.]+$/, "") + ".json";
  await gfetch(`/me/drive/items/${folder.id}:/${enc(jn)}:/content`, { method: "PUT", body: JSON.stringify(info, null, 2) }, tk);
  return { name: done.name, folderUrl: folder.webUrl };
}

// ---------- Invio ----------
let sending = false;
$("#send").onclick = async () => {
  if (sending) return;
  if (C.clientId.startsWith("INSERIRE")) return alertLog("App non ancora configurata (manca il Client ID).");
  sending = true; $("#send").disabled = true;
  let tk;
  try { tk = await token(); } catch (e) { sending = false; if (e.message !== "redirect") alertLog(e.message); return; }
  const items = (await qAll()).filter(i => i.status !== "ok");
  let ok = 0, ko = 0, lastUrl = "";
  log(`Invio di ${items.length} file…`);
  for (const it of items) {
    it.status = "up"; await qPut(it); await draw();
    try {
      const r = await upload(it, tk); ok++; lastUrl = r.folderUrl;
      log(`✓ ${r.name}`); await qDel(it.id); if (urls.has(it.id)) { URL.revokeObjectURL(urls.get(it.id)); urls.delete(it.id); }
    } catch (e) { ko++; it.status = "err"; await qPut(it); log(`✗ ${it.name}: ${e.message}`); }
    await draw();
  }
  log(`Fatto: ${ok} inviati${ko ? ", " + ko + " in errore (riprova)" : ""}.`);
  if (lastUrl) $("#dest").innerHTML = `<a href="${lastUrl}" target="_blank" rel="noopener">Apri la cartella su OneDrive</a>`;
  sending = false; draw();
};

// ---------- Galleria ----------
$("#pick").onchange = async e => {
  const files = [...e.target.files]; const now = Date.now();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    await qPut({ id: now + "_" + i + "_" + Math.random().toString(36).slice(2, 7), name: f.name, type: f.type, blob: f, added: now, lastModified: f.lastModified || now, person, pag: (() => { try { return localStorage.getItem("pag") || ""; } catch (e) { return ""; } })(), note: "", status: "new" });
  }
  e.target.value = ""; draw();
};

$("#pickpdf").onchange = e => $("#pick").onchange(e);

function log(s) { $("#logcard").classList.remove("hidden"); $("#log").textContent += s + "\n"; }
function alertLog(s) { log(s); }

// ---------- Avvio ----------
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
drawPersons();
(async () => {
  try { await initAuth(); } catch (e) { log("Accesso non disponibile: " + e.message); }
  const n = new URLSearchParams(location.search).get("shared");
  if (n) { history.replaceState(null, "", location.pathname); }
  await draw();
  $("#dest").textContent = "Destinazione: Documenti/" + C.baseFolder + "/<persona>";
})();
