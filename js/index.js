// ============================================================
// Profile Page — index.js
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initScrollReveal();
  initSparkles();
  initNavScroll();
});

// --- Navigation Toggle ---
function initNav() {
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.classList.toggle('open');
    });
    // Close on link click
    links.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => links.classList.remove('open'));
    });
  }
}

// --- Scroll Reveal ---
function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, i * 150);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  reveals.forEach(el => observer.observe(el));
}

// --- Nav Scroll Effect ---
function initNavScroll() {
  const nav = document.getElementById('mainNav');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  });
}

// --- Sparkle Effect ---
function initSparkles() {
  const container = document.getElementById('sparkleContainer');
  if (!container) return;

  const colors = ['#c5a3ff', '#ffabd8', '#a8edca', '#ffb8a8', '#a8d8ff', '#ffe9a0'];

  function createSparkle() {
    const sparkle = document.createElement('div');
    sparkle.className = 'sparkle';
    sparkle.style.left = Math.random() * 100 + '%';
    sparkle.style.top = Math.random() * 100 + '%';
    sparkle.style.animationDuration = (3 + Math.random() * 4) + 's';
    sparkle.style.animationDelay = Math.random() * 3 + 's';

    const color = colors[Math.floor(Math.random() * colors.length)];
    sparkle.style.background = color;
    sparkle.style.setProperty('color', color);

    container.appendChild(sparkle);

    // Remove and recreate
    setTimeout(() => {
      sparkle.remove();
      createSparkle();
    }, (6 + Math.random() * 4) * 1000);
  }

  // Create initial sparkles
  for (let i = 0; i < 15; i++) {
    setTimeout(() => createSparkle(), i * 300);
  }
}
