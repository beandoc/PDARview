// ═══════════════════════════════════════════════════════════════════
// PD AR Viewer — In-Page AR Session (8th Wall SLAM + Three.js + Spark)
// ───────────────────────────────────────────────────────────────────
// Unlike <model-viewer>'s AR, which hands the model off to the OS AR
// viewer (Scene Viewer / Quick Look) and drops all of our teaching UI,
// this runs the AR session *inside the page*. That means our hotspots,
// dimension callouts and guided tour stay live on top of the camera
// feed — and it works in iOS Safari, where WebXR does not.
//
// Architecture (8th Wall "custom pipeline module" pattern):
//   • 8th Wall engine  → camera feed + 6DoF SLAM pose + ABSOLUTE scale
//   • Our Three.js     → owns the scene/camera/renderer (so our mesh
//                        + Spark splats share ONE three.js instance and
//                        there is no version conflict with 8th Wall)
//   • Spark            → optional Gaussian-splat "photoreal" layer
//
// The engine binary is loaded via a <script> tag in viewer.html; the
// XR8Promise helper resolves once window.XR8 is ready.
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { XR8Promise } from '@8thwall/engine-binary';

// Spark is loaded lazily (only when the user turns on photoreal mode) so
// its WebGL2/splat machinery never costs anything unless it's used.
let _sparkModulePromise = null;
function loadSpark() {
    if (!_sparkModulePromise) {
        _sparkModulePromise = import('@sparkjsdev/spark');
    }
    return _sparkModulePromise;
}

const GROUND_Y = 0; // 8th Wall absolute-scale world tracking puts the floor at y = 0.

export class ARSession {
    /**
     * @param {object} opts
     * @param {string} opts.modelUrl   GLB of the device (mesh, with clean geometry)
     * @param {string} [opts.splatUrl] Optional Gaussian splat (.spz/.ply/.splat) for photoreal mode
     * @param {{w:number,h:number,d:number}} opts.dimensions  Real size in METERS
     * @param {Array<{id,title,body,emoji,position:[number,number,number]}>} opts.hotspots
     *        Hotspot anchors in MODEL-LOCAL metres (same frame as the <model-viewer> data-position).
     * @param {() => void} [opts.onExit] Called after the AR session tears down.
     */
    constructor(opts) {
        this.opts = opts;
        // Optional pluggable experience: { build(ctx), update(dt), onPlaced?(), dispose?() }.
        // When present it owns the 3D content instead of loading opts.modelUrl.
        this.experience = opts.experience || null;
        this._lastT = 0;
        this.placed = false;
        this.splatMode = false;
        this.splatMesh = null;
        this.sparkRenderer = null;
        this.markerEls = [];
        this._raycaster = new THREE.Raycaster();
        this._ndc = new THREE.Vector2();
        this._tmpVec = new THREE.Vector3();
        this._running = false;
    }

    // ─── Capability check (call before launch to decide on fallback) ───
    static async isSupported() {
        try {
            const XR8 = await Promise.race([
                XR8Promise,
                new Promise((_, r) => setTimeout(() => r(new Error('engine-timeout')), 8000)),
            ]);
            // Requires camera + motion sensors + WebGL. isDeviceBrowserCompatible
            // covers the "desktop / unsupported browser" cases for us.
            return !!(XR8?.XrDevice?.isDeviceBrowserCompatible?.() ?? true);
        } catch {
            return false;
        }
    }

    // ─── Launch ───
    async start() {
        const XR8 = await XR8Promise;
        this.XR8 = XR8;

        this._buildOverlay();

        // World tracking with ABSOLUTE (metric) scale — critical for a
        // placement-planning tool: the machine appears at its true size.
        XR8.XrController.configure({
            disableWorldTracking: false,
            scale: 'absolute',
        });

        XR8.addCameraPipelineModules([
            XR8.GlTextureRenderer.pipelineModule(), // draws the camera feed to the canvas
            XR8.XrController.pipelineModule(),       // 6DoF motion + surface estimation
            this._threePipelineModule(),             // our scene, rendered on top
            this._eventsPipelineModule(),            // camera-permission / error handling
        ]);

        this._running = true;
        XR8.run({ canvas: this.canvas });
    }

    stop() {
        if (!this._running) return;
        this._running = false;
        try { this.XR8?.stop(); } catch { /* noop */ }
        try { this.XR8?.clearCameraPipelineModules(); } catch { /* noop */ }
        this.experience?.dispose?.();
        this.renderer?.dispose?.();
        this.root?.remove();
        this.opts.onExit?.();
    }

    // ─── DOM overlay: canvas + HUD + hotspot markers live here ───
    _buildOverlay() {
        const root = document.createElement('div');
        root.className = 'ar-live';
        root.innerHTML = `
            <canvas class="ar-live__canvas"></canvas>
            <div class="ar-live__markers"></div>

            <div class="ar-live__coach" data-state="scanning">
                <div class="ar-live__coach-icon">📱</div>
                <p class="ar-live__coach-text">Slowly move your phone to scan the floor…</p>
            </div>

            <div class="ar-live__hud">
                <button class="ar-live__btn ar-live__exit" aria-label="Exit AR">✕</button>
                <div class="ar-live__actions">
                    <button class="ar-live__btn ar-live__reset" hidden>↻ Move</button>
                    <button class="ar-live__btn ar-live__photoreal" hidden>✨ Photoreal</button>
                    <button class="ar-live__btn ar-live__snap" hidden>📸</button>
                </div>
            </div>

            <div class="ar-live__scalebar" hidden>
                <span class="ar-live__scalebar-fill"></span>
                <span class="ar-live__scalebar-text">46.7 cm — actual size</span>
            </div>
        `;
        document.body.appendChild(root);

        this.root = root;
        this.canvas = root.querySelector('.ar-live__canvas');
        this.markerLayer = root.querySelector('.ar-live__markers');
        this.coach = root.querySelector('.ar-live__coach');
        this.resetBtn = root.querySelector('.ar-live__reset');
        this.photorealBtn = root.querySelector('.ar-live__photoreal');
        this.snapBtn = root.querySelector('.ar-live__snap');
        this.scalebar = root.querySelector('.ar-live__scalebar');

        root.querySelector('.ar-live__exit').addEventListener('click', () => this.stop());
        this.resetBtn.addEventListener('click', () => this._unplace());
        this.snapBtn.addEventListener('click', () => this._snapshot());
        if (this.opts.splatUrl) {
            this.photorealBtn.hidden = false;
            this.photorealBtn.addEventListener('click', () => this._togglePhotoreal());
        }

        // Tap-to-place / re-place.
        this.canvas.addEventListener('click', (e) => this._onTap(e));
    }

    // ─── Custom three.js pipeline module (shares 8th Wall's GL context) ───
    _threePipelineModule() {
        return {
            name: 'pd-three',
            onStart: ({ canvas, GLctx }) => this._onThreeStart(canvas, GLctx),
            onUpdate: ({ processCpuResult }) => this._onPose(processCpuResult),
            onRender: () => this._onRender(),
            // Keep our viewport in sync with the engine's canvas (orientation changes).
            onCanvasSizeChange: ({ canvasWidth, canvasHeight }) => {
                this.renderer?.setSize(canvasWidth, canvasHeight, false);
            },
        };
    }

    _onThreeStart(canvas, GLctx) {
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            context: GLctx,
            alpha: false,
            antialias: true,
        });
        this.renderer.autoClear = false; // camera feed is drawn first; we only clear depth
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, canvas.width / canvas.height, 0.01, 1000);
        this.scene.add(this.camera);

        // Studio-ish lighting so the mesh reads well against a real room.
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.1));
        const key = new THREE.DirectionalLight(0xffffff, 1.4);
        key.position.set(2, 4, 3);
        key.castShadow = true;
        this.scene.add(key);

        // Placement root — everything we anchor to the floor lives under here.
        this.placeRoot = new THREE.Group();
        this.placeRoot.visible = false;
        this.scene.add(this.placeRoot);

        // Ground shadow catcher for realism.
        const shadowMat = new THREE.ShadowMaterial({ opacity: 0.28 });
        const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), shadowMat);
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.receiveShadow = true;
        this.placeRoot.add(shadowPlane);
        this.renderer.shadowMap.enabled = true;

        // Reticle that snaps to the floor before placement.
        this.reticle = this._buildReticle();
        this.scene.add(this.reticle);

        if (this.experience) {
            this.experience.build({
                THREE,
                scene: this.scene,
                camera: this.camera,
                renderer: this.renderer,
                placeRoot: this.placeRoot,
                hudHost: this.root, // AR overlay — inject custom controls here (correctly layered)
            });
        } else {
            this._loadModel();
        }
        this._buildMarkers();
    }

    _buildReticle() {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.12, 0.16, 48),
            new THREE.MeshBasicMaterial({ color: 0x4dd0e1, transparent: true, opacity: 0.9 })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.visible = false;
        return ring;
    }

    _loadModel() {
        new GLTFLoader().load(this.opts.modelUrl, (gltf) => {
            const model = gltf.scene;
            model.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
            this.meshGroup = model;
            this.placeRoot.add(model);
        });
    }

    // Hotspot + dimension DOM markers, positioned each frame by projecting
    // their 3D anchor to screen space. Reuses the existing .hotspot styling.
    _buildMarkers() {
        const { hotspots = [], dimensions } = this.opts;

        hotspots.forEach((h) => {
            const el = document.createElement('button');
            el.className = 'ar-marker';
            el.innerHTML = `
                <span class="ar-marker__dot"></span>
                <span class="ar-marker__label">
                    <strong>${h.emoji ?? ''} ${h.title}</strong>
                    <span>${h.body}</span>
                </span>`;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.markerLayer.querySelectorAll('.ar-marker.open')
                    .forEach((m) => { if (m !== el) m.classList.remove('open'); });
                el.classList.toggle('open');
            });
            this.markerLayer.appendChild(el);
            this.markerEls.push({ el, anchor: new THREE.Vector3(...h.position) });
        });

        // Three dimension callouts on the bounding faces.
        if (dimensions) {
            const { w, h, d } = dimensions;
            const dims = [
                { txt: `${(w * 100).toFixed(1)} cm`, sub: 'width', at: [0, 0, d / 2 + 0.02] },
                { txt: `${(h * 100).toFixed(1)} cm`, sub: 'height', at: [-w / 2 - 0.02, 0, 0] },
                { txt: `${(d * 100).toFixed(1)} cm`, sub: 'depth', at: [w / 2 + 0.02, 0, 0] },
            ];
            dims.forEach((dm) => {
                const el = document.createElement('div');
                el.className = 'ar-marker ar-marker--dim';
                el.innerHTML = `<span class="ar-marker__dim">${dm.txt}<em>${dm.sub}</em></span>`;
                this.markerLayer.appendChild(el);
                this.markerEls.push({ el, anchor: new THREE.Vector3(...dm.at) });
            });
        }
    }

    // ─── Per-frame pose from 8th Wall → our camera ───
    _onPose(processCpuResult) {
        const realitySource = processCpuResult?.reality;
        if (!realitySource) return;
        const { rotation, position, intrinsics } = realitySource;

        if (intrinsics) {
            const m = this.camera.projectionMatrix.elements;
            for (let i = 0; i < 16; i++) m[i] = intrinsics[i];
            this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
        }
        if (rotation) {
            this.camera.setRotationFromQuaternion(rotation);
        }
        if (position) {
            this.camera.position.set(position.x, position.y, position.z);
        }

        if (!this.placed) this._updateReticle();
    }

    // Cast from screen centre to the floor; park the reticle there.
    _updateReticle() {
        if (!this.reticle) return;
        this._ndc.set(0, 0);
        this._raycaster.setFromCamera(this._ndc, this.camera);
        const hit = this._rayToGround();
        if (hit) {
            this.reticle.position.copy(hit);
            this.reticle.visible = true;
            this.coach?.setAttribute('data-state', 'ready');
            const t = this.coach?.querySelector('.ar-live__coach-text');
            if (t) t.textContent = 'Tap to place the machine on the floor';
        } else {
            this.reticle.visible = false;
        }
    }

    _rayToGround() {
        const dir = this._raycaster.ray.direction;
        const origin = this._raycaster.ray.origin;
        if (Math.abs(dir.y) < 1e-5) return null;
        const t = (GROUND_Y - origin.y) / dir.y;
        if (t <= 0) return null; // ground is behind us
        return this._tmpVec.copy(origin).addScaledVector(dir, t).clone();
    }

    _onTap(e) {
        if (!this.camera) return;
        const rect = this.canvas.getBoundingClientRect();
        this._ndc.set(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        this._raycaster.setFromCamera(this._ndc, this.camera);
        const hit = this._rayToGround();
        if (!hit) return;

        this.placeRoot.position.copy(hit);
        // Face the machine toward the viewer at placement time.
        this.placeRoot.rotation.y = Math.atan2(
            this.camera.position.x - hit.x,
            this.camera.position.z - hit.z
        );
        this.placeRoot.visible = true;
        this._setPlaced(true);
    }

    _unplace() {
        this._setPlaced(false);
    }

    _setPlaced(placed) {
        this.placed = placed;
        if (this.reticle) this.reticle.visible = !placed;
        if (this.placeRoot) this.placeRoot.visible = placed;
        this.resetBtn.hidden = !placed;
        this.snapBtn.hidden = !placed;
        this.scalebar.hidden = !placed;
        this.coach.style.display = placed ? 'none' : '';
        if (placed) this.experience?.onPlaced?.();
    }

    // ─── Photoreal (Gaussian splat) toggle ───
    async _togglePhotoreal() {
        this.splatMode = !this.splatMode;
        this.photorealBtn.classList.toggle('active', this.splatMode);

        if (this.splatMode && !this.splatMesh) {
            const { SparkRenderer, SplatMesh } = await loadSpark();
            if (!this.sparkRenderer) {
                this.sparkRenderer = new SparkRenderer({ renderer: this.renderer });
                this.scene.add(this.sparkRenderer);
            }
            this.splatMesh = new SplatMesh({ url: this.opts.splatUrl });
            this.placeRoot.add(this.splatMesh);
        }
        if (this.splatMesh) this.splatMesh.visible = this.splatMode;
        if (this.meshGroup) this.meshGroup.visible = !this.splatMode;
        // Dimension/hotspot markers only make sense on the mesh.
        this.markerLayer.classList.toggle('ar-markers--hidden', this.splatMode);
    }

    // ─── Render + project DOM markers ───
    _onRender() {
        if (!this.renderer) return;
        if (this.experience) {
            const now = performance.now();
            const dt = this._lastT ? Math.min((now - this._lastT) / 1000, 0.05) : 0;
            this._lastT = now;
            this.experience.update(dt);
        }
        this.renderer.clearDepth();
        this.renderer.render(this.scene, this.camera);
        if (this.placed) this._projectMarkers();
    }

    _projectMarkers() {
        const rect = this.canvas.getBoundingClientRect();
        const hidden = this.markerLayer.classList.contains('ar-markers--hidden');
        this.markerEls.forEach(({ el, anchor }) => {
            this._tmpVec.copy(anchor);
            this.placeRoot.localToWorld(this._tmpVec);
            this._tmpVec.project(this.camera);
            const behind = this._tmpVec.z > 1;
            if (behind || hidden) { el.style.display = 'none'; return; }
            el.style.display = '';
            el.style.left = `${(this._tmpVec.x * 0.5 + 0.5) * rect.width}px`;
            el.style.top = `${(-this._tmpVec.y * 0.5 + 0.5) * rect.height}px`;
        });
    }

    async _snapshot() {
        try {
            // Composite the camera feed + our scene straight off the canvas.
            const url = this.canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = url;
            a.download = `APD-in-my-room.png`;
            a.click();
        } catch (err) {
            console.warn('AR snapshot failed:', err);
        }
    }

    // ─── Camera permission / runtime error handling ───
    _eventsPipelineModule() {
        return {
            name: 'pd-events',
            onCameraStatusChange: ({ status }) => {
                if (status === 'failed') {
                    alert('Camera access is required for AR.\n\nPlease allow camera permission and reload.');
                    this.stop();
                }
            },
            onException: (err) => {
                console.error('8th Wall exception:', err);
            },
        };
    }
}
