// ═══════════════════════════════════════════════════
// PD AR Viewer — Landing Page Logic
// ═══════════════════════════════════════════════════

import QRCode from 'qrcode';

// ─── Navbar Scroll Effect ───
const navbar = document.getElementById('navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const currentScroll = window.scrollY;
  if (currentScroll > 50) {
    navbar.style.background = 'rgba(11, 17, 32, 0.95)';
  } else {
    navbar.style.background = 'rgba(11, 17, 32, 0.85)';
  }
  lastScroll = currentScroll;
});

// ─── Mobile Nav Toggle ───
const navToggle = document.getElementById('nav-toggle');
const navLinks = document.querySelector('.nav-links');

navToggle?.addEventListener('click', () => {
  navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
  if (navLinks.style.display === 'flex') {
    navLinks.style.position = 'absolute';
    navLinks.style.top = '100%';
    navLinks.style.left = '0';
    navLinks.style.right = '0';
    navLinks.style.flexDirection = 'column';
    navLinks.style.background = 'rgba(11, 17, 32, 0.98)';
    navLinks.style.padding = '1rem';
    navLinks.style.borderBottom = '1px solid rgba(255,255,255,0.08)';
  }
});

// ─── Scroll Reveal Animation ───
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, observerOptions);

document.querySelectorAll('.step-card, .spec-item, .faq-item, .guide-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  observer.observe(el);
});

// ─── QR Code Generation ───
const generateQrBtn = document.getElementById('generate-qr-btn');
const copyLinkBtn = document.getElementById('copy-link-btn');
const qrArea = document.getElementById('qr-area');
const shareSendRow = document.getElementById('share-send-row');
const shareSmsBtn = document.getElementById('share-sms-btn');
const shareEmailBtn = document.getElementById('share-email-btn');

function getViewerUrl() {
  const base = window.location.origin;
  return `${base}/viewer.html`;
}

generateQrBtn?.addEventListener('click', async () => {
  const url = getViewerUrl();
  qrArea.innerHTML = '';

  try {
    const canvas = await QRCode.toCanvas(url, {
      width: 220,
      margin: 2,
      color: {
        dark: '#0ea5e9',
        light: '#0b1120'
      }
    });
    canvas.style.borderRadius = '12px';
    canvas.style.border = '1px solid rgba(14, 165, 233, 0.3)';
    qrArea.appendChild(canvas);
    shareSendRow.style.display = 'flex';

    // Update share links
    const message = `Your clinic has sent you a link to view your APD dialysis machine in AR. Open this link on your phone: ${url}`;
    shareSmsBtn.href = `sms:?body=${encodeURIComponent(message)}`;
    shareEmailBtn.href = `mailto:?subject=${encodeURIComponent('View Your APD Machine in AR')}&body=${encodeURIComponent(message)}`;
  } catch (err) {
    console.error('QR generation error:', err);
    qrArea.innerHTML = '<p style="color: #ef4444;">Error generating QR code</p>';
  }
});

copyLinkBtn?.addEventListener('click', async () => {
  const url = getViewerUrl();
  try {
    await navigator.clipboard.writeText(url);
    const originalText = copyLinkBtn.innerHTML;
    copyLinkBtn.innerHTML = '<span class="btn-icon">✅</span> Copied!';
    setTimeout(() => {
      copyLinkBtn.innerHTML = originalText;
    }, 2000);
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = url;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    copyLinkBtn.innerHTML = '<span class="btn-icon">✅</span> Copied!';
    setTimeout(() => {
      copyLinkBtn.innerHTML = '<span class="btn-icon">🔗</span> Copy Link';
    }, 2000);
  }
});

// ─── Smooth scroll for anchor links ───
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
