require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Database (JSON files in public/data) ---
const store = require('./db/store');

// --- Paths ---
const PUBLIC_DIR = path.join(__dirname, 'public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');
const LEGACY_UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure images / data directories exist
for (const dir of [IMAGES_DIR, store.DATA_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// Legacy folder from the old version — still served if it exists
if (fs.existsSync(LEGACY_UPLOADS_DIR)) {
  app.use('/uploads', express.static(LEGACY_UPLOADS_DIR));
}

// --- Multer: save uploads straight into public/images ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const base = path.basename(file.originalname, ext)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'image';
    cb(null, `${base}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype);
    if (extOk && mimeOk) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Multi-file upload config (up to 10 images)
const uploadMulti = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: 10 }
]);

// Relative URL so the site works both locally and under a GitHub Pages subpath
const toPublicUrl = (file) => `images/${file.filename}`;

// --- Auth ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'artfolio123';
const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 10);
const sessions = new Map(); // token -> expiry

function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const expiry = sessions.get(token);
  if (Date.now() > expiry) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }
  next();
}

// --- Helpers ---

// Normalize a field that may arrive as a JSON string, a single value, or an array
function parseList(value) {
  if (value === undefined || value === null || value === '') return [];
  let list = value;
  if (typeof list === 'string') {
    try {
      const parsed = JSON.parse(list);
      list = Array.isArray(parsed) ? parsed : [list];
    } catch (e) {
      list = [list];
    }
  }
  if (!Array.isArray(list)) list = [list];
  return list.filter(u => typeof u === 'string' && u.trim());
}

// Convert Google Drive share links into direct-view links
function convertDriveLink(url) {
  if (!url) return url;
  const match = url.match(/(?:drive\.google\.com\/file\/d\/|drive\.google\.com\/open\?id=)([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://drive.google.com/uc?export=view&id=${match[1]}`;
  }
  return url;
}

// Delete an image that lives in this repo (external URLs are left alone)
function deleteLocalFile(fileUrl, reason = 'unknown') {
  if (!fileUrl || /^(https?:)?\/\//i.test(fileUrl) || fileUrl.startsWith('data:')) return;

  const relative = fileUrl.replace(/^\/+/, '');
  const filePath = relative.startsWith('uploads/')
    ? path.join(__dirname, relative)   // legacy uploads folder
    : path.join(PUBLIC_DIR, relative); // public/images/...

  // Never step outside the folders we own
  const allowed = [IMAGES_DIR, LEGACY_UPLOADS_DIR];
  if (!allowed.some(dir => filePath.startsWith(dir + path.sep))) return;

  if (fs.existsSync(filePath)) {
    console.log(`🗑️ Deleting image: ${relative} (reason: ${reason})`);
    try { fs.unlinkSync(filePath); } catch (e) { console.error('❌ Delete failed:', e.message); }
  }
}

// --- API Routes ---

// Login
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }
  if (!bcrypt.compareSync(password, hashedPassword)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + 24 * 60 * 60 * 1000); // 24h
  res.json({ token });
});

// Get all works (optional tag filter)
app.get('/api/works', (req, res) => {
  try {
    const { tag } = req.query;
    let works = store.getWorks();

    if (tag) {
      const wanted = tag.trim().toLowerCase();
      works = works.filter(w =>
        (w.tags || '').split(',').map(t => t.trim().toLowerCase()).includes(wanted)
      );
    }

    res.json(works.map(w => ({
      ...w,
      starBtnClass: w.is_starred ? 'btn-star-active' : 'btn-secondary',
      starIcon: w.is_starred ? '⭐' : '☆'
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single work by ID
app.get('/api/works/:id', (req, res) => {
  try {
    const work = store.getWorkById(req.params.id);
    if (!work) {
      return res.status(404).json({ error: 'Work not found' });
    }
    res.json(work);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get unique tags (with order & highlight info)
app.get('/api/tags', (req, res) => {
  try {
    res.json(store.syncTags());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder tags
app.put('/api/tags/reorder', authMiddleware, (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'Invalid data' });

    store.reorderTags(orderedIds);
    console.log('✅ Reordered tags successfully');
    res.json({ success: true, message: 'Tags reordered successfully' });
  } catch (err) {
    console.error('❌ Tag reorder error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Toggle tag highlight
app.put('/api/tags/:id/highlight', authMiddleware, (req, res) => {
  try {
    const tag = store.getRawTags().find(t => String(t.id) === String(req.params.id));
    if (!tag) return res.status(404).json({ error: 'Tag not found' });

    const updated = store.updateTag(tag.id, { is_highlighted: !tag.is_highlighted });
    console.log(`✨ Toggled highlight for tag: ${updated.name} (Status: ${updated.is_highlighted})`);
    res.json({ success: true, is_highlighted: updated.is_highlighted });
  } catch (err) {
    console.error('❌ Tag highlight toggle error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reorder Works (Must be above /api/works/:id)
app.put('/api/works/reorder', authMiddleware, (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'Invalid data' });

    store.reorderWorks(orderedIds);
    console.log('✅ Reordered works successfully');
    res.json({ success: true, message: 'Reordered successfully' });
  } catch (err) {
    console.error('❌ Reorder error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Toggle Star (Must be above /api/works/:id)
app.put('/api/works/:id/star', authMiddleware, (req, res) => {
  try {
    const work = store.getWorkById(req.params.id);
    if (!work) return res.status(404).json({ error: 'Work not found' });

    const updated = store.updateWork(work.id, { is_starred: !work.is_starred });
    console.log(`⭐ Toggled star for: ${updated.title} (Status: ${updated.is_starred})`);
    res.json({ success: true, is_starred: updated.is_starred });
  } catch (err) {
    console.error('❌ Star toggle error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Upload new work (auth required)
app.post('/api/works', authMiddleware, (req, res, next) => {
  uploadMulti(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, (req, res) => {
  try {
    const {
      title, title_th, title_en, title_jp,
      description, description_th, description_en, description_jp,
      tags, video_url, external_image_url
    } = req.body;
    if (!title || !tags) {
      return res.status(400).json({ error: 'Title and tags are required' });
    }

    // Primary image
    const mainFile = req.files && req.files['image'] ? req.files['image'][0] : null;
    const image_url = mainFile ? toPublicUrl(mainFile) : convertDriveLink(external_image_url || '');

    if (!image_url && !video_url) {
      return res.status(400).json({ error: 'Image or YouTube URL is required' });
    }

    // Additional images: uploaded files first, then external URLs
    let images = req.files && req.files['images'] ? req.files['images'].map(toPublicUrl) : [];
    images = images.concat(parseList(req.body.external_images).map(convertDriveLink));

    const newWork = store.addWork({
      title,
      title_th: title_th || '',
      title_en: title_en || '',
      title_jp: title_jp || '',
      description: description || '',
      description_th: description_th || '',
      description_en: description_en || '',
      description_jp: description_jp || '',
      image_url,
      images,
      video_url: video_url || null,
      videos: parseList(req.body.videos),
      tags
    });
    store.syncTags();

    res.json({ ...newWork, message: 'Work uploaded successfully ✨' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete work (auth required)
app.delete('/api/works/:id', authMiddleware, (req, res) => {
  try {
    const work = store.getWorkById(req.params.id);
    if (!work) {
      return res.status(404).json({ error: 'Work not found' });
    }
    console.log(`🗑️ Admin deleting work: "${work.title}" (${work.id})`);

    deleteLocalFile(work.image_url, `admin deleted work "${work.title}"`);
    (work.images || []).forEach(img =>
      deleteLocalFile(img, `admin deleted work "${work.title}"`)
    );

    store.deleteWork(work.id);
    store.syncTags();
    res.json({ message: 'Work deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit work (auth required)
app.put('/api/works/:id', authMiddleware, (req, res, next) => {
  uploadMulti(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, (req, res) => {
  try {
    const work = store.getWorkById(req.params.id);
    if (!work) {
      return res.status(404).json({ error: 'Work not found' });
    }

    const {
      title, title_th, title_en, title_jp,
      description, description_th, description_en, description_jp,
      tags, video_url, external_image_url
    } = req.body;
    if (!title || !tags) {
      return res.status(400).json({ error: 'Title and tags are required' });
    }

    // Handle main image
    let new_image_url = work.image_url;
    const mainFile = req.files && req.files['image'] ? req.files['image'][0] : null;
    if (mainFile) {
      new_image_url = toPublicUrl(mainFile);
      // Only delete old main image if it's being replaced with a NEW upload
      deleteLocalFile(work.image_url, 'main image replaced by new upload');
    } else if (external_image_url && external_image_url !== work.image_url) {
      new_image_url = convertDriveLink(external_image_url);
      // Only delete old main image if the URL actually changed
      deleteLocalFile(work.image_url, 'main image replaced by external URL');
    }

    if (!new_image_url && !video_url && !work.video_url) {
      return res.status(400).json({ error: 'Image or YouTube URL is required' });
    }

    // Handle additional images
    let newImages;
    if (req.body.keep_existing_images !== undefined) {
      newImages = parseList(req.body.keep_existing_images);
    } else {
      // If keep_existing_images is NOT sent, keep ALL existing images by default
      // This prevents accidental deletion when the frontend doesn't send this field
      newImages = [...(work.images || [])];
      console.log(`ℹ️ keep_existing_images not provided for work "${work.title}", keeping all ${newImages.length} existing images`);
    }

    // Delete old images that are no longer in the keep list (only those explicitly removed)
    (work.images || []).forEach(img => {
      if (!newImages.includes(img)) {
        deleteLocalFile(img, `image removed during edit of "${work.title}"`);
      }
    });

    // Add newly uploaded images, then external image URLs
    if (req.files && req.files['images']) {
      newImages = newImages.concat(req.files['images'].map(toPublicUrl));
    }
    newImages = newImages.concat(parseList(req.body.external_images).map(convertDriveLink));

    const updated = store.updateWork(work.id, {
      title,
      title_th: title_th || '',
      title_en: title_en || '',
      title_jp: title_jp || '',
      description: description || '',
      description_th: description_th || '',
      description_en: description_en || '',
      description_jp: description_jp || '',
      tags,
      video_url: video_url || null,
      videos: parseList(req.body.videos),
      image_url: new_image_url,
      images: newImages
    });
    store.syncTags();

    res.json({ ...updated, message: 'Work updated successfully ✨' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Page routing (mirrors how GitHub Pages serves the same files) ---
app.get('*', (req, res) => {
  const page = req.path.slice(1); // remove leading /
  const htmlPath = path.join(PUBLIC_DIR, page.endsWith('.html') ? page : `${page}.html`);
  if (page && htmlPath.startsWith(PUBLIC_DIR + path.sep) && fs.existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🎨 Portfolio server running at http://localhost:${PORT}`);
  console.log(`   📁 Works page: http://localhost:${PORT}/works.html`);
  console.log(`   🔐 Admin page: http://localhost:${PORT}/admin.html`);
  console.log(`   💾 Data: public/data/*.json   🖼  Images: public/images/\n`);
});
