import { GestureEngine } from './gesture-engine.js';

class HygieneAuditor {
    constructor() {
        this.engine = null;
        this.timerVal = 60;
        this.totalDuration = 60;
        this.isActive = false;
        this.isScrubbing = false;
        this.currentScrubMotion = null;
        this.currentStep = 1;
        this.lastHeartbeat = 0;
        this.lastTickTime = 0;

        // Smoothing Buffer for UI stability
        this.scrubBuffer = [];
        this.bufferSize = 10;

        // UI Elements
        this.timerEl = document.getElementById('timer-val');
        this.progressEl = document.getElementById('timer-progress');
        this.statusDot = document.getElementById('status-dot');
        this.statusText = document.getElementById('status-text');
        this.video = document.getElementById('webcam-video');
        this.overlay = document.getElementById('gesture-overlay');
        this.ctx = this.overlay.getContext('2d');
        this.calibrationBox = document.getElementById('calibration-box');
        this.feedbackTxt = document.getElementById('feedback-txt');

        this.init();
    }

    init() {
        // Mode Selection
        const modeWash = document.getElementById('mode-wash');
        const modeRub = document.getElementById('mode-rub');

        modeWash.addEventListener('click', () => {
            this.setDuration(60);
            modeWash.classList.add('selected');
            modeRub.classList.remove('selected');
        });

        modeRub.addEventListener('click', () => {
            this.setDuration(30);
            modeRub.classList.add('selected');
            modeWash.classList.remove('selected');
        });

        // Start Button
        document.getElementById('start-btn').addEventListener('click', () => this.startProcedure());
    }

    setDuration(seconds) {
        this.totalDuration = seconds;
        this.timerVal = seconds;
        this.timerEl.innerText = seconds;
        const offset = 880 - ((seconds / this.totalDuration) * 880);
        this.progressEl.style.strokeDashoffset = offset;
    }

    async startProcedure() {
        document.getElementById('landing-overlay').style.display = 'none';

        try {
            // Start Camera
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' }
            });
            this.video.srcObject = stream;

            // Wait for video load
            await new Promise(r => this.video.onloadeddata = r);

            // Init Engine with 2-hand tracking
            this.engine = new GestureEngine(this.video, { numHands: 2 });
            await this.engine.init();

            // Bind Events
            this.bindEvents();

            // Start Timer Loop
            this.isActive = true;
            this.lastTickTime = performance.now();
            this.tick();

        } catch (error) {
            console.error('Failed to start hygiene auditor:', error);
            alert('Camera access is required for clinical compliance auditing.');
        }
    }

    bindEvents() {
        // Skeletal Rendering Logic - Mirroring fixed here
        this.engine.on('draw', (data) => {
            this.lastHeartbeat = Date.now();
            this.drawMesh(data.landmarks);
        });

        // 🚨 Broad Scrubbing detected
        this.engine.on('scrub', (data) => {
            this.lastHeartbeat = Date.now();
            // ... (rest of logic same as before)
            let motionValid = false;
            let statusMessage = 'ACTIVE SCRUBBING';

            if (this.currentStep === 1 && this.currentScrubMotion === 'palm') motionValid = true;
            else if (this.currentStep === 2 && this.currentScrubMotion === 'interlace') motionValid = true;
            else if (this.currentStep === 3 && (this.currentScrubMotion === 'thumbs' || this.currentScrubMotion === 'fingertips')) motionValid = true;
            else if (this.currentStep === 4) motionValid = true;

            this.isScrubbing = data.active && (motionValid || this.currentStep === 4);

            if (this.isScrubbing) {
                this.statusDot.classList.add('active');
                this.statusDot.style.background = '#00ff88';
                this.statusText.innerText = 'ACTIVE SCRUBBING';
                this.feedbackTxt.innerText = 'MoCap Tracking Active - Step ' + this.currentStep;
            } else if (data.active) {
                this.statusDot.classList.remove('active');
                this.statusDot.style.background = '#ffaa00';
                this.statusText.innerText = 'INCORRECT MOTION';
                this.feedbackTxt.innerText = `Perform WHO Step ${this.currentStep} gesture.`;
            }
        });

        // Granular Step detected
        this.engine.on('scrub_step', (data) => {
            this.currentScrubMotion = data.step;
        });

        // Hand Presence Feedback
        this.engine.on('hand_detected', () => {
            this.statusDot.style.background = '#fff';
            this.statusText.innerText = 'WAITING FOR MOTION';
            this.calibrationBox?.classList.add('active');
        });

        this.engine.on('hands_lost', () => {
            this.isScrubbing = false;
            this.statusText.innerText = 'HANDS OUT OF FRAME';
            this.statusDot.classList.remove('active');
            this.statusDot.style.background = '#ff4d4d';
            this.feedbackTxt.innerText = 'Raise hands into the camera view.';
            this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
            this.calibrationBox?.classList.remove('active');
        });

        this.engine.on('idle', () => {
            this.isScrubbing = false;
            this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
        });
    }

    tick() {
        if (!this.isActive) return;

        const now = performance.now();
        const dt = (now - this.lastTickTime) / 1000; // Delta time in seconds
        this.lastTickTime = now;

        const isHeartbeatActive = (now - this.lastHeartbeat) < 500;

        // Update smoothing buffer
        this.scrubBuffer.push(this.isScrubbing && isHeartbeatActive);
        if (this.scrubBuffer.length > this.bufferSize) this.scrubBuffer.shift();

        // Check if clinical criteria met (e.g. 70% of frames in buffer must be valid)
        const validFrames = this.scrubBuffer.filter(v => v).length;
        const isClinicallyScrubbing = (validFrames / this.scrubBuffer.length) >= 0.7;

        // ONLY count down if AI detects stable, correct scrubbing
        if (isClinicallyScrubbing) {
            this.timerVal -= dt;

            // Update UI
            const displayVal = Math.ceil(this.timerVal);
            this.timerEl.innerText = displayVal;

            const offset = 880 - ((this.timerVal / this.totalDuration) * 880);
            this.progressEl.style.strokeDashoffset = offset;

            // Manage Steps
            this.updateSteps();

            // Completion
            if (this.timerVal <= 0) {
                this.completeProcedure();
            }
        } else if (!isHeartbeatActive && this.isScrubbing) {
            // Force stop if engine is silent
            this.isScrubbing = false;
            this.statusDot.classList.remove('active');
        }

        requestAnimationFrame(() => this.tick());
    }

    updateSteps() {
        const progress = 1 - (this.timerVal / this.totalDuration);
        let newStep = 1;

        if (progress > 0.3) newStep = 2;
        if (progress > 0.6) newStep = 3;
        if (progress > 0.9) newStep = 4;

        if (newStep !== this.currentStep) {
            this.currentStep = newStep;

            // UI Updates
            document.querySelectorAll('.step-card').forEach(card => card.classList.remove('active'));
            document.getElementById(`step-${newStep}`).classList.add('active');

            // Audio Feedback
            this.playNotification();
        }
    }

    playNotification() {
        // Simple synth "ding"
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    }

    completeProcedure() {
        this.isActive = false;
        document.getElementById('celebration').classList.add('active');
    }

    drawMesh(allHands) {
        this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);

        // Match canvas to display size
        if (this.overlay.width !== this.overlay.clientWidth) {
            this.overlay.width = this.overlay.clientWidth;
            this.overlay.height = this.overlay.clientHeight;
        }

        const CONNECTIONS = [
            [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
            [0, 5], [5, 6], [6, 7], [7, 8], // Index
            [0, 9], [9, 10], [10, 11], [11, 12], // Middle
            [0, 13], [13, 14], [14, 15], [15, 16], // Ring
            [0, 17], [17, 18], [18, 19], [19, 20] // Pinky
        ];

        allHands.forEach((hand, index) => {
            const color = index === 0 ? '#00d2ff' : '#00ff88';

            // Draw Connections (Bones)
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 4;
            this.ctx.lineCap = 'round';
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = color;

            CONNECTIONS.forEach(([i, j]) => {
                const pt1 = hand[i];
                const pt2 = hand[j];
                this.ctx.beginPath();
                // Coordinate Mirror Fix: If the canvas is mirrored with CSS scaleX(-1),
                // we should draw as if looking into a mirror.
                this.ctx.moveTo(pt1.x * this.overlay.width, pt1.y * this.overlay.height);
                this.ctx.lineTo(pt2.x * this.overlay.width, pt2.y * this.overlay.height);
                this.ctx.stroke();
            });

            // Draw Joint Glow
            this.ctx.fillStyle = 'white';
            this.ctx.shadowBlur = 5;
            hand.forEach(pt => {
                this.ctx.beginPath();
                this.ctx.arc(pt.x * this.overlay.width, pt.y * this.overlay.height, 4, 0, Math.PI * 2);
                this.ctx.fill();
            });
        });
    }
}

// Start
new HygieneAuditor();
