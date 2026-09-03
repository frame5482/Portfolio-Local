// ============================================================
// JSON File Store — db/store.js
// Replaces MongoDB. All data lives in plain JSON files inside
// public/data/ so that GitHub Pages can serve them directly.
// ============================================================
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const WORKS_FILE = path.join(DATA_DIR, 'works.json');
const TAGS_FILE = path.join(DATA_DIR, 'tags.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (err) {
    console.error(`❌ Failed to read ${path.basename(file)}:`, err.message);
    return fallback;
  }
}

// Write via temp file + rename so a crash can never leave a half-written DB
function writeJson(file, data) {
  ensureDataDir();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// --- Work defaults (mirrors the old mongoose schema) ---
function normalizeWork(w = {}) {
  return {
    id: w.id || genId(),
    title: w.title || '',
    title_th: w.title_th || '',
    title_en: w.title_en || '',
    title_jp: w.title_jp || '',
    description: w.description || '',
    description_th: w.description_th || '',
    description_en: w.description_en || '',
    description_jp: w.description_jp || '',
    image_url: w.image_url || '',
    images: Array.isArray(w.images) ? w.images : [],
    video_url: w.video_url || null,
    videos: Array.isArray(w.videos) ? w.videos : [],
    tags: w.tags || '',
    is_starred: w.is_starred === true,
    order: typeof w.order === 'number' ? w.order : 0,
    created_at: w.created_at || new Date().toISOString()
  };
}

// Featured first, then manual order, then newest first
function sortWorks(works) {
  return works.slice().sort((a, b) => {
    if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
    if (a.order !== b.order) return a.order - b.order;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

// --- Works ---
function getWorks() {
  return sortWorks(readJson(WORKS_FILE, []).map(normalizeWork));
}

function saveWorks(works) {
  writeJson(WORKS_FILE, sortWorks(works.map(normalizeWork)));
}

function getWorkById(id) {
  return getWorks().find(w => String(w.id) === String(id)) || null;
}

function addWork(data) {
  const works = getWorks();
  const work = normalizeWork(data);
  works.unshift(work);
  saveWorks(works);
  return work;
}

function updateWork(id, patch) {
  const works = getWorks();
  const index = works.findIndex(w => String(w.id) === String(id));
  if (index === -1) return null;
  works[index] = normalizeWork({ ...works[index], ...patch, id: works[index].id });
  saveWorks(works);
  return works[index];
}

function deleteWork(id) {
  const works = getWorks();
  const index = works.findIndex(w => String(w.id) === String(id));
  if (index === -1) return null;
  const [removed] = works.splice(index, 1);
  saveWorks(works);
  return removed;
}

// --- Tags ---
function normalizeTag(t = {}) {
  return {
    id: t.id || genId(),
    name: t.name || '',
    order: typeof t.order === 'number' ? t.order : 999,
    is_highlighted: t.is_highlighted === true
  };
}

function getRawTags() {
  return readJson(TAGS_FILE, []).map(normalizeTag);
}

function saveTags(tags) {
  writeJson(TAGS_FILE, tags.map(normalizeTag).sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  }));
}

function tagNamesFromWorks(works) {
  const set = new Set();
  works.forEach(w => {
    (w.tags || '').split(',').forEach(t => {
      const trimmed = t.trim();
      if (trimmed) set.add(trimmed);
    });
  });
  return set;
}

// Keep tags.json in sync with the tags actually used by works,
// preserving the order / highlight metadata of existing tags.
function syncTags() {
  const names = tagNamesFromWorks(getWorks());
  const existing = getRawTags();
  const byName = new Map(existing.map(t => [t.name, t]));

  const synced = [...names].map(name => byName.get(name) || normalizeTag({ name }));
  saveTags(synced);
  return getRawTags();
}

function updateTag(id, patch) {
  const tags = getRawTags();
  const index = tags.findIndex(t => String(t.id) === String(id));
  if (index === -1) return null;
  tags[index] = normalizeTag({ ...tags[index], ...patch, id: tags[index].id });
  saveTags(tags);
  return tags.find(t => String(t.id) === String(id));
}

function reorderTags(orderedIds) {
  const tags = getRawTags();
  orderedIds.forEach((id, index) => {
    const tag = tags.find(t => String(t.id) === String(id));
    if (tag) tag.order = index;
  });
  saveTags(tags);
}

function reorderWorks(orderedIds) {
  const works = getWorks();
  orderedIds.forEach((id, index) => {
    const work = works.find(w => String(w.id) === String(id));
    if (work) work.order = index;
  });
  saveWorks(works);
}

module.exports = {
  DATA_DIR, WORKS_FILE, TAGS_FILE,
  genId, normalizeWork, normalizeTag, sortWorks,
  getWorks, saveWorks, getWorkById, addWork, updateWork, deleteWork, reorderWorks,
  getRawTags, saveTags, syncTags, updateTag, reorderTags
};
