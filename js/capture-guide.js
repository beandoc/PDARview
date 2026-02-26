// ═══════════════════════════════════════════════════
// PD AR Viewer — Capture Guide Page Logic
// ═══════════════════════════════════════════════════

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

document.querySelectorAll('.guide-card, .pipeline-step').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

// ─── Pipeline Step Highlight ───
const pipelineSteps = document.querySelectorAll('.pipeline-step');
const guideSections = document.querySelectorAll('.guide-step-section');

const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const idx = Array.from(guideSections).indexOf(entry.target);
            pipelineSteps.forEach((step, i) => {
                if (i <= idx) {
                    step.style.borderColor = 'rgba(14, 165, 233, 0.5)';
                    step.style.background = 'rgba(14, 165, 233, 0.08)';
                } else {
                    step.style.borderColor = '';
                    step.style.background = '';
                }
            });
        }
    });
}, { threshold: 0.3 });

guideSections.forEach(section => sectionObserver.observe(section));
