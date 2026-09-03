// ============================================================
// Data Source — data-source.js
// ------------------------------------------------------------
// The public pages read the portfolio straight out of the JSON
// files in public/data/, so they work as plain static files
// (GitHub Pages) with no server and no database.
// The Express server is only needed for the admin page.
// ============================================================

const PortfolioData = (() => {
  const WORKS_URL = 'data/works.json';
  const TAGS_URL = 'data/tags.json';

  let worksPromise = null;
  let tagsPromise = null;

  async function fetchJson(url, fallback) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data : fallback;
    } catch (err) {
      console.error(`Failed to load ${url}:`, err);
      return fallback;
    }
  }

  // Images are stored as repo-relative paths ("images/foo.png") so the site
  // works from any base path. External links are passed through untouched.
  function resolveUrl(url) {
    if (!url) return '';
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    return url.replace(/^\/+/, '');
  }

  function normalizeWork(w) {
    return {
      id: w.id,
      title: w.title || '',
      title_th: w.title_th || '',
      title_en: w.title_en || '',
      title_jp: w.title_jp || '',
      description: w.description || '',
      description_th: w.description_th || '',
      description_en: w.description_en || '',
      description_jp: w.description_jp || '',
      image_url: resolveUrl(w.image_url),
      images: (w.images || []).map(resolveUrl).filter(Boolean),
      video_url: w.video_url || null,
      videos: w.videos || [],
      tags: w.tags || '',
      is_starred: w.is_starred === true,
      order: typeof w.order === 'number' ? w.order : 0,
      created_at: w.created_at || null
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

  function getWorks() {
    if (!worksPromise) {
      worksPromise = fetchJson(WORKS_URL, []).then(rows => sortWorks(rows.map(normalizeWork)));
    }
    return worksPromise;
  }

  async function getWorkById(id) {
    const works = await getWorks();
    return works.find(w => String(w.id) === String(id)) || null;
  }

  // Tag list is derived from the works themselves, then enriched with the
  // order / highlight metadata saved in tags.json.
  function getTags() {
    if (!tagsPromise) {
      tagsPromise = (async () => {
        const [works, meta] = await Promise.all([getWorks(), fetchJson(TAGS_URL, [])]);
        const byName = new Map(meta.map(t => [t.name, t]));

        const names = new Set();
        works.forEach(w => {
          (w.tags || '').split(',').forEach(t => {
            const trimmed = t.trim();
            if (trimmed) names.add(trimmed);
          });
        });

        return [...names]
          .map(name => {
            const m = byName.get(name) || {};
            return {
              id: m.id || name,
              name,
              order: typeof m.order === 'number' ? m.order : 999,
              is_highlighted: m.is_highlighted === true
            };
          })
          .sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));
      })();
    }
    return tagsPromise;
  }

  return { getWorks, getWorkById, getTags, resolveUrl };
})();
