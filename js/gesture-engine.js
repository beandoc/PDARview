import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

export class GestureEngine {
    constructor(videoElement, options = {}) {
        this.video = videoElement;
        this.handLandmarker = null;
        this.lastVideoTime = -1;
        this.numHands = options.numHands || 1;

        this.callbacks = {
            rotate: [],
            zoom: [],
            point: [],
            scrub: [],
            idle: [],
            any: []
        };

        // Gesture State
        this.prevHand = null;
        this.pinchStartDist = null;
        this.lastHandPos = [null, null]; // For scrub velocity
    }

    async init() {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );

        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: this.numHands
        });

        this.startDetection();
    }

    startDetection() {
        const predict = () => {
            if (this.handLandmarker && this.video.currentTime !== this.lastVideoTime && this.video.videoWidth > 0 && this.video.videoHeight > 0) {
                this.lastVideoTime = this.video.currentTime;
                try {
                    const results = this.handLandmarker.detectForVideo(this.video, performance.now());
                    this.processResults(results);
                } catch (e) {
                    console.warn("MediaPipe detection skipped frame:", e);
                }
            }
            requestAnimationFrame(predict);
        };
        predict();
    }

    processResults(results) {
        if (!results.landmarks || results.landmarks.length === 0) {
            this.emit('idle');
            this.prevHand = null;
            return;
        }

        this.emit('any');

        // Multi-hand detection for clinical use (Scrubbing)
        if (results.landmarks.length >= 2) {
            this.detectScrubbing(results.landmarks);
        }

        const landmarks = results.landmarks[0];

        // 3D Navigation Gestures
        this.detectRotation(landmarks);
        this.detectPinch(landmarks);
        this.detectPoint(landmarks);
    }

    // 🧼 SCRUB: Detect two hands overlapping and moving (WHO protocol)
    detectScrubbing(allLandmarks) {
        const h1 = allLandmarks[0][9]; // Palm center hand 1
        const h2 = allLandmarks[1][9]; // Palm center hand 2

        // Distance between palms
        const dist = Math.hypot(h1.x - h2.x, h1.y - h2.y);

        // Velocity check: Is there motion?
        let isMoving = false;
        if (this.lastHandPos[0] && this.lastHandPos[1]) {
            const v1 = Math.hypot(h1.x - this.lastHandPos[0].x, h1.y - this.lastHandPos[0].y);
            const v2 = Math.hypot(h2.x - this.lastHandPos[1].x, h2.y - this.lastHandPos[1].y);
            if (v1 > 0.005 || v2 > 0.005) isMoving = true;
        }

        // Scrubbing is detected if hands are close and moving
        if (dist < 0.15 && isMoving) {
            this.emit('scrub', { intensity: 1 - (dist / 0.15) });
        }

        this.lastHandPos = [h1, h2];
    }

    // ✋ ROTATE: Follow palm movements
    detectRotation(landmarks) {
        const palmCenter = landmarks[9];

        if (this.prevHand) {
            const dx = palmCenter.x - this.prevHand.x;
            const dy = palmCenter.y - this.prevHand.y;

            if (this.getFingerCount(landmarks) >= 3) {
                this.emit('rotate', { dx: -dx, dy });
            }
        }
        this.prevHand = palmCenter;
    }

    // 🤏 PINCH: Zoom
    detectPinch(landmarks) {
        const thumb = landmarks[4];
        const index = landmarks[8];
        const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
        const fingersOut = this.getFingerCount(landmarks);

        if (dist < 0.05 && fingersOut < 2) {
            if (this.pinchStartDist === null) {
                this.pinchStartDist = dist;
            } else {
                const delta = dist - this.pinchStartDist;
                this.emit('zoom', { delta: -delta * 5 });
            }
        } else {
            this.pinchStartDist = null;
        }
    }

    // 👆 POINT: For hotspot selection
    detectPoint(landmarks) {
        const indexTip = landmarks[8];
        const indexBase = landmarks[5];
        const isPoint = indexTip.y < indexBase.y && this.getFingerCount(landmarks) === 1;

        if (isPoint) {
            this.emit('point', { x: indexTip.x, y: indexTip.y });
        }
    }

    getFingerCount(landmarks) {
        const tips = [8, 12, 16, 20];
        const pips = [6, 10, 14, 18];
        let count = 0;
        for (let i = 0; i < 4; i++) {
            if (landmarks[tips[i]].y < landmarks[pips[i]].y) count++;
        }
        if (Math.abs(landmarks[4].x - landmarks[2].x) > 0.05) count++;
        return count;
    }

    on(event, cb) {
        if (this.callbacks[event]) this.callbacks[event].push(cb);
    }

    emit(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(cb => cb(data));
        }
    }
}
