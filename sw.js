const VERSION = "v4";
const SHELL = ["./", "index.html", "app.js", "config.js", "msal-browser.min.js",
  "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open("shell-" + VERSION).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(
    ks.filter(k => k.startsWith("shell-") && k !== "shell-" + VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});

// --- IndexedDB minimal (stesso schema di app.js) ---
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("ricevute", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("queue", { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function addToQueue(files) {
  const d = await db();
  const tx = d.transaction("queue", "readwrite"); const st = tx.objectStore("queue");
  const now = Date.now();
  files.forEach((f, i) => st.put({
    id: now + "_" + i + "_" + Math.random().toString(36).slice(2, 7),
    name: f.name || ("foto_" + i), type: f.type, blob: f, added: now,
    lastModified: f.lastModified || now, person: null, note: "", status: "new"
  }));
  return new Promise(r => tx.oncomplete = r);
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method === "POST" && url.pathname.endsWith("/share")) {
    e.respondWith((async () => {
      const fd = await e.request.formData();
      const files = fd.getAll("files").filter(f => f && f.size);
      await addToQueue(files);
      return Response.redirect("./?shared=" + files.length, 303);
    })());
    return;
  }
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // rete prima (aggiornamenti immediati), cache se offline
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open("shell-" + VERSION).then(c => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
