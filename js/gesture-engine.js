import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

export class GestureEngine {
    constructor(videoElement, options = {}) {
        this.video = videoElement;
        this.handLandmarker = null;
        this.lastVideoTime = -1;
        this.numHands = options.numHands || 1;
        this._rafId = null;
        this._destroyed = false;

        this.callbacks = {
            rotate: [],
            zoom: [],
            move: [],
            point: [],
            draw: [],
            scrub: [],
            scrub_step: [],
            hand_detected: [],
            hands_lost: [],
            idle: [],
            any: []
        };

        // Gesture State
        this.prevHand = null;
        this.pinchStartDist = null;
        this.pinchStartPos = null;
        this.lastHandPos = [null, null];
        this.handsPresent = false;

        // Smoothing for step detection
        this.stepBuffer = [];
        this.stepBufferSize = 15;
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
            numHands: this.numHands,
            minHandDetectionConfidence: 0.7,
            minHandPresenceConfidence: 0.7,
            minTrackingConfidence: 0.7
        });

        this.startDetection();
    }

    startDetection() {
        const predict = () => {
            if (this._destroyed) return;
            const now = performance.now();
            if (this.handLandmarker && this.video.currentTime !== this.lastVideoTime && this.video.videoWidth > 0 && this.video.videoHeight > 0) {
                this.lastVideoTime = this.video.currentTime;
                try {
                    const results = this.handLandmarker.detectForVideo(this.video, now);
                    this.processResults(results);
                } catch (e) {
                    // Silently skip dropped frames — common on lower-end GPUs
                }
            }
            this._rafId = requestAnimationFrame(predict);
        };
        predict();
    }

    destroy() {
        this._destroyed = true;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        if (this.handLandmarker) {
            this.handLandmarker.close();
            this.handLandmarker = null;
        }
        // Clear all callbacks
        for (const key in this.callbacks) {
            this.callbacks[key] = [];
        }
    }

    processResults(results) {
        if (!results.landmarks || results.landmarks.length === 0) {
            if (this.handsPresent) {
                this.emit('hands_lost');
                this.handsPresent = false;
            }
            this.emit('idle');
            this.prevHand = null;
            this.lastHandPos = [null, null];
            return;
        }

        if (!this.handsPresent) {
            this.emit('hand_detected');
            this.handsPresent = true;
        }

        // Emit for drawing mesh (normalized landmarks)
        this.emit('draw', { landmarks: results.landmarks });

        this.emit('any');

        // Process primary hand for navigation (Rotate, Zoom, Point)
        const primaryHand = results.landmarks[0];
        this.detectRotation(primaryHand);
        this.detectPinch(primaryHand);
        this.detectPoint(primaryHand);

        // Multi-hand detection (Scrubbing ONLY - for clinical compliance)
        if (results.landmarks.length >= 2) {
            const worldLandmarks = results.worldLandmarks || [];
            if (worldLandmarks.length >= 2) {
                this.detectScrubbing(worldLandmarks, results.landmarks);
            } else {
                this.emit('scrub', { active: false, intensity: 0 });
            }
        } else if (results.landmarks.length === 1) {
            // Hand hygiene fallback
            this.detectSingleHandScrubbing(results.landmarks[0]);
        } else {
            this.emit('scrub', { active: false, intensity: 0 });
        }
    }

    // 🧼 1-Hand Fallback: Detect high-velocity jitter indicating a rub
    detectSingleHandScrubbing(landmarks) {
        const center = landmarks[9];
        let detected = false;

        if (this.lastHandPos[0]) {
            const v = Math.hypot(center.x - this.lastHandPos[0].x, center.y - this.lastHandPos[0].y);
            // High velocity jitter is a signature of rubbing
            if (v > 0.015) {
                this.emit('scrub', { active: true, intensity: 0.5 });
                this.emit('scrub_step', { step: 'palm' });
                detected = true;
            }
        }

        if (!detected) {
            this.emit('scrub', { active: false, intensity: 0 });
        }

        this.lastHandPos[0] = center;
    }

    // 🧼 SCRUB: Detect two hands overlapping and moving using 3D world dimensions (meters)
    detectScrubbing(worldLandmarks, normalizedLandmarks) {
        const w1 = worldLandmarks[0];
        const w2 = worldLandmarks[1];

        // Use 3D Euclidean distance between palms (landmark 9)
        const dist = Math.sqrt(
            Math.pow(w1[9].x - w2[9].x, 2) +
            Math.pow(w1[9].y - w2[9].y, 2) +
            Math.pow(w1[9].z - w2[9].z, 2)
        );

        // Velocity check in 3D
        let isMoving = false;
        if (this.lastHandPos[0] && this.lastHandPos[1]) {
            const v1 = Math.sqrt(
                Math.pow(w1[9].x - this.lastHandPos[0].x, 2) +
                Math.pow(w1[9].y - this.lastHandPos[0].y, 2) +
                Math.pow(w1[9].z - this.lastHandPos[0].z, 2)
            );
            const v2 = Math.sqrt(
                Math.pow(w2[9].x - this.lastHandPos[1].x, 2) +
                Math.pow(w2[9].y - this.lastHandPos[1].y, 2) +
                Math.pow(w2[9].z - this.lastHandPos[1].z, 2)
            );
            // 0.003m (3mm) per frame motion threshold is standard for "scrubbing" 
            if (v1 > 0.003 || v2 > 0.003) isMoving = true;
        }

        // Broad scrubbing detection (0.1m = 10cm 3D proximity)
        const isScrubbing = dist < 0.1 && isMoving;

        if (isScrubbing) {
            this.emit('scrub', { active: true, intensity: Math.max(0, 1 - (dist / 0.1)) });

            // 🔬 WHO Specific Step Classification using 3D spatial logic
            const rawStep = this.classifyScrubStep(w1, w2);

            // Temporal Smoothing for Step Classification
            this.stepBuffer.push(rawStep);
            if (this.stepBuffer.length > this.stepBufferSize) this.stepBuffer.shift();

            // Find most frequent step in buffer (majority vote)
            const counts = {};
            this.stepBuffer.forEach(s => counts[s] = (counts[s] || 0) + 1);
            const bestStep = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);

            this.emit('scrub_step', { step: bestStep });
        } else {
            this.emit('scrub', { active: false, intensity: 0 });
            this.stepBuffer = []; // Clear buffer when hands separate
        }

        this.lastHandPos = [w1[9], w2[9]];
    }

    // 🔬 Classify specific WHO motions based on 3D WORLD Landmark geometry
    classifyScrubStep(w1, w2) {
        // Step 2/3: Interlacing Fingers
        // Vector analysis: Are index fingers roughly pointing in opposite directions?
        const v1 = { x: w1[8].x - w1[5].x, y: w1[8].y - w1[5].y, z: w1[8].z - w1[5].z };
        const v2 = { x: w2[8].x - w2[5].x, y: w2[8].y - w2[5].y, z: w2[8].z - w2[5].z };

        // Normalize
        const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2);
        const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2 + v2.z ** 2);
        const dot = (v1.x * v2.x + v1.y * v2.y + v1.z * v2.z) / (mag1 * mag2);

        // Relaxed threshold: dot < 0 means angle is > 90 deg opposite (much easier to hit)
        const isInterlaced = dot < 0;

        // Step 6: Thumb Rubbing
        // 3D distance between thumb tip and opposite palm center (Relaxed to 5cm / 0.05m)
        const t1ToP2 = Math.sqrt((w1[4].x - w2[9].x) ** 2 + (w1[4].y - w2[9].y) ** 2 + (w1[4].z - w2[9].z) ** 2);
        const t2ToP1 = Math.sqrt((w2[4].x - w1[9].x) ** 2 + (w2[4].y - w1[9].y) ** 2 + (w2[4].z - w1[9].z) ** 2);

        // Step 7: Fingertips in Palm
        // Check 3D distance of clustered fingertips (Relaxed spread and distance)
        const tips1ToP2 = Math.sqrt((w1[8].x - w2[9].x) ** 2 + (w1[8].y - w2[9].y) ** 2 + (w1[8].z - w2[9].z) ** 2);
        const fingerSpread = Math.sqrt((w1[8].x - w1[20].x) ** 2 + (w1[8].y - w1[20].y) ** 2 + (w1[8].z - w1[20].z) ** 2);

        if (t1ToP2 < 0.05 || t2ToP1 < 0.05) {
            return 'thumbs';
        }
        else if (fingerSpread < 0.08 && tips1ToP2 < 0.05) {
            return 'fingertips';
        }
        else if (isInterlaced) {
            return 'interlace';
        }

        return 'palm';
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

    // 🤏 PINCH: Zoom & Movement (Single Hand)
    detectPinch(landmarks) {
        const thumb = landmarks[4];
        const index = landmarks[8];
        const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y);

        // A "pinch" is thumb and index meeting
        if (dist < 0.08) {
            if (this.pinchStartDist === null) {
                this.pinchStartDist = dist;
                this.pinchStartPos = { x: thumb.x, y: thumb.y };
            } else {
                const deltaDist = dist - this.pinchStartDist;
                const deltaX = thumb.x - this.pinchStartPos.x;
                const deltaY = thumb.y - this.pinchStartPos.y;

                // 1. Zoom: Change in pinch width
                if (Math.abs(deltaDist) > 0.002) {
                    this.emit('zoom', { delta: deltaDist * 8 });
                }

                // 2. Move: Translation of the pinched hand
                if (Math.abs(deltaX) > 0.01 || Math.abs(deltaY) > 0.01) {
                    this.emit('move', { dx: deltaX, dy: deltaY });
                }

                // Smooth update
                this.pinchStartDist = dist;
                this.pinchStartPos = { x: thumb.x, y: thumb.y };
            }
        } else {
            this.pinchStartDist = null;
            this.pinchStartPos = null;
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
