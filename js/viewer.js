// ═══════════════════════════════════════════════════
// PD AR Viewer — 3D Viewer Page Logic
// ═══════════════════════════════════════════════════

import '@google/model-viewer';

// ─── Elements ───
const viewer = document.getElementById('apd-viewer');
const infoPanel = document.getElementById('info-panel');
const panelToggle = document.getElementById('panel-toggle');
const hintOverlay = document.getElementById('hint-overlay');
const dismissHint = document.getElementById('dismiss-hint');
const toggleHotspots = document.getElementById('toggle-hotspots');
const toggleDimensions = document.getElementById('toggle-dimensions');

// ─── Info Panel Toggle ───
panelToggle?.addEventListener('click', () => {
    infoPanel.classList.toggle('open');
});

// ─── First-time Hint ───
const hintDismissed = sessionStorage.getItem('pd-hint-dismissed');
if (hintDismissed) {
    hintOverlay?.classList.add('hidden');
}

dismissHint?.addEventListener('click', () => {
    hintOverlay?.classList.add('hidden');
    sessionStorage.setItem('pd-hint-dismissed', 'true');
});

// Also dismiss on first interaction with model
viewer?.addEventListener('camera-change', () => {
    if (!hintOverlay?.classList.contains('hidden')) {
        hintOverlay?.classList.add('hidden');
        sessionStorage.setItem('pd-hint-dismissed', 'true');
    }
}, { once: true });

// ─── Camera View Presets ───
document.querySelectorAll('[data-orbit]').forEach(btn => {
    btn.addEventListener('click', () => {
        const orbit = btn.getAttribute('data-orbit');
        viewer.cameraOrbit = orbit;
        viewer.fieldOfView = '30deg';
    });
});

// ─── Hotspot Interaction ───
const allHotspotLabels = document.querySelectorAll('.hotspot-label');
const allHotspots = document.querySelectorAll('.hotspot');

function closeAllLabels() {
    allHotspotLabels.forEach(label => label.classList.remove('active'));
}

allHotspots.forEach(hotspot => {
    const label = hotspot.querySelector('.hotspot-label');
    const closeBtn = hotspot.querySelector('.hotspot-close');

    hotspot.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = label.classList.contains('active');
        closeAllLabels();
        if (!isActive) {
            label.classList.add('active');
        }
    });

    closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        label.classList.remove('active');
    });
});

// Close labels when clicking on the model
viewer?.addEventListener('click', (e) => {
    if (!e.target.closest('.hotspot')) {
        closeAllLabels();
    }
});

// ─── Toggle Hotspot Visibility ───
let hotspotsVisible = true;

toggleHotspots?.addEventListener('click', () => {
    hotspotsVisible = !hotspotsVisible;
    toggleHotspots.classList.toggle('active', hotspotsVisible);

    allHotspots.forEach(h => {
        h.style.display = hotspotsVisible ? '' : 'none';
    });

    if (!hotspotsVisible) {
        closeAllLabels();
    }
});

// ─── Toggle Dimension Visibility ───
let dimensionsVisible = false;
const dimensionHotspots = document.querySelectorAll('.dimension-hotspot');

toggleDimensions?.addEventListener('click', () => {
    dimensionsVisible = !dimensionsVisible;
    toggleDimensions.classList.toggle('active', dimensionsVisible);

    dimensionHotspots.forEach(d => {
        d.classList.toggle('visible', dimensionsVisible);
    });
});

// ─── Progress Bar ───
viewer?.addEventListener('progress', (e) => {
    const bar = document.getElementById('progress-bar-update');
    if (bar) {
        const progress = e.detail.totalProgress;
        bar.style.width = `${progress * 100}%`;
        if (progress >= 1) {
            setTimeout(() => { bar.style.opacity = '0'; }, 500);
        }
    }
});

viewer?.addEventListener('ar-status', (e) => {
    console.log('AR Status:', e.detail.status);
    if (e.detail.status === 'failed') {
        alert('Unable to open AR. Please ensure your browser supports WebXR/AR and you have granted camera permissions.');
    }
});

// ─── Guided Tour (Phase 3) ───
const tourSteps = [
    {
        orbit: '45deg 75deg 2.5m',
        target: 'hotspot-screen',
        title: 'The Control Center',
        content: 'Start by turning on the machine. The screen will guide you through the self-test.'
    },
    {
        orbit: '-45deg 75deg 2.2m',
        target: 'hotspot-cassette',
        title: 'Loading Supplies',
        content: 'Open the door to load the cassette. Ensure the tubing is not pinched.'
    },
    {
        orbit: '180deg 85deg 2.5m',
        target: 'hotspot-power',
        title: 'Power Source',
        content: 'Always keep the machine plugged in. It has a memory for power outages.'
    },
    {
        orbit: '0deg 30deg 1.5m',
        target: 'hotspot-drain',
        title: 'Drain Connection',
        content: 'This line carries the waste fluid away. Keep the bag lower than your bed.'
    }
];

let tourActive = false;
let currentStep = 0;

function startTour() {
    tourActive = true;
    currentStep = 0;
    viewer.dismissPoster();
    showStep(0);
}

function showStep(index) {
    const step = tourSteps[index];
    viewer.cameraOrbit = step.orbit;
    viewer.fieldOfView = '25deg';

    closeAllLabels();
    const hotspot = document.getElementById(step.target);
    const label = hotspot.querySelector('.hotspot-label');
    label.classList.add('active');

    // Update UI if any tour-specific UI exists
    console.log(`Tour Step ${index + 1}: ${step.title}`);
}

// ─── Keyboard shortcuts ───
document.addEventListener('keydown', (e) => {
    switch (e.key) {
        case 'i':
        case 'I':
            infoPanel?.classList.toggle('open');
            break;
        case 'h':
        case 'H':
            toggleHotspots?.click();
            break;
        case 'd':
        case 'D':
            toggleDimensions?.click();
            break;
        case 't':
        case 'T':
            startTour();
            break;
        case 'n':
        case 'N':
            if (tourActive) {
                currentStep = (currentStep + 1) % tourSteps.length;
                showStep(currentStep);
            }
            break;
        case 'Escape':
            closeAllLabels();
            tourActive = false;
            break;
    }
});
