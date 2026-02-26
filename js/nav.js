// ═══════════════════════════════════════════════════
// NephroView — Shared Navigation Component
// ═══════════════════════════════════════════════════

export function initNavigation() {
  const navbar = document.getElementById('navbar');
  const navToggle = document.getElementById('nav-toggle');
  const navMenu = document.querySelector('.nav-menu');

  // ─── Scroll Glass Effect ───
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
    lastScroll = y;
  });

  // ─── Mobile Toggle ───
  navToggle?.addEventListener('click', () => {
    navMenu?.classList.toggle('open');
    navToggle.classList.toggle('active');
  });

  // ─── Dropdown on hover (desktop) / click (mobile) ───
  document.querySelectorAll('.nav-dropdown').forEach(dd => {
    const trigger = dd.querySelector('.nav-dropdown-trigger');

    trigger?.addEventListener('click', (e) => {
      if (window.innerWidth <= 900) {
        e.preventDefault();
        dd.classList.toggle('open');
      }
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown') && window.innerWidth <= 900) {
      document.querySelectorAll('.nav-dropdown.open').forEach(d => d.classList.remove('open'));
    }
  });

  // ─── Mark active page ───
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav-menu a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '/' && href === '/')) {
      link.classList.add('active');
    }
  });
}

/**
 * Injects the shared navigation HTML into #navbar.
 * Call this before initNavigation().
 */
export function renderNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  navbar.innerHTML = `
    <div class="nav-container">
      <a href="/" class="nav-logo">
        <span class="logo-icon">🫘</span>
        <span class="logo-text">Nephro<span class="logo-accent">View</span></span>
      </a>

      <div class="nav-menu">
        <div class="nav-dropdown">
          <button class="nav-dropdown-trigger">🎓 Learn <span class="chevron">▾</span></button>
          <div class="nav-dropdown-panel">
            <a href="/learn-ckd.html" class="dd-link">
              <span class="dd-icon">🫘</span>
              <div><strong>Understanding CKD</strong><small>Kidney disease stages & eGFR</small></div>
            </a>
            <a href="/learn-pd.html" class="dd-link">
              <span class="dd-icon">💧</span>
              <div><strong>What is PD?</strong><small>Peritoneal dialysis explained</small></div>
            </a>
            <a href="/learn-comparison.html" class="dd-link">
              <span class="dd-icon">⚖️</span>
              <div><strong>PD vs Hemodialysis</strong><small>Side-by-side comparison</small></div>
            </a>
            <a href="/learn-daily-life.html" class="dd-link">
              <span class="dd-icon">🌅</span>
              <div><strong>Life on PD</strong><small>Daily routine & lifestyle</small></div>
            </a>
          </div>
        </div>

        <div class="nav-dropdown">
          <button class="nav-dropdown-trigger">🔬 Equipment <span class="chevron">▾</span></button>
          <div class="nav-dropdown-panel">
            <a href="/viewer.html" class="dd-link">
              <span class="dd-icon">📱</span>
              <div><strong>APD Machine Viewer</strong><small>3D & AR exploration</small></div>
            </a>
            <a href="/supply-gallery.html" class="dd-link">
              <span class="dd-icon">🧴</span>
              <div><strong>Supply Kit Gallery</strong><small>Everything in your kit</small></div>
            </a>
            <a href="/supply-storage.html" class="dd-link">
              <span class="dd-icon">📦</span>
              <div><strong>Storage Optimizer</strong><small>AR supply room planner</small></div>
            </a>
            <a href="/catheter-guide.html" class="dd-link">
              <span class="dd-icon">🩺</span>
              <div><strong>Catheter Guide</strong><small>Exit site anatomy</small></div>
            </a>
          </div>
        </div>

        <div class="nav-dropdown">
          <button class="nav-dropdown-trigger">📋 Guides <span class="chevron">▾</span></button>
          <div class="nav-dropdown-panel">
            <a href="/guide-setup.html" class="dd-link">
              <span class="dd-icon">🧤</span>
              <div><strong>Treatment Setup</strong><small>Step-by-step preparation</small></div>
            </a>
            <a href="/guide-connect.html" class="dd-link">
              <span class="dd-icon">🔗</span>
              <div><strong>Connect & Disconnect</strong><small>Sterile technique</small></div>
            </a>
            <a href="/guide-troubleshooting.html" class="dd-link">
              <span class="dd-icon">🚨</span>
              <div><strong>Troubleshooting</strong><small>Alarms & common issues</small></div>
            </a>
            <a href="/guide-emergency.html" class="dd-link">
              <span class="dd-icon">🆘</span>
              <div><strong>Emergencies</strong><small>When to call for help</small></div>
            </a>
          </div>
        </div>

        <div class="nav-dropdown">
          <button class="nav-dropdown-trigger">🛡️ Self-Care <span class="chevron">▾</span></button>
          <div class="nav-dropdown-panel">
            <a href="/care-exit-site.html" class="dd-link">
              <span class="dd-icon">🩹</span>
              <div><strong>Exit Site Care</strong><small>Cleaning & dressing</small></div>
            </a>
            <a href="/care-infection.html" class="dd-link">
              <span class="dd-icon">🦠</span>
              <div><strong>Infection Prevention</strong><small>Peritonitis awareness</small></div>
            </a>
            <a href="/care-diet.html" class="dd-link">
              <span class="dd-icon">🥗</span>
              <div><strong>Diet & Fluids</strong><small>Nutrition for PD</small></div>
            </a>
            <a href="/care-checklist.html" class="dd-link">
              <span class="dd-icon">✅</span>
              <div><strong>Daily Checklist</strong><small>Self-assessment tracker</small></div>
            </a>
          </div>
        </div>

        <a href="/capture-guide.html" class="nav-link">📸 Capture Guide</a>
      </div>

      <button class="nav-toggle" id="nav-toggle" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  `;

  initNavigation();
}
