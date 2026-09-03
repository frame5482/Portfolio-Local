// ============================================================
// Portfolio Editor — admin.js
// ------------------------------------------------------------
// No server, no database. This page loads data/works.json and
// data/tags.json, lets you edit them in the browser, and writes
// the result straight back into the site folder:
//
//   • Chrome / Edge : "เชื่อมโฟลเดอร์" grants write access to the
//     repo folder, then "บันทึก" writes data/*.json and copies new
//     images into images/.
//   • Any browser   : "ดาวน์โหลดไฟล์" downloads the JSON files and
//     any new images so you can drop them in by hand.
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initNavScroll();
  initWorkspace();
  initUpload();
  initFileUpload();
  initMultiFileUpload();
  initDynamicInputs();
  loadData();
});

// --- State ---
let works = [];
let tags = [];
let editingId = null;
let existingImages = [];   // gallery image paths kept while editing

let dirHandle = null;                 // FileSystemDirectoryHandle, when connected
const pendingFiles = new Map();       // "images/foo.png" -> Blob (not written yet)
const pendingUrls = new Map();        // "images/foo.png" -> blob: URL for previews
const filesToDelete = new Set();      // "images/foo.png" to remove on save
let dirty = false;

// --- Cropper State ---
let cropper = null;
let croppedBlob = null;
let originalFileName = '';

window.addEventListener('languageChanged', () => {
  renderWorksList();
});

window.addEventListener('beforeunload', (e) => {
  if (!dirty) return;
  e.preventDefault();
  e.returnValue = '';
});

// --- Navigation ---
function initNav() {
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => links.classList.remove('open'));
    });
  }
}

function initNavScroll() {
  const nav = document.getElementById('mainNav');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 50);
  });
}

// --- Toast ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${type === 'success' ? '✅' : '❌'} ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================
// Helpers
// ============================================================

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function imageFileName(originalName) {
  const dot = originalName.lastIndexOf('.');
  const ext = (dot > 0 ? originalName.slice(dot) : '.jpg').toLowerCase();
  const base = (dot > 0 ? originalName.slice(0, dot) : originalName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'image';
  return `${base}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
}

function isLocalImage(url) {
  return !!url && !/^(https?:|data:|blob:)/i.test(url);
}

// Register a picked/cropped file and return the path it will be saved at
function stageImage(blob, originalName) {
  const path = `images/${imageFileName(originalName || 'image.jpg')}`;
  pendingFiles.set(path, blob);
  pendingUrls.set(path, URL.createObjectURL(blob));
  filesToDelete.delete(path);
  return path;
}

// What to show in an <img> for a stored path
function previewSrc(path) {
  return pendingUrls.get(path) || path;
}

// Drop a local image, unless another work still points at it
function releaseImage(path) {
  if (!isLocalImage(path)) return;
  const stillUsed = works.some(w =>
    w.image_url === path || (w.images || []).includes(path)
  );
  if (stillUsed) return;

  if (pendingFiles.has(path)) {
    URL.revokeObjectURL(pendingUrls.get(path));
    pendingFiles.delete(path);
    pendingUrls.delete(path);
  } else {
    filesToDelete.add(path);
  }
}

function sortWorks(list) {
  return list.slice().sort((a, b) => {
    if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
    if (a.order !== b.order) return a.order - b.order;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

function markDirty() {
  dirty = true;
  updateWorkspaceBar();
}

// ============================================================
// Workspace: connect folder / save / export
// ============================================================

const SUPPORTS_FS = typeof window.showDirectoryPicker === 'function';

function initWorkspace() {
  const connectBtn = document.getElementById('connectFolderBtn');
  const saveBtn = document.getElementById('saveBtn');
  const exportBtn = document.getElementById('exportBtn');

  if (!SUPPORTS_FS) {
    connectBtn.disabled = true;
    connectBtn.title = 'เบราว์เซอร์นี้ไม่รองรับ — ใช้ปุ่มดาวน์โหลดไฟล์แทน';
  }

  connectBtn.addEventListener('click', connectFolder);
  saveBtn.addEventListener('click', saveToFolder);
  exportBtn.addEventListener('click', exportFiles);

  updateWorkspaceBar();
}

async function connectFolder() {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });

    // Make sure this really is the site folder
    try {
      await handle.getDirectoryHandle('data');
    } catch (err) {
      showToast('โฟลเดอร์นี้ไม่มีโฟลเดอร์ data/ — เลือกโฟลเดอร์หลักของเว็บ', 'error');
      return;
    }

    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      showToast('ไม่ได้รับสิทธิ์เขียนไฟล์', 'error');
      return;
    }

    dirHandle = handle;
    showToast(`เชื่อมโฟลเดอร์ "${handle.name}" แล้ว ✨`);
    updateWorkspaceBar();
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('connectFolder:', err);
      showToast('เชื่อมโฟลเดอร์ไม่สำเร็จ', 'error');
    }
  }
}

async function writeFile(dir, name, contents) {
  const fileHandle = await dir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

async function saveToFolder() {
  if (!dirHandle) return;

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '⏳ กำลังบันทึก...';

  try {
    const dataDir = await dirHandle.getDirectoryHandle('data', { create: true });
    await writeFile(dataDir, 'works.json', JSON.stringify(works, null, 2));
    await writeFile(dataDir, 'tags.json', JSON.stringify(tags, null, 2));

    const imagesDir = await dirHandle.getDirectoryHandle('images', { create: true });

    for (const [path, blob] of pendingFiles) {
      await writeFile(imagesDir, path.replace('images/', ''), blob);
    }

    for (const path of filesToDelete) {
      try {
        await imagesDir.removeEntry(path.replace('images/', ''));
      } catch (err) {
        // already gone, or never existed on disk — nothing to do
      }
    }

    const written = pendingFiles.size;
    const removed = filesToDelete.size;

    pendingUrls.forEach(url => URL.revokeObjectURL(url));
    pendingFiles.clear();
    pendingUrls.clear();
    filesToDelete.clear();
    dirty = false;

    showToast(`บันทึกแล้ว ✨ (รูปใหม่ ${written} · ลบ ${removed})`);
    renderWorksList();
  } catch (err) {
    console.error('saveToFolder:', err);
    showToast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
  } finally {
    saveBtn.innerHTML = '💾 บันทึก';
    updateWorkspaceBar();
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportFiles() {
  downloadBlob(new Blob([JSON.stringify(works, null, 2)], { type: 'application/json' }), 'works.json');
  downloadBlob(new Blob([JSON.stringify(tags, null, 2)], { type: 'application/json' }), 'tags.json');

  // Browsers throttle rapid downloads, so space them out a little
  for (const [path, blob] of pendingFiles) {
    await new Promise(r => setTimeout(r, 250));
    downloadBlob(blob, path.replace('images/', ''));
  }

  const extra = pendingFiles.size
    ? ` + รูปใหม่ ${pendingFiles.size} ไฟล์ (เอาไปวางใน images/)`
    : '';
  showToast(`ดาวน์โหลด works.json / tags.json${extra}`);
}

function updateWorkspaceBar() {
  const dot = document.getElementById('workspaceDot');
  const title = document.getElementById('workspaceTitle');
  const hint = document.getElementById('workspaceHint');
  const saveBtn = document.getElementById('saveBtn');

  saveBtn.disabled = !dirHandle;

  const pending = pendingFiles.size;
  const pendingLabel = pending ? ` · รูปใหม่ ${pending} ไฟล์` : '';

  dot.className = 'workspace-dot';

  if (!dirHandle) {
    dot.classList.add(dirty ? 'dirty' : '');
    title.textContent = dirty ? 'มีการแก้ไขที่ยังไม่ได้บันทึก' : 'ยังไม่ได้เชื่อมโฟลเดอร์';
    hint.textContent = SUPPORTS_FS
      ? `กด "เชื่อมโฟลเดอร์" เลือกโฟลเดอร์ Portfolio-Local เพื่อบันทึกลงไฟล์ได้เลย${pendingLabel}`
      : `เบราว์เซอร์นี้บันทึกลงไฟล์ตรง ๆ ไม่ได้ ใช้ "ดาวน์โหลดไฟล์" แทน (Chrome/Edge บันทึกได้เลย)${pendingLabel}`;
    return;
  }

  dot.classList.add(dirty ? 'dirty' : 'connected');
  title.textContent = dirty
    ? `📂 ${dirHandle.name} — ยังไม่ได้บันทึก`
    : `📂 ${dirHandle.name} — บันทึกแล้ว`;
  hint.textContent = dirty
    ? `กด "บันทึก" เพื่อเขียนลง data/works.json และ images/${pendingLabel}`
    : 'commit + push ขึ้น GitHub ได้เลย';
}

// ============================================================
// Load data
// ============================================================

async function loadData() {
  try {
    const [worksRes, tagsRes] = await Promise.all([
      fetch('data/works.json', { cache: 'no-cache' }),
      fetch('data/tags.json', { cache: 'no-cache' })
    ]);
    works = sortWorks(worksRes.ok ? await worksRes.json() : []);
    tags = tagsRes.ok ? await tagsRes.json() : [];
  } catch (err) {
    console.error('loadData:', err);
    works = [];
    tags = [];
    showToast('โหลด data/works.json ไม่ได้', 'error');
  }
  syncTags();
  renderWorksList();
  renderTagManager();
}

// Tags come from the works themselves; tags.json only remembers
// the display order and which ones are highlighted.
function syncTags() {
  const names = new Set();
  works.forEach(w => {
    (w.tags || '').split(',').forEach(t => {
      const trimmed = t.trim();
      if (trimmed) names.add(trimmed);
    });
  });

  const byName = new Map(tags.map(t => [t.name, t]));
  tags = [...names]
    .map(name => byName.get(name) || { id: genId(), name, order: 999, is_highlighted: false })
    .sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name))
    .map((tag, index) => ({ ...tag, order: index }));
}

// ============================================================
// Work form
// ============================================================

function initUpload() {
  const form = document.getElementById('uploadForm');

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const videos = Array.from(document.querySelectorAll('.work-video-input'))
      .map(i => i.value.trim()).filter(Boolean);
    const videoUrl = videos[0] || null;

    const externalImages = Array.from(document.querySelectorAll('.work-ext-image-input'))
      .map(i => i.value.trim()).filter(Boolean);

    const externalImageUrl = document.getElementById('workImageUrl').value.trim();
    const imageFile = document.getElementById('workImage').files[0];

    if (!imageFile && !croppedBlob && !videoUrl && !externalImageUrl && !editingId) {
      showToast('ใส่รูปหรือลิงก์ YouTube อย่างน้อยหนึ่งอย่าง', 'error');
      return;
    }

    const existing = editingId ? works.find(w => w.id === editingId) : null;

    // --- main image ---
    let image_url = existing ? existing.image_url : '';
    if (croppedBlob) {
      if (existing) releaseImage(existing.image_url);
      image_url = stageImage(croppedBlob, originalFileName || 'cropped.jpg');
    } else if (imageFile) {
      if (existing) releaseImage(existing.image_url);
      image_url = stageImage(imageFile, imageFile.name);
    } else if (externalImageUrl && externalImageUrl !== image_url) {
      if (existing) releaseImage(existing.image_url);
      image_url = externalImageUrl;
    }

    // --- gallery images ---
    if (existing) {
      (existing.images || []).forEach(img => {
        if (!existingImages.includes(img)) releaseImage(img);
      });
    }
    const images = [
      ...existingImages,
      ...pendingGalleryFiles.map(file => stageImage(file, file.name)),
      ...externalImages
    ];

    const payload = {
      title: document.getElementById('workTitle').value.trim(),
      title_th: document.getElementById('workTitleTh').value.trim(),
      title_en: document.getElementById('workTitleEn').value.trim(),
      title_jp: document.getElementById('workTitleJp').value.trim(),
      description: document.getElementById('workDescTh').value.trim(),
      description_th: document.getElementById('workDescTh').value.trim(),
      description_en: document.getElementById('workDescEn').value.trim(),
      description_jp: document.getElementById('workDescJp').value.trim(),
      tags: document.getElementById('workTags').value.trim(),
      image_url,
      images,
      video_url: videoUrl,
      videos
    };

    if (existing) {
      Object.assign(existing, payload);
      showToast('แก้ไขแล้ว ✨');
    } else {
      works.unshift({
        id: genId(),
        ...payload,
        is_starred: false,
        order: 0,
        created_at: new Date().toISOString()
      });
      showToast('เพิ่มผลงานแล้ว ✨');
    }

    works = sortWorks(works);
    syncTags();
    markDirty();
    cancelEdit();
    renderWorksList();
    renderTagManager();
  });

  document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
}

function cancelEdit() {
  editingId = null;
  existingImages = [];
  pendingGalleryFiles = [];
  croppedBlob = null;
  originalFileName = '';

  document.getElementById('uploadForm').reset();
  document.getElementById('imagePreview').classList.remove('visible');
  document.getElementById('previewImg').src = '';
  document.getElementById('multiImagePreviews').innerHTML = '';

  clearDynamicInputs('videoInputsContainer', `
    <div class="dynamic-input-row" style="display:flex; gap:10px; margin-bottom:0.5rem;">
      <input type="url" name="videos" class="work-video-input" placeholder="e.g., https://www.youtube.com/watch?v=xxxxx" style="flex:1;">
      <button type="button" class="btn btn-secondary btn-sm remove-input-btn" style="padding:0 0.8rem; font-size:1.2rem; display:none;">✕</button>
    </div>
  `);
  clearDynamicInputs('externalImageInputsContainer', `
    <div class="dynamic-input-row" style="display:flex; gap:10px; margin-bottom:0.5rem;">
      <input type="url" name="external_images" class="work-ext-image-input" placeholder="Insert additional image link (e.g., https://...)" style="flex:1;">
      <button type="button" class="btn btn-secondary btn-sm remove-input-btn" style="padding:0 0.8rem; font-size:1.2rem; display:none;">✕</button>
    </div>
  `);

  document.getElementById('submitBtn').innerHTML = '✨ Upload';
  document.getElementById('cancelEditBtn').style.display = 'none';
  document.querySelector('.upload-card h2').textContent = '📤 Upload New Work';
}

window.editWork = function (id) {
  const work = works.find(w => w.id === id);
  if (!work) return;

  editingId = id;
  croppedBlob = null;
  pendingGalleryFiles = [];

  document.getElementById('workTitle').value = work.title || '';
  document.getElementById('workTitleTh').value = work.title_th || '';
  document.getElementById('workTitleEn').value = work.title_en || '';
  document.getElementById('workTitleJp').value = work.title_jp || '';
  document.getElementById('workDescTh').value = work.description_th || '';
  document.getElementById('workDescEn').value = work.description_en || '';
  document.getElementById('workDescJp').value = work.description_jp || '';
  document.getElementById('workTags').value = work.tags || '';

  // videos
  document.getElementById('videoInputsContainer').innerHTML = '';
  const workVideos = (work.videos && work.videos.length)
    ? work.videos
    : (work.video_url ? [work.video_url] : []);
  if (workVideos.length === 0) {
    addDynamicInput('videoInputsContainer', 'videos', 'work-video-input', 'e.g., https://www.youtube.com/watch?v=xxxxx');
    document.querySelector('#videoInputsContainer .remove-input-btn').style.display = 'none';
  } else {
    workVideos.forEach(v =>
      addDynamicInput('videoInputsContainer', 'videos', 'work-video-input', 'e.g., https://www.youtube.com/watch?v=xxxxx', v)
    );
  }

  // external image inputs start empty — existing images are managed in the preview grid
  clearDynamicInputs('externalImageInputsContainer', `
    <div class="dynamic-input-row" style="display:flex; gap:10px; margin-bottom:0.5rem;">
      <input type="url" name="external_images" class="work-ext-image-input" placeholder="Insert additional image link (e.g., https://...)" style="flex:1;">
      <button type="button" class="btn btn-secondary btn-sm remove-input-btn" style="padding:0 0.8rem; font-size:1.2rem; display:none;">✕</button>
    </div>
  `);

  document.getElementById('workImageUrl').value = isLocalImage(work.image_url) ? '' : (work.image_url || '');

  if (work.image_url) {
    document.getElementById('previewImg').src = previewSrc(work.image_url);
    document.getElementById('imagePreview').classList.add('visible');
  } else {
    document.getElementById('imagePreview').classList.remove('visible');
  }

  existingImages = [...(work.images || [])];
  renderMultiPreviews();

  document.getElementById('submitBtn').innerHTML = '💾 Save Changes';
  document.getElementById('cancelEditBtn').style.display = 'block';
  document.querySelector('.upload-card h2').textContent = '✏️ Edit Work';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteWork = function (id) {
  const work = works.find(w => w.id === id);
  if (!work) return;
  if (!confirm(`ลบผลงาน "${work.title}" ?`)) return;

  works = works.filter(w => w.id !== id);
  releaseImage(work.image_url);
  (work.images || []).forEach(releaseImage);

  syncTags();
  markDirty();
  if (editingId === id) cancelEdit();
  renderWorksList();
  renderTagManager();
  showToast('ลบแล้ว');
};

window.toggleStar = function (id) {
  const work = works.find(w => w.id === id);
  if (!work) return;
  work.is_starred = !work.is_starred;
  works = sortWorks(works);
  markDirty();
  renderWorksList();
};

// ============================================================
// Image inputs
// ============================================================

function initFileUpload() {
  const area = document.getElementById('fileUploadArea');
  const input = document.getElementById('workImage');
  const preview = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');

  input.addEventListener('change', () => {
    if (input.files && input.files[0]) openCropper(input.files[0]);
  });

  document.getElementById('removeImgBtn').addEventListener('click', () => {
    input.value = '';
    croppedBlob = null;
    document.getElementById('workImageUrl').value = '';
    previewImg.src = '';
    preview.classList.remove('visible');
  });

  const workImageUrl = document.getElementById('workImageUrl');
  workImageUrl.addEventListener('input', () => {
    if (workImageUrl.value.trim()) {
      previewImg.src = workImageUrl.value.trim();
      preview.classList.add('visible');
      input.value = '';
      croppedBlob = null;
    } else if (!input.files[0]) {
      preview.classList.remove('visible');
    }
  });

  area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event('change'));
    }
  });
}

let pendingGalleryFiles = [];

function initMultiFileUpload() {
  const area = document.getElementById('multiFileUploadArea');
  const input = document.getElementById('workImages');

  input.addEventListener('change', () => {
    for (const file of input.files) pendingGalleryFiles.push(file);
    renderMultiPreviews();
  });

  area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('dragover');
    for (const file of e.dataTransfer.files) {
      if (file.type.startsWith('image/')) pendingGalleryFiles.push(file);
    }
    renderMultiPreviews();
  });
}

function renderMultiPreviews() {
  const container = document.getElementById('multiImagePreviews');
  container.innerHTML = '';

  existingImages.forEach((url, idx) => {
    container.appendChild(createPreviewItem(previewSrc(url), 'existing', idx));
  });

  pendingGalleryFiles.forEach((file, idx) => {
    container.appendChild(createPreviewItem(URL.createObjectURL(file), 'new', idx, file.name));
  });
}

function createPreviewItem(src, type, index, name) {
  const wrapper = document.createElement('div');
  wrapper.className = 'multi-preview-item';
  wrapper.innerHTML = `
    <img src="${src}" alt="Preview ${index + 1}">
    <button type="button" class="multi-preview-remove" title="Remove this image">✖</button>
    <span class="multi-preview-label">${type === 'existing' ? '📌' : '✨'} ${name || (index + 1)}</span>
  `;

  wrapper.querySelector('.multi-preview-remove').addEventListener('click', () => {
    if (type === 'existing') {
      existingImages.splice(index, 1);
    } else {
      pendingGalleryFiles.splice(index, 1);
    }
    renderMultiPreviews();
  });

  return wrapper;
}

// --- Cropper ---
function openCropper(file) {
  originalFileName = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    const modal = document.getElementById('cropperModal');
    const image = document.getElementById('cropperImage');
    image.src = e.target.result;
    modal.style.display = 'flex';

    if (cropper) cropper.destroy();
    cropper = new Cropper(image, { aspectRatio: 16 / 9, viewMode: 2, background: false });
  };
  reader.readAsDataURL(file);
}

function closeCropper() {
  document.getElementById('cropperModal').style.display = 'none';
  if (cropper) cropper.destroy();
  if (!croppedBlob) document.getElementById('workImage').value = '';
}

function applyCrop() {
  if (!cropper) return;
  cropper.getCroppedCanvas({ width: 1920, height: 1080 }).toBlob((blob) => {
    croppedBlob = blob;
    document.getElementById('previewImg').src = URL.createObjectURL(blob);
    document.getElementById('imagePreview').classList.add('visible');
    closeCropper();
  }, 'image/jpeg', 0.9);
}

window.closeCropper = closeCropper;
window.applyCrop = applyCrop;

// --- Dynamic inputs (videos & external image links) ---
function initDynamicInputs() {
  document.getElementById('addVideoBtn').addEventListener('click', () => {
    addDynamicInput('videoInputsContainer', 'videos', 'work-video-input', 'e.g., https://www.youtube.com/watch?v=xxxxx');
  });

  document.getElementById('addExternalImageBtn').addEventListener('click', () => {
    addDynamicInput('externalImageInputsContainer', 'external_images', 'work-ext-image-input', 'Insert additional image link (e.g., https://...)');
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-input-btn')) {
      e.target.closest('.dynamic-input-row').remove();
    }
  });
}

function addDynamicInput(containerId, name, className, placeholder, value = '') {
  const container = document.getElementById(containerId);
  const row = document.createElement('div');
  row.className = 'dynamic-input-row';
  row.style.cssText = 'display:flex; gap:10px; margin-bottom:0.5rem; animation: cardFadeIn 0.3s ease;';
  row.innerHTML = `
    <input type="url" name="${name}" class="${className}" placeholder="${placeholder}" value="${value}" style="flex:1;">
    <button type="button" class="btn btn-secondary btn-sm remove-input-btn" style="padding:0 0.8rem; font-size:1.2rem;">✕</button>
  `;
  container.appendChild(row);
}

function clearDynamicInputs(containerId, defaultHtml) {
  document.getElementById(containerId).innerHTML = defaultHtml;
}

// ============================================================
// Works list
// ============================================================

function getYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([\w-]{11})/);
  return match ? match[1] : null;
}

function getYouTubeThumbnail(url) {
  const id = getYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
}

const PLACEHOLDER_THUMB =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23f0f0f0'/><text y='50%' x='50%' dominant-baseline='middle' text-anchor='middle' font-size='40'>🖼</text></svg>";

function renderWorksList() {
  const container = document.getElementById('worksList');

  if (works.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="emoji">📭</div><p>ยังไม่มีผลงาน</p></div>';
    return;
  }

  const lang = typeof getCurrentLang === 'function' ? getCurrentLang() : 'th';

  container.innerHTML = works.map(work => {
    const thumb = previewSrc(work.image_url) || getYouTubeThumbnail(work.video_url) || PLACEHOLDER_THUMB;
    const videoBadge = work.video_url ? '<span style="color:var(--peach-dark);font-size:0.75rem;">🎬 YouTube</span>' : '';
    const imgCount = (work.image_url ? 1 : 0) + (work.images ? work.images.length : 0);
    const imgBadge = imgCount > 1 ? `<span style="color:var(--lavender-dark);font-size:0.75rem;">🖼 ${imgCount} images</span>` : '';
    const isNew = pendingFiles.has(work.image_url) ? '<span class="pending-badge">รูปใหม่</span>' : '';
    const title = work[`title_${lang}`] || work.title;

    return `
      <div class="admin-work-item ${work.is_starred ? 'starred-item' : ''}" data-id="${work.id}" draggable="true"
           ondragstart="dragStart(event)" ondragover="dragOver(event)" ondrop="drop(event)"
           ondragenter="dragEnter(event)" ondragleave="dragLeave(event)" ondragend="dragEnd(event)">
        <div class="drag-handle">⋮⋮</div>
        <img src="${thumb}" alt="${title}" class="admin-work-thumb" onerror="this.src=&quot;${PLACEHOLDER_THUMB}&quot;">
        <div class="admin-work-info">
          <h3>${title} ${work.is_starred ? '<span class="star-badge-text">⭐ Featured</span>' : ''} ${isNew}</h3>
          <p>${work.tags} ${videoBadge} ${imgBadge}</p>
        </div>
        <div style="display: flex; gap: 5px; align-items: center;">
          <button class="btn btn-sm ${work.is_starred ? 'btn-star-active' : 'btn-secondary'}"
                  onclick="event.stopPropagation(); toggleStar('${work.id}')"
                  title="ปักหมุดไว้บนสุด">${work.is_starred ? '⭐' : '☆'}</button>
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); editWork('${work.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteWork('${work.id}')">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

// --- Drag & drop reordering ---
let dragSource = null;

window.dragStart = function (e) {
  dragSource = e.currentTarget;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging');
};

window.dragOver = function (e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
};

window.dragEnter = function (e) { e.currentTarget.classList.add('drag-over'); };
window.dragLeave = function (e) { e.currentTarget.classList.remove('drag-over'); };

window.drop = function (e) {
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');

  if (dragSource && dragSource !== e.currentTarget) {
    const items = Array.from(document.querySelectorAll('.admin-work-item'));
    const from = items.indexOf(dragSource);
    const to = items.indexOf(e.currentTarget);

    const list = document.getElementById('worksList');
    if (from < to) {
      list.insertBefore(dragSource, e.currentTarget.nextSibling);
    } else {
      list.insertBefore(dragSource, e.currentTarget);
    }

    const orderedIds = Array.from(document.querySelectorAll('.admin-work-item')).map(i => i.dataset.id);
    orderedIds.forEach((id, index) => {
      const work = works.find(w => w.id === id);
      if (work) work.order = index;
    });

    works = sortWorks(works);
    markDirty();
    renderWorksList();
  }
  return false;
};

window.dragEnd = function (e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.admin-work-item').forEach(el => el.classList.remove('drag-over'));
};

// ============================================================
// Tag manager
// ============================================================

let tagDragSource = null;

function renderTagManager() {
  const container = document.getElementById('tagManagerList');
  const emptyState = document.getElementById('tagManagerEmpty');

  if (!tags.length) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  container.innerHTML = tags.map((tag, index) => `
    <div class="tag-manager-item ${tag.is_highlighted ? 'tag-highlighted' : ''}" data-tag-id="${tag.id}" draggable="true">
      <div class="tag-drag-handle" title="Drag to reorder">⋮⋮</div>
      <span class="tag-order-badge">#${index + 1}</span>
      <span class="tag-name">${tag.name}</span>
      <div class="tag-actions">
        <button class="btn btn-sm ${tag.is_highlighted ? 'btn-highlight-active' : 'btn-secondary'} tag-highlight-btn"
                onclick="event.stopPropagation(); toggleTagHighlight('${tag.id}')"
                title="${tag.is_highlighted ? 'Remove highlight' : 'Highlight this tag'}">
          ${tag.is_highlighted ? '✨' : '☆'}
        </button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.tag-manager-item').forEach(item => {
    item.addEventListener('dragstart', tagDragStart);
    item.addEventListener('dragover', tagDragOver);
    item.addEventListener('dragenter', tagDragEnter);
    item.addEventListener('dragleave', tagDragLeave);
    item.addEventListener('drop', tagDrop);
    item.addEventListener('dragend', tagDragEnd);
  });
}

function tagDragStart(e) {
  tagDragSource = e.currentTarget;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('tag-dragging');
}

function tagDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function tagDragEnter(e) { e.currentTarget.classList.add('tag-drag-over'); }
function tagDragLeave(e) { e.currentTarget.classList.remove('tag-drag-over'); }

function tagDrop(e) {
  e.stopPropagation();
  e.currentTarget.classList.remove('tag-drag-over');

  if (tagDragSource && tagDragSource !== e.currentTarget) {
    const items = Array.from(document.querySelectorAll('.tag-manager-item'));
    const from = items.indexOf(tagDragSource);
    const to = items.indexOf(e.currentTarget);
    const list = document.getElementById('tagManagerList');

    if (from < to) {
      list.insertBefore(tagDragSource, e.currentTarget.nextSibling);
    } else {
      list.insertBefore(tagDragSource, e.currentTarget);
    }

    const orderedIds = Array.from(document.querySelectorAll('.tag-manager-item')).map(i => i.dataset.tagId);
    orderedIds.forEach((id, index) => {
      const tag = tags.find(t => t.id === id);
      if (tag) tag.order = index;
    });
    tags.sort((a, b) => a.order - b.order);

    markDirty();
    renderTagManager();
    showToast('เรียงแท็กใหม่แล้ว 🏷️');
  }
}

function tagDragEnd(e) {
  e.currentTarget.classList.remove('tag-dragging');
  document.querySelectorAll('.tag-manager-item').forEach(el => el.classList.remove('tag-drag-over'));
}

window.toggleTagHighlight = function (id) {
  const tag = tags.find(t => t.id === id);
  if (!tag) return;
  tag.is_highlighted = !tag.is_highlighted;
  markDirty();
  renderTagManager();
  showToast(tag.is_highlighted ? 'ไฮไลต์แท็กแล้ว ✨' : 'เอาไฮไลต์ออกแล้ว');
};
