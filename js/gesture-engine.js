import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

export class GestureEngine {
    constructor(videoElement) {
        this.video = videoElement;
        this.handLandmarker = null;
        this.lastVideoTime = -1;
        this.callbacks = {
            rotate: [],
            zoom: [],
            point: [],
            idle: [],
            any: []
        };

        // Gesture State
        this.prevHand = null;
        this.pinchStartDist = null;
        this.isPointing = false;
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
            numHands: 1
        });

        this.startDetection();
    }

    startDetection() {
        const predict = () => {
            if (this.video.currentTime !== this.lastVideoTime) {
                this.lastVideoTime = this.video.currentTime;
                const results = this.handLandmarker.detectForVideo(this.video, performance.now());
                this.processResults(results);
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
        const landmarks = results.landmarks[0]; // Tracking single hand for simplicity

        // Analyze Gestures
        this.detectRotation(landmarks);
        this.detectPinch(landmarks);
        this.detectPoint(landmarks);
    }

    // ✋ ROTATE: Follow palm movements
    detectRotation(landmarks) {
        const palmCenter = landmarks[9]; // Middle MCP

        if (this.prevHand) {
            const dx = palmCenter.x - this.prevHand.x;
            const dy = palmCenter.y - this.prevHand.y;

            // Only rotate if palm is mostly open
            if (this.getFingerCount(landmarks) >= 3) {
                this.emit('rotate', { dx: -dx, dy }); // Invert DX for natural feel
            }
        }
        this.prevHand = palmCenter;
    }

    // 🤏 PINCH: Zoom based on thumb-index distance
    detectPinch(landmarks) {
        const thumb = landmarks[4];
        const index = landmarks[8];
        const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y);

        // If other fingers are curled (pinch gesture)
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

        // If index is pointing up and other fingers are curled
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

        // Thumb special case
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
