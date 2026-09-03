// ============================================================
// Admin Page — admin.js
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initNavScroll();
  checkAuth();
  initLogin();
  initUpload();
  initFileUpload();
  initMultiFileUpload();
  initDynamicInputs();
  initLogout();
  checkServerAvailable();
});

let authToken = localStorage.getItem('artfolio_token') || null;
let editingId = null;
let existingImages = []; // For editing — images to keep

window.addEventListener('languageChanged', () => {
  loadAdminWorks();
});

// --- Cropper State ---
let cropper = null;
let croppedBlob = null;
let originalFileName = "";

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

// --- Auth Check ---
function checkAuth() {
  if (authToken) {
    showAdminPanel();
    loadAdminWorks();
    loadAdminTags();
  }
}

function showAdminPanel() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('uploadSection').classList.add('visible');
  document.getElementById('worksListSection').classList.add('visible');
  document.getElementById('tagManagerSection').classList.add('visible');
  document.getElementById('adminTopbar').classList.add('visible');
}

function hideAdminPanel() {
  document.getElementById('loginSection').style.display = '';
  document.getElementById('uploadSection').classList.remove('visible');
  document.getElementById('worksListSection').classList.remove('visible');
  document.getElementById('tagManagerSection').classList.remove('visible');
  document.getElementById('adminTopbar').classList.remove('visible');
}

// --- Login ---
function initLogin() {
  const form = document.getElementById('loginForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('passwordInput').value;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Incorrect password', 'error');
        return;
      }
      authToken = data.token;
      localStorage.setItem('artfolio_token', authToken);
      showToast('Login successful! ✨');
      showAdminPanel();
      loadAdminWorks();
      loadAdminTags();
    } catch (err) {
      showToast('Cannot reach the server — run "npm start" locally', 'error');
      showOfflineNotice();
    }
  });
}

// The admin API only exists when the local Express server is running.
// On a static host (GitHub Pages) there is nothing to talk to.
async function checkServerAvailable() {
  try {
    const res = await fetch('api/tags', { cache: 'no-store' });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('application/json')) throw new Error('no API');
  } catch (err) {
    showOfflineNotice();
  }
}

function showOfflineNotice() {
  const notice = document.getElementById('offlineNotice');
  if (notice) notice.style.display = 'block';
}

// --- Logout ---
function initLogout() {
  document.getElementById('logoutBtn').addEventListener('click', () => {
    authToken = null;
    localStorage.removeItem('artfolio_token');
    hideAdminPanel();
    document.getElementById('passwordInput').value = '';
    showToast('Logged out');
  });
}

// --- File Upload Preview (Main Image) ---
function initFileUpload() {
  const area = document.getElementById('fileUploadArea');
  const input = document.getElementById('workImage');
  const preview = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');

  input.addEventListener('change', () => {
    if (input.files && input.files[0]) {
      openCropper(input.files[0]);
    }
  });

  const removeImgBtn = document.getElementById('removeImgBtn');
  if (removeImgBtn) {
    removeImgBtn.addEventListener('click', () => {
      input.value = '';
      croppedBlob = null;
      document.getElementById('workImageUrl').value = '';
      previewImg.src = '';
      preview.classList.remove('visible');
    });
  }

  const workImageUrl = document.getElementById('workImageUrl');
  workImageUrl.addEventListener('input', () => {
    if (workImageUrl.value.trim()) {
      previewImg.src = workImageUrl.value.trim();
      preview.classList.add('visible');
      input.value = ''; // clear file if url is entered
    } else if (!input.files[0]) {
      preview.classList.remove('visible');
    }
  });

  // Drag & drop
  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    area.classList.add('dragover');
  });
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

// --- Multi-File Upload (Gallery Images) ---
let pendingGalleryFiles = []; // New files to upload

function initMultiFileUpload() {
  const area = document.getElementById('multiFileUploadArea');
  const input = document.getElementById('workImages');

  input.addEventListener('change', () => {
    if (input.files.length > 0) {
      for (const file of input.files) {
        pendingGalleryFiles.push(file);
      }
      renderMultiPreviews();
    }
  });

  // Drag & drop
  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    area.classList.add('dragover');
  });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      for (const file of e.dataTransfer.files) {
        if (file.type.startsWith('image/')) {
          pendingGalleryFiles.push(file);
        }
      }
      renderMultiPreviews();
    }
  });
}

// --- Cropper Functions ---
function openCropper(file) {
  originalFileName = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    const modal = document.getElementById('cropperModal');
    const image = document.getElementById('cropperImage');
    image.src = e.target.result;
    modal.style.display = 'flex';

    if (cropper) cropper.destroy();
    cropper = new Cropper(image, {
      aspectRatio: 16 / 9,
      viewMode: 2,
      background: false
    });
  };
  reader.readAsDataURL(file);
}

function closeCropper() {
  document.getElementById('cropperModal').style.display = 'none';
  if (cropper) cropper.destroy();
  // If we canceled and don't have a cropped blob yet, clear the input
  if (!croppedBlob) {
    document.getElementById('workImage').value = '';
  }
}

function applyCrop() {
  if (!cropper) return;
  const canvas = cropper.getCroppedCanvas({
    width: 1920, // High quality limit
    height: 1080
  });

  canvas.toBlob((blob) => {
    croppedBlob = blob;
    const previewImg = document.getElementById('previewImg');
    const preview = document.getElementById('imagePreview');
    previewImg.src = URL.createObjectURL(blob);
    preview.classList.add('visible');
    closeCropper();
  }, 'image/jpeg', 0.9);
}

window.closeCropper = closeCropper;
window.applyCrop = applyCrop;


function renderMultiPreviews() {
  const container = document.getElementById('multiImagePreviews');
  container.innerHTML = '';

  // Existing images (when editing)
  existingImages.forEach((url, idx) => {
    const wrapper = createPreviewItem(url, 'existing', idx);
    container.appendChild(wrapper);
  });

  // New files
  pendingGalleryFiles.forEach((file, idx) => {
    const url = URL.createObjectURL(file);
    const wrapper = createPreviewItem(url, 'new', idx, file.name);
    container.appendChild(wrapper);
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

// --- Dynamic Inputs (Videos & External Images) ---
function initDynamicInputs() {
  document.getElementById('addVideoBtn').addEventListener('click', () => {
    addDynamicInput('videoInputsContainer', 'videos', 'work-video-input', 'e.g., https://www.youtube.com/watch?v=xxxxx');
  });

  document.getElementById('addExternalImageBtn').addEventListener('click', () => {
    addDynamicInput('externalImageInputsContainer', 'external_images', 'work-ext-image-input', 'Insert additional image link (e.g., https://...)');
  });

  // Event delegation for remove buttons
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

// --- Upload Work ---
function initUpload() {
  const form = document.getElementById('uploadForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Collect videos
    const videoInputs = document.querySelectorAll('.work-video-input');
    const videos = Array.from(videoInputs).map(i => i.value.trim()).filter(Boolean);
    const videoUrl = videos.length > 0 ? videos[0] : ''; // use first video as main video

    // Collect external images
    const extImgInputs = document.querySelectorAll('.work-ext-image-input');
    const externalImages = Array.from(extImgInputs).map(i => i.value.trim()).filter(Boolean);

    const imageFile = document.getElementById('workImage').files[0];
    const externalImageUrl = document.getElementById('workImageUrl').value.trim();

    if (!imageFile && !videoUrl && !externalImageUrl) {
      showToast('Please insert an image or YouTube URL', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('title', document.getElementById('workTitle').value);
    formData.append('title_th', document.getElementById('workTitleTh').value);
    formData.append('title_en', document.getElementById('workTitleEn').value);
    formData.append('title_jp', document.getElementById('workTitleJp').value);
    formData.append('description', document.getElementById('workTitle').value); // fallback
    formData.append('description_th', document.getElementById('workDescTh').value);
    formData.append('description_en', document.getElementById('workDescEn').value);
    formData.append('description_jp', document.getElementById('workDescJp').value);
    formData.append('tags', document.getElementById('workTags').value);
    if (videoUrl) formData.append('video_url', videoUrl);
    videos.forEach(v => formData.append('videos', v));

    if (externalImageUrl) formData.append('external_image_url', externalImageUrl);
    externalImages.forEach(img => formData.append('external_images', img));
    
    if (croppedBlob) {
      formData.append('image', croppedBlob, originalFileName || 'cropped_image.jpg');
    } else if (imageFile) {
      formData.append('image', imageFile);
    }

    // Append gallery images
    pendingGalleryFiles.forEach(file => {
      formData.append('images', file);
    });

    // For editing, ALWAYS send list of existing images to keep (even if empty)
    // This tells the server exactly which images to retain
    if (editingId) {
      formData.append('keep_existing_images', JSON.stringify(existingImages));
    }

    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/works/${editingId}` : '/api/works';

    const submitBtn = document.getElementById('submitBtn');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '⏳ Uploading...';
    submitBtn.disabled = true;

    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url);
        xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const loadedMB = (e.loaded / 1024 / 1024).toFixed(1);
            const totalMB = (e.total / 1024 / 1024).toFixed(1);
            submitBtn.innerHTML = `⏳ Uploading... ${loadedMB}/${totalMB}MB`;
          }
        };

        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data);
            } else {
              if (xhr.status === 401) {
                authToken = null;
                localStorage.removeItem('artfolio_token');
                hideAdminPanel();
                reject({ error: 'Session expired, please login again' });
              } else {
                reject(data);
              }
            }
          } catch(err) {
            reject({ error: 'Error reading data' });
          }
        };

        xhr.onerror = () => reject({ error: 'Network error: failed to connect' });
        xhr.send(formData);
      });

      // Upload success - Show checkmarks on previews
      const previews = document.querySelectorAll('#imagePreview.visible, #multiImagePreviews .gallery-preview-item');
      previews.forEach(el => {
        const tick = document.createElement('div');
        tick.innerHTML = '✅';
        tick.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); font-size:3rem; z-index:10; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5)); animation: cardFadeIn 0.3s ease;';
        el.style.position = 'relative';
        el.appendChild(tick);
      });

      if (previews.length > 0) {
        await new Promise(r => setTimeout(r, 1000)); // wait 1 sec to let user see ticks
      }

      showToast(editingId ? 'Update successful! ✨' : 'Upload successful! ✨');
      cancelEdit();
      loadAdminWorks();
      loadAdminTags();
    } catch (err) {
      console.error('Upload error:', err);
      showToast(err.error || 'Error uploading', 'error');
    } finally {
      submitBtn.innerHTML = originalBtnText;
      submitBtn.disabled = false;
    }
  });

  document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
}

function cancelEdit() {
  editingId = null;
  existingImages = [];
  pendingGalleryFiles = [];
  document.getElementById('workTitleTh').value = '';
  document.getElementById('workTitleEn').value = '';
  document.getElementById('workTitleJp').value = '';
  document.getElementById('workDescTh').value = '';
  document.getElementById('workDescEn').value = '';
  document.getElementById('workDescJp').value = '';
  croppedBlob = null;
  document.getElementById('imagePreview').classList.remove('visible');
  document.getElementById('previewImg').src = '';
  document.getElementById('multiImagePreviews').innerHTML = '';
  // Reset dynamic inputs
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

// --- Load Admin Works List ---
async function loadAdminWorks() {
  try {
    const res = await fetch('/api/works');
    const works = await res.json();
    const container = document.getElementById('worksList');

    window.adminWorks = works; // Store globally for editing

    if (!Array.isArray(works) || works.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="emoji">📭</div><p>No works yet (or database connection failed)</p></div>';
      return;
    }

    container.innerHTML = works.map((work, index) => {
      const thumbSrc = work.image_url || getYouTubeThumbnail(work.video_url);
      const videoBadge = work.video_url ? '<span style="color:var(--peach-dark);font-size:0.75rem;">🎬 YouTube</span>' : '';
      const imgCount = 1 + (work.images ? work.images.length : 0);
      const imgBadge = imgCount > 1 ? `<span style="color:var(--lavender-dark);font-size:0.75rem;">🖼 ${imgCount} images</span>` : '';
      
      const isStarred = work.is_starred === true;
      const title = work[`title_${getCurrentLang()}`] || work.title;

      return `
      <div class="admin-work-item ${isStarred ? 'starred-item' : ''}" data-id="${work.id}" draggable="true" ondragstart="dragStart(event)" ondragover="dragOver(event)" ondrop="drop(event)" ondragenter="dragEnter(event)" ondragleave="dragLeave(event)" ondragend="dragEnd(event)">
        <div class="drag-handle">⋮⋮</div>
        <img src="${thumbSrc}" alt="${title}" class="admin-work-thumb" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 100 100\\'><rect width=\\'100\\' height=\\'100\\' fill=\\'%23f0f0f0\\'/><text y=\\'50%\\' x=\\'50%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'40\\'>🖼</text></svg>'">
        <div class="admin-work-info">
          <h3>${title} ${isStarred ? '<span class="star-badge-text">⭐ Featured</span>' : ''}</h3>
          <p>${work.tags} ${videoBadge} ${imgBadge}</p>
        </div>
        <div style="display: flex; gap: 5px; align-items: center;">
          <button class="btn btn-sm ${work.starBtnClass}" onclick="event.stopPropagation(); toggleStar('${work.id}')" title="Star this work to keep it at the top">${work.starIcon}</button>
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); editWork('${work.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteWork('${work.id}')">🗑</button>
        </div>
      </div>
    `;
    }).join('');
  } catch (err) {
    console.error('Failed to load works:', err);
  }
}

// --- Toggle Star ---
window.toggleStar = async function(id) {
  try {
    const res = await fetch(`/api/works/${id}/star`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      console.log(`✅ Star toggled for ${id}`);
      loadAdminWorks();
    } else {
      const errData = await res.json();
      console.error('❌ Star toggle failed:', errData);
    }
  } catch (err) {
    console.error('Toggle star error:', err);
  }
};

// --- Drag and Drop Reordering ---
let dragSource = null;

window.dragStart = function(e) {
  dragSource = e.currentTarget;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging');
};

window.dragOver = function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
};

window.dragEnter = function(e) {
  e.currentTarget.classList.add('drag-over');
};

window.dragLeave = function(e) {
  e.currentTarget.classList.remove('drag-over');
};

window.drop = async function(e) {
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
  
  if (dragSource && dragSource !== e.currentTarget) {
    const allItems = Array.from(document.querySelectorAll('.admin-work-item'));
    const sourceIndex = allItems.indexOf(dragSource);
    const targetIndex = allItems.indexOf(e.currentTarget);
    
    const list = document.getElementById('worksList');
    if (sourceIndex < targetIndex) {
      list.insertBefore(dragSource, e.currentTarget.nextSibling);
    } else {
      list.insertBefore(dragSource, e.currentTarget);
    }
    
    // Save order
    const orderedIds = Array.from(document.querySelectorAll('.admin-work-item')).map(item => item.dataset.id);
    
    try {
      await fetch('/api/works/reorder', {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderedIds })
      });
      // reload to sort starred properly
      loadAdminWorks();
    } catch (err) {
      console.error('Reorder error:', err);
    }
  }
  return false;
};

window.dragEnd = function(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.admin-work-item').forEach(el => el.classList.remove('drag-over'));
};

// --- Edit Work ---
function editWork(id) {
  const work = window.adminWorks.find(w => w.id === id);
  if (!work) return;

  editingId = id;
  document.getElementById('workTitle').value = work.title;
  document.getElementById('workTitleTh').value = work.title_th || '';
  document.getElementById('workTitleEn').value = work.title_en || '';
  document.getElementById('workTitleJp').value = work.title_jp || '';
  document.getElementById('workDescTh').value = work.description_th || '';
  document.getElementById('workDescEn').value = work.description_en || '';
  document.getElementById('workDescJp').value = work.description_jp || '';
  document.getElementById('workTags').value = work.tags;
  
  // Populate videos
  document.getElementById('videoInputsContainer').innerHTML = '';
  const workVideos = work.videos && work.videos.length > 0 ? work.videos : (work.video_url ? [work.video_url] : []);
  if (workVideos.length === 0) {
    addDynamicInput('videoInputsContainer', 'videos', 'work-video-input', 'e.g., https://www.youtube.com/watch?v=xxxxx');
    document.querySelector('#videoInputsContainer .remove-input-btn').style.display = 'none';
  } else {
    workVideos.forEach(v => {
      addDynamicInput('videoInputsContainer', 'videos', 'work-video-input', 'e.g., https://www.youtube.com/watch?v=xxxxx', v);
    });
  }

  // Populate external image links (since images includes both local and external, we extract only external for these inputs, OR we just show them in the multiImagePreviews. Let's just reset the external image inputs because existing images are managed by the multiImagePreviews container)
  document.getElementById('externalImageInputsContainer').innerHTML = `
    <div class="dynamic-input-row" style="display:flex; gap:10px; margin-bottom:0.5rem;">
      <input type="url" name="external_images" class="work-ext-image-input" placeholder="Insert additional image link (e.g., https://...)" style="flex:1;">
      <button type="button" class="btn btn-secondary btn-sm remove-input-btn" style="padding:0 0.8rem; font-size:1.2rem; display:none;">✕</button>
    </div>
  `;
  
  if (work.image_url && work.image_url.startsWith('http')) {
    document.getElementById('workImageUrl').value = work.image_url;
  } else {
    document.getElementById('workImageUrl').value = '';
  }

  if (work.image_url) {
    document.getElementById('previewImg').src = work.image_url;
    document.getElementById('imagePreview').classList.add('visible');
  } else {
    document.getElementById('imagePreview').classList.remove('visible');
  }

  // Load existing gallery images
  existingImages = work.images ? [...work.images] : [];
  pendingGalleryFiles = [];
  renderMultiPreviews();

  document.getElementById('submitBtn').innerHTML = '💾 Save Changes';
  document.getElementById('cancelEditBtn').style.display = 'block';
  document.querySelector('.upload-card h2').textContent = '✏️ Edit Work';
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Delete Work ---
async function deleteWork(id) {
  if (!confirm('Are you sure you want to delete this work?')) return;
  try {
    const res = await fetch(`/api/works/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) {
      const data = await res.json();
      if (res.status === 401) {
        authToken = null;
        localStorage.removeItem('artfolio_token');
        hideAdminPanel();
        showToast('Session expired', 'error');
        return;
      }
      showToast(data.error || 'Delete failed', 'error');
      return;
    }
    showToast('Delete successful');
    loadAdminWorks();
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}

// --- YouTube Helpers ---
function getYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([\\w-]{11})/);
  return match ? match[1] : null;
}

function getYouTubeThumbnail(url) {
  const id = getYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
}

// ============================================================
// Tag Manager
// ============================================================

let adminTags = [];
let tagDragSource = null;

async function loadAdminTags() {
  try {
    const res = await fetch('/api/tags');
    adminTags = await res.json();
    renderTagManager();
  } catch (err) {
    console.error('Failed to load tags:', err);
  }
}

function renderTagManager() {
  const container = document.getElementById('tagManagerList');
  const emptyState = document.getElementById('tagManagerEmpty');

  if (!adminTags || adminTags.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  container.innerHTML = adminTags.map((tag, index) => {
    const highlightClass = tag.is_highlighted ? 'tag-highlighted' : '';
    const highlightBtnClass = tag.is_highlighted ? 'btn-highlight-active' : 'btn-secondary';
    const highlightIcon = tag.is_highlighted ? '✨' : '☆';
    const orderBadge = `<span class="tag-order-badge">#${index + 1}</span>`;

    return `
      <div class="tag-manager-item ${highlightClass}" data-tag-id="${tag.id}" draggable="true">
        <div class="tag-drag-handle" title="Drag to reorder">⋮⋮</div>
        ${orderBadge}
        <span class="tag-name">${tag.name}</span>
        <div class="tag-actions">
          <button class="btn btn-sm ${highlightBtnClass} tag-highlight-btn" 
                  onclick="event.stopPropagation(); toggleTagHighlight('${tag.id}')" 
                  title="${tag.is_highlighted ? 'Remove highlight' : 'Highlight this tag'}">
            ${highlightIcon}
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Attach drag events
  container.querySelectorAll('.tag-manager-item').forEach(item => {
    item.addEventListener('dragstart', tagDragStart);
    item.addEventListener('dragover', tagDragOver);
    item.addEventListener('dragenter', tagDragEnter);
    item.addEventListener('dragleave', tagDragLeave);
    item.addEventListener('drop', tagDrop);
    item.addEventListener('dragend', tagDragEnd);
  });
}

// --- Tag Drag & Drop ---
function tagDragStart(e) {
  tagDragSource = e.currentTarget;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('tag-dragging');
}

function tagDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function tagDragEnter(e) {
  e.currentTarget.classList.add('tag-drag-over');
}

function tagDragLeave(e) {
  e.currentTarget.classList.remove('tag-drag-over');
}

async function tagDrop(e) {
  e.stopPropagation();
  e.currentTarget.classList.remove('tag-drag-over');

  if (tagDragSource && tagDragSource !== e.currentTarget) {
    const allItems = Array.from(document.querySelectorAll('.tag-manager-item'));
    const sourceIndex = allItems.indexOf(tagDragSource);
    const targetIndex = allItems.indexOf(e.currentTarget);
    const list = document.getElementById('tagManagerList');

    if (sourceIndex < targetIndex) {
      list.insertBefore(tagDragSource, e.currentTarget.nextSibling);
    } else {
      list.insertBefore(tagDragSource, e.currentTarget);
    }

    // Save new order
    const orderedIds = Array.from(document.querySelectorAll('.tag-manager-item')).map(item => item.dataset.tagId);
    try {
      await fetch('/api/tags/reorder', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderedIds })
      });
      showToast('Tag order saved! 🏷️');
      loadAdminTags();
    } catch (err) {
      console.error('Tag reorder error:', err);
      showToast('Failed to reorder tags', 'error');
    }
  }
}

function tagDragEnd(e) {
  e.currentTarget.classList.remove('tag-dragging');
  document.querySelectorAll('.tag-manager-item').forEach(el => el.classList.remove('tag-drag-over'));
}

// --- Toggle Tag Highlight ---
window.toggleTagHighlight = async function(id) {
  try {
    const res = await fetch(`/api/tags/${id}/highlight`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      showToast(data.is_highlighted ? 'Tag highlighted! ✨' : 'Highlight removed');
      loadAdminTags();
    } else {
      const errData = await res.json();
      console.error('Highlight toggle failed:', errData);
      showToast('Failed to toggle highlight', 'error');
    }
  } catch (err) {
    console.error('Toggle highlight error:', err);
    showToast('Failed to toggle highlight', 'error');
  }
};
