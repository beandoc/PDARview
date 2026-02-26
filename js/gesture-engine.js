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
            scrub_step: [],
            hand_detected: [],
            hands_lost: [],
            idle: [],
            any: []
        };

        // Gesture State
        this.prevHand = null;
        this.pinchStartDist = null;
        this.stretchStartDist = null;
        this.lastHandPos = [null, null]; // For scrub velocity
        this.handsPresent = false;
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

        // Multi-hand detection (Scrubbing / Zoom)
        if (results.landmarks.length >= 2) {
            // Use worldLandmarks (meters) for more precise clinical distance logic
            const worldLandmarks = results.worldLandmarks || [];
            if (worldLandmarks.length >= 2) {
                this.detectScrubbing(worldLandmarks, results.landmarks);
            } else {
                this.emit('scrub', { active: false, intensity: 0 });
            }
            this.detectTwoHandZoom(results.landmarks);
        } else if (results.landmarks.length === 1) {
            // Fallback for overlapping hands (Step 1: Palm to Palm)
            this.detectSingleHandScrubbing(results.landmarks[0]);

            // Single hand navigation 
            const landmarks = results.landmarks[0];
            this.detectRotation(landmarks);
            this.detectPinch(landmarks);
            this.detectPoint(landmarks);
        } else {
            this.emit('scrub', { active: false, intensity: 0 });
        }
    }

    // 👐 STRETCH ZOOM: Simpler zoom and exploded view trigger
    detectTwoHandZoom(allLandmarks) {
        const h1 = allLandmarks[0][9]; // Palm 1
        const h2 = allLandmarks[1][9]; // Palm 2
        const currentDist = Math.hypot(h1.x - h2.x, h1.y - h2.y);

        if (this.stretchStartDist !== null) {
            const delta = currentDist - this.stretchStartDist;
            // Only zoom if movement is significant
            if (Math.abs(delta) > 0.005) {
                this.emit('zoom', { delta: delta * 2.5 });
            }
        }
        this.stretchStartDist = currentDist;
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

    // 🧼 SCRUB: Detect two hands overlapping and moving using precise world dimensions (meters)
    detectScrubbing(worldLandmarks, normalizedLandmarks) {
        const w1 = worldLandmarks[0];
        const w2 = worldLandmarks[1];

        const h1 = normalizedLandmarks[0];
        const h2 = normalizedLandmarks[1];

        // Palm distance in meters (very precise)
        const dist = Math.hypot(w1[9].x - w2[9].x, w1[9].y - w2[9].y, w1[9].z - w2[9].z);

        // Velocity check: Is there motion?
        let isMoving = false;
        const center1 = h1[9];
        const center2 = h2[9];

        if (this.lastHandPos[0] && this.lastHandPos[1]) {
            const v1 = Math.hypot(center1.x - this.lastHandPos[0].x, center1.y - this.lastHandPos[0].y);
            const v2 = Math.hypot(center2.x - this.lastHandPos[1].x, center2.y - this.lastHandPos[1].y);
            if (v1 > 0.005 || v2 > 0.005) isMoving = true;
        }

        // Broad scrubbing detection (0.08m = 8cm proximity)
        const isScrubbing = dist < 0.08 && isMoving;

        if (isScrubbing) {
            this.emit('scrub', { active: true, intensity: 1 - (dist / 0.08) });

            // WHO Specific Step Classification
            const stepId = this.classifyScrubStep(h1, h2);
            if (stepId) {
                this.emit('scrub_step', { step: stepId });
            }
        } else {
            this.emit('scrub', { active: false, intensity: 0 });
        }

        this.lastHandPos = [center1, center2];
    }

    // 🔬 Classify specific WHO motions based on landmark geometry
    classifyScrubStep(h1, h2) {
        // Step 2/3: Interlacing Fingers
        // If the tips of the index/middle intersect the plane of the other hand
        const interlacingDist = Math.hypot(h1[8].x - h2[8].x, h1[8].y - h2[8].y);

        // Step 6: Thumb Rubbing
        // If thumb of h1 is completely over the palm of h2 (or vice versa)
        const thumb1ToPalm2 = Math.hypot(h1[4].x - h2[9].x, h1[4].y - h2[9].y);
        const thumb2ToPalm1 = Math.hypot(h2[4].x - h1[9].x, h2[4].y - h1[9].y);

        // Step 7: Fingertips in Palm
        // If clustered fingertips of h1 are over the palm of h2
        const clusteredFingersDist = Math.hypot(h1[8].x - h1[12].x, h1[8].y - h1[12].y);
        const tips1ToPalm2 = Math.hypot(h1[8].x - h2[9].x, h1[8].y - h2[9].y);

        if (thumb1ToPalm2 < 0.05 || thumb2ToPalm1 < 0.05) {
            return 'thumbs';
        }
        else if (clusteredFingersDist < 0.03 && tips1ToPalm2 < 0.05) {
            return 'fingertips';
        }
        else if (interlacingDist < 0.08) {
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

    // 🤏 PINCH: Zoom
    detectPinch(landmarks) {
        const thumb = landmarks[4];
        const index = landmarks[8];
        const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y);

        // Simpler pinch: More forgiving distance and finger count
        if (dist < 0.08) {
            if (this.pinchStartDist === null) {
                this.pinchStartDist = dist;
            } else {
                const delta = dist - this.pinchStartDist;
                this.emit('zoom', { delta: delta * 5 });
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
