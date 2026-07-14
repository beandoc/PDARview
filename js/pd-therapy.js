// ═══════════════════════════════════════════════════════════════════
// PD Therapy in AR — the "Insight Heart" analog for peritoneal dialysis
// ───────────────────────────────────────────────────────────────────
// A pluggable ARSession experience (see js/ar-session.js). It builds a
// stylised, holographic cross-section of the abdomen and animates one
// full PD exchange:
//
//   FILL  — warmed dialysate flows down the Tenckhoff catheter and the
//           peritoneal cavity fills to ~2 L.
//   DWELL — fluid sits against the peritoneal membrane; urea, creatinine
//           and excess water diffuse OUT of the blood vessels, across the
//           membrane, INTO the fluid (the particle swarm). Real dwell is
//           ~4 h — shown here as a time-lapse.
//   DRAIN — the now-waste-laden ("cloudy") fluid drains back out.
//
// The anatomy is generated procedurally in Three.js on purpose: it keeps
// the download tiny and offline-capable, and an honest schematic is the
// right register for patient education (no fake medical realism).
// ═══════════════════════════════════════════════════════════════════

import * as THREE from 'three';

// Phase boundaries along a normalised cycle t ∈ [0, 1].
const FILL_END = 0.15;
const DWELL_END = 0.85;
const CYCLE_SECONDS = 24;        // wall-clock length of one animated cycle at 1×
const DWELL_HOURS = 4;           // real dwell time the time-lapse represents

const FLUID_CLEAR = new THREE.Color('#39c2ff'); // fresh dialysate (blue)
const FLUID_WASTE = new THREE.Color('#e0a23a'); // spent, toxin-laden (amber)

const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export class PDTherapyExperience {
    constructor() {
        this.t = 0;
        this.playing = false;
        this.speed = 1;
        this.loop = true;
        this.autoRotate = true; // spin on desktop; disabled in AR (the patient walks around it)
        this._elapsed = 0;
        this._onUpdateCb = null;
        this._disposables = [];
    }

    // ─── Public control API (wired to the timeline HUD) ───
    play() { this.playing = true; this._syncButtons(); }
    pause() { this.playing = false; this._syncButtons(); }
    togglePlay() { this.playing ? this.pause() : this.play(); }
    setSpeed(mult) { this.speed = mult; this._syncButtons(); }
    seek(t) { this.t = clamp01(t); this._apply(); }
    reset() { this.t = 0; this._apply(); }
    onUpdate(cb) { this._onUpdateCb = cb; }
    onPlaced() { this.play(); } // auto-start once anchored in the room

    // ─── Build the anatomy (called by ARSession once the scene exists) ───
    build({ placeRoot, hudHost }) {
        this.root = new THREE.Group();
        this.root.position.y = 0.55;          // float like a hologram above the placement point
        placeRoot.add(this.root);

        this._buildPedestal(placeRoot);
        this._buildBody();
        this._buildMembrane();
        this._buildFluid();
        this._buildCatheter();
        this._buildVessels();
        this._buildParticles();
        this._buildHUD(hudHost);

        this._apply();
    }

    // Glowing base disc + light beam — reads as an intentional medical hologram.
    _buildPedestal(placeRoot) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.16, 0.2, 64),
            this._track(new THREE.MeshBasicMaterial({ color: 0x39c2ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }))
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.002;
        placeRoot.add(ring);
        this.pedestalRing = ring;

        const beam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.18, 0.55, 48, 1, true),
            this._track(new THREE.MeshBasicMaterial({
                color: 0x39c2ff, transparent: true, opacity: 0.06,
                side: THREE.DoubleSide, depthWrite: false,
            }))
        );
        beam.position.y = 0.275;
        placeRoot.add(beam);
    }

    // Translucent abdominal cross-section (skin/body wall).
    _buildBody() {
        const geo = new THREE.SphereGeometry(0.5, 48, 32);
        geo.scale(0.34, 0.4, 0.24);
        const mat = this._track(new THREE.MeshStandardMaterial({
            color: 0xffd9c2, roughness: 0.6, metalness: 0.0,
            transparent: true, opacity: 0.1, depthWrite: false,
            emissive: 0xff9e80, emissiveIntensity: 0.15,
        }));
        const body = new THREE.Mesh(geo, mat);
        body.renderOrder = 1;
        this.root.add(body);

        // Faint wireframe skin for the "scan" aesthetic.
        const wire = new THREE.Mesh(geo.clone(), this._track(new THREE.MeshBasicMaterial({
            color: 0xff9e80, wireframe: true, transparent: true, opacity: 0.06, depthWrite: false,
        })));
        this.root.add(wire);
    }

    // Peritoneal membrane enclosing the cavity.
    _buildMembrane() {
        const geo = new THREE.SphereGeometry(0.5, 48, 32);
        geo.scale(0.26, 0.3, 0.18);
        this.membraneRadii = new THREE.Vector3(0.26 * 0.5, 0.3 * 0.5, 0.18 * 0.5);
        const mat = this._track(new THREE.MeshStandardMaterial({
            color: 0x8fe3ff, roughness: 0.4, transparent: true, opacity: 0.14,
            depthWrite: false, side: THREE.DoubleSide, emissive: 0x39c2ff, emissiveIntensity: 0.25,
        }));
        const m = new THREE.Mesh(geo, mat);
        m.renderOrder = 2;
        this.membrane = m;
        this.root.add(m);
    }

    // Dialysate fluid volume — scales with fill level, tints with waste load.
    _buildFluid() {
        const geo = new THREE.SphereGeometry(0.5, 48, 32);
        geo.scale(0.24, 0.28, 0.16);
        this.fluidMat = this._track(new THREE.MeshStandardMaterial({
            color: FLUID_CLEAR.clone(), transparent: true, opacity: 0.5,
            depthWrite: false, roughness: 0.15, metalness: 0.0,
            emissive: FLUID_CLEAR.clone(), emissiveIntensity: 0.4,
        }));
        const f = new THREE.Mesh(geo, this.fluidMat);
        f.renderOrder = 3;
        this.fluid = f;
        this.root.add(f);
    }

    // Tenckhoff catheter: curved tube from the lower-front abdomen into the cavity.
    _buildCatheter() {
        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0.02, -0.34, 0.26),   // exit site (outside body, lower front)
            new THREE.Vector3(0.02, -0.22, 0.14),
            new THREE.Vector3(0.0, -0.08, 0.05),
            new THREE.Vector3(0.0, 0.0, 0.0),        // tip, deep in the cavity
        ]);
        this.catheterCurve = curve;
        const geo = new THREE.TubeGeometry(curve, 64, 0.012, 12, false);
        const mat = this._track(new THREE.MeshStandardMaterial({
            color: 0xf2f4f8, roughness: 0.35, metalness: 0.1,
            emissive: 0x88aaff, emissiveIntensity: 0.15,
        }));
        const tube = new THREE.Mesh(geo, mat);
        tube.renderOrder = 4;
        this.root.add(tube);

        // A glowing bead that runs along the catheter to show flow direction.
        this.flowBead = new THREE.Mesh(
            new THREE.SphereGeometry(0.02, 16, 16),
            this._track(new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9 }))
        );
        this.root.add(this.flowBead);
    }

    // Sub-peritoneal capillary network — the source of the diffusing solutes.
    _buildVessels() {
        this.vesselMats = [];
        this.vesselSeeds = [];
        const rng = mulberry32(1337);
        for (let i = 0; i < 7; i++) {
            const pts = [];
            const a0 = rng() * Math.PI * 2;
            const b0 = rng() * Math.PI - Math.PI / 2;
            for (let s = 0; s <= 6; s++) {
                const a = a0 + s * 0.5 + (rng() - 0.5) * 0.4;
                const b = b0 + (rng() - 0.5) * 0.9;
                pts.push(this._onMembrane(a, b, 1.02 + rng() * 0.05));
            }
            const curve = new THREE.CatmullRomCurve3(pts);
            const geo = new THREE.TubeGeometry(curve, 40, 0.006, 8, false);
            const mat = this._track(new THREE.MeshStandardMaterial({
                color: 0xd63b4f, roughness: 0.5, emissive: 0xff4d6a, emissiveIntensity: 0.4,
            }));
            const v = new THREE.Mesh(geo, mat);
            v.renderOrder = 2;
            this.root.add(v);
            this.vesselMats.push(mat);
            // Remember a surface point near this vessel to spawn solute particles from.
            this.vesselSeeds.push(this._onMembrane(a0 + 1.5, b0, 0.98));
        }
    }

    // Point on/near the membrane surface for spherical coords (a: azimuth, b: elevation).
    _onMembrane(a, b, scale = 1) {
        const r = this.membraneRadii;
        return new THREE.Vector3(
            Math.cos(b) * Math.cos(a) * r.x * scale,
            Math.sin(b) * r.y * scale,
            Math.cos(b) * Math.sin(a) * r.z * scale
        );
    }

    // Solute swarm: particles migrate membrane → fluid interior during dwell.
    _buildParticles() {
        this.PCOUNT = 320;
        const positions = new Float32Array(this.PCOUNT * 3);
        const colors = new Float32Array(this.PCOUNT * 3);
        this.pStart = [];
        this.pEnd = [];
        this.pOffset = new Float32Array(this.PCOUNT);
        const rng = mulberry32(7);
        const waste = new THREE.Color('#ffb648');

        for (let i = 0; i < this.PCOUNT; i++) {
            const seed = this.vesselSeeds[i % this.vesselSeeds.length];
            const start = seed.clone().multiplyScalar(1 + (rng() - 0.5) * 0.15);
            // End point: somewhere inside the fluid volume.
            const end = this._onMembrane(rng() * Math.PI * 2, rng() * Math.PI - Math.PI / 2, rng() * 0.7);
            this.pStart.push(start);
            this.pEnd.push(end);
            this.pOffset[i] = rng();
            start.toArray(positions, i * 3);
            waste.toArray(colors, i * 3);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.pGeo = geo;
        this.pPos = positions;

        const mat = this._track(new THREE.PointsMaterial({
            size: 0.014, vertexColors: true, transparent: true, opacity: 0,
            depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
        }));
        this.pMat = mat;
        const pts = new THREE.Points(geo, mat);
        pts.renderOrder = 5;
        this.root.add(pts);
    }

    // ─── Per-frame update ───
    update(dt) {
        if (this.playing) {
            this.t += (dt * this.speed) / CYCLE_SECONDS;
            if (this.t >= 1) this.t = this.loop ? this.t % 1 : 1;
        }
        // Gentle idle rotation for the hologram feel (desktop only).
        if (this.root && this.autoRotate) this.root.rotation.y += dt * 0.12;
        this._elapsed = (this._elapsed || 0) + dt;
        this._apply();
    }

    _apply() {
        if (!this.fluid) return;
        const t = this.t;
        const phase = t < FILL_END ? 'fill' : t < DWELL_END ? 'dwell' : 'drain';

        // Fill fraction 0→1 (fill), 1 (dwell), 1→0.05 (drain).
        let fill;
        if (phase === 'fill') fill = easeInOut(t / FILL_END);
        else if (phase === 'dwell') fill = 1;
        else fill = 1 - easeInOut((t - DWELL_END) / (1 - DWELL_END)) * 0.95;

        this.fluid.scale.setScalar(0.05 + 0.95 * fill);

        // Waste load rises through the dwell → fluid tints blue → amber.
        const dwellProg = clamp01((t - FILL_END) / (DWELL_END - FILL_END));
        const wasteLoad = phase === 'drain' ? 1 : dwellProg;
        this.fluidMat.color.copy(FLUID_CLEAR).lerp(FLUID_WASTE, wasteLoad);
        this.fluidMat.emissive.copy(this.fluidMat.color);

        // Catheter flow bead: inward on fill, hidden on dwell, outward on drain.
        this._updateFlowBead(phase);

        // Vessel pulse.
        const pulse = 0.35 + 0.25 * Math.sin(this._elapsed * 4);
        for (const m of this.vesselMats) m.emissiveIntensity = pulse;

        // Solute diffusion particles — active during dwell (and clearing on drain).
        this._updateParticles(phase, dwellProg, t);

        // Pedestal shimmer.
        if (this.pedestalRing) this.pedestalRing.material.opacity = 0.5 + 0.2 * Math.sin(this._elapsed * 2);

        this._emitState(t, phase, dwellProg);
    }

    _updateFlowBead(phase) {
        if (!this.flowBead) return;
        if (phase === 'dwell') { this.flowBead.visible = false; return; }
        this.flowBead.visible = true;
        const speed = 0.6;
        let u = (this._elapsed * speed) % 1;
        if (phase === 'drain') u = 1 - u; // reverse direction on drain
        const p = this.catheterCurve.getPoint(clamp01(u));
        this.flowBead.position.copy(p);
        this.flowBead.material.color.set(phase === 'drain' ? 0xe0a23a : 0x9fe8ff);
    }

    _updateParticles(phase, dwellProg, t) {
        const pos = this.pPos;
        let opacity = 0;
        if (phase === 'dwell') opacity = 0.9;
        else if (phase === 'drain') opacity = 0.9 * (1 - easeInOut((t - DWELL_END) / (1 - DWELL_END)));
        this.pMat.opacity = opacity;
        if (opacity <= 0.01) { this.pMat.opacity = 0; return; }

        const flow = this._elapsed * 0.25;
        for (let i = 0; i < this.PCOUNT; i++) {
            // Progress from membrane (0) to fluid interior (1); gated by dwell progress.
            let p = (this.pOffset[i] + flow) % 1;
            p *= clamp01(dwellProg * 1.4);              // ramp up as the dwell proceeds
            if (phase === 'drain') p = clamp01(p + 0.5); // sweep inward remnants out
            const e = easeInOut(p);
            const s = this.pStart[i], en = this.pEnd[i];
            pos[i * 3] = s.x + (en.x - s.x) * e;
            pos[i * 3 + 1] = s.y + (en.y - s.y) * e;
            pos[i * 3 + 2] = s.z + (en.z - s.z) * e;
        }
        this.pGeo.attributes.position.needsUpdate = true;
    }

    _emitState(t, phase, dwellProg) {
        if (!this._onUpdateCb) return;
        const totalMin = DWELL_HOURS * 60;
        const mins = Math.round(dwellProg * totalMin);
        const dwellClock = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
        const label = phase === 'fill' ? 'Filling' : phase === 'dwell' ? 'Dwelling' : 'Draining';
        this._onUpdateCb({ t, phase, label, dwellClock, playing: this.playing, speed: this.speed });
    }

    // ─── Timeline HUD (injected into the AR overlay so it layers correctly) ───
    _buildHUD(hudHost) {
        if (!hudHost) return;
        const el = document.createElement('div');
        el.className = 'therapy-hud';
        el.innerHTML = `
            <div class="therapy-hud__status">
                <span class="therapy-hud__phase" data-phase="fill">Filling</span>
                <span class="therapy-hud__clock"></span>
            </div>
            <div class="therapy-hud__track">
                <span class="therapy-hud__seg therapy-hud__seg--fill" title="Fill"></span>
                <span class="therapy-hud__seg therapy-hud__seg--dwell" title="Dwell (~4 h)"></span>
                <span class="therapy-hud__seg therapy-hud__seg--drain" title="Drain"></span>
                <input class="therapy-hud__scrub" type="range" min="0" max="1000" value="0" aria-label="Scrub cycle" />
                <span class="therapy-hud__playhead"></span>
            </div>
            <div class="therapy-hud__controls">
                <button class="therapy-hud__btn therapy-hud__play">⏸ Pause</button>
                <button class="therapy-hud__btn therapy-hud__speed">1×</button>
                <button class="therapy-hud__btn therapy-hud__restart">↺ Restart</button>
            </div>`;
        hudHost.appendChild(el);
        this.hud = el;

        this.phaseEl = el.querySelector('.therapy-hud__phase');
        this.clockEl = el.querySelector('.therapy-hud__clock');
        this.scrub = el.querySelector('.therapy-hud__scrub');
        this.playhead = el.querySelector('.therapy-hud__playhead');
        this.playBtn = el.querySelector('.therapy-hud__play');
        this.speedBtn = el.querySelector('.therapy-hud__speed');

        this.playBtn.addEventListener('click', () => this.togglePlay());
        el.querySelector('.therapy-hud__restart').addEventListener('click', () => { this.reset(); this.play(); });
        this.speedBtn.addEventListener('click', () => {
            const speeds = [1, 2, 4, 0.5];
            const next = speeds[(speeds.indexOf(this.speed) + 1) % speeds.length];
            this.setSpeed(next);
        });
        this.scrub.addEventListener('input', () => {
            this.pause();
            this.seek(parseInt(this.scrub.value, 10) / 1000);
        });

        // Reflect state into the HUD each frame.
        this.onUpdate((st) => {
            if (!this._scrubbing) this.scrub.value = String(Math.round(st.t * 1000));
            this.playhead.style.left = `${st.t * 100}%`;
            this.phaseEl.textContent = st.label;
            this.phaseEl.dataset.phase = st.phase;
            this.clockEl.textContent = st.phase === 'dwell' ? `dwell ${st.dwellClock} / ${DWELL_HOURS}:00` :
                st.phase === 'fill' ? 'in ~10 min' : 'out ~20 min';
        });
        this.scrub.addEventListener('pointerdown', () => { this._scrubbing = true; });
        window.addEventListener('pointerup', () => { this._scrubbing = false; });
    }

    _syncButtons() {
        if (this.playBtn) this.playBtn.textContent = this.playing ? '⏸ Pause' : '▶ Play';
        if (this.speedBtn) this.speedBtn.textContent = `${this.speed}×`;
    }

    dispose() {
        this.hud?.remove();
        for (const d of this._disposables) { try { d.dispose(); } catch { /* noop */ } }
    }

    _track(material) { this._disposables.push(material); return material; }
}

// Small deterministic PRNG so the vessel/particle layout is stable across builds.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// The hotspots shown live over the anatomy (model-local metres, matching the float height).
export const THERAPY_HOTSPOTS = [
    { id: 'catheter', emoji: '🩺', title: 'Tenckhoff catheter', body: 'A soft, permanent tube carries dialysate in and out. The cuffs anchor it and block bacteria at the exit site.', position: [0.02, 0.21, 0.26] },
    { id: 'membrane', emoji: '🫧', title: 'Peritoneal membrane', body: 'The lining of your abdomen. Its rich blood supply lets it work as a natural filter.', position: [0.16, 0.55, 0.02] },
    { id: 'fluid', emoji: '💧', title: 'Dialysate (~2 L)', body: 'Sterile fluid dwells in the cavity. A sugar (glucose) pulls excess water out of your blood.', position: [0, 0.55, 0.14] },
    { id: 'vessels', emoji: '🩸', title: 'Blood vessels', body: 'Wastes like urea and creatinine, plus extra water, diffuse from here across the membrane into the fluid.', position: [-0.14, 0.72, 0.04] },
    { id: 'drain', emoji: '♻️', title: 'Spent fluid out', body: 'After the dwell, the now-cloudy fluid — full of waste — drains out, and a fresh fill begins.', position: [0.02, 0.24, 0.26] },
];
