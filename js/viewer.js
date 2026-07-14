// ═══════════════════════════════════════════════════
// PD AR Viewer — 3D Viewer Page Logic
// ═══════════════════════════════════════════════════

import '@google/model-viewer';
import { generateColoredBox } from './box-generator.js';
import { ARSession } from './ar-session.js';

// ─── Elements ───
const viewer = document.getElementById('apd-viewer');
const infoPanel = document.getElementById('info-panel');
const panelToggle = document.getElementById('panel-toggle');
const hintOverlay = document.getElementById('hint-overlay');
const dismissHint = document.getElementById('dismiss-hint');
const toggleHotspots = document.getElementById('toggle-hotspots');
const toggleDimensions = document.getElementById('toggle-dimensions');
const zoomIndicator = document.getElementById('zoom-indicator');
const captureBtn = document.getElementById('capture-view');
const toast = document.getElementById('toast');

// ─── 3D Model Loading (Scan vs. Fallback Box) ───
const REAL_MODEL_PATH = 'models/apd_machine_scan.glb';
const SPLAT_PATH = 'models/apd_machine.spz'; // optional Gaussian-splat photoreal capture

// Real-world size (metres) — shared by dimension labels + AR absolute scale.
const DIMENSIONS_M = { w: 0.467, h: 0.194, d: 0.387 };

// Resolved at load time; consumed by the in-page AR session.
let resolvedModelUrl = REAL_MODEL_PATH;
let splatUrl = null;

(async () => {
    try {
        // Does an optional photoreal splat capture ship alongside the mesh?
        fetch(SPLAT_PATH, { method: 'HEAD' })
            .then((r) => { if (r.ok) splatUrl = SPLAT_PATH; })
            .catch(() => { /* no splat — mesh only */ });

        // Check if high-fidelity scan exists
        const response = await fetch(REAL_MODEL_PATH, { method: 'HEAD' });

        if (response.ok) {
            // HIGH-FIDELITY SCAN FOUND
            viewer.src = REAL_MODEL_PATH;
            // Also update iOS source if needed (usually handles auto-conversion but explicit is better)
            viewer.iosSrc = REAL_MODEL_PATH.replace('.glb', '.usdz');
            viewer.scale = '1 1 1';
            console.log('💎 High-Fidelity 3D Scan Detected & Loaded');

            // Apply premium rendering settings for real models
            viewer.shadowIntensity = 2;
            viewer.exposure = 1.2;
            viewer.environmentImage = 'neutral';
        } else {
            // FALLBACK TO GENERATED BOX
            console.log('ℹ️ No real scan found at /models/, generating calibrated proxy box...');
            const blobUrl = await generateColoredBox(0.467, 0.194, 0.387, {
                top: '#d4a843',
                bottom: '#8b6914',
                front: '#c6a664',
                back: '#a58940',
                right: '#b89a50',
                left: '#b89a50',
            });
            viewer.src = blobUrl;
            viewer.scale = '1 1 1';
            resolvedModelUrl = blobUrl;
        }
    } catch (err) {
        console.warn('Scan detection failed, using fallback:', err);
    }
})();


// ─── Live Zoom Percentage Indicator (throttled) ───
let _zoomThrottleTimer = null;
viewer?.addEventListener('camera-change', () => {
    if (!zoomIndicator || _zoomThrottleTimer) return;
    _zoomThrottleTimer = setTimeout(() => {
        _zoomThrottleTimer = null;
        const orbit = viewer.getCameraOrbit();
        const dist = orbit.radius;
        const refDist = 1.5;
        const zoomPct = Math.round((refDist / dist) * 100);
        zoomIndicator.textContent = `${zoomPct}%`;
        zoomIndicator.classList.toggle('zoomed-in', zoomPct > 120);
        zoomIndicator.classList.toggle('zoomed-out', zoomPct < 80);
    }, 50);
});


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
let dimensionsVisible = true; // Dimensions visible by default
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

// ─── AR Status & Experience ───
const arBanner = document.getElementById('ar-info-banner');
let prevDimensionsState = false;

viewer?.addEventListener('ar-status', (e) => {
    const status = e.detail.status;
    console.log('AR Status:', status);

    if (status === 'session-started') {
        // Automatically show dimensions in AR for better scale reference
        prevDimensionsState = dimensionsVisible;
        if (!dimensionsVisible) {
            dimensionsVisible = true;
            toggleDimensions?.classList.add('active');
            dimensionHotspots.forEach(d => d.classList.add('visible'));
        }

        // Show scale info banner
        arBanner?.classList.add('active');
        setTimeout(() => arBanner?.classList.remove('active'), 5000);

    } else if (status === 'not-presenting') {
        // Restore previous dimensions state when exiting AR
        if (dimensionsVisible !== prevDimensionsState) {
            dimensionsVisible = prevDimensionsState;
            toggleDimensions?.classList.toggle('active', dimensionsVisible);
            dimensionHotspots.forEach(d => d.classList.toggle('visible', dimensionsVisible));
        }
        arBanner?.classList.remove('active');

    } else if (status === 'failed') {
        alert('Unable to launch AR. \n\nPossible reasons:\n- Using a desktop browser (try on mobile)\n- Camera permissions denied\n- No AR support on this device');
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

const tourBar = document.getElementById('tour-bar');
const tourStepEl = document.getElementById('tour-step');
const tourTitleEl = document.getElementById('tour-title');
const tourBodyEl = document.getElementById('tour-body');

function startTour() {
    tourActive = true;
    currentStep = 0;
    viewer.dismissPoster();
    tourBar?.removeAttribute('hidden');
    showStep(0);
}

function exitTour() {
    tourActive = false;
    tourBar?.setAttribute('hidden', '');
    closeAllLabels();
}

function nextTourStep() {
    if (!tourActive) return;
    if (currentStep >= tourSteps.length - 1) { exitTour(); return; }
    currentStep += 1;
    showStep(currentStep);
}

function showStep(index) {
    const step = tourSteps[index];
    if (!step) return;
    viewer.cameraOrbit = step.orbit;
    viewer.fieldOfView = '25deg';

    closeAllLabels();
    const hotspot = document.getElementById(step.target);
    const label = hotspot?.querySelector('.hotspot-label');
    if (label) label.classList.add('active');

    // Drive the on-screen tour bar.
    if (tourStepEl) tourStepEl.textContent = `${index + 1} / ${tourSteps.length}`;
    if (tourTitleEl) tourTitleEl.textContent = step.title;
    if (tourBodyEl) tourBodyEl.textContent = step.content;
    const nextBtn = document.getElementById('tour-next');
    if (nextBtn) nextBtn.textContent = index >= tourSteps.length - 1 ? 'Finish ✓' : 'Next ▸';
}

document.getElementById('start-tour')?.addEventListener('click', startTour);
document.getElementById('tour-next')?.addEventListener('click', nextTourStep);
document.getElementById('tour-exit')?.addEventListener('click', exitTour);

// ─── In-Page AR Launch (8th Wall) with OS-AR fallback ───
function readHotspotsFromDOM() {
    return Array.from(document.querySelectorAll('.hotspot')).map((h) => {
        const pos = (h.getAttribute('data-position') || '0 0 0')
            .split(/\s+/).map(Number);
        const heading = h.querySelector('h4')?.textContent?.trim() || '';
        const emoji = heading.match(/^\p{Emoji}/u)?.[0] || '';
        const title = heading.replace(/^\p{Emoji}\s*/u, '').trim();
        return {
            id: h.id,
            emoji,
            title,
            body: h.querySelector('p')?.textContent?.trim() || '',
            position: [pos[0] || 0, pos[1] || 0, pos[2] || 0],
        };
    });
}

async function launchAR() {
    const btn = document.getElementById('launch-ar');
    btn?.setAttribute('disabled', '');

    // Prefer the in-page experience (keeps hotspots/dimensions live on iOS Safari).
    if (await ARSession.isSupported()) {
        try {
            const session = new ARSession({
                modelUrl: resolvedModelUrl,
                splatUrl,
                dimensions: DIMENSIONS_M,
                hotspots: readHotspotsFromDOM(),
                onExit: () => btn?.removeAttribute('disabled'),
            });
            await session.start();
            return;
        } catch (err) {
            console.warn('In-page AR failed, falling back to OS AR:', err);
        }
    }

    // Fallback: model-viewer's Scene Viewer (Android) / Quick Look (iOS).
    try {
        if (viewer.canActivateAR) {
            await viewer.activateAR();
        } else {
            alert('AR is not available on this device or browser.\n\nTry opening this page on a modern mobile phone (Android Chrome or iOS Safari) with camera access enabled.');
        }
    } catch (err) {
        console.error('OS AR activation failed:', err);
    } finally {
        btn?.removeAttribute('disabled');
    }
}

document.getElementById('launch-ar')?.addEventListener('click', launchAR);

// ─── Capture View & Toast ───
function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

captureBtn?.addEventListener('click', async () => {
    try {
        // Take snapshot of model-viewer
        // .toBlob() or .toDataURL() is supported by <model-viewer>
        const blob = await viewer.toBlob({
            idealAspect: true,
            mimeType: 'image/png'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `APD-Placement-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('📸 Snapshot Saved to Downloads!');
    } catch (err) {
        console.error('Snapshot failed:', err);
        showToast('❌ Failed to capture view');
    }
});

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
            nextTourStep();
            break;
        case 'Escape':
            closeAllLabels();
            exitTour();
            break;
    }
});
