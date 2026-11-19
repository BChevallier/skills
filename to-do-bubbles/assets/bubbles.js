"use strict";
// Bubbles — app code. The page shell (index.html) only links bubbles.css and this file.
document.body.insertAdjacentHTML("afterbegin", "<canvas id=\"c\"></canvas>\n\n<div id=\"shade\"></div>\n<header>\n  <nav id=\"tabs\"></nav>\n  <span id=\"title\">Bubbles</span>\n  <select id=\"projSel\" hidden></select>\n  <span id=\"doneH\" class=\"hnum\"></span>\n  <div id=\"bar\"><div id=\"barFill\"></div></div>\n  <span id=\"leftH\" class=\"hnum\"></span>\n  <button id=\"addBtn\" title=\"Add a tag\">+</button>\n  <span id=\"ro\" class=\"hnum\" hidden>view only</span><span id=\"sync\"></span>\n</header>\n\n<main>\n  <div id=\"spacer\"></div>\n  <div id=\"sheet\">\n  <div id=\"boxes\"></div>\n  <div id=\"done\"><div class=\"doneTitle\">Done</div><div id=\"doneStats\"></div><details id=\"doneList\"><summary>Completed to-dos</summary><div id=\"doneBody\"></div></details></div>\n  </div>\n</main>\n\n<div id=\"legend\"></div>\n<div id=\"tip\"></div>\n<div id=\"pal\"></div>\n<div id=\"card\"></div>\n<div id=\"veil\"></div>\n<div class=\"dlg\" id=\"finishDlg\"></div>\n<div class=\"dlg\" id=\"editDlg\"></div>\n<div id=\"loading\">Loading\u2026</div>\n<div id=\"fatal\"><div><h2>Bubbles can't start</h2><p id=\"fatalMsg\" style=\"color:#8e96aa\"></p></div></div>\n\n");
/* =====================================================================
   Bubbles — one-file template. Sections:
   1 state + model   2 server sync   3 physics   4 canvas drawing
   5 canvas input    6 list view     7 done + calibration   8 dialogs
   Data format: see SKILL.md. No deadlines anywhere, on purpose.
   ===================================================================== */

// ---------- 1. state + model ----------
const $ = (id) => document.getElementById(id);
const HOLD_MS = 800, LIST_DEFAULT = 5, TOP = 90;
let data = null, version = null, project = null;
// doc = the whole saved document; data = the sheet (tab) on screen, holding its own tags + todos.
let doc = null;
const hidden = new Set();          // "poofed" to-dos, forgotten on reload
const openBoxes = new Set(), openParents = new Set(), showHidden = new Set();
const rnd = new Map();             // random sort keys, new on every load

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const q15 = (h) => Math.max(0.25, Math.round(h * 4) / 4);          // 15-minute steps
const fmt = (h) => dec(Math.round(h * 4) / 4) + " h";           // decimal hours everywhere, e.g. 1.5 h
const dec = (h) => String(Number(h.toFixed(2)));                   // decimal hours, e.g. 3.25
const PALETTE = ["#6ea8fe", "#3f78e0", "#5ad1e6", "#7fd6a0", "#b6e36b", "#f2d45c", "#f2b25c", "#f08a5c", "#f08a8a", "#f27fc0", "#c79bf2", "#9aa3b5"];
function rand(key) {
  if (!rnd.has(key)) { const a = new Uint32Array(1); crypto.getRandomValues(a); rnd.set(key, a[0]); }
  return rnd.get(key);
}
const byId = (id) => data.todos.find((t) => t.id === id);
const tagById = (id) => data.tags.find((t) => t.id === id);
const kids = (t) => data.todos.filter((c) => c.parent === t.id);
const isParent = (t) => kids(t).length > 0;
const est = (t) => isParent(t) ? kids(t).reduce((s, c) => s + est(c), 0) : (t.estimate_h || 0);
const frac = (t) => {
  if (isParent(t)) { const e = est(t); return e ? kids(t).reduce((s, c) => s + est(c) * frac(c), 0) / e : 0; }
  return t.done ? 1 : (t.progress || 0) / 100;
};
const isDone = (t) => isParent(t) ? kids(t).every(isDone) : !!t.done;
function effTags(t) {
  const known = (ids) => (ids || []).filter(tagById);
  if (isParent(t)) { const s = new Set(known(t.tags)); kids(t).forEach((c) => known(c.tags).forEach((x) => s.add(x))); return [...s]; }
  const own = known(t.tags);
  if (own.length || !t.parent) return own;
  const p = byId(t.parent); return p ? known(p.tags) : [];
}
const leaves = () => data.todos.filter((t) => !isParent(t));
const topLevel = () => data.todos.filter((t) => !t.parent || !byId(t.parent));
const pickable = (on) => { const per = totals().per; return data.tags.filter((g) => !per[g.id].closed || on.has(g.id)); };   // tag pickers: finished areas only if already picked

function totals() {
  const per = {}; data.tags.forEach((g) => per[g.id] = { planned: 0, done: 0, open: 0 });
  let untagged = 0, done = 0, worked = 0, left = 0;
  for (const t of leaves()) {
    const e = est(t), f = frac(t), tg = effTags(t);
    done += e * f;
    // header numbers: real hours for finished to-dos, the done share of the estimate for open ones;
    // "left" is every bubble still floating: the open share of to-dos plus each tag's "not planned yet" bubble
    if (t.done) worked += t.actual_h != null ? +t.actual_h : e; else { worked += e * f; left += e * (1 - f); }
    if (!tg.length) untagged += e;
    tg.forEach((id) => { per[id].planned += e / tg.length; per[id].done += e * f / tg.length; if (!t.done) per[id].open++; });
  }
  let total = untagged;
  data.tags.forEach((g) => {
    const p = per[g.id];
    p.closed = !!g.done && !p.open;                      // tag finished by holding its empty box title
    p.total = p.closed ? p.planned : Math.max(g.estimate_h || 0, p.planned);
    p.unplanned = p.closed ? 0 : Math.max(0, (g.estimate_h || 0) - p.planned);
    total += p.total; left += p.unplanned;
  });
  return { per, total, done, remaining: Math.max(0, total - done), worked, left };
}

// ---------- 2. server sync ----------
let saveTimer = null, saving = false, dirty = false, standalone = false, dbRef = null, looping = false;
let dbNs = null, base = null, readOnly = false;   // shared tracker: database, the document as last read, view-only viewer
const TAB = "tab-" + Math.random().toString(36).slice(2, 10), clone = (v) => JSON.parse(JSON.stringify(v)), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const canon = (v) => JSON.stringify(v, (k, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, key) => (o[key] = x[key], o), {}) : x);
function setSync(cls, title) { $("sync").textContent = cls === "err" ? title : ""; }   // only speaks up on errors
async function api(path, opts) {
  const r = await fetch(path, opts);
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
}
async function load() {
  const r = await api("/api/project?p=" + encodeURIComponent(project));
  if (r.status !== 200) throw new Error(r.body.error || "could not load project");
  adopt(r.body.data); version = r.body.version;
  refresh(); if (cardId) drawCard();
}
function changed() {
  if (readOnly) { if (base) adopt(clone(base)); refresh(); if (cardId) drawCard(); return; }   // view only: undo any slip
  commitView(); dirty = true; refresh(); clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); setSync("busy", "Saving…"); }
async function save() {
  if (standalone) {              // no server (e.g. shared demo page): keep changes in this browser only
    try { localStorage.setItem("bubbles:" + project, JSON.stringify(doc)); } catch (e) {}
    dirty = false; setSync("", "Demo mode: changes stay in this browser"); return;
  }
  if (saving) { saveTimer = setTimeout(save, 200); return; }
  saving = true; dirty = false;
  if (dbRef) {                  // published tracker: the whole project is one document in the artifact's database
    try { await saveDb(); setSync("", ""); }
    catch (e) { if (e && e.code === "invalid_argument") goReadOnly(); else setSync("err", "Could not save (" + ((e && e.code) || "error") + ")"); }
    saving = false; return;
  }
  try {
    const r = await api("/api/save?p=" + encodeURIComponent(project), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version, data: doc }),
    });
    if (r.status === 200) { version = r.body.version; setSync("", "Saved"); }
    else if (r.status === 409) { await load(); setSync("err", "File was changed elsewhere — reloaded, last click not saved"); }
    else setSync("err", "Save failed");
  } catch (e) { setSync("err", "Server not reachable"); }
  saving = false;
}
setInterval(async () => {        // pick up edits made to the JSON file by someone else
  if (!project || standalone || dbRef || dirty || saving || document.hidden) return;
  try {
    const r = await api("/api/version?p=" + encodeURIComponent(project));
    if (r.status === 200 && r.body.version !== version && !dirty && !saving) await load();
  } catch (e) {}
}, 3000);

// ---------- 2a. shared trackers: merging saves ----------
// Several people can edit a shared tracker at once, and a database write replaces the whole document.
// So a save never writes blindly: it takes a short lease (two saves never interleave), reads the latest
// document, merges this view's changes into it, and writes the result. Changes to different to-dos, tags,
// sheets or fields all survive; when two people change the same field, the later save wins for that field.
const isList = (a) => Array.isArray(a) && a.every((x) => x && typeof x === "object" && !Array.isArray(x) && "id" in x);
const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
function merge3(b, m, t) {        // b = document as last read, m = this view, t = latest saved
  const same = (x, y) => canon(x) === canon(y);
  if (same(m, b)) return t;
  if (same(t, b)) return m;
  const arrs = [b, m, t].filter((x) => x !== undefined);
  if (arrs.every(Array.isArray) && arrs.every(isList)) return mergeList(b || [], m || [], t || []);
  if (arrs.every(isObj)) {
    const out = {};
    new Set([...Object.keys(b || {}), ...Object.keys(m), ...Object.keys(t)]).forEach((k) => {
      const v = merge3(b && b[k], m[k], t[k]); if (v !== undefined) out[k] = v; });
    return out;
  }
  return m;                       // both changed the same value: the later save (this one) wins
}
function mergeList(b, m, t) {     // lists of items with ids (sheets, tags, to-dos), merged item by item
  const B = new Map(b.map((x) => [x.id, x])), M = new Map(m.map((x) => [x.id, x])), T = new Map(t.map((x) => [x.id, x]));
  const item = (id) => {          // the merged item, or undefined when it was deleted on one side and untouched on the other
    const b0 = B.get(id), m0 = M.get(id), t0 = T.get(id);
    if (m0 && t0) return merge3(b0, m0, t0);
    const one = m0 || t0; return b0 && canon(one) === canon(b0) ? undefined : one;   // deleted but changed elsewhere: keep
  };
  const moved = (x) => {          // did this side change the order of the items it kept? (adding or deleting doesn't count)
    const X = new Set(x.map((y) => y.id)), keptB = b.filter((y) => X.has(y.id)).map((y) => y.id);
    return x.filter((y) => B.has(y.id)).map((y) => y.id).join("\n") !== keptB.join("\n"); };
  const [P, Q] = moved(m) && !moved(t) ? [m, t] : [t, m];                      // whoever reordered sets the order (them, if both did)
  const out = [], has = (id) => out.some((o) => o.id === id);
  P.forEach((x) => { const v = item(x.id); if (v !== undefined) out.push(v); });
  Q.forEach((x, i) => {
    if (has(x.id)) return; const v = item(x.id); if (v === undefined) return;
    const prev = Q.slice(0, i).reverse().find((y) => has(y.id));
    out.splice(prev ? out.findIndex((o) => o.id === prev.id) + 1 : 0, 0, v);   // keep it next to its neighbour
  });
  return out;
}
async function saveDb() {
  const lock = dbNs.doc("tracker/lock");
  for (let i = 0; i < 25; i++) {  // wait up to about 5 s for another person's save to finish
    let r; try { r = await lock.acquire({ holder: TAB, ttlMs: 2000 }); } catch (e) { break; }
    if (r && r.acquired) break; await sleep(200);
  }
  const mine = clone(doc), snap = await dbRef.get();
  const theirs = snap.exists ? normalize(clone(snap.data())) : clone(base || mine);
  const merged = base && canon(theirs) !== canon(base) ? merge3(base, mine, theirs) : mine;
  await dbRef.set(clone(merged));
  base = clone(merged);
  const next = dirty ? merge3(mine, clone(doc), merged) : merged;               // keep edits made while saving
  if (canon(next) !== canon(doc)) { adopt(clone(next)); refresh(); if (cardId) drawCard(); }
}
function goReadOnly() {           // a viewer who may not change the tracker: same view, no editing
  if (readOnly) return; readOnly = true;
  document.body.classList.add("ro"); closeCard(); hideDlgs(); $("pal").style.display = "none";
  $("title").title = ""; $("ro").hidden = false;
  if (base) adopt(clone(base)); refresh();
}

function refresh() {
  if (!titleEditing) $("title").textContent = doc.name || project;
  document.title = (doc.name || project) + " · Bubbles";
  renderTabs();
  const t = totals(), pct = t.worked + t.left ? Math.round(100 * t.worked / (t.worked + t.left)) : 0;
  $("barFill").style.width = pct + "%";
  const half = (h) => String(Math.round(h * 2) / 2);          // header: half-hour precision is plenty
  $("doneH").textContent = half(t.worked) + " h worked"; $("leftH").textContent = half(t.left) + " h left";
  rebuildBodies(t); renderBoxes(t); renderDone(); renderLegend(t); placeShade();
}

// ---------- 2b. sheets (tabs) ----------
// Document format: { name, sheets: [{ id, name, color, tags, todos }] }. Each sheet is one project.
// Old one-sheet documents ({ name, tags, todos }) still load: they become one sheet "Main" on the next save.
// Click a tab to show that sheet; shift-click to show several at once (one merged bubble view).
// Which sheets are shown is remembered per browser only, so two viewers never flip each other's view.
// Each sheet has a colour family (its `color` is the base); in a merged view its tags take shades of that family,
// so projects stay apart at a glance. Tag and to-do ids are unique across the whole document.
const HUES = [215, 188, 150, 88, 48, 24, 356, 322, 272], FAMILIES = HUES.map((h) => hsl(h, 85, 68));   // base of each family
function hsl(h, s, l) {
  s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, "0");
  return "#" + f(0) + f(8) + f(4);
}
function hueOf(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (!d) return 0; const h = mx === r ? (g - b) / d % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360;
}
const SHADES = [[0, 85, 68], [12, 80, 78], [-12, 75, 58], [6, 60, 85], [-6, 90, 50], [18, 70, 66], [-18, 70, 74], [0, 30, 66]];
const familyOf = (base) => { const i = FAMILIES.indexOf(base), h = i >= 0 ? HUES[i] : hueOf(base);   // exact hue for the 9 bases, no rounding drift
  return SHADES.map(([dh, s, l]) => hsl((h + dh + 360) % 360, s, l)); };
const sheetOf = (x) => owner.get(x) || data;                     // the sheet a tag or to-do belongs to
const nextShade = (s, skip) => { const fam = familyOf(s.color), used = s.tags.filter((g) => g !== skip).map((g) => g.color);
  return fam.find((c) => !used.includes(c)) || fam[s.tags.length % fam.length]; };
// One sheet open: tags get clearly different hues (optional per-tag `solo`, else the next free one).
// Several sheets open: tags fall back to their sheet's family shade (`color`), so projects stay apart.
const SOLO = [215, 48, 356, 150, 272, 24, 188, 88, 322].map((h) => hsl(h, 85, 68)).concat([235, 68, 10, 170, 292, 40, 200, 110, 340].map((h) => hsl(h, 65, 82)));   // far-apart hues first
function soloColor(g) {
  const s = sheetOf(g), used = new Set(s.tags.filter((x) => x.solo).map((x) => x.solo)); let res = null;
  for (const x of s.tags) { if (x.solo) { if (x === g) return x.solo; continue; }
    const c = SOLO.find((k) => !used.has(k)) || SOLO[s.tags.indexOf(x) % SOLO.length]; used.add(c); if (x === g) { res = c; break; } }
  return res || g.color;
}
const tc = (g) => data && data.multi ? g.color : soloColor(g);    // the colour a tag shows in the current view

const owner = new WeakMap();
let rowDrag = null, justRowDragged = false;   // list rows: drag one onto another to nest it
let shown = [], primary = null, viewPos = new Map(), renaming = null, tagRenaming = null, titleEditing = false, tabDrag = false, justDragged = false;
// Sheets are never deleted, only archived: they stay in the document but are never shown again.
// There is deliberately no way to restore one from the page.
const live = () => doc.sheets.filter((s) => !s.archived);
function normalize(d) {
  if (!Array.isArray(d.sheets) || !d.sheets.length) d.sheets = [{ id: "s1", name: "Main", tags: d.tags || [], todos: d.todos || [] }];
  delete d.tags; delete d.todos;
  const tagIds = new Set(), todoIds = new Set(), uniq = (seen, id, s) => { let n = id, i = 2; while (seen.has(n)) n = id + "-" + s.id + (i++ > 2 ? i : ""); seen.add(n); return n; };
  d.sheets.forEach((s, i) => {
    s.id = s.id || "s" + (i + 1); s.name = s.name || "Sheet " + (i + 1); s.tags = s.tags || []; s.todos = s.todos || [];
    if (!s.color) s.color = FAMILIES.find((c) => !d.sheets.some((o) => o.color === c)) || FAMILIES[i % FAMILIES.length];
    s.tags.forEach((g) => { const n = uniq(tagIds, g.id, s); if (n !== g.id) { s.todos.forEach((t) => t.tags = (t.tags || []).map((x) => x === g.id ? n : x)); g.id = n; } });
    s.tags.forEach((g) => { if (!g.color) g.color = nextShade(s, g); });   // tag without colour: next free shade of the sheet
    s.todos.forEach((t) => { const n = uniq(todoIds, t.id, s); if (n !== t.id) { s.todos.forEach((c) => { if (c.parent === t.id) c.parent = n; }); t.id = n; } });
  });
  return d;
}
const viewKey = () => "bubbles-view:" + project;
function adopt(d) {
  doc = normalize(d);
  if (!shown.length) try { const v = JSON.parse(localStorage.getItem(viewKey()) || "{}"); shown = v.shown || []; primary = v.primary; } catch (e) {}
  buildView();
}
function buildView() {
  if (!live().length) doc.sheets.push({ id: "s" + Math.random().toString(36).slice(2, 8), name: "Main", tags: [], todos: [], color: FAMILIES[0] });
  let ss = live().filter((s) => shown.includes(s.id)); if (!ss.length) ss = [live()[0]];
  shown = ss.map((s) => s.id); if (!shown.includes(primary)) primary = shown[0];
  ss.forEach((s) => { s.tags.forEach((g) => owner.set(g, s)); s.todos.forEach((t) => owner.set(t, s)); });
  data = ss.length === 1 ? ss[0] : { id: "view", multi: true, sheets: ss, tags: ss.flatMap((s) => s.tags), todos: ss.flatMap((s) => s.todos),
    done_counter: Math.max(0, ...ss.map((s) => s.done_counter || 0)) };
}
function commitView() {          // merged view: hand new, changed and deleted tags/to-dos back to their own sheets
  if (!data || !data.multi) return;
  const prim = doc.sheets.find((s) => s.id === primary) || data.sheets[0];
  data.tags.forEach((g) => { if (!owner.has(g)) owner.set(g, prim); });
  data.todos.forEach((t) => { if (owner.has(t)) return;
    const p = t.parent && data.todos.find((x) => x.id === t.parent), g = (t.tags || []).map(tagById).find(Boolean);
    owner.set(t, (p && owner.get(p)) || (g && owner.get(g)) || prim); });
  data.sheets.forEach((s) => { s.tags = data.tags.filter((g) => owner.get(g) === s); s.todos = data.todos.filter((t) => owner.get(t) === s); s.done_counter = data.done_counter; });
}
function showSheets(ids, prim) {
  const key = shown.slice().sort().join(","); viewPos.set(key, new Map(pos));         // each view keeps its own bubble layout
  shown = ids; primary = prim; buildView();
  pos.clear(); packs.clear(); (viewPos.get(shown.slice().sort().join(",")) || new Map()).forEach((v, k) => pos.set(k, v));
  try { localStorage.setItem(viewKey(), JSON.stringify({ shown, primary })); } catch (e) {}
  closeCard(); bodies = []; refresh(); wake(1);
}
function sheetLeft(s) { const keep = data; data = s; const t = totals(); data = keep; return t.left; }   // same rule as the header
function renderTabs() {
  const nav = $("tabs"); if (!nav || renaming || tabDrag) return;
  const half = (h) => String(Math.round(h * 2) / 2), one = shown.length === 1;
  nav.innerHTML = live().map((s) => { const on = shown.includes(s.id);
    return `<span class="tab${on ? " on" : ""}" data-id="${esc(s.id)}" style="--c:${esc(s.color)}" title="${readOnly ? "" : (on ? "Double-click to rename, drag to reorder" : "Click to open, shift-click to show alongside, drag to reorder")}">`
    + `<span class="tdot" data-act="color" title="Change this project's colours"></span>`
    + `<span class="tname">${esc(s.name)}</span><span class="tleft">${half(sheetLeft(s))} h</span>`
    + (on && one && live().length > 1 ? `<span class="tdel" title="Hold to archive this sheet"><i></i>×</span>` : `<span class="tdel off"><i></i>×</span>`)   // the cross always keeps its space, so tabs never shift
    + `</span>`; }).join("")
    + `<button class="tadd ghost" title="Add a sheet">+</button>`;
  nav.querySelectorAll(".tab").forEach((el) => {
    const id = el.dataset.id, s = doc.sheets.find((x) => x.id === id);
    el.onclick = (e) => {
      if (justDragged || e.target.closest(".tdel")) return;
      if (e.target.closest(".tdot")) { openSheetPalette(s, e.target); return; }
      if (e.shiftKey) {
        if (!shown.includes(id)) showSheets([...shown, id], id);
        else if (shown.length > 1) { const rest = shown.filter((x) => x !== id); showSheets(rest, primary === id ? rest[0] : primary); }
      } else if (!(one && shown[0] === id)) showSheets([id], id);
    };
    el.onmousedown = (e) => { if (!e.target.closest(".tinput")) e.preventDefault(); };   // a press on a tab never starts a text selection (drags, shift-clicks)
    el.onpointerdown = (e) => startTabDrag(e, el, s, nav);
    el.ondblclick = (e) => { if (!readOnly && shown.includes(id) && !e.target.closest(".tdel,.tdot")) startRename(el, s); };
  });
  nav.querySelector(".tadd").onclick = () => { if (readOnly) return;
    const s = { id: "s" + Math.random().toString(36).slice(2, 8), name: "New sheet", tags: [], todos: [],
      color: FAMILIES.find((c) => !live().some((o) => o.color === c)) || FAMILIES[live().length % FAMILIES.length] };
    commitView(); doc.sheets.push(s); showSheets([s.id], s.id); changed();
    startRename(nav.querySelector(`.tab[data-id="${s.id}"]`), s);
  };
  const del = readOnly ? null : nav.querySelector(".tdel:not(.off)");                 // hold 0.8 s, like finishing a to-do: archives the sheet
  if (del) {
    let timer = null; const stop = () => { clearTimeout(timer); del.classList.remove("holding"); };
    del.onpointerdown = (e) => { e.stopPropagation(); del.classList.add("holding");
      timer = setTimeout(() => { stop(); const L = live(), i = L.indexOf(data), next = L[i - 1] || L[i + 1];
        data.archived = true; data.archived_at = today(); showSheets([next.id], next.id); changed(); }, HOLD_MS); };
    del.onpointerup = del.onpointerleave = stop;
  }
}
// Drag a tab sideways to reorder the sheets. The order is simply the order of doc.sheets.
function startTabDrag(e, el, s, nav) {
  if (readOnly || e.button !== 0 || e.shiftKey || e.target.closest(".tdel,.tdot,.tinput")) return;
  const x0 = e.clientX, others = [...nav.querySelectorAll(".tab")].filter((t) => t !== el);
  const mids = others.map((t) => { const r = t.getBoundingClientRect(); return r.left + r.width / 2; });
  let moved = false, idx = 0;
  const mark = () => others.forEach((t, i) => {
    t.classList.toggle("dropBefore", moved && i === idx);
    t.classList.toggle("dropAfter", moved && idx === others.length && i === others.length - 1); });
  const move = (ev) => {          // listened for on the window: a fast drag leaves the tab at once
    const dx = ev.clientX - x0;
    if (!moved) { if (Math.abs(dx) < 6) return; moved = tabDrag = true; el.classList.add("dragging"); document.body.classList.add("noselect"); getSelection().removeAllRanges(); }
    el.style.transform = `translateX(${dx}px)`;
    idx = mids.filter((m) => m < ev.clientX).length; mark();
  };
  const up = (ev) => {
    removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
    if (!moved) return;
    tabDrag = false; justDragged = true; setTimeout(() => { justDragged = false; }, 0);   // the click that follows a drag does nothing
    el.classList.remove("dragging"); document.body.classList.remove("noselect"); el.style.transform = ""; moved = false; mark();
    if (ev.type === "pointercancel") return refresh();
    const L = live().filter((x) => x !== s), before = L[idx];
    if (live().indexOf(s) === idx) return refresh();                                  // dropped where it was
    commitView(); doc.sheets.splice(doc.sheets.indexOf(s), 1);
    doc.sheets.splice(before ? doc.sheets.indexOf(before) : doc.sheets.length, 0, s);
    changed();
  };
  addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
}
function openSheetPalette(s, dotEl) {    // the dot beside a tab name: pick the project's colour family
  if (readOnly) return;
  const pal = $("pal"), r = dotEl.getBoundingClientRect();
  const taken = (c) => live().some((o) => o !== s && o.color === c);
  pal.innerHTML = FAMILIES.map((c) => `<span data-c="${c}" class="${c === s.color ? "on" : ""}${taken(c) ? " taken" : ""}" title="${taken(c) ? "Used by " + esc(live().find((o) => o !== s && o.color === c).name) : ""}" style="background:${c}"></span>`).join("");
  pal.style.display = "grid"; pal.style.left = Math.min(innerWidth - 200, r.left) + "px"; pal.style.top = (r.bottom + 8) + "px";
  pal.onclick = (e) => { const c = e.target.dataset.c; if (!c || taken(c)) return;
    commitView(); const fam = familyOf(c); s.color = c; s.tags.forEach((g, i) => g.color = fam[i % fam.length]);   // re-shade every tag of the project
    pal.style.display = "none"; changed(); };
}
function startRename(el, s) {
  if (readOnly) return;
  if (!el) return; renaming = s.id;
  const name = el.querySelector(".tname"), inp = document.createElement("input");
  inp.className = "tinput"; inp.value = s.name; inp.size = Math.max(6, s.name.length + 1);
  name.replaceWith(inp); inp.focus(); inp.select();
  const done = (keep) => { if (!renaming) return; renaming = null;
    const v = inp.value.trim(); if (keep && v && v !== s.name) { s.name = v; changed(); } else refresh(); };
  inp.oninput = () => { inp.size = Math.max(6, inp.value.length + 1); };
  inp.onkeydown = (e) => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); };
  inp.onblur = () => done(true);
}
function startTitleRename() {       // double-click the tracker name to rename the whole tracker
  if (readOnly) return;
  const el = $("title"); if (titleEditing || !doc) return; titleEditing = true;
  const cur = doc.name || "", inp = document.createElement("input");
  inp.className = "tinput titleInput"; inp.value = cur; inp.size = Math.max(6, cur.length + 1);
  el.textContent = ""; el.appendChild(inp); inp.focus(); inp.select();
  const done = (keep) => { if (!titleEditing) return; titleEditing = false;
    const v = inp.value.trim(); if (keep && v && v !== cur) { doc.name = v; changed(); } else refresh(); };
  inp.oninput = () => { inp.size = Math.max(6, inp.value.length + 1); };
  inp.onkeydown = (e) => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); };
  inp.onblur = () => done(true);
}
function startTagRename(tagId) {   // double-click a tag's name in its box to rename the tag
  const g = tagById(tagId), el = document.querySelector(`.box[data-box="${CSS.escape(tagId)}"] .bname`);
  if (readOnly || !g || !el || tagRenaming) return; tagRenaming = tagId;
  const inp = document.createElement("input");
  inp.className = "tinput tagInput"; inp.value = g.name; inp.size = Math.max(6, g.name.length + 1);
  el.replaceWith(inp); inp.focus(); inp.select();
  const done = (keep) => { if (!tagRenaming) return; tagRenaming = null;
    const v = inp.value.trim(); if (keep && v && v !== g.name) { g.name = v; changed(); } else refresh(); };
  inp.oninput = () => { inp.size = Math.max(6, inp.value.length + 1); };
  inp.onkeydown = (e) => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); };
  inp.onblur = () => done(true);
  inp.onclick = inp.onpointerdown = (e) => e.stopPropagation();       // clicks in the field don't fold the box or start a hold
}
$("title").title = "Double-click to rename";
$("title").ondblclick = startTitleRename;

// Favicon: three bubbles. Lives here (not in index.html) so every tracker gets it with bubbles.js.
(() => { const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill-opacity=".28" stroke-width="4">'
  + '<circle cx="24" cy="38" r="19" fill="#68a2f3" stroke="#68a2f3"/><circle cx="46" cy="19" r="13" fill="#68f3ad" stroke="#68f3ad"/>'
  + '<circle cx="50" cy="49" r="9" fill="#f368c0" stroke="#f368c0"/></svg>';
  document.querySelectorAll("link[rel~=icon]").forEach((l) => l.remove());
  const l = document.createElement("link"); l.rel = "icon"; l.type = "image/svg+xml";
  l.href = "data:image/svg+xml," + encodeURIComponent(svg); document.head.appendChild(l); })();

// ---------- 3. physics ----------
const cv = $("c"), ctx = cv.getContext("2d");
let W = 0, H = 0, DPR = 1, bodies = [], heat = 0, drag = null, scale = 40;
let zoom = 1, zx = 0, zy = 0, zoomPress = null;   // view zoom: screen = world * zoom + (zx, zy)
const toWorld = (e) => ({ x: (e.clientX - zx) / zoom, y: (e.clientY - zy) / zoom });
const pos = new Map();   // remembered positions by body id
const packs = new Map(); // child layouts inside parents

function resize() {
  DPR = window.devicePixelRatio || 1; W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR; wake();
}
function wake(h) { heat = Math.max(heat, h || 1); }   // heat cools down, so the layout always comes to rest

function packChildren(list) {         // pack child circles tightly, then find a small circle around them
  const key = list.map((c) => c.id + ":" + c.r.toFixed(1)).join("|");
  if (packs.has(key)) return packs.get(key);
  const GAPC = 4, placed = [];
  const free = (x, y, r) => placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + GAPC - 0.01);
  [...list].sort((a, b) => b.r - a.r).forEach((c) => {
    let best = null;
    if (!placed.length) best = { x: 0, y: 0 };
    else if (placed.length === 1) best = { x: placed[0].r + c.r + GAPC, y: 0 };
    else for (let a = 0; a < placed.length; a++) for (let b = a + 1; b < placed.length; b++) {   // spots touching two placed circles
      const A = placed[a], B = placed[b], ra = A.r + c.r + GAPC, rb = B.r + c.r + GAPC, dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
      if (d > ra + rb || d < Math.abs(ra - rb) || !d) continue;
      const k = (ra * ra - rb * rb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, ra * ra - k * k));
      for (const sg of [1, -1]) {
        const x = A.x + k * dx / d - sg * h * dy / d, y = A.y + k * dy / d + sg * h * dx / d;
        if (free(x, y, c.r) && (!best || Math.hypot(x, y) + c.r < Math.hypot(best.x, best.y) + c.r)) best = { x, y };
      }
    }
    if (!best) best = { x: Math.max(...placed.map((p) => p.x + p.r)) + c.r + GAPC, y: 0 };
    placed.push({ id: c.id, x: best.x, y: best.y, r: c.r });
  });
  let cx = 0, cy = 0;                                    // approximate smallest enclosing circle
  for (let it = 1; it <= 300; it++) {
    let far = placed[0], fd = -1;
    for (const p of placed) { const d = Math.hypot(p.x - cx, p.y - cy) + p.r; if (d > fd) { fd = d; far = p; } }
    cx += (far.x - cx) / (it + 1); cy += (far.y - cy) / (it + 1);
  }
  placed.forEach((p) => { p.x -= cx; p.y -= cy; });
  const out = { R: Math.max(...placed.map((p) => Math.hypot(p.x, p.y) + p.r)) + 6, at: new Map(placed.map((p) => [p.id, p])) };
  packs.set(key, out); return out;
}

function rebuildBodies(t) {
  const sum = Math.max(1, t.remaining + 0.0001);
  scale = Math.min(58, Math.max(20, Math.sqrt(0.2 * W * (H - TOP) / (Math.PI * Math.max(sum, 6)))));
  const rad = (h) => Math.max(9, scale * Math.sqrt(Math.max(h, 0.25)));
  const next = [];
  const anchors = {};
  data.tags.forEach((g, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / data.tags.length;
    anchors[g.id] = { x: W / 2 + Math.cos(a) * W * 0.27, y: (H + TOP) / 2 + Math.sin(a) * (H - TOP) * 0.27 };
  });
  const spawn = (id, tags) => {
    if (pos.has(id)) return pos.get(id);
    let x = W / 2, y = (H + TOP) / 2;
    const mates = bodies.filter((b) => b.tags.some((g) => tags.includes(g)));
    if (mates.length) { x = mates.reduce((s, b) => s + b.x, 0) / mates.length; y = mates.reduce((s, b) => s + b.y, 0) / mates.length; }
    else if (tags.length) { x = tags.reduce((s, g) => s + anchors[g].x, 0) / tags.length; y = tags.reduce((s, g) => s + anchors[g].y, 0) / tags.length; }
    const p = { x: x + (Math.random() - .5) * 40, y: y + (Math.random() - .5) * 40 }; pos.set(id, p); return p;
  };
  for (const todo of topLevel()) {
    if (isDone(todo) || hidden.has(todo.id)) continue;
    const tags = effTags(todo), b = { id: todo.id, kind: "todo", tags, vx: 0, vy: 0 };
    if (isParent(todo)) {
      b.kind = "parent";
      const cs = kids(todo).filter((c) => !c.done && !hidden.has(c.id)).map((c) => ({ id: c.id, r: rad(est(c)) }));
      if (!cs.length) continue;
      const pk = packChildren(cs); b.r = pk.R; b.children = cs.map((c) => ({ id: c.id, r: c.r, ox: pk.at.get(c.id).x, oy: pk.at.get(c.id).y }));
    } else b.r = rad(est(todo));
    Object.assign(b, spawn(b.id, tags)); next.push(b);
  }
  data.tags.forEach((g) => {
    const u = t.per[g.id].unplanned;
    if (u < 0.25) return;
    const b = { id: "~" + g.id, kind: "unplanned", tags: [g.id], hours: u, r: rad(u), vx: 0, vy: 0 };
    Object.assign(b, spawn(b.id, b.tags)); next.push(b);
  });
  next.forEach((b) => { b.m = b.r * b.r / 900; });
  wake(bodies.length ? 0.4 : 1); bodies = next;
}

function step() {
  const cx = W / 2, cy = (H + TOP) / 2, n = bodies.length;
  const G = 9, AMAX = 0.5, GAP = 34, K = 0.02, A_STICK = 0.012, V_STICK = 0.04;
  for (const b of bodies) {
    b.ax = (cx - b.x) * 0.00035; b.ay = (cy - b.y) * 0.0007;
    // no hard walls: a bubble outside the view is only pulled back gently (and never while you hold it)
    const ox = Math.max(0, b.r + 4 - b.x) - Math.max(0, b.x - (W - b.r - 4)), oy = Math.max(0, TOP + b.r - b.y) - Math.max(0, b.y - (H - b.r - 4));
    b.ax += ox * 0.01; b.ay += oy * 0.01;
  }
  const cool = Math.min(1, heat * 1.5);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = bodies[i], b = bodies[j];
    if (drag && drag.ghost && (a === drag.body || b === drag.body)) continue;
    let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
    const nx = dx / d, ny = dy / d, touch = a.r + b.r;
    if (a.tags.some((g) => b.tags.includes(g))) {            // same tag: attract, bigger pulls harder
      if (d > touch + 3) {
        const near = Math.min(1, (d - touch) / 40);            // fade out at contact: no jitter
        const fa = Math.min(AMAX, G * b.m / d) * near, fb = Math.min(AMAX, G * a.m / d) * near;
        a.ax += nx * fa; a.ay += ny * fa; b.ax -= nx * fb; b.ay -= ny * fb;
      }
    } else {                                                  // different tags: keep a gap
      const over = touch + GAP - d;
      if (over > 0) {
        const f = K * over, wa = b.m / (a.m + b.m), wb = 1 - wa;
        a.ax -= nx * f * wa * 2; a.ay -= ny * f * wa * 2; b.ax += nx * f * wb * 2; b.ay += ny * f * wb * 2;
      }
    }
  }
  let moved = 0;
  for (const b of bodies) {
    b.px = b.x; b.py = b.y;
    if (drag && drag.body === b) { b.vx = b.vy = 0; continue; }
    const amag = Math.hypot(b.ax, b.ay), v = Math.hypot(b.vx, b.vy);
    if (v < V_STICK && amag < A_STICK) { b.vx = b.vy = 0; }    // stick: weak pulls can't move a resting bubble
    else { b.vx = (b.vx + b.ax * cool) * 0.82; b.vy = (b.vy + b.ay * cool) * 0.82; }
    b.x += b.vx; b.y += b.vy;
  }
  for (let it = 0; it < 4; it++) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = bodies[i], b = bodies[j];
    if (drag && drag.ghost && (a === drag.body || b === drag.body)) continue;
    let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
    const over = a.r + b.r + 3 - d;
    if (over <= 0) continue;
    const nx = dx / d, ny = dy / d;
    let wa = b.m / (a.m + b.m), wb = 1 - wa;
    if (drag && drag.body === a) { wa = 0; wb = 1; } else if (drag && drag.body === b) { wa = 1; wb = 0; }
    a.x -= nx * over * wa; a.y -= ny * over * wa; b.x += nx * over * wb; b.y += ny * over * wb;
  }
  for (const b of bodies) {
    moved = Math.max(moved, Math.hypot(b.x - b.px, b.y - b.py));
    pos.set(b.id, { x: b.x, y: b.y });
  }
  heat = drag ? Math.max(heat, 0.5) : heat * 0.994;   // slow cooling: ~10 s to settle
  if (heat < 0.03) { heat = 0; bodies.forEach((b) => { b.vx = b.vy = 0; }); }
}

// ---------- 4. canvas drawing ----------
const pops = [];
let hover = null, holdInfo = null;   // holdInfo = {id, x, y, r, t0}
const colorOf = (id) => { const g = tagById(id); return g ? tc(g) : "#8e96aa"; };

function wrap(text, maxW, maxLines) {
  const words = text.split(/\s+/), lines = []; let cur = "";
  for (const w of words) {
    const tryL = cur ? cur + " " + w : w;
    if (ctx.measureText(tryL).width <= maxW || !cur) cur = tryL; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, "…"); }
  return lines.map((l) => { while (ctx.measureText(l).width > maxW && l.length > 2) l = l.slice(0, -2) + "…"; return l; });
}
function tagAngles(x, y, selfId, tags) {   // direction from this bubble to the rest of each tag's cluster
  return tags.map((g, i) => {
    let sx = 0, sy = 0, n = 0;
    for (const b of bodies) if (b.id !== selfId && b.tags.length === 1 && b.tags[0] === g) { sx += b.x * b.m; sy += b.y * b.m; n += b.m; }
    return n ? Math.atan2(sy / n - y, sx / n - x) : i * 2 * Math.PI / tags.length;
  });
}
function drawTodo(todo, x, y, r, tags, selfId) {   // neon style: dark inside, glowing rim, progress arc
  const cols = tags.length ? tags.map(colorOf) : ["#8e96aa"], multi = cols.length > 1, c = multi ? "#e8ebf1" : cols[0], T0 = -Math.PI / 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = "#14161a"; ctx.fill();
  const TAU = 2 * Math.PI, p = frac(todo), pr = r - 7;
  let segs = [{ from: T0, to: T0 + TAU, col: c }];
  if (!multi) { ctx.shadowColor = c; ctx.shadowBlur = 14; ctx.lineWidth = 2; ctx.strokeStyle = c; ctx.stroke(); ctx.stroke(); ctx.shadowBlur = 0; }
  else {                                            // one ring, one segment per tag, each turned toward its own cluster
    const ang = tagAngles(x, y, selfId, tags);
    const order = ang.map((a, i) => ({ a: ((a % TAU) + TAU) % TAU, col: cols[i] })).sort((p1, q1) => p1.a - q1.a), n = order.length;
    const mids = order.map((o, k) => { const nx = order[(k + 1) % n].a + (k + 1 === n ? TAU : 0); return o.a + (nx - o.a) / 2; });
    segs = order.map((o, k) => ({ from: k ? mids[k - 1] : mids[n - 1] - TAU, to: mids[k], col: o.col }));
    ctx.lineWidth = 2.5; ctx.lineCap = "round";
    segs.forEach((g) => {
      if (g.to - 0.07 <= g.from + 0.07) return;
      ctx.beginPath(); ctx.arc(x, y, r, g.from + 0.07, g.to - 0.07); ctx.shadowColor = g.col; ctx.shadowBlur = 14; ctx.strokeStyle = g.col; ctx.stroke(); ctx.stroke();
    });
    ctx.shadowBlur = 0; ctx.lineCap = "butt";
  }
  if (p > 0 && pr > 2) {                           // progress arc inside the rim, in the colour of the rim segment beside it
    const a0 = T0, a1 = T0 + p * TAU; ctx.lineWidth = 3; ctx.shadowBlur = 6;
    for (const g of segs) for (const sh of [-TAU, 0, TAU]) {
      const f = Math.max(a0, g.from + sh), e = Math.min(a1, g.to + sh);
      if (e <= f) continue;
      ctx.beginPath(); ctx.arc(x, y, pr, f, e); ctx.shadowColor = g.col; ctx.strokeStyle = g.col; ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  if (hover === todo.id) { ctx.beginPath(); ctx.arc(x, y, r + 4, 0, 7); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.stroke(); }
  if (r >= 30) {
    ctx.fillStyle = c; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const fs = r > 50 ? 13 : 11; ctx.font = "600 " + fs + "px -apple-system, Segoe UI, sans-serif";
    const lines = wrap(todo.title, r * 1.45, r > 46 ? 3 : 2), lh = fs + 2;
    const showH = r > 40, total = lines.length * lh + (showH ? lh : 0);
    lines.forEach((l, i) => ctx.fillText(l, x, y - total / 2 + lh / 2 + i * lh));
    if (showH) { ctx.font = (fs - 1) + "px -apple-system, Segoe UI, sans-serif"; ctx.globalAlpha = .65; ctx.fillText(fmt(est(todo)), x, y - total / 2 + lh / 2 + lines.length * lh); ctx.globalAlpha = 1; }
  }
}
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  ctx.setTransform(DPR * zoom, 0, 0, DPR * zoom, DPR * zx, DPR * zy);
  for (const b of bodies) {
    if (b.kind === "unplanned") {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fillStyle = colorOf(b.tags[0]); ctx.globalAlpha = .1; ctx.fill();
      ctx.globalAlpha = .45; ctx.setLineDash([4, 5]); ctx.lineWidth = 1.5; ctx.strokeStyle = colorOf(b.tags[0]); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    } else if (b.kind === "parent") {
      const todo = byId(b.id); if (!todo) continue;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fillStyle = "rgba(255,255,255,.035)"; ctx.fill();
      ctx.lineWidth = hover === b.id ? 2 : 1.2; ctx.globalAlpha = hover === b.id ? .9 : .5; ctx.shadowColor = colorOf(b.tags[0]); ctx.shadowBlur = 12;
      ctx.strokeStyle = hover === b.id ? "#fff" : colorOf(b.tags[0]); ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      for (const c of b.children) { if (childDrag && childDrag.id === c.id) continue; const ct = byId(c.id); if (ct) drawTodo(ct, b.x + c.ox, b.y + c.oy, c.r, effTags(ct), b.id); }
    } else { const todo = byId(b.id); if (todo) drawTodo(todo, b.x, b.y, b.r, b.tags, b.id); }
  }
  if (childDrag) { const ct = byId(childDrag.id); if (ct) drawTodo(ct, childDrag.x, childDrag.y, childDrag.r, effTags(ct), null); }
  if (holdInfo) {                                 // hold-to-finish ring
    const f = (performance.now() - holdInfo.t0 - 120) / (HOLD_MS - 120);
    if (f > 0) { ctx.beginPath(); ctx.arc(holdInfo.x, holdInfo.y, holdInfo.r + 5, -Math.PI / 2, -Math.PI / 2 + Math.min(1, f) * 2 * Math.PI);
      ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.strokeStyle = "#fff"; ctx.stroke(); ctx.lineCap = "butt"; }
  }
  const now = performance.now();
  for (let i = pops.length - 1; i >= 0; i--) {    // pop animation
    const p = pops[i], f = (now - p.t0) / 450;
    if (f >= 1) { pops.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - f; ctx.strokeStyle = p.color; ctx.fillStyle = p.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + f * .5), 0, 7); ctx.stroke();
    for (let k = 0; k < 10; k++) { const a = k * .628 + p.seed; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * p.r * (1 + f * 1.4), p.y + Math.sin(a) * p.r * (1 + f * 1.4), 3 * (1 - f), 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
}
function loop() {
  if (data) {
    if (heat > 0) step();
    if (holdInfo) { const loc = locate(holdInfo.id); if (loc) { holdInfo.x = loc.x; holdInfo.y = loc.y; } }
    draw();
  }
  requestAnimationFrame(loop);
}
function locate(id) {             // where is this to-do drawn right now?
  for (const b of bodies) {
    if (b.id === id) return { x: b.x, y: b.y, r: b.r, body: b };
    if (b.children) for (const c of b.children) if (c.id === id) return { x: b.x + c.ox, y: b.y + c.oy, r: c.r, body: b };
  }
  return null;
}
function hit(x, y) {
  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i];
    if (Math.hypot(x - b.x, y - b.y) > b.r) continue;
    if (b.children) for (const c of b.children) if (Math.hypot(x - b.x - c.ox, y - b.y - c.oy) <= c.r) return { id: c.id, body: b, r: c.r, x: b.x + c.ox, y: b.y + c.oy };
    return { id: b.id, body: b, r: b.r, x: b.x, y: b.y };
  }
  return null;
}

// ---------- 5. canvas input ----------
let press = null, childDrag = null;   // childDrag: a sub-to-do being pulled out of its parent
function bodyAt(x, y, except) {        // to-do bubble under the pointer (a possible new parent)
  for (let i = bodies.length - 1; i >= 0; i--) { const b = bodies[i]; if (b !== except && b.kind !== "unplanned" && Math.hypot(x - b.x, y - b.y) <= b.r) return b; }
  return null;
}
cv.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const w = toWorld(e), h = hit(w.x, w.y);
  if (!h) {                                   // empty spot: hold and drag up/down to zoom, the cluster stays centred
    cv.setPointerCapture(e.pointerId); $("tip").style.display = "none";
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of bodies) { x0 = Math.min(x0, b.x - b.r); y0 = Math.min(y0, b.y - b.r); x1 = Math.max(x1, b.x + b.r); y1 = Math.max(y1, b.y + b.r); }
    const c = bodies.length ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : { x: W / 2, y: (H + TOP) / 2 };
    zoomPress = { y0: e.clientY, sx: W / 2, sy: (H + TOP) / 2, z0: zoom, wx: c.x, wy: c.y }; cv.style.cursor = "ns-resize"; return;
  }
  cv.setPointerCapture(e.pointerId);
  const todo = byId(h.id);
  press = { h, x0: e.clientX, y0: e.clientY, dx: h.body.x - w.x, dy: h.body.y - w.y, t0: performance.now(), moved: false,
    isChild: h.id !== h.body.id, leaf: !!todo && !isParent(todo) };
  if (press.leaf && !readOnly) {
    holdInfo = { id: h.id, x: h.x, y: h.y, r: h.r, t0: press.t0 };
    press.timer = setTimeout(() => { const id = press.h.id; endPress(); askFinish(id); }, HOLD_MS);
  }
});
function endPress() { if (press) clearTimeout(press.timer); press = null; zoomPress = null; holdInfo = null; drag = null; childDrag = null; }
cv.addEventListener("pointermove", (e) => {
  if (zoomPress) {                            // up = zoom in, down = zoom out
    zoom = Math.min(4, Math.max(0.4, zoomPress.z0 * Math.exp((zoomPress.y0 - e.clientY) / 250)));
    zx = zoomPress.sx - zoomPress.wx * zoom; zy = zoomPress.sy - zoomPress.wy * zoom; return;
  }
  const w = toWorld(e);
  if (press) {
    if (!press.moved && Math.hypot(e.clientX - press.x0, e.clientY - press.y0) > 6) {   // it's a drag, not a hold
      press.moved = true; clearTimeout(press.timer); holdInfo = null; $("tip").style.display = "none";
      if (press.isChild) childDrag = { id: press.h.id, r: press.h.r, x: w.x, y: w.y };
      else drag = { body: press.h.body, ghost: !readOnly && press.leaf && press.h.body.kind === "todo" };
    }
    if (press.moved) {
      if (childDrag) { childDrag.x = w.x; childDrag.y = w.y; const tg = bodyAt(w.x, w.y, press.h.body); hover = tg ? tg.id : null; }
      else {
        press.h.body.x = w.x + press.dx; press.h.body.y = w.y + press.dy;
        if (drag.ghost) { const tg = bodyAt(w.x, w.y, press.h.body); hover = tg ? tg.id : null; }   // highlight the new parent
      }
      wake(0.5);
    }
    return;
  }
  const h = hit(w.x, w.y), tip = $("tip");
  hover = h ? h.id : null; cv.style.cursor = h ? "pointer" : "default";
  const todo = h && byId(h.id);
  if (todo) {
    tip.style.display = "block"; tip.textContent = todo.title + " · " + fmt(est(todo)) + (frac(todo) > 0 ? " · " + Math.round(frac(todo) * 100) + "%" : "");
    tip.style.left = Math.min(innerWidth - 270, e.clientX + 14) + "px"; tip.style.top = (e.clientY + 16) + "px";
  } else tip.style.display = "none";
});
cv.addEventListener("pointerup", (e) => {
  if (zoomPress) { zoomPress = null; cv.style.cursor = "default"; return; }
  if (!press) return;
  const w = toWorld(e);
  const p = press, cd = childDrag, dg = drag; endPress(); wake(0.6); hover = null;
  if (!p.moved) { if (byId(p.h.id)) openCard(p.h.id, e.clientX, e.clientY); return; }   // short click: details only
  const t = byId(p.h.id); if (!t) return;
  if (cd) {                                      // a sub-to-do was dragged
    const tg = bodyAt(w.x, w.y, null);
    if (tg === p.h.body) return;                 // dropped back into its parent
    const old = byId(t.parent);
    if (!(t.tags || []).length && old) t.tags = [...(old.tags || [])];      // keep the tags it had through its parent
    t.parent = tg ? tg.id : null; pos.set(t.id, { x: w.x, y: w.y }); changed();
  } else if (dg && dg.ghost) {                   // a to-do dropped onto another one becomes its sub-to-do
    const tg = bodyAt(w.x, w.y, dg.body);
    if (tg) { t.parent = tg.id; pos.delete(t.id); changed(); }
  }
});
cv.addEventListener("pointercancel", endPress);
cv.addEventListener("pointerleave", () => { hover = null; $("tip").style.display = "none"; });
function renderLegend(t) {         // top right: which colour is which tag (open areas only)
  const item = (c, n) => `<div class="lg"><span style="background:${esc(c)};box-shadow:0 0 6px ${esc(c)}"></span>${esc(n)}</div>`;
  const open = (g) => !t.per[g.id].closed;
  let h = data.multi
    ? data.sheets.map((s) => { const gs = s.tags.filter(open); return gs.length ? `<div class="lgSheet">${esc(s.name)}</div>` + gs.map((g) => item(tc(g), g.name)).join("") : ""; }).join("")
    : data.tags.filter(open).map((g) => item(tc(g), g.name)).join("");
  if (topLevel().some((x) => !isDone(x) && !effTags(x).length)) h += item("#8e96aa", "No tag");
  $("legend").innerHTML = h; placeLegend();
}
function placeLegend() {           // sits under the header; fades out once the lists scroll up to it
  const lg = $("legend"), top = document.querySelector("header").getBoundingClientRect().bottom - 4;
  lg.style.top = top + "px";
  const plus = $("addBtn").getBoundingClientRect();          // right edge lines up with the header "+"
  lg.style.right = (plus.width ? document.documentElement.clientWidth - plus.right : 18) - 8 + "px";   // - 8: the legend's padding, room for the dots' glow
  lg.style.opacity = $("sheet").getBoundingClientRect().top > top + lg.offsetHeight + 12 ? "" : "0";
}
function placeShade() { $("shade").style.transform = "translateY(" + Math.max(-130, $("sheet").getBoundingClientRect().top) + "px)"; }
addEventListener("scroll", () => { placeShade(); placeLegend(); closeCard(); $("tip").style.display = "none"; $("pal").style.display = "none"; hover = null; });
addEventListener("resize", () => { resize(); if (data) refresh(); });

// ---------- 6. list view ----------
const holdSvg = '<svg viewBox="0 0 20 20"><circle class="ring" cx="10" cy="10" r="8"/><circle class="fill" cx="10" cy="10" r="8"/></svg>';
const linksOf = (t) => (t.links || []).filter((u) => /^https?:\/\//i.test(u));
const GLOBE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><circle cx="8" cy="8" r="6.4"/><ellipse cx="8" cy="8" rx="2.9" ry="6.4"/><path d="M1.6 8h12.8M2.7 4.6c1.5.7 3.3 1 5.3 1s3.8-.3 5.3-1M2.7 11.4c1.5-.7 3.3-1 5.3-1s3.8.3 5.3 1"/></svg>';
const TRASH = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 4.2h10.8M6.2 4.2V2.9c0-.4.3-.7.7-.7h2.2c.4 0 .7.3.7.7v1.3M3.9 4.2l.6 8.6c0 .6.5 1 1.1 1h4.8c.6 0 1.1-.4 1.1-1l.6-8.6M6.6 6.7l.2 4.4M9.4 6.7l-.2 4.4"/></svg>';
const EYEOFF = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 8s2.4-4.2 6.5-4.2S14.500 8 14.500 8s-2.400 4.200-6.500 4.200S1.500 8 1.500 8z"/><circle cx="8" cy="8" r="1.9"/><path d="M2.800 2.300l10.400 11.400"/></svg>';
const UNDO = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M5.600 3.200L2.400 6.400l3.200 3.200"/><path d="M2.600 6.400h6.600a4 4 0 010 8H6.400"/></svg>';
const EYE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 8s2.4-4.2 6.5-4.2S14.500 8 14.500 8s-2.400 4.200-6.500 4.200S1.500 8 1.500 8z"/><circle cx="8" cy="8" r="1.900"/></svg>';
const linksHtml = (t) => linksOf(t).map((u) => `<a class="lnk" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(u)}">${GLOBE}</a>`).join("");
function rowHtml(t, boxKey, child) {
  const par = isParent(t), isHidden = hidden.has(t.id), p = Math.round(frac(t) * 100);
  let h = `<div class="row${child ? " child" : ""}${isHidden ? " hiddenRow" : ""}" data-id="${esc(t.id)}">`;
  h += par ? `<span class="caret" data-act="caret">${openParents.has(boxKey + t.id) ? "▾" : "▸"}</span>`
           : `<span class="hold" data-act="hold" title="Hold to finish" style="--c:${esc(boxKey ? colorOf(boxKey) : "#8e96aa")}">${holdSvg}</span>`;
  h += `<span class="t" data-act="open" title="${esc(t.title)}">${esc(t.title)}</span>${linksHtml(t)}`;
  h += `<span class="meta">${!par && p ? p + "% · " : ""}${fmt(est(t))}</span>`;
  h += isHidden ? `<button class="ghost" data-act="unhide" title="Bring back">↩</button>`
                : `<button class="ghost poof ico" data-act="poof" title="Hide until reload">${EYEOFF}</button>`;
  h += "</div>";
  if (par && openParents.has(boxKey + t.id))
    kids(t).filter((c) => !c.done && (!hidden.has(c.id) || showHidden.has(boxKey))).forEach((c) => h += rowHtml(c, boxKey, true));
  return h;
}
function renderBoxes(t) {
  if (tagRenaming || (rowDrag && rowDrag.moved)) return;           // keep the open name field; the lists catch up when it closes
  const groups = data.tags.filter((g) => !t.per[g.id].closed).map((g) => ({ key: g.id, name: g.name, color: tc(g), done: t.per[g.id].done, total: t.per[g.id].total }));
  const open = topLevel().filter((x) => !isDone(x));
  if (open.some((x) => !effTags(x).length)) groups.push({ key: "", name: "No tag", color: "#8e96aa", done: null });
  const built = groups.map((g) => {
    const mine = open.filter((x) => g.key ? effTags(x).includes(g.key) : !effTags(x).length)
      .sort((a, b) => rand(g.key + "/" + a.id) - rand(g.key + "/" + b.id));
    const vis = mine.filter((x) => !hidden.has(x.id)), hid = mine.filter((x) => hidden.has(x.id));
    const kidsHidden = mine.some((x) => kids(x).some((c) => hidden.has(c.id)));
    const full = openBoxes.has(g.key), shown = full ? vis : vis.slice(0, LIST_DEFAULT);
    let h = `<div class="box" data-box="${esc(g.key)}"><div class="boxHead" data-act="toggle"${g.key && !mine.length ? " data-empty" : ""}>${g.key && !mine.length ? `<span class="tagHold" style="--c:${esc(g.color)}">${holdSvg}` : ""}<span class="dot" ${g.key ? 'data-act="color" title="Change colour"' : ""} style="background:${esc(g.color)}"></span>${g.key && !mine.length ? "</span>" : ""}`
      + `<span class="boxName"><span class="bname"${g.key && !readOnly ? ' title="Double-click to rename"' : ""}>${esc(g.name)}</span>${data.multi && g.key ? `<span class="boxSheet">${esc(sheetOf(tagById(g.key)).name)}</span>` : ""}</span><span class="boxHours">${g.done === null ? vis.length + " open" : dec(g.done) + " / " + dec(g.total) + " h"}</span><button class="ghost addIn" data-act="add" title="Add a to-do here">+</button></div>`;
    if (g.done !== null) h += `<div class="mini"><i style="width:${g.total ? 100 * g.done / g.total : 0}%;background:${esc(g.color)}"></i></div>`;
    h += shown.length ? shown.map((x) => rowHtml(x, g.key, false)).join("") : `<div class="empty">Nothing open here.${g.key ? " Hold the title to finish this area." : ""}</div>`;
    if (showHidden.has(g.key)) h += hid.map((x) => rowHtml(x, g.key, false)).join("");
    h += `<div class="boxFoot"><span class="more" data-act="toggle">${vis.length > LIST_DEFAULT ? (full ? "show less" : "show all " + vis.length) : ""}</span>`;
    if (hid.length || kidsHidden) h += `<button class="ghost ico" data-act="showHidden" title="${showHidden.has(g.key) ? "Stop showing hidden to-dos" : "Show hidden to-dos"}" style="${showHidden.has(g.key) ? "color:var(--text)" : ""}">${showHidden.has(g.key) ? EYE : EYEOFF}</button>`;
    return { html: h + "</div></div>", rows: (h.match(/class="row/g) || []).length };
  });
  const nCol = Math.max(1, Math.min(built.length, Math.floor((innerWidth - 20) / 336))), cols = Array.from({ length: nCol }, () => ({ h: 0, html: "" }));
  built.forEach((b) => { const c = cols.reduce((m, x) => x.h < m.h ? x : m); c.html += b.html; c.h += 90 + b.rows * 33; });   // each box goes to the shortest column
  $("boxes").innerHTML = cols.map((c) => `<div class="col">${c.html}</div>`).join("");
}
let listHold = null;
function cancelListHold() { if (listHold) { clearTimeout(listHold.timer); listHold.el.classList.remove("holding"); listHold = null; } }
$("boxes").addEventListener("pointerdown", (e) => {
  const head = e.target.closest(".boxHead[data-empty]");
  if (head && !readOnly && !e.target.closest("[data-act=color],[data-act=add]")) {     // hold an empty box's title: the area is finished
    const boxEl = head.closest(".box"), g = tagById(boxEl.dataset.box);
    boxEl.classList.add("holding");
    const dr = boxEl.querySelector(".dot").getBoundingClientRect();
    listHold = { el: boxEl, timer: setTimeout(() => {
      cancelListHold(); if (!g) return;
      burst(dr.left + dr.width / 2, dr.top + dr.height / 2, tc(g));
      g.done = true; g.done_seq = nextSeq(); g.done_at = today(); changed();
    }, HOLD_MS) };
    return;
  }
  const el = e.target.closest("[data-act=hold]"); if (!el || readOnly) return;
  const id = el.closest(".row").dataset.id;
  el.classList.add("holding");
  const r = el.getBoundingClientRect(), origin = { x: r.left + 10, y: r.top + 10, color: el.style.getPropertyValue("--c") };
  listHold = { el, timer: setTimeout(() => { cancelListHold(); askFinish(id, origin); }, HOLD_MS) };
});
["pointerup", "pointerleave", "pointercancel"].forEach((ev) => $("boxes").addEventListener(ev, cancelListHold, true));

// Drag a row onto another top-level row: it becomes that to-do's sub-to-do (one level only, same sheet).
// Drag a sub-to-do onto any box outside a row: it becomes a top-level to-do again and keeps its tags.
$("boxes").addEventListener("pointerdown", (e) => {
  const row = e.target.closest(".row");
  if (!row || readOnly || e.button !== 0 || e.target.closest("[data-act=hold],[data-act=caret],button,a")) return;
  rowDrag = { id: row.dataset.id, row, x: e.clientX, y: e.clientY, moved: false, ghost: null, over: null };
});
function dropTarget(x, y) {             // what the dragged row would land on: { row, todo } to nest, { box } to un-nest
  const d = byId(rowDrag.id), el = document.elementFromPoint(x, y), row = el && el.closest(".row"), box = el && el.closest(".box");
  if (row) {
    const t = byId(row.dataset.id);
    const ok = t && t !== d && !t.parent && !isParent(d) && d.parent !== t.id && owner.get(t) === owner.get(d);
    return ok ? { row, todo: t } : null;
  }
  return box && d.parent ? { box } : null;
}
function markDrop(tg) {
  document.querySelectorAll(".dropInto,.dropOut").forEach((x) => x.classList.remove("dropInto", "dropOut"));
  if (tg && tg.row) tg.row.classList.add("dropInto"); else if (tg && tg.box) tg.box.classList.add("dropOut");
}
addEventListener("pointermove", (e) => {
  if (!rowDrag) return;
  if (!rowDrag.moved) {
    if (Math.hypot(e.clientX - rowDrag.x, e.clientY - rowDrag.y) < 6) return;
    cancelListHold(); rowDrag.moved = true; document.body.classList.add("noselect"); getSelection().removeAllRanges();
    const r = rowDrag.row.getBoundingClientRect(), g = rowDrag.row.cloneNode(true);
    g.classList.add("dragGhost"); g.style.width = r.width + "px"; document.body.appendChild(g);
    rowDrag.ghost = g; rowDrag.dx = e.clientX - r.left; rowDrag.dy = e.clientY - r.top; rowDrag.row.classList.add("dragging");
  }
  rowDrag.ghost.style.transform = `translate(${e.clientX - rowDrag.dx}px, ${e.clientY - rowDrag.dy}px)`;
  rowDrag.over = dropTarget(e.clientX, e.clientY); markDrop(rowDrag.over);
});
function endRowDrag(drop) {
  if (!rowDrag) return;
  const { moved, over, ghost, row } = rowDrag, d = byId(rowDrag.id); rowDrag = null;
  if (!moved) return;
  justRowDragged = true; setTimeout(() => { justRowDragged = false; }, 0);
  ghost.remove(); row.classList.remove("dragging"); markDrop(null); document.body.classList.remove("noselect");
  if (drop && over && d) {
    if (over.todo) { d.parent = over.todo.id; openParents.add(over.row.closest(".box").dataset.box + over.todo.id); }
    else { if (!(d.tags || []).length) d.tags = effTags(d); d.parent = null; }        // keep the tags it inherited
    changed();
  } else refresh();
}
addEventListener("pointerup", () => endRowDrag(true));
addEventListener("pointercancel", () => endRowDrag(false));
addEventListener("keydown", (e) => { if (e.key === "Escape") endRowDrag(false); });
$("boxes").addEventListener("click", (e) => {
  if (justRowDragged) { justRowDragged = false; return; }          // the click that ends a drag does nothing
  const a = e.target.closest("[data-act]"); if (!a) return;
  const box = a.closest(".box").dataset.box, row = a.closest(".row"), id = row && row.dataset.id, act = a.dataset.act;
  if (act === "color") { openPalette(box, a); e.stopPropagation(); return; }
  if (act === "add") { if (!readOnly) openEdit(null, box); return; }
  if (act === "toggle" && e.detail === 2 && box && !readOnly && e.target.closest(".bname")) {   // double-click a tag name: rename it
    openBoxes.has(box) ? openBoxes.delete(box) : openBoxes.add(box);   // undo the first click's toggle
    refresh(); startTagRename(box); return;
  }
  if (act === "toggle") openBoxes.has(box) ? openBoxes.delete(box) : openBoxes.add(box);
  else if (act === "caret") openParents.has(box + id) ? openParents.delete(box + id) : openParents.add(box + id);
  else if (act === "poof") hidden.add(id);
  else if (act === "unhide") hidden.delete(id);
  else if (act === "showHidden") showHidden.has(box) ? showHidden.delete(box) : showHidden.add(box);
  else if (act === "open") { openCard(id, e.clientX, e.clientY); return; }
  else return;
  refresh();
});

function openPalette(tagId, dotEl) {     // click a box's dot: pick the tag colour from a fixed palette
  if (readOnly) return;
  const g = tagById(tagId), pal = $("pal"), r = dotEl.getBoundingClientRect(); if (!g) return;
  const solo = !data.multi, cur = tc(g), opts = solo ? SOLO : familyOf(sheetOf(g).color);
  pal.innerHTML = opts.map((c) => `<span data-c="${c}" class="${c === cur ? "on" : ""}" style="background:${c}"></span>`).join("");
  pal.style.display = "grid"; pal.style.left = Math.min(innerWidth - 200, r.left) + "px"; pal.style.top = (r.bottom + 8) + "px";
  pal.onclick = (e) => { const c = e.target.dataset.c; if (!c) return; if (solo) g.solo = c; else g.color = c; pal.style.display = "none"; changed(); };
}
document.addEventListener("pointerdown", (e) => { if (!e.target.closest("#pal") && !e.target.closest("[data-act=color]")) $("pal").style.display = "none"; });

// ---------- 7. done drawer + calibration ----------
const nextSeq = () => (data.done_counter = Math.max(data.done_counter || 0, ...data.todos.map((t) => t.done_seq || 0), ...data.tags.map((g) => g.done_seq || 0)) + 1);   // order of finishing, not a time
function scatter(pts, lines, S) {          // estimated (x) against real (y) hours, log scale
  // Durations come in 15-minute steps, so many to-dos share the exact same spot. Each spot is drawn as a
  // clump (one dot per to-do, spiralling out) so that the number of to-dos there stays visible.
  const L = 18, B = 22, all = pts.flatMap((p) => [p.e, p.a]), lo = Math.log2(Math.min(...all) / 1.5), hi = Math.log2(Math.max(...all) * 1.5);
  const X = (v) => L + (Math.log2(v) - lo) / (hi - lo) * (S - L - 8), Y = (v) => S - B - (Math.log2(v) - lo) / (hi - lo) * (S - B - 8);
  const seen = new Map(), sorted = [...pts].sort((p, q) => (p.col < q.col ? -1 : p.col > q.col ? 1 : 0));
  return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" style="flex:none">`
    + `<path d="M${L} 8V${S - B}H${S - 8}" fill="none" stroke="#4a505c"/>`
    + `<line x1="${L}" y1="${S - B}" x2="${S - 8}" y2="8" stroke="#5b6379" stroke-dasharray="3 4"/>`
    + sorted.map((p) => {
        const key = p.e + "|" + p.a, k = seen.get(key) || 0; seen.set(key, k + 1);
        const ang = k * 2.39996, rad = 5 * Math.sqrt(k);
        return `<circle cx="${(X(p.e) + Math.cos(ang) * rad).toFixed(1)}" cy="${(Y(p.a) + Math.sin(ang) * rad).toFixed(1)}" r="4" fill="${esc(p.col)}" fill-opacity=".9" stroke="#1c1f26" stroke-width=".6"><title>${esc(p.title)}: ${fmt(p.e)} → ${fmt(p.a)}</title></circle>`;
      }).join("")
    + `<g fill="#8e96aa" font-size="10.5"><text x="${S - 8}" y="${S - 8}" text-anchor="end">estimated h →</text>`
    + `<text transform="translate(11 ${8}) rotate(-90)" text-anchor="end">real h →</text></g></svg>`;
}
const today = () => new Date().toLocaleDateString("sv");            // YYYY-MM-DD, local
const dayNo = (s) => { const [y, m, d] = s.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
function histogram(done) {                 // real hours per day, from the automatic completion dates; at least a 30-day window
  const logged = done.filter((t) => /^\d{4}-\d\d-\d\d$/.test(t.done_at || "")), last = dayNo(today());
  const first = Math.min(last - 29, ...logged.map((t) => dayNo(t.done_at))), bins = Array(last - first + 1).fill(0);
  logged.forEach((t) => { const k = dayNo(t.done_at) - first; if (k >= 0 && k < bins.length) bins[k] += t.actual_h || est(t); });
  const mx = Math.max(1, ...bins), lab = (n) => new Date(n * 864e5).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
  return `<div id="hist" style="gap:${bins.length > 60 ? 1 : 2}px">${bins.map((v, i) => `<span class="bin" data-tip="${lab(first + i)} · ${fmt(v)}"><i class="${v ? "" : "zero"}" style="height:${v ? Math.max(8, 100 * v / mx) : 0}%"></i></span>`).join("")}</div>`;
}
function renderDone() {
  const done = leaves().filter((t) => t.done), rated = done.filter((t) => t.actual_h > 0 && est(t) > 0);
  let h = "";
  if (rated.length) {
    const ratioOf = (list) => list.reduce((s, t) => s + t.actual_h, 0) / list.reduce((s, t) => s + est(t), 0), ratio = ratioOf(rated);
    const within = rated.filter((t) => Math.abs(t.actual_h / est(t) - 1) <= 0.25).length;
    const pt = (t, col) => ({ e: est(t), a: t.actual_h, title: t.title, col });
    h += `<div id="calib"><div class="cblock">${scatter(rated.map((t) => pt(t, colorOf(effTags(t)[0]))), [], 230)}<div class="lbl">by tag</div></div>`
      + `<div class="cblock" id="calibMid"><div id="calibCol"><div id="calibNums"><div><div class="big">${done.length}</div><div class="lbl">completed</div></div>`
      + `<div><div class="big">${Math.round(100 * within / rated.length)}%</div><div class="lbl">within ±25 % of the estimate</div></div>`
      + `<div><div class="big">×${ratio.toFixed(2)}</div><div class="lbl">real ÷ estimated</div></div></div>${histogram(done)}</div><div class="lbl">hours per day</div></div>`
      + `<div class="cblock">${scatter(rated.map((t) => pt(t, "#c9ced9")), [], 230)}<div class="lbl">all</div></div></div>`;
  }
  $("doneStats").innerHTML = h; h = "";            // stats stay open; only the list below folds
  const items = [...done.map((t) => ({ t, seq: t.done_seq || 0 })), ...data.tags.filter((g) => g.done).map((g) => ({ g, seq: g.done_seq || 0 }))];
  items.forEach((it, i) => it.i = i); items.sort((a, b) => b.seq - a.seq || b.i - a.i);            // newest first
  h += items.length ? items.map((it) => {
    if (it.g) return `<div class="row" data-tag="${esc(it.g.id)}"><span class="dot" style="background:${esc(tc(it.g))}"></span><span class="t" style="cursor:default">${esc(it.g.name)}</span>`
      + `<button class="ghost ico" data-act="reopen" style="margin-left:auto" title="Reopen this area">${UNDO}</button></div>`;
    const t = it.t, p = t.parent && byId(t.parent);
    return `<div class="row" data-id="${esc(t.id)}"><span class="hold doneMark" style="--c:${esc(colorOf(effTags(t)[0]))}">${holdSvg}</span><span class="t" style="cursor:default">${p ? `<span style="color:var(--dim)">${esc(p.title)} › </span>` : ""}${esc(t.title)}</span>`
      + `<span class="meta">est. ${fmt(est(t))} → real</span><span class="step"><button data-act="less">−</button><span>${t.actual_h ? fmt(t.actual_h) : "?"}</span><button data-act="more">+</button></span>`
      + `<button class="ghost ico" data-act="undo" title="Not done after all">${UNDO}</button></div>`;
  }).join("") : `<div class="empty">Nothing finished yet.</div>`;
  $("doneBody").innerHTML = h;
}
$("doneStats").addEventListener("mousemove", (e) => {      // histogram: date and hours of the bar under the mouse
  const bin = e.target.closest(".bin"), tip = $("tip");
  if (!bin) { tip.style.display = "none"; return; }
  tip.textContent = bin.dataset.tip; tip.style.display = "block";
  tip.style.left = Math.min(innerWidth - 150, e.clientX + 12) + "px"; tip.style.top = (e.clientY - 34) + "px";
});
$("doneStats").addEventListener("mouseleave", () => { $("tip").style.display = "none"; });
$("doneBody").addEventListener("click", (e) => {
  const a = e.target.closest("[data-act]"); if (!a) return;
  const row = a.closest(".row");
  if (a.dataset.act === "reopen") { const g = tagById(row.dataset.tag); if (g) { g.done = false; delete g.done_seq; delete g.done_at; changed(); } return; }
  const t = byId(row.dataset.id); if (!t) return;
  if (a.dataset.act === "undo") { t.done = false; t.actual_h = null; t.progress = 0; delete t.done_seq; delete t.done_at; }
  else t.actual_h = q15((t.actual_h || est(t)) + (a.dataset.act === "more" ? .25 : -.25));
  changed();
});

// ---------- 8. card + dialogs ----------
let cardId = null;
document.addEventListener("pointerdown", (e) => { if (cardId && !e.target.closest("#card")) closeCard(); }, true);
function closeCard() { $("card").style.display = "none"; cardId = null; }
let cardXY = { x: 0, y: 0 };
function openCard(id, x, y) { cardId = id; cardXY = { x, y }; drawCard(); }
function drawCard() {                 // every field is edited by clicking on it
  const t = byId(cardId); if (!t) return closeCard();
  const par = isParent(t), c = $("card"), on = new Set(par ? (t.tags || []) : effTags(t)), ln = linksOf(t);
  c.innerHTML = `<span id="cardX" title="Close">×</span><h3><span id="cardTitle" title="Click to rename">${esc(t.title)}</span> <span id="cardEst" title="${par ? "Sum of its sub-to-dos" : "Click to change"}">${fmt(est(t))}</span></h3>`
    + `<div id="cardTags">${pickable(on).map((g) => `<span class="chip tagPick${on.has(g.id) ? " on" : ""}" data-tag="${esc(g.id)}" style="color:${esc(tc(g))}">${esc(g.name)}</span>`).join("")}</div>`
    + `<div id="cardLinks">${ln.map((u, i) => `<div class="lrow"><a class="lnk" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(u)}">${GLOBE} ${esc(u.replace(/^https?:\/\//i, "").slice(0, 30))}</a><span class="lx" data-i="${i}" title="Remove link">×</span></div>`).join("")}`
    + `<input type="text" id="cardAddLink" placeholder="http://" spellcheck="false"></div>`
    + (par ? `<div class="sub">${kids(t).filter((k) => !k.done).length} of ${kids(t).length} sub-to-dos open · done when all of them are</div>`
           : `<div id="cardProg" title="Progress" style="--c:${esc(colorOf(effTags(t)[0]))}"><i style="width:${t.progress || 0}%"></i><b id="cardPct">${t.progress || 0}%</b></div>`)
    + `<div class="btns"><button class="ghost ico" id="cardDel" title="Delete" style="margin-right:auto">${TRASH}</button><button class="ghost ico" id="cardHide" title="Hide until reload">${EYEOFF}</button></div>`;
  c.style.display = "block";
  c.style.left = Math.max(8, Math.min(innerWidth - 280, cardXY.x + 12)) + "px";
  c.style.top = Math.max(TOP, Math.min(innerHeight - c.offsetHeight - 8, cardXY.y + 12)) + "px";
  const field = (el, value, done) => {          // swap a text for an input; Enter or leaving it saves
    const inp = document.createElement("input"); inp.type = "text"; inp.value = value; inp.className = "cardIn"; el.replaceWith(inp); inp.focus();
    let fin = false; const end = (ok) => { if (fin) return; fin = true; done(ok ? inp.value.trim() : null); };
    inp.onkeydown = (e) => { if (e.key === "Enter") end(true); else if (e.key === "Escape") { e.stopPropagation(); end(false); } };
    inp.onblur = () => end(true);
  };
  $("cardX").onclick = closeCard;
  if (readOnly) {                 // view only: the card shows the details, nothing in it can be changed
    ["cardDel", "cardAddLink"].forEach((k) => { const el = $(k); if (el) el.remove(); });
    $("cardHide").onclick = () => { hidden.add(t.id); closeCard(); refresh(); };
    return;
  }
  $("cardTitle").onclick = (e) => field(e.currentTarget, t.title, (v) => { if (v) { t.title = v; changed(); } if (cardId) drawCard(); });
  $("cardTags").onclick = (e) => {
    const ch = e.target.closest("[data-tag]"); if (!ch) return;
    on.has(ch.dataset.tag) ? on.delete(ch.dataset.tag) : on.add(ch.dataset.tag);
    t.tags = [...on]; changed(); drawCard();          // keeps the order in which tags were picked; the first one gives the colour
  };
  if (!par) {
    $("cardEst").onclick = (e) => {
      const el = e.currentTarget;
      if (!$("cardEstV")) { el.style.cursor = "default"; el.innerHTML = stepper("cardEstV", q15(t.estimate_h || 0.25)); return; }
      setTimeout(() => { const v = +$("cardEstV").dataset.v; if (v !== t.estimate_h) { t.estimate_h = v; changed(); } }, 0);
    };
    const bar = $("cardProg");                        // progress bar: click or drag anywhere on it
    const setP = (e) => {
      const r = bar.getBoundingClientRect(), v = Math.max(0, Math.min(95, Math.round((e.clientX - r.left) / r.width * 20) * 5));
      t.progress = v; bar.firstChild.style.width = v + "%"; $("cardPct").textContent = v + "%"; wake(0.05);
    };
    bar.onpointerdown = (e) => { bar.setPointerCapture(e.pointerId); setP(e); bar.onpointermove = setP; };
    bar.onpointerup = () => { bar.onpointermove = null; changed(); };
  }
  $("cardLinks").onclick = (e) => {
    const x = e.target.closest(".lx");
    if (x) { const l = linksOf(t); l.splice(+x.dataset.i, 1); if (l.length) t.links = l; else delete t.links; changed(); drawCard(); }
  };
  $("cardAddLink").onkeydown = (e) => {
    if (e.key !== "Enter") return;
    let v = e.target.value.trim(); if (!v) return;
    if (!/^https?:\/\//i.test(v)) v = "http://" + v;
    if (/^https?:\/\/\S+\.\S+$/i.test(v)) { t.links = [...linksOf(t), v]; changed(); drawCard(); $("cardAddLink").focus(); }
  };
  $("cardHide").onclick = () => { hidden.add(t.id); closeCard(); refresh(); };
  $("cardDel").onclick = (e) => {
    const btn = e.currentTarget;
    if (btn.dataset.sure) { const gone = new Set([t.id, ...kids(t).map((k) => k.id)]); data.todos = data.todos.filter((x) => !gone.has(x.id)); closeCard(); changed(); }
    else { btn.dataset.sure = 1; btn.style.color = "#f08a8a"; btn.title = par ? "Click again to delete it with its sub-to-dos" : "Click again to delete"; }
  };
}
function showDlg(el) { $("veil").style.display = "block"; el.style.display = "block"; }
function hideDlgs() { $("veil").style.display = "none"; $("finishDlg").style.display = "none"; $("editDlg").style.display = "none"; }
$("veil").onclick = hideDlgs;
addEventListener("keydown", (e) => { if (e.key === "Escape") { hideDlgs(); closeCard(); } });

function stepper(id, val, none, step = 0.25) {     // none: stepping below the smallest value gives "no estimate" (value 0); tags only
  return `<span class="step"><button type="button" data-step="-${step}" data-for="${id}">−</button><span id="${id}" data-v="${val}"${none ? " data-none" : ""}>${val > 0 ? fmt(val) : "no estimate"}</span><button type="button" data-step="${step}" data-for="${id}">+</button></span>`; }
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-step]"); if (!b) return;
  const el = $(b.dataset.for), cur = +el.dataset.v, st = +b.dataset.step, none = el.hasAttribute("data-none");
  const v = none && cur + st < 0.25 ? 0 : q15(none && cur === 0 ? Math.abs(st) : cur + st);
  el.dataset.v = v; el.textContent = v > 0 ? fmt(v) : "no estimate";
});

function burst(x, y, color) {
  const el = document.createElement("div"); el.className = "burst"; el.style.cssText = `left:${x}px;top:${y}px;--c:${color}`;
  document.body.appendChild(el); setTimeout(() => el.remove(), 550);
}
function askFinish(id, origin) {          // finishing always asks for the real duration
  if (readOnly) return;
  const t = byId(id); if (!t || isParent(t)) return;
  closeCard();
  const d = $("finishDlg");
  d.innerHTML = `<h3>Done: ${esc(t.title)}</h3><div style="color:var(--dim)">You estimated ${fmt(est(t))}.</div><label>How long did it really take?</label>${stepper("finVal", q15(est(t)))}`
    + `<div class="btns"><button id="finNo">Not done</button><button class="primary" id="finYes">Pop it</button></div>`;
  showDlg(d);
  $("finNo").onclick = hideDlgs;
  $("finYes").onclick = () => {
    const loc = locate(id);
    if (loc) pops.push({ x: loc.x, y: loc.y, r: loc.r, t0: performance.now(), color: colorOf(effTags(t)[0]), seed: Math.random() * 6 });
    if (origin) {                // finished from a list: burst in the tag's colour where the circle was
      burst(origin.x, origin.y, origin.color);
    }
    t.done = true; t.progress = 100; t.actual_h = +$("finVal").dataset.v; t.done_seq = nextSeq(); t.done_at = today();
    hideDlgs(); changed();
  };
}

function openEdit(id, presetTag) {
  if (readOnly) return;
  const t = id ? byId(id) : null, d = $("editDlg");
  const picked = new Set(t ? (t.tags || []) : presetTag ? [presetTag] : []), hasKids = t && isParent(t);
  d.innerHTML = `<h3>${t ? "Edit to-do" : "New to-do"}</h3><label>What exactly? (be specific)</label><input type="text" id="edTitle" value="${t ? esc(t.title) : ""}">`
    + `<label>Tags</label><div id="edTags">${pickable(picked).map((g) => `<span class="chip tagPick${picked.has(g.id) ? " on" : ""}" data-tag="${esc(g.id)}" style="color:${esc(tc(g))}">${esc(g.name)}</span>`).join("")}</div>`
    + (hasKids ? `<label>Duration</label><div>${fmt(est(t))} — sum of its sub-to-dos</div>` : `<label>Estimated duration</label>${stepper("edEst", q15(t ? t.estimate_h || 0.5 : 0.5))}`)
    + `<label>Links (optional, separate with spaces)</label><input type="text" id="edLinks" placeholder="https://…" value="${t ? esc(linksOf(t).join(" ")) : ""}">`
    + `<div class="btns">${t ? `<button class="ghost" id="edDel" style="margin-right:auto">Delete</button>` : ""}<button id="edNo">Cancel</button><button class="primary" id="edYes">Save</button></div>`;
  showDlg(d); $("edTitle").focus();
  $("edTags").onclick = (e) => { const c = e.target.closest("[data-tag]"); if (!c) return; c.classList.toggle("on"); picked.has(c.dataset.tag) ? picked.delete(c.dataset.tag) : picked.add(c.dataset.tag); };
  $("edNo").onclick = hideDlgs;
  if (t) $("edDel").onclick = (e) => {
    if (e.target.dataset.sure) { const gone = new Set([t.id, ...kids(t).map((k) => k.id)]); data.todos = data.todos.filter((x) => !gone.has(x.id)); hideDlgs(); changed(); }
    else { e.target.dataset.sure = 1; e.target.textContent = hasKids ? "Delete with sub-to-dos?" : "Really delete?"; }
  };
  const submit = () => {
    const title = $("edTitle").value.trim(); if (!title) { $("edTitle").focus(); return; }
    const tgt = t || { id: "t" + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36), progress: 0, done: false, actual_h: null, parent: null };
    tgt.title = title; tgt.tags = [...picked];
    if (!hasKids) tgt.estimate_h = +$("edEst").dataset.v;
    const ln = $("edLinks").value.split(/\s+/).filter((u) => /^https?:\/\//i.test(u));
    if (ln.length) tgt.links = ln; else delete tgt.links;
    if (!t) data.todos.push(tgt);
    hideDlgs(); changed();
  };
  $("edYes").onclick = submit;
  $("edTitle").onkeydown = (e) => { if (e.key === "Enter") submit(); };
}
function openTagDlg() {            // header "+": a new tag (area of work)
  if (readOnly) return;
  const d = $("editDlg"); const home = data.multi ? (doc.sheets.find((s) => s.id === primary) || data.sheets[0]) : data, solo = !data.multi, shade = nextShade(home), fam = solo ? SOLO : familyOf(home.color);
  let col = solo ? (SOLO.find((c) => !home.tags.some((g) => soloColor(g) === c)) || SOLO[0]) : shade;
  d.innerHTML = `<h3>New tag</h3><label>Area of work</label><input type="text" id="tgName" placeholder="e.g. Assembly">`
    + `<label>Colour</label><div id="tgPal" style="display:flex;flex-wrap:wrap;gap:8px">${fam.map((c) => `<span data-c="${c}" style="width:22px;height:22px;border-radius:50%;cursor:pointer;background:${c}"></span>`).join("")}</div>`
    + `<label>Rough total hours <span style="opacity:.7">(optional)</span></label>${stepper("tgEst", 5, true, 1)}`
    + `<div class="btns"><button id="tgNo">Cancel</button><button class="primary" id="tgYes">Save</button></div>`;
  const mark = () => d.querySelectorAll("#tgPal span").forEach((x) => x.style.outline = x.dataset.c === col ? "2px solid #fff" : "none");
  mark(); showDlg(d); $("tgName").focus();
  $("tgPal").onclick = (e) => { if (e.target.dataset.c) { col = e.target.dataset.c; mark(); } };
  $("tgNo").onclick = hideDlgs;
  const submit = () => {
    const name = $("tgName").value.trim(); if (!name) { $("tgName").focus(); return; }
    let id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tag", n = 2; const base = id;
    while (doc.sheets.some((s) => s.tags.some((g) => g.id === id))) id = base + "-" + n++;
    const g = { id, name, color: solo ? shade : col, ...(solo ? { solo: col } : {}), estimate_h: +$("tgEst").dataset.v || null }; owner.set(g, home);   // null: no estimate for this area
    if (data.multi) data.tags.push(g); else home.tags.push(g); hideDlgs(); changed();
  };
  $("tgYes").onclick = submit; $("tgName").onkeydown = (e) => { if (e.key === "Enter") submit(); };
}
$("addBtn").onclick = openTagDlg;

// ---------- start ----------
function run() { window.__bubbles = { get doc() { return doc; }, get data() { return data; }, get bodies() { return bodies; }, totals, hidden }; if (!looping) { looping = true; loop(); } }
function fatal(msg) { $("fatal").style.display = "flex"; $("fatalMsg").textContent = msg; }

async function startServer() {          // localhost: serve.py reads and writes projects/<name>.json
  const list = (await api("/api/projects")).body.projects || [];
  if (!list.length) throw new Error("No project file found in the projects folder.");
  const want = new URLSearchParams(location.search).get("p");
  project = list.includes(want) ? want : list[0];
  const sel = $("projSel");
  if (list.length > 1) {
    sel.hidden = false; sel.innerHTML = list.map((n) => `<option${n === project ? " selected" : ""}>${esc(n)}</option>`).join("");
    sel.onchange = () => { location.search = "?p=" + encodeURIComponent(sel.value); };
  }
  await load(); run();
}
function startEmbedded(emb) {           // demo page: data ships inside the page, changes stay in this browser
  standalone = true; let d = JSON.parse(emb.textContent); project = (d.name || "demo") + ":" + (d.rev || 0);
  try { const s = localStorage.getItem("bubbles:" + project); if (s) d = JSON.parse(s); } catch (e) {}
  adopt(d);
  refresh(); run();
}
async function startDb() {              // published tracker: data lives in the artifact's database, document tracker/main
  project = document.title; adopt({ name: document.title, tags: [], todos: [] });
  let db = null; try { db = window.claude ? await window.claude.use("db") : null; } catch (e) {}
  if (!db) return fatal("The saved data of this tracker can't be reached in this view.");
  dbNs = db; dbRef = db.doc("tracker/main");
  try { const u = await window.claude.use("user"); if (u && (await u.can("data.write")) === false) goReadOnly(); } catch (e) {}
  $("loading").style.display = "flex";
  let first = true; const begin = () => { if (first) { first = false; $("loading").style.display = "none"; refresh(); run(); } };
  const timer = setTimeout(() => { $("loading").textContent = "The saved data can't be reached yet. Still trying…"; }, 10000);
  dbRef.onSnapshot((snap) => {
    if (!snap.metadata.fromCache) clearTimeout(timer);
    if (snap.metadata.hasPendingWrites || dirty || saving) return;      // our own edits are newer
    if (snap.exists) {
      const inc = JSON.parse(JSON.stringify(snap.data()));
      if (first || canon(normalize(inc)) !== canon(doc)) { adopt(inc); base = clone(doc); if (!first) { refresh(); if (cardId && !byId(cardId)) closeCard(); else if (cardId) drawCard(); } }
    }
    begin();
  }, (e) => { clearTimeout(timer); begin(); setSync("err", "Saved data unavailable (" + ((e && e.code) || "error") + ")"); });
}
(async function start() {
  resize();
  try {
    const emb = $("embedded"), local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if (emb) startEmbedded(emb); else if (local) await startServer(); else await startDb();
  } catch (e) { fatal(String(e.message || e)); }
})();
