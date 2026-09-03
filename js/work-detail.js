// ============================================================
// Work Detail Page — work-detail.js
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initNavScroll();
  loadWorkDetail();
  initFullscreen();
});

// --- State ---
let currentWork = null;
let allMedia = [];   // Array of { type: 'image'|'video', src: string, thumb: string }
let currentMediaIndex = 0;
let fullscreenIndex = 0;

window.addEventListener('languageChanged', () => {
  renderDetail();
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

// --- YouTube Helpers ---
function getYouTubeId(url) {
  if (!url) return null;
  const regex = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function getYouTubeThumbnail(url) {
  const id = getYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
}

// --- Load Work Detail ---
async function loadWorkDetail() {
  const params = new URLSearchParams(window.location.search);
  const workId = params.get('id');

  if (!workId) {
    showError();
    return;
  }

  try {
    currentWork = await PortfolioData.getWorkById(workId);
    if (!currentWork) {
      showError();
      return;
    }

    document.getElementById('detailLoading').style.display = 'none';
    document.getElementById('detailContainer').style.display = '';
    renderDetail();
  } catch (err) {
    console.error('Failed to load work detail:', err);
    showError();
  }
}

function showError() {
  document.getElementById('detailLoading').style.display = 'none';
  document.getElementById('detailError').style.display = 'block';
}

// --- Render Detail ---
function renderDetail() {
  const work = currentWork;
  if (!work) return;

  const lang = getCurrentLang();
  const title = work[`title_${lang}`] || work.title;
  const description = work[`description_${lang}`] || work.description;

  // Update page title
  document.title = `${title} — Amonphan Jamratsri ✨`;

  // Breadcrumb
  document.getElementById('breadcrumbTitle').textContent = title;

  // Build media array
  allMedia = [];

  // Main image first
  if (work.image_url) {
    allMedia.push({ type: 'image', src: work.image_url, thumb: work.image_url });
  }

  // Videos
  const videosToProcess = work.videos && work.videos.length > 0 ? [...work.videos] : [];
  if (work.video_url && !videosToProcess.includes(work.video_url)) {
    videosToProcess.unshift(work.video_url);
  }

  videosToProcess.forEach(vUrl => {
    const videoId = getYouTubeId(vUrl);
    if (videoId) {
      allMedia.push({
        type: 'video',
        src: `https://www.youtube.com/embed/${videoId}?rel=0`,
        thumb: getYouTubeThumbnail(vUrl),
        videoUrl: vUrl
      });
    }
  });

  // Additional images
  if (work.images && work.images.length > 0) {
    work.images.forEach(img => {
      allMedia.push({ type: 'image', src: img, thumb: img });
    });
  }

  // If no media at all, use a placeholder
  if (allMedia.length === 0) {
    allMedia.push({
      type: 'image',
      src: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 225'><rect width='400' height='225' fill='%23f0f0f0'/><text y='50%' x='50%' dominant-baseline='middle' text-anchor='middle' font-size='40'>🖼</text></svg>",
      thumb: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 225'><rect width='400' height='225' fill='%23f0f0f0'/><text y='50%' x='50%' dominant-baseline='middle' text-anchor='middle' font-size='40'>🖼</text></svg>"
    });
  }

  // Render gallery
  renderGallery();

  // Info panel — cover
  const infoCoverImg = document.getElementById('infoCoverImg');
  infoCoverImg.src = work.image_url || getYouTubeThumbnail(work.video_url) || '';
  infoCoverImg.alt = title;

  // Title
  document.getElementById('detailTitle').textContent = title;

  // Short description in info panel
  const descEl = document.getElementById('detailDesc');
  descEl.textContent = description || '';

  // Date
  const date = new Date(work.created_at);
  const dateStr = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  document.getElementById('detailDate').textContent = dateStr;

  // Video link
  if (work.video_url) {
    document.getElementById('videoRow').style.display = '';
    const videoLink = document.getElementById('detailVideoLink');
    videoLink.href = work.video_url;
  }

  // Image count
  const imgCount = allMedia.filter(m => m.type === 'image').length;
  const vidCount = allMedia.filter(m => m.type === 'video').length;
  let countText = `${imgCount} images`;
  if (vidCount > 0) countText += ` + ${vidCount} videos`;
  document.getElementById('detailImgCount').textContent = countText;

  // Tags
  const tagsContainer = document.getElementById('detailTags');
  const tags = work.tags.split(',').map(t => t.trim()).filter(Boolean);
  tagsContainer.innerHTML = tags.map(tag =>
    `<a href="works.html?tag=${encodeURIComponent(tag)}" class="detail-tag">${tag}</a>`
  ).join('');

  // Full description below
  if (description && description.length > 100) {
    document.getElementById('detailFullDesc').style.display = '';
    document.getElementById('fullDescContent').textContent = description;
  } else {
    document.getElementById('detailFullDesc').style.display = 'none';
  }
}

// --- Gallery ---
function renderGallery() {
  renderThumbnails();
  selectMedia(0);
  initThumbNav();
}

function renderThumbnails() {
  const container = document.getElementById('galleryThumbs');
  container.innerHTML = '';

  allMedia.forEach((media, index) => {
    const thumb = document.createElement('div');
    thumb.className = 'gallery-thumb';
    if (index === 0) thumb.classList.add('active');

    const img = document.createElement('img');
    img.src = media.thumb;
    img.alt = `Media ${index + 1}`;
    img.loading = 'lazy';
    thumb.appendChild(img);

    if (media.type === 'video') {
      const badge = document.createElement('div');
      badge.className = 'thumb-play-badge';
      badge.textContent = '▶';
      thumb.appendChild(badge);
    }

    thumb.addEventListener('click', () => selectMedia(index));
    container.appendChild(thumb);
  });
}

function selectMedia(index) {
  if (index < 0 || index >= allMedia.length) return;
  
  const animClass = index > currentMediaIndex ? 'slide-left' : 'slide-right';
  currentMediaIndex = index;

  const media = allMedia[index];
  const mainImg = document.getElementById('galleryMainImg');
  const mainVideo = document.getElementById('galleryMainVideo');

  if (media.type === 'video') {
    mainImg.style.display = 'none';
    mainVideo.style.display = '';
    mainVideo.src = media.src;
  } else {
    mainVideo.style.display = 'none';
    mainVideo.src = '';
    mainImg.style.display = '';
    mainImg.src = media.src;
    mainImg.alt = currentWork?.title || '';
    
    // Trigger animation
    mainImg.classList.remove('slide-left', 'slide-right');
    void mainImg.offsetWidth; // trigger reflow
    mainImg.classList.add(animClass);
  }

  // Update active thumb
  document.querySelectorAll('.gallery-thumb').forEach((thumb, i) => {
    thumb.classList.toggle('active', i === index);
  });

  // Scroll active thumb into view
  const activeThumb = document.querySelectorAll('.gallery-thumb')[index];
  if (activeThumb) {
    activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

function initThumbNav() {
  const container = document.getElementById('galleryThumbs');
  const prevBtn = document.getElementById('thumbPrev');
  const nextBtn = document.getElementById('thumbNext');
  const mainPrevBtn = document.getElementById('mainPrev');
  const mainNextBtn = document.getElementById('mainNext');

  // Main Image Navigation
  if (mainPrevBtn) {
    mainPrevBtn.addEventListener('click', () => {
      let nextIndex = currentMediaIndex - 1;
      if (nextIndex < 0) nextIndex = allMedia.length - 1; // loop around
      selectMedia(nextIndex);
    });
  }
  if (mainNextBtn) {
    mainNextBtn.addEventListener('click', () => {
      let nextIndex = currentMediaIndex + 1;
      if (nextIndex >= allMedia.length) nextIndex = 0; // loop around
      selectMedia(nextIndex);
    });
  }

  // Thumbnail Strip Scrolling & Image Navigation
  prevBtn.addEventListener('click', () => {
    container.scrollBy({ left: -240, behavior: 'smooth' });
    let nextIndex = currentMediaIndex - 1;
    if (nextIndex < 0) nextIndex = allMedia.length - 1;
    selectMedia(nextIndex);
  });

  nextBtn.addEventListener('click', () => {
    container.scrollBy({ left: 240, behavior: 'smooth' });
    let nextIndex = currentMediaIndex + 1;
    if (nextIndex >= allMedia.length) nextIndex = 0;
    selectMedia(nextIndex);
  });

  // Keyboard navigation for gallery
  document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('fullscreenOverlay');
    if (overlay.classList.contains('active')) return; // fullscreen handles its own keys

    if (e.key === 'ArrowLeft') {
      selectMedia(currentMediaIndex - 1);
    } else if (e.key === 'ArrowRight') {
      selectMedia(currentMediaIndex + 1);
    }
  });

  // Fullscreen button
  document.getElementById('fullscreenBtn').addEventListener('click', () => {
    if (allMedia[currentMediaIndex]?.type === 'image') {
      openFullscreen(currentMediaIndex);
    }
  });

  // Click main image to go fullscreen
  document.getElementById('galleryMainImg').addEventListener('click', () => {
    openFullscreen(currentMediaIndex);
  });
}

// --- Fullscreen Lightbox ---
function initFullscreen() {
  const overlay = document.getElementById('fullscreenOverlay');
  const closeBtn = document.getElementById('fullscreenClose');
  const prevBtn = document.getElementById('fullscreenPrev');
  const nextBtn = document.getElementById('fullscreenNext');

  closeBtn.addEventListener('click', closeFullscreen);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeFullscreen();
  });

  prevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigateFullscreen(-1);
  });

  nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigateFullscreen(1);
  });

  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('active')) return;
    if (e.key === 'Escape') closeFullscreen();
    if (e.key === 'ArrowLeft') navigateFullscreen(-1);
    if (e.key === 'ArrowRight') navigateFullscreen(1);
  });
}

function openFullscreen(startIndex) {
  // Only images in fullscreen
  const imageIndices = allMedia
    .map((m, i) => m.type === 'image' ? i : -1)
    .filter(i => i >= 0);

  if (imageIndices.length === 0) return;

  // Find closest image index
  let fsIdx = imageIndices.indexOf(startIndex);
  if (fsIdx === -1) fsIdx = 0;
  fullscreenIndex = fsIdx;

  updateFullscreenImage(imageIndices);

  const overlay = document.getElementById('fullscreenOverlay');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeFullscreen() {
  const overlay = document.getElementById('fullscreenOverlay');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

function navigateFullscreen(direction) {
  const imageIndices = allMedia
    .map((m, i) => m.type === 'image' ? i : -1)
    .filter(i => i >= 0);

  if (imageIndices.length === 0) return;

  fullscreenIndex += direction;
  if (fullscreenIndex < 0) fullscreenIndex = imageIndices.length - 1;
  if (fullscreenIndex >= imageIndices.length) fullscreenIndex = 0;

  updateFullscreenImage(imageIndices);
}

function updateFullscreenImage(imageIndices) {
  const mediaIdx = imageIndices[fullscreenIndex];
  const media = allMedia[mediaIdx];
  const img = document.getElementById('fullscreenImg');
  img.src = media.src;
  img.alt = currentWork?.title || '';

  const counter = document.getElementById('fullscreenCounter');
  counter.textContent = `${fullscreenIndex + 1} / ${imageIndices.length}`;

  // Also select in main gallery
  selectMedia(mediaIdx);
}
