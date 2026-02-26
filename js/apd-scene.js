import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class APDScene {
    constructor(canvas) {
        this.canvas = canvas;
        this.hotspots = [];
        this.isIdle = true;
        this.idleY = 0;
        this.currentModel = null;

        this.init();
    }

    init() {
        // 1. Scene & Camera
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0d0d0d);
        this.scene.fog = new THREE.Fog(0x0d0d0d, 5, 15);

        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 0.5, 2);

        // 2. Renderer
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // 3. Lighting (Studio Setup)
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        const keyLight = new THREE.DirectionalLight(0xffffff, 1);
        keyLight.position.set(5, 5, 5);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 1024;
        keyLight.shadow.mapSize.height = 1024;
        this.scene.add(keyLight);

        const fillLight = new THREE.HemisphereLight(0x4facfe, 0xffffff, 0.3);
        this.scene.add(fillLight);

        // 4. Ground Plane
        const groundGeo = new THREE.PlaneGeometry(20, 20);
        const groundMat = new THREE.ShadowMaterial({ opacity: 0.4 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.5;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // 5. APD Cycler / Machine Group
        this.modelGroup = new THREE.Group();
        this.scene.add(this.modelGroup);

        // 6. Model Loader
        this.loader = new GLTFLoader();
        this.loadModel();

        // 7. Hotspots
        this.addHotspot(0, 0.05, 0.2, "Display Screen", "High-contrast LCD that shows treatment status and alarms. It auto-dims at night.");
        this.addHotspot(0, -0.05, 0.2, "Cassette Door", "The main door where you load the disposable tubing set (cassette). Ensure it clicks shut.");
        this.addHotspot(0.2, 0, 0, "Solution Ports", "Up to 4 ports for your dialysis solution bags. Must be handled with strict sterile technique.");
        this.addHotspot(-0.24, -0.08, 0, "Power Switch", "Located on the side/rear. Keep the machine plugged in at all times during treatment.");

        // 8. Handle Resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    loadModel(type = 'proxy') {
        // Clear existing model
        if (this.currentModel) {
            this.modelGroup.remove(this.currentModel);
        }
        this.hotspots.forEach(h => this.modelGroup.remove(h.mesh));
        this.hotspots = [];

        if (type === 'proxy') {
            const group = new THREE.Group();

            const boxGeo = new THREE.BoxGeometry(0.467, 0.194, 0.387);
            const boxMat = new THREE.MeshStandardMaterial({
                color: 0x222222,
                metalness: 0.8,
                roughness: 0.1,
                emissive: 0x4facfe,
                emissiveIntensity: 0.05
            });
            const box = new THREE.Mesh(boxGeo, boxMat);
            box.castShadow = true;
            group.add(box);

            const screenGeo = new THREE.PlaneGeometry(0.3, 0.1);
            const screenMat = new THREE.MeshStandardMaterial({
                color: 0x000,
                emissive: 0x4facfe,
                emissiveIntensity: 0.4
            });
            const screen = new THREE.Mesh(screenGeo, screenMat);
            screen.position.set(0, 0.02, 0.195);
            group.add(screen);

            this.currentModel = group;
            this.modelGroup.add(group);

            // Add Hotspots back for APD
            this.addHotspot(0, 0.05, 0.2, "Display Screen", "High-contrast LCD that shows treatment status.");
            this.addHotspot(0, -0.05, 0.2, "Cassette Door", "Main door for loading the tubing set.");
            this.addHotspot(0.2, 0, 0, "Solution Ports", "Connection points for dialysis bags.");
            this.addHotspot(-0.24, -0.08, 0, "Power Switch", "Rear panel power controls.");

            console.log("Scene initialized with high-fidelity proxy. Ready for .glb swap.");

        } else if (type === 'vision-pro') {
            // Use the model URL from the tutorial (proxying GD via a CDN/direct link)
            // Note: Google Drive direct links often have CORS issues, so we'll use a reliable external sample for now if GD fails
            const visionProUrl = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb';

            console.log("Loading high-fidelity test model...");

            this.loader.load(visionProUrl, (gltf) => {
                const model = gltf.scene;

                // Auto-center and scale
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 0.5 / maxDim;
                model.scale.set(scale, scale, scale);

                // Center it
                const center = box.getCenter(new THREE.Vector3());
                model.position.x += (model.position.x - center.x) * scale;
                model.position.y += (model.position.y - center.y) * scale;
                model.position.z += (model.position.z - center.z) * scale;

                model.traverse(node => {
                    if (node.isMesh) {
                        node.castShadow = true;
                        node.receiveShadow = true;
                    }
                });

                this.currentModel = model;
                this.modelGroup.add(model);

                // Add test hotspots for Vision Pro
                this.addHotspot(0, 0, 0.2, "Glass Front", "Laminated glass that acts as an optical lens.");
                this.addHotspot(0.2, 0.1, 0, "Digital Crown", "Used to control immersion levels.");

            }, undefined, (error) => {
                console.error("Error loading test model:", error);
                this.loadModel('proxy'); // Fallback
            });
        }
    }

    addHotspot(x, y, z, title, description) {
        const geo = new THREE.SphereGeometry(0.02, 16, 16);
        const mat = new THREE.MeshBasicMaterial({ color: 0x4facfe, transparent: true, opacity: 0.6 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);

        // Add glow effect
        const glowGeo = new THREE.SphereGeometry(0.03, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({ color: 0x4facfe, transparent: true, opacity: 0.2 });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        mesh.add(glow);

        this.modelGroup.add(mesh);
        this.hotspots.push({ mesh, title, description, glow });
    }

    rotateModel(dx, dy) {
        this.modelGroup.rotation.y += dx * 2;
        this.modelGroup.rotation.x += dy * 2;

        // Clamp X rotation to prevent flipping
        this.modelGroup.rotation.x = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.modelGroup.rotation.x));
    }

    zoomModel(delta) {
        this.camera.position.z += delta * 2;
        this.camera.position.z = Math.max(0.8, Math.min(4, this.camera.position.z));
    }

    checkHotspots(x, y) {
        // Convert screen coords (0-1) to NDC (-1 to 1)
        const mouse = new THREE.Vector2(x * 2 - 1, -(y * 2 - 1));
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);

        const activeMeshes = this.hotspots.map(h => h.mesh);
        const intersects = raycaster.intersectObjects(activeMeshes);

        // Reset all glows
        this.hotspots.forEach(h => {
            h.glow.scale.set(1, 1, 1);
            h.mesh.material.color.set(0x4facfe);
        });

        if (intersects.length > 0) {
            const hitMesh = intersects[0].object;
            const hotspot = this.hotspots.find(h => h.mesh === hitMesh);

            // Pulse selected hotspot
            hitMesh.children[0].scale.set(1.5, 1.5, 1.5);
            hitMesh.material.color.set(0xffffff);

            return hotspot;
        }
        return null;
    }

    setIdle(isIdle) {
        this.isIdle = isIdle;
    }

    update() {
        if (this.isIdle) {
            this.modelGroup.rotation.y += 0.005;
            this.idleY += 0.02;
            this.modelGroup.position.y = Math.sin(this.idleY) * 0.02;
        } else {
            // Smoothly return to center height
            this.modelGroup.position.y *= 0.9;
        }

        // Pulse all hotspots subtly
        const time = Date.now() * 0.002;
        this.hotspots.forEach(h => {
            const s = 1 + Math.sin(time) * 0.1;
            h.mesh.scale.set(s, s, s);
        });

        this.renderer.render(this.scene, this.camera);
    }
}
