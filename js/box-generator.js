// ═══════════════════════════════════════════════════
// Box GLB Generator — Creates proper 3D boxes with
// distinct face colors for realistic AR experience
// ═══════════════════════════════════════════════════

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/**
 * Generate a single box with per-face coloring for 3D depth perception.
 * Returns a Blob URL pointing to a .glb file.
 *
 * @param {number} width  - Width in meters
 * @param {number} height - Height in meters
 * @param {number} depth  - Depth in meters
 * @param {object} colors - { top, bottom, front, back, left, right } hex colors
 */
export async function generateColoredBox(width, height, depth, colors = {}) {
    const defaultColors = {
        top: colors.top || '#d4a843',  // Gold/tan top
        bottom: colors.bottom || '#8b6914',  // Darker bottom
        front: colors.front || '#c6a664',  // Warm front
        back: colors.back || '#a58940',  // Slightly darker back
        right: colors.right || '#b89a50',  // Muted right
        left: colors.left || '#b89a50',  // Muted left
    };

    const scene = new THREE.Scene();

    // Create 6 separate planes for each face with unique materials
    const faces = [
        { name: 'front', color: defaultColors.front, pos: [0, 0, depth / 2], rot: [0, 0, 0], size: [width, height] },
        { name: 'back', color: defaultColors.back, pos: [0, 0, -depth / 2], rot: [0, Math.PI, 0], size: [width, height] },
        { name: 'top', color: defaultColors.top, pos: [0, height / 2, 0], rot: [-Math.PI / 2, 0, 0], size: [width, depth] },
        { name: 'bottom', color: defaultColors.bottom, pos: [0, -height / 2, 0], rot: [Math.PI / 2, 0, 0], size: [width, depth] },
        { name: 'right', color: defaultColors.right, pos: [width / 2, 0, 0], rot: [0, Math.PI / 2, 0], size: [depth, height] },
        { name: 'left', color: defaultColors.left, pos: [-width / 2, 0, 0], rot: [0, -Math.PI / 2, 0], size: [depth, height] },
    ];

    faces.forEach(f => {
        const geo = new THREE.PlaneGeometry(f.size[0], f.size[1]);
        const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(f.color),
            roughness: 0.8,
            metalness: 0.05,
            side: THREE.FrontSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(...f.pos);
        mesh.rotation.set(...f.rot);
        mesh.name = f.name;
        scene.add(mesh);
    });

    // Export as GLB
    const exporter = new GLTFExporter();
    return new Promise((resolve, reject) => {
        exporter.parse(scene, (buffer) => {
            const blob = new Blob([buffer], { type: 'model/gltf-binary' });
            resolve(URL.createObjectURL(blob));
        }, (err) => reject(err), { binary: true });
    });
}

/**
 * Generate a stack of PD fluid supply boxes with alternating colors.
 * Returns a Blob URL pointing to a .glb file.
 *
 * @param {number} count    - Number of boxes
 * @param {string} strategy - 'block', 'wall', 'tower', 'pallet'
 */
export async function generateSupplyStack(count, strategy = 'block') {
    const BOX_W = 0.29;  // meters
    const BOX_D = 0.47;  // meters
    const BOX_H = 0.17;  // meters

    const scene = new THREE.Scene();

    // Alternating color pairs for visual distinction
    const colorSets = [
        { top: '#e8d5a0', front: '#d4a843', right: '#c49730', back: '#b89030', left: '#c49730', bottom: '#a07820' },
        { top: '#c8e0f0', front: '#6aabcf', right: '#5a98bb', back: '#5090b0', left: '#5a98bb', bottom: '#4080a0' },
    ];

    // Generate box positions based on strategy
    const positions = [];

    if (strategy === 'block') {
        const perRow = 2;
        const perLayer = 4;
        for (let i = 0; i < count; i++) {
            const layer = Math.floor(i / perLayer);
            const inLayer = i % perLayer;
            const col = inLayer % perRow;
            const row = Math.floor(inLayer / perRow);
            positions.push({
                x: (col - 0.5) * BOX_W,
                y: layer * BOX_H + BOX_H / 2,
                z: (row - 0.5) * BOX_D,
            });
        }
    } else if (strategy === 'wall') {
        const perRow = 6;
        for (let i = 0; i < count; i++) {
            const layer = Math.floor(i / perRow);
            const col = i % perRow;
            positions.push({
                x: (col - 2.5) * BOX_W,
                y: layer * BOX_H + BOX_H / 2,
                z: 0,
            });
        }
    } else if (strategy === 'tower') {
        for (let i = 0; i < count; i++) {
            positions.push({
                x: 0,
                y: i * BOX_H + BOX_H / 2,
                z: 0,
            });
        }
    } else if (strategy === 'pallet') {
        const perRow = 5;
        const palletHeight = 0.15;
        for (let i = 0; i < count; i++) {
            const layer = Math.floor(i / perRow);
            const col = i % perRow;
            positions.push({
                x: (col - 2) * BOX_W,
                y: palletHeight + layer * BOX_H + BOX_H / 2,
                z: 0,
            });
        }
        // Add pallet base
        const palletGeo = new THREE.BoxGeometry(1.2, 0.15, 1.0);
        const palletMat = new THREE.MeshStandardMaterial({ color: '#8B6914', roughness: 0.9 });
        const palletMesh = new THREE.Mesh(palletGeo, palletMat);
        palletMesh.position.set(0, 0.075, 0);
        scene.add(palletMesh);
    }

    // Create each box with face colors
    positions.forEach((pos, index) => {
        const cs = colorSets[index % 2];
        const group = new THREE.Group();

        const faces = [
            { color: cs.front, p: [0, 0, BOX_D / 2], r: [0, 0, 0], s: [BOX_W, BOX_H] },
            { color: cs.back, p: [0, 0, -BOX_D / 2], r: [0, Math.PI, 0], s: [BOX_W, BOX_H] },
            { color: cs.top, p: [0, BOX_H / 2, 0], r: [-Math.PI / 2, 0, 0], s: [BOX_W, BOX_D] },
            { color: cs.bottom, p: [0, -BOX_H / 2, 0], r: [Math.PI / 2, 0, 0], s: [BOX_W, BOX_D] },
            { color: cs.right, p: [BOX_W / 2, 0, 0], r: [0, Math.PI / 2, 0], s: [BOX_D, BOX_H] },
            { color: cs.left, p: [-BOX_W / 2, 0, 0], r: [0, -Math.PI / 2, 0], s: [BOX_D, BOX_H] },
        ];

        faces.forEach(f => {
            const geo = new THREE.PlaneGeometry(f.s[0] * 0.98, f.s[1] * 0.98); // Slight inset for edge lines
            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(f.color),
                roughness: 0.75,
                metalness: 0.05,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(...f.p);
            mesh.rotation.set(...f.r);
            group.add(mesh);
        });

        // Add subtle edge wireframe for box outline
        const edgeGeo = new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D);
        const edgeMat = new THREE.MeshStandardMaterial({
            color: 0x000000,
            wireframe: true,
            transparent: true,
            opacity: 0.15,
        });
        const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
        group.add(edgeMesh);

        group.position.set(pos.x, pos.y, pos.z);
        scene.add(group);
    });

    // Export as GLB
    const exporter = new GLTFExporter();
    return new Promise((resolve, reject) => {
        exporter.parse(scene, (buffer) => {
            const blob = new Blob([buffer], { type: 'model/gltf-binary' });
            resolve(URL.createObjectURL(blob));
        }, (err) => reject(err), { binary: true });
    });
}
