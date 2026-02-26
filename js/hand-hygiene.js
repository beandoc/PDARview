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

        // UI Elements
        this.timerEl = document.getElementById('timer-val');
        this.progressEl = document.getElementById('timer-progress');
        this.statusDot = document.getElementById('status-dot');
        this.statusText = document.getElementById('status-text');
        this.feedbackTxt = document.getElementById('feedback-txt');
        this.video = document.getElementById('webcam-video');

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
                video: { width: 640, height: 480 }
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
            this.tick();

        } catch (error) {
            console.error('Failed to start hygiene auditor:', error);
            alert('Camera access is required for clinical compliance auditing.');
        }
    }

    bindEvents() {
        // Broad Scrubbing detected
        this.engine.on('scrub', (data) => {
            this.isScrubbing = true;
            this.statusDot.classList.add('active');

            // Check if they are doing the right motion for the current step
            let motionValid = false;
            let statusMessage = 'ACTIVE SCRUBBING';

            if (this.currentStep === 1 && this.currentScrubMotion === 'palm') motionValid = true;
            else if (this.currentStep === 2 && this.currentScrubMotion === 'interlace') motionValid = true;
            else if (this.currentStep === 3 && (this.currentScrubMotion === 'thumbs' || this.currentScrubMotion === 'fingertips')) motionValid = true;
            else if (this.currentStep === 4) motionValid = true; // Any motion is fine for final rinse/dry

            if (!motionValid && this.currentStep !== 4) {
                statusMessage = 'INCORRECT MOTION';
                this.statusDot.style.background = '#ffaa00'; // Warning color
                this.feedbackTxt.innerText = `Please check step ${this.currentStep} instructions.`;
            } else {
                this.statusDot.style.background = '';
                this.feedbackTxt.innerText = 'Good progress! Keep going.';
            }

            this.statusText.innerText = statusMessage;

            // Only consider it valid scrubbing if the motion is correct
            this.isScrubbing = motionValid || this.currentStep === 4;
        });

        // Granular Step detected
        this.engine.on('scrub_step', (data) => {
            this.currentScrubMotion = data.step;
        });

        // Hands lost or idle
        this.engine.on('idle', () => {
            this.isScrubbing = false;
            this.currentScrubMotion = null;
            this.statusDot.classList.remove('active');
            this.statusDot.style.background = '';
            this.statusText.innerText = 'WAITING FOR MOTION';
            this.feedbackTxt.innerText = 'Please resume step instructions to continue timer';
        });
    }

    tick() {
        if (!this.isActive) return;

        // Only count down if AI detects active scrubbing
        if (this.isScrubbing) {
            this.timerVal -= 0.05; // Smoothing sub-seconds

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
}

// Start
new HygieneAuditor();
