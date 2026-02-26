import { APDScene } from './apd-scene.js';
import { GestureEngine } from './gesture-engine.js';

class GestureTrainer {
    constructor() {
        this.scene = null;
        this.engine = null;

        this.startBtn = document.getElementById('start-btn');
        this.landingOverlay = document.getElementById('landing-overlay');
        this.webcamElement = document.getElementById('webcam-video');

        this.init();
    }

    async init() {
        // Initialize the 3D Scene
        const canvas = document.getElementById('gesture-canvas');
        this.scene = new APDScene(canvas);

        // Handle Start Button
        this.startBtn.addEventListener('click', () => this.startExperience());

        // Handle Model Toggle
        this.currentModelType = 'proxy';
        const toggleBtn = document.getElementById('model-toggle-btn');
        toggleBtn.addEventListener('click', () => {
            this.currentModelType = this.currentModelType === 'proxy' ? 'vision-pro' : 'proxy';
            this.scene.loadModel(this.currentModelType);
            toggleBtn.querySelector('span:last-child').innerText = this.currentModelType === 'proxy' ? ' Test Model' : ' APD Machine';
        });

        // Handle UI Close
        document.getElementById('info-close').addEventListener('click', () => {
            document.getElementById('info-sidebar').classList.remove('active');
        });
    }

    async startExperience() {
        this.startBtn.disabled = true;
        this.startBtn.innerText = 'Initializing...';

        try {
            // 1. Start Webcam
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 }
            });
            this.webcamElement.srcObject = stream;

            // 2. Wait for video to be ready
            await new Promise((resolve) => {
                this.webcamElement.onloadeddata = () => {
                    resolve();
                };
            });

            // 3. Initialize Gesture Engine
            this.engine = new GestureEngine(this.webcamElement);
            await this.engine.init();

            // 3. Bind Engine Events to Scene Actions
            this.bindEvents();

            // 4. Hide Overlay
            this.landingOverlay.classList.add('hidden');

            // 5. Start Animation Loop
            this.tick();

        } catch (error) {
            console.error('Failed to start experience:', error);
            alert('Camera access is required for this experience to work. Please grant permission and try again.');
            this.startBtn.disabled = false;
            this.startBtn.innerText = 'Start Experience 🖐️';
        }
    }

    bindEvents() {
        // Rotate: Map hand X/Y to scene rotation
        this.engine.on('rotate', (data) => {
            this.scene.rotateModel(data.dx, data.dy);
            this.updateBadge('gesture-rotate', true);
        });

        // Zoom: Map pinch distance to scene zoom
        this.engine.on('zoom', (data) => {
            this.scene.zoomModel(data.delta);
            this.updateBadge('gesture-zoom', true);
        });

        // Point: Raycast to find hotspots
        this.engine.on('point', (data) => {
            const hit = this.scene.checkHotspots(data.x, data.y);
            this.updateBadge('gesture-point', true);

            if (hit) {
                this.showHotspotInfo(hit);
            }
        });

        // Idle/Pause: When no gesture detected
        this.engine.on('idle', () => {
            this.clearBadges();
            this.scene.setIdle(true);
        });

        // Any active gesture stops idle movement
        this.engine.on('any', () => {
            this.scene.setIdle(false);
        });
    }

    updateBadge(id, active) {
        this.clearBadges();
        const badge = document.getElementById(id);
        if (badge && active) badge.classList.add('active');
    }

    clearBadges() {
        document.querySelectorAll('.gesture-badge').forEach(b => b.classList.remove('active'));
    }

    showHotspotInfo(hotspot) {
        const sidebar = document.getElementById('info-sidebar');
        const title = document.getElementById('info-title');
        const desc = document.getElementById('info-desc');

        title.innerText = hotspot.title;
        desc.innerText = hotspot.description;
        sidebar.classList.add('active');
    }

    tick() {
        this.scene.update();
        requestAnimationFrame(() => this.tick());
    }
}

// Instantiate
new GestureTrainer();
