/**
 * Minimal XR Earth — lightweight bridge from D3.js to WebXR.
 *
 * When the user clicks "Immersive" in the menu, this script:
 * 1. Loads Three.js from CDN (legacy script tag, no modules)
 * 2. Creates a simple 3D sphere with the Earth texture
 * 3. Hides the D3 display, enters WebXR passthrough or VR
 * 4. Positions the globe in front of the user
 *
 * Uses CDN: three.min.js + OrbitControls via vanilla script tags
 */
(function() {
    "use strict";

    var THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    var THREE_LOADED = false;
    var xrActive = false;
    var engine = null;

    // ---- Inject XR button into menu ----
    function injectButton() {
        var menu = document.getElementById('menu');
        if (!menu) return;

        // Check if already injected
        if (document.getElementById('xr-menu-btn')) return;

        var projP = menu.querySelector('p:has(#atlantis)');
        if (!projP) return;

        var p = document.createElement('p');
        p.innerHTML = 'XR | <span class="text-button" id="xr-menu-btn">🌐 Immersive</span>';
        projP.parentNode.insertBefore(p, projP.nextSibling);

        document.getElementById('xr-menu-btn').onclick = function() {
            // Close menu
            menu.classList.add('invisible');
            // Start XR
            startXR();
        };
    }

    // ---- Load Three.js from CDN ----
    function loadThreeJS(callback) {
        if (window.THREE && window.THREE.Scene) {
            THREE_LOADED = true;
            callback();
            return;
        }

        var script = document.createElement('script');
        script.src = THREE_CDN;
        script.onload = function() {
            THREE_LOADED = true;
            callback();
        };
        script.onerror = function() {
            console.error('[XR] Failed to load Three.js');
            alert('Failed to load XR libraries. Check internet connection.');
        };
        document.head.appendChild(script);
    }

    // ---- XR Engine ----
    function startXR() {
        if (xrActive) return;

        loadThreeJS(function() {
            runXR();
        });
    }

    function runXR() {
        var THREE = window.THREE;
        var container = document.getElementById('display');
        var details = document.getElementById('details');

        // ---- Create overlay ----
        var overlay = document.createElement('div');
        overlay.id = 'xr-min-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:200;background:#000005;display:flex;flex-direction:column;';

        // Top bar
        var topBar = document.createElement('div');
        topBar.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:210;display:flex;gap:8px;';
        topBar.innerHTML =
            '<button class="xr-min-btn" data-mode="desktop" style="background:rgba(226,180,46,0.15);color:#e2b42e;border:1px solid #e2b42e;padding:8px 16px;border-radius:18px;font-size:13px;cursor:pointer;">🖥 Desktop</button>' +
            '<button class="xr-min-btn" data-mode="passthrough" style="background:transparent;color:#888;border:1px solid #555;padding:8px 16px;border-radius:18px;font-size:13px;cursor:pointer;">📷 Passthrough</button>' +
            '<button class="xr-min-btn" data-mode="vr" style="background:transparent;color:#888;border:1px solid #555;padding:8px 16px;border-radius:18px;font-size:13px;cursor:pointer;">🥽 VR</button>';
        overlay.appendChild(topBar);

        // Exit button
        var exitBtn = document.createElement('button');
        exitBtn.textContent = '✕ Exit';
        exitBtn.style.cssText = 'position:absolute;top:16px;right:16px;z-index:210;background:rgba(0,0,0,0.5);color:#e2b42e;border:1px solid #e2b42e;padding:8px 14px;border-radius:18px;font-size:13px;cursor:pointer;';
        overlay.appendChild(exitBtn);

        // Loading
        var loading = document.createElement('div');
        loading.id = 'xr-min-loading';
        loading.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#888;font-size:14px;z-index:220;';
        loading.textContent = 'Loading...';
        overlay.appendChild(loading);

        document.body.appendChild(overlay);

        // Hide D3 elements
        container.style.display = 'none';
        if (details) details.style.display = 'none';

        // ---- Three.js setup ----
        var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = false;
        overlay.insertBefore(renderer.domElement, overlay.firstChild);

        var scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000005);

        var camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.set(0, 0, 3);

        // ---- Earth sphere (unlit, matches D3 orthographic appearance) ----
        var texLoader = new THREE.TextureLoader();
        var earthTex = texLoader.load('/natural-earth.png');

        var sphereGeo = new THREE.SphereGeometry(1, 64, 64);
        var sphereMat = new THREE.MeshBasicMaterial({
            map: earthTex,
        });
        var earth = new THREE.Mesh(sphereGeo, sphereMat);
        scene.add(earth);

        // Graticule
        var graticule = buildGraticule(THREE, 1.002);
        scene.add(graticule);

        // Auto-rotate
        var autoRotate = true;
        var rotSpeed = 0.002;

        // ---- OrbitControls for desktop ----
        var orbitControls = null;
        if (THREE.OrbitControls) {
            orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
            orbitControls.enableDamping = true;
            orbitControls.rotateSpeed = 0.5;
            orbitControls.minDistance = 1.5;
            orbitControls.maxDistance = 6;
        }

        // ---- State ----
        var currentMode = 'desktop';
        var xrSession = null;
        var animId = null;

        // ---- Hide loading ----
        loading.style.display = 'none';

        // ---- Render loop ----
        function renderLoop() {
            if (currentMode === 'desktop') {
                animId = requestAnimationFrame(renderLoop);
                if (autoRotate) earth.rotation.y += rotSpeed;
                if (orbitControls) orbitControls.update();
                renderer.render(scene, camera);
            }
        }
        renderLoop();

        // ---- Mode switching ----
        function setMode(mode) {
            // Update button styles
            document.querySelectorAll('.xr-min-btn').forEach(function(b) {
                var isActive = b.getAttribute('data-mode') === mode;
                b.style.cssText = (isActive ?
                    'background:rgba(226,180,46,0.15);color:#e2b42e;border:1px solid #e2b42e;' :
                    'background:transparent;color:#888;border:1px solid #555;') +
                    'padding:8px 16px;border-radius:18px;font-size:13px;cursor:pointer;';
            });

            if (mode === currentMode && (mode === 'desktop') === !xrSession) return;

            if (mode === 'desktop') {
                exitXRSession();
                return;
            }

            enterXRSession(mode);
        }

        function enterXRSession(mode) {
            if (!navigator.xr) {
                console.warn('[XR] WebXR not available');
                return;
            }

            var sessionMode = mode === 'passthrough' ? 'immersive-ar' : 'immersive-vr';

            navigator.xr.isSessionSupported(sessionMode).then(function(supported) {
                if (!supported) {
                    console.warn('[XR] ' + sessionMode + ' not supported');
                    return;
                }

                return navigator.xr.requestSession(sessionMode, {
                    optionalFeatures: ['local-floor']
                });
            }).then(function(session) {
                if (!session) return;

                xrSession = session;
                currentMode = mode;
                renderer.xr.enabled = true;
                renderer.xr.setReferenceSpaceType('local-floor');

                // Position globe in front of user in XR space
                // local-floor: origin at floor, user at ~(0, 1.6, 0)
                // Place globe at eye level, 3m forward
                earth.position.set(0, 1.6, -3);
                graticule.position.set(0, 1.6, -3);

                session.addEventListener('end', function() {
                    xrSession = null;
                    renderer.xr.enabled = false;
                    currentMode = 'desktop';
                    earth.position.set(0, 0, 0);
                    graticule.position.set(0, 0, 0);
                    if (orbitControls) orbitControls.enabled = true;
                    renderer.setAnimationLoop(null);
                    // Restart desktop render loop
                    if (animId) cancelAnimationFrame(animId);
                    renderLoop();
                });

                return renderer.xr.setSession(session);
            }).then(function() {
                // XR animation loop: Three.js handles rendering, we update objects
                renderer.setAnimationLoop(function(time, frame) {
                    if (autoRotate) earth.rotation.y += rotSpeed;
                });
                if (orbitControls) orbitControls.enabled = false;

                // Update background for passthrough
                if (mode === 'passthrough') {
                    scene.background = null;
                }
            }).catch(function(err) {
                console.error('[XR] Session error:', err);
            });
        }

        function exitXRSession() {
            if (xrSession) {
                try { xrSession.end(); } catch(e) {}
                xrSession = null;
            }
            renderer.xr.enabled = false;
            currentMode = 'desktop';
            earth.position.set(0, 0, 0);
            graticule.position.set(0, 0, 0);
            if (orbitControls) orbitControls.enabled = true;
            renderer.setAnimationLoop(null);
            scene.background = new THREE.Color(0x000005);
            if (animId) cancelAnimationFrame(animId);
            renderLoop();
        }

        // ---- Button handlers ----
        document.querySelectorAll('.xr-min-btn').forEach(function(btn) {
            btn.onclick = function() {
                setMode(this.getAttribute('data-mode'));
            };
        });

        exitBtn.onclick = function() {
            exitXRSession();
            // Remove overlay, restore D3
            document.body.removeChild(overlay);
            container.style.display = '';
            if (details) details.style.display = '';
            xrActive = false;
        };

        // ---- Window resize ----
        window.addEventListener('resize', function() {
            var w = window.innerWidth;
            var h = window.innerHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        });

        xrActive = true;
    }

    function buildGraticule(THREE, R) {
        var pts = [];
        // Latitudes
        for (var lat = -75; lat <= 75; lat += 15) {
            var phi = (90 - lat) * Math.PI / 180;
            for (var lon = 0; lon <= 360; lon += 2) {
                var th = lon * Math.PI / 180;
                pts.push(new THREE.Vector3(
                    R * Math.sin(phi) * Math.cos(th),
                    R * Math.cos(phi),
                    R * Math.sin(phi) * Math.sin(th)
                ));
            }
        }
        // Longitudes
        for (var lon2 = 0; lon2 < 360; lon2 += 15) {
            var th2 = lon2 * Math.PI / 180;
            for (var lat2 = -90; lat2 <= 90; lat2 += 2) {
                var phi2 = (90 - lat2) * Math.PI / 180;
                pts.push(new THREE.Vector3(
                    R * Math.sin(phi2) * Math.cos(th2),
                    R * Math.cos(phi2),
                    R * Math.sin(phi2) * Math.sin(th2)
                ));
            }
        }
        var geo = new THREE.BufferGeometry().setFromPoints(pts);
        var mat = new THREE.LineBasicMaterial({ color: 0x2a4a6a, transparent: true, opacity: 0.25, depthWrite: false });
        return new THREE.LineSegments(geo, mat);
    }

    // ---- Init ----
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectButton);
    } else {
        injectButton();
    }

})();