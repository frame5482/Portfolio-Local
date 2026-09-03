// ============================================================
// One-off migration: MongoDB + Cloudinary  ->  JSON + local images
// ------------------------------------------------------------
//   node scripts/migrate-from-mongo.js
//
// Reads every work/tag out of the MongoDB in MONGODB_URI, downloads
// each remote image into public/images/, and writes public/data/*.json.
// Safe to re-run: already-downloaded images are reused.
// ============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const LEGACY_UPLOADS_DIR = path.join(ROOT, 'uploads');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in .env — nothing to migrate from.');
  process.exit(1);
}

for (const dir of [IMAGES_DIR, DATA_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/avif': '.avif'
};

// url -> local relative path, so a shared image is only downloaded once
const downloaded = new Map();

function safeName(input, ext) {
  const base = path
    .basename(input, path.extname(input))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'image';
  const hash = crypto.createHash('md5').update(input).digest('hex').slice(0, 8);
  return `${base}-${hash}${ext}`;
}

async function downloadImage(url) {
  if (downloaded.has(url)) return downloaded.get(url);

  let res;
  try {
    res = await fetch(url, { redirect: 'follow' });
  } catch (err) {
    console.warn(`   ⚠️  Download failed (${err.message}) — keeping original URL`);
    return url;
  }

  if (!res.ok) {
    console.warn(`   ⚠️  HTTP ${res.status} — keeping original URL: ${url}`);
    return url;
  }

  const mime = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!mime.startsWith('image/')) {
    console.warn(`   ⚠️  Not an image (${mime || 'unknown'}) — keeping original URL: ${url}`);
    return url;
  }

  const urlPath = (() => {
    try { return new URL(url).pathname; } catch (e) { return url; }
  })();
  const ext = EXT_BY_MIME[mime] || path.extname(urlPath) || '.jpg';
  const filename = safeName(urlPath, ext);
  const dest = path.join(IMAGES_DIR, filename);

  if (!fs.existsSync(dest)) {
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buffer);
    console.log(`   ⬇️  ${filename} (${(buffer.length / 1024).toFixed(0)} KB)`);
  } else {
    console.log(`   ♻️  ${filename} (already downloaded)`);
  }

  const relative = `images/${filename}`;
  downloaded.set(url, relative);
  return relative;
}

// Copy a file left over from the old local-uploads version
function adoptLegacyUpload(url) {
  const filename = path.basename(url);
  const source = path.join(LEGACY_UPLOADS_DIR, filename);
  if (!fs.existsSync(source)) {
    console.warn(`   ⚠️  Missing legacy upload: ${filename}`);
    return url;
  }
  const dest = path.join(IMAGES_DIR, filename);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(source, dest);
    console.log(`   📁 copied ${filename} from uploads/`);
  }
  return `images/${filename}`;
}

async function localizeUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:')) return trimmed;
  if (trimmed.startsWith('images/') || trimmed.startsWith('/images/')) {
    return trimmed.replace(/^\/+/, '');
  }
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/')) {
    return adoptLegacyUpload(trimmed);
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return downloadImage(trimmed);
  }
  return trimmed;
}

async function main() {
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('📦 Connected.\n');

  const db = mongoose.connection.db;
  const works = await db.collection('works').find({}).toArray();
  const tags = await db.collection('tags').find({}).toArray();
  console.log(`📊 Found ${works.length} works and ${tags.length} tags.\n`);

  const migrated = [];
  for (const w of works) {
    console.log(`🎨 ${w.title || '(untitled)'}`);
    const image_url = await localizeUrl(w.image_url || '');

    const images = [];
    for (const img of w.images || []) {
      images.push(await localizeUrl(img));
    }

    migrated.push({
      id: String(w._id),
      title: w.title || '',
      title_th: w.title_th || '',
      title_en: w.title_en || '',
      title_jp: w.title_jp || '',
      description: w.description || '',
      description_th: w.description_th || '',
      description_en: w.description_en || '',
      description_jp: w.description_jp || '',
      image_url,
      images: images.filter(Boolean),
      video_url: w.video_url || null,
      videos: w.videos || [],
      tags: w.tags || '',
      is_starred: w.is_starred === true,
      order: typeof w.order === 'number' ? w.order : 0,
      created_at: w.created_at ? new Date(w.created_at).toISOString() : new Date().toISOString()
    });
  }

  const migratedTags = tags.map(t => ({
    id: String(t._id),
    name: t.name || '',
    order: typeof t.order === 'number' ? t.order : 999,
    is_highlighted: t.is_highlighted === true
  }));

  const store = require('../db/store');
  store.saveWorks(migrated);
  store.saveTags(migratedTags);
  store.syncTags();

  console.log(`\n✅ Wrote public/data/works.json (${migrated.length} works)`);
  console.log(`✅ Wrote public/data/tags.json (${migratedTags.length} tags)`);
  console.log(`🖼  Images are in public/images/\n`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
