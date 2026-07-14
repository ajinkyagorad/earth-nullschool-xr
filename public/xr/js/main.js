/**
 * Main Application - Earth XR
 *
 * Three.js + WebXR globe with wind particle visualization.
 * Supports: Desktop (monitor), Passthrough (immersive-ar), VR (immersive-vr)
 *
 * Entry point loaded from index.html as ES module.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRManager } from './xr-manager.js';
import { Globe } from './globe.js';
import { WindParticles } from './particles.js';
import { DataLoader } from './data-loader.js';

// ============================================================
// DOM References
// ============================================================
const container = document.getElementById('xr-container');
const loadingEl = document.getElementById('loading');
const infoEl = document.getElementById('info');
const startBtn = document.getElementById('start-btn');
const statsEl = document.getElementById('stats');
const enterXrBtn = document.getElementById('enter-xr');
const xrHintEl = document.getElementById('xr-hint');

const modeDesktop = document.getElementById('mode-desktop');
const modePassthrough = document.getElementById('mode-passthrough');
const modeVr = document.getElementById('mode-vr');

// ============================================================
// Three.js Setup
// ============================================================
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = false;
renderer.xr.setReferenceSpaceType('local-floor');

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

container.insertBefore(renderer.domElement, container.firstChild);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000005);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0.5, 3.2);
camera.lookAt(0, 0, 0);

// ============================================================
// Orbit Controls (Desktop mode)
// ============================================================
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.5;
controls.zoomSpeed = 0.8;
controls.minDistance = 1.5;
controls.maxDistance = 8.0;
controls.target.set(0, 0, 0);
controls.enabled = false; // disabled until user clicks start

// ============================================================
// Application State
// ============================================================
const state = {
    mode: 'desktop',
    isReady: false,
    isXR: false,
    particleCount: 3000,
    autoRotate: false,
    showGraticule: true,
    running: false,
};

// ============================================================
// Components
// ============================================================
const globe = new Globe(scene);
globe.autoRotate = false;

const particles = new WindParticles(scene, globe, state.particleCount);

const dataLoader = new DataLoader();
dataLoader.onProgress = (pct) => {
    const pctEl = loadingEl.querySelector('div:last-child');
    if (pctEl) pctEl.textContent = `Loading weather data... ${Math.round(pct * 100)}%`;
};

const xrManager = new XRManager(renderer, camera, handleModeChange);

// ============================================================
// XR Controller Interaction
// ============================================================
const controllers = [];
const controllerGrips = [];

function setupXRControllers() {
    // Create two XR controllers (left and right)
    for (let i = 0; i < 2; i++) {
        const controller = renderer.xr.getController(i);
        controller.addEventListener('selectstart', onXRSelectStart);
        controller.addEventListener('selectend', onXRSelectEnd);
        controller.addEventListener('squeezestart', onXRSqueezeStart);
        controller.addEventListener('squeezeend', onXRSqueezeEnd);
        scene.add(controller);
        controllers.push(controller);

        const grip = renderer.xr.getControllerGrip(i);
        scene.add(grip);
        controllerGrips.push(grip);
    }

    // Add a visible controller model (simple ray)
    controllers.forEach((controller) => {
        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -1),
        ]);
        const material = new THREE.LineBasicMaterial({
            color: 0xe2b42e,
            transparent: true,
            opacity: 0.5,
        });
        const line = new THREE.Line(geometry, material);
        controller.add(line);
    });
}

// XR Interaction state
const xrInteraction = {
    isGrabbing: false,
    grabController: null,
    grabRotation: new THREE.Quaternion(),
    initialDistance: 0,
};

function onXRSelectStart(event) {
    // Trigger interaction - could show data at point
    const controller = event.target;
    console.log('[XR] Select on controller', controller);
}

function onXRSelectEnd(event) {
    // Trigger release
}

function onXRSqueezeStart(event) {
    // Grab the globe
    const controller = event.target;
    xrInteraction.isGrabbing = true;
    xrInteraction.grabController = controller;

    // Store the globe's current rotation
    xrInteraction.grabRotation.copy(globe.group.quaternion);

    // Disable auto-rotate when user grabs
    globe.autoRotate = false;

    console.log('[XR] Grab started');
}

function onXRSqueezeEnd(event) {
    xrInteraction.isGrabbing = false;
    xrInteraction.grabController = null;
    console.log('[XR] Grab ended');
}

// ============================================================
// Mode Management
// ============================================================

function handleModeChange(modeInfo) {
    const { mode, session, error } = modeInfo;

    if (error) {
        console.warn('Mode change error:', error);
        setModeUI('desktop');
        return;
    }

    state.mode = mode;
    state.isXR = mode !== 'desktop';

    // Update scene background for passthrough mode
    if (mode === 'passthrough') {
        scene.background = null; // transparent for AR
    } else {
        scene.background = new THREE.Color(0x000005);
    }

    controls.enabled = !state.isXR;

    setModeUI(mode);
    setXrHint(mode);

    console.log(`[App] Switched to mode: ${mode}`);
}

function setModeUI(activeMode) {
    [modeDesktop, modePassthrough, modeVr].forEach(btn => btn.classList.remove('active'));
    if (activeMode === 'desktop') modeDesktop.classList.add('active');
    else if (activeMode === 'passthrough') modePassthrough.classList.add('active');
    else if (activeMode === 'vr') modeVr.classList.add('active');

    enterXrBtn.classList.toggle('hidden', activeMode !== 'desktop');
    infoEl.classList.toggle('hidden', activeMode !== 'desktop');
    document.getElementById('mode-toggle').style.display = activeMode === 'desktop' ? 'flex' : 'none';
}

function setXrHint(mode) {
    if (mode === 'passthrough') {
        xrHintEl.textContent = '📷 Passthrough — Globe in your space • Grip to rotate • Trigger to select';
        xrHintEl.classList.remove('hidden');
    } else if (mode === 'vr') {
        xrHintEl.textContent = '🥽 VR — Full immersion • Grip to rotate • Trigger to select';
        xrHintEl.classList.remove('hidden');
    } else {
        xrHintEl.classList.add('hidden');
    }
}

// ============================================================
// Mode Button Handlers
// ============================================================

let pendingXRMode = null;

async function switchToDesktop() {
    if (state.mode === 'desktop') return;
    await xrManager.switchMode('desktop');
    startDesktopLoop();
}

async function switchToPassthrough() {
    if (state.mode === 'passthrough') return;
    if (!state.isXR) {
        if (!navigator.xr) {
            console.warn('[App] WebXR not available');
            return;
        }
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        if (!supported) {
            console.warn('[App] Passthrough (immersive-ar) not supported on this device');
            return;
        }
        pendingXRMode = 'passthrough';
        enterXrBtn.classList.remove('hidden');
        enterXrBtn.textContent = '📷 Enter Passthrough';
        return;
    }
    await xrManager.switchMode('passthrough');
}

async function switchToVR() {
    if (state.mode === 'vr') return;
    if (!state.isXR) {
        if (!navigator.xr) {
            console.warn('[App] WebXR not available');
            return;
        }
        const supported = await navigator.xr.isSessionSupported('immersive-vr');
        if (!supported) {
            console.warn('[App] VR (immersive-vr) not supported on this device');
            return;
        }
        pendingXRMode = 'vr';
        enterXrBtn.classList.remove('hidden');
        enterXrBtn.textContent = '🥽 Enter VR';
        return;
    }
    await xrManager.switchMode('vr');
}

enterXrBtn.addEventListener('click', async () => {
    const target = pendingXRMode || 'passthrough';
    enterXrBtn.classList.add('hidden');
    await xrManager.switchMode(target);
    pendingXRMode = null;
});

modeDesktop.addEventListener('click', switchToDesktop);
modePassthrough.addEventListener('click', switchToPassthrough);
modeVr.addEventListener('click', switchToVR);

// ============================================================
// Initialization (triggered by Start button)
// ============================================================
let animationId = null;

startBtn.addEventListener('click', async () => {
    startBtn.classList.add('hidden');
    loadingEl.classList.remove('hidden');

    try {
        const grids = await dataLoader.load();
        const windFn = dataLoader.getWindField();
        if (windFn) {
            particles.setWindField(windFn);
            console.log('[App] Wind field loaded');
        } else {
            console.warn('[App] No wind data, using synthetic field');
            particles.setWindField(syntheticWindField);
        }

        state.isReady = true;
        loadingEl.classList.add('hidden');
        infoEl.classList.remove('hidden');
        controls.enabled = true;

        // Log XR support but keep buttons visible; clicking checks support on-demand
        const support = await xrManager.getSupport();
        console.log(`[App] XR support - AR: ${support.ar}, VR: ${support.vr}`);

        state.running = true;
        startDesktopLoop();

    } catch (err) {
        console.error('[App] Init failed:', err);
        loadingEl.innerHTML = `
            <div style="color:#e88;font-size:14px;">⚠️ Failed to load weather data</div>
            <div style="font-size:12px;color:#888;margin-top:8px;">Using synthetic wind for demo</div>
        `;

        particles.setWindField(syntheticWindField);
        state.isReady = true;
        state.running = true;

        setTimeout(() => {
            loadingEl.classList.add('hidden');
            infoEl.classList.remove('hidden');
            controls.enabled = true;
            startDesktopLoop();
        }, 1500);
    }
});

/**
 * Synthetic wind field for demo/testing when real data is unavailable.
 */
function syntheticWindField(lon, lat) {
    const u = 5 * Math.sin(lat * Math.PI / 90) * Math.cos(lon * Math.PI / 180 * 3);
    const v = 3 * Math.cos(lat * Math.PI / 90) * Math.sin(lon * Math.PI / 180 * 2);
    const mag = Math.sqrt(u * u + v * v);
    return [u, v, mag];
}

// ============================================================
// Render Loops
// ============================================================

function startDesktopLoop() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    controls.enabled = true;

    let frameCount = 0;
    let lastTime = performance.now();
    let fps = 0;

    function desktopFrame(time) {
        if (!state.running || state.mode !== 'desktop') {
            animationId = null;
            return;
        }

        animationId = requestAnimationFrame(desktopFrame);

        frameCount++;
        if (time - lastTime > 1000) {
            fps = frameCount;
            frameCount = 0;
            lastTime = time;
            if (statsEl) {
                const mode = state.mode === 'desktop' ? 'Desktop' : state.mode;
                statsEl.textContent = `${mode} • ${fps} FPS • ${state.particleCount} particles`;
            }
        }

        controls.update();
        globe.update();
        particles.update(time);

        renderer.render(scene, camera);
    }

    desktopFrame(performance.now());
}

function xrFrame(time, frame) {
    if (!state.isXR || !state.running) return;

    globe.update();

    // Handle XR controller grab interaction
    if (xrInteraction.isGrabbing && xrInteraction.grabController) {
        const controller = xrInteraction.grabController;
        // Use controller orientation to rotate globe
        const controllerQuat = new THREE.Quaternion();
        controller.getWorldQuaternion(controllerQuat);

        // Map controller rotation to globe rotation with some dampening
        // Simple approach: use the controller's Y-axis rotation for globe Y rotation
        const euler = new THREE.Euler().setFromQuaternion(controllerQuat);
        globe.group.rotation.y = euler.y * 0.5;
        globe.group.rotation.x = euler.x * 0.3;
    }

    particles.update(time);

    // renderer.render() is called automatically by the XR system
}

// ============================================================
// XR Session Setup
// ============================================================

// Patch the renderer's setAnimationLoop to handle our xrFrame
const originalSetAnimationLoop = renderer.setAnimationLoop.bind(renderer);
renderer.setAnimationLoop = (callback) => {
    if (callback) {
        originalSetAnimationLoop(xrFrame);
    } else {
        originalSetAnimationLoop(null);
    }
};

// Listen for XR session start to set up controllers
renderer.xr.addEventListener('sessionstart', () => {
    console.log('[App] XR session started');
    setupXRControllers();
    state.running = true;
});

renderer.xr.addEventListener('sessionend', () => {
    console.log('[App] XR session ended');
    state.running = false;
});

// ============================================================
// Window Resize
// ============================================================
window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
});

// ============================================================
// Keyboard shortcuts (desktop only)
// ============================================================
window.addEventListener('keydown', (e) => {
    if (!state.isReady) return;
    switch (e.key) {
        case '1': switchToDesktop(); break;
        case '2': switchToPassthrough(); break;
        case '3': switchToVR(); break;
        case 'r': case 'R':
            state.autoRotate = !state.autoRotate;
            globe.autoRotate = state.autoRotate;
            break;
        case 'g': case 'G':
            state.showGraticule = !state.showGraticule;
            if (globe.graticule) globe.graticule.visible = state.showGraticule;
            break;
    }
});

// Show the start button
startBtn.classList.remove('hidden');
loadingEl.classList.add('hidden');

// ============================================================
// Cleanup
// ============================================================
window.addEventListener('beforeunload', () => {
    if (animationId) cancelAnimationFrame(animationId);
    xrManager.dispose();
    particles.dispose();
    globe.dispose();
    dataLoader.dispose();
    renderer.dispose();
});