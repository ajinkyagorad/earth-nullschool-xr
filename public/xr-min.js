/**
 * XR Bridge — creates a 3D scene combining the static Earth texture
 * with the live D3 wind particles (captured from canvases).
 *
 * The D3 engine keeps running underneath. We:
 *   - Render a 3D Earth sphere (textured from /natural-earth.png)
 *   - Overlay live wind particles from the D3 animation canvas
 *   - Overlay color overlay from the D3 overlay canvas
 *   - Composite everything into WebXR
 *
 * Result: 3D globe in XR with live wind particles from the D3 engine.
 */
(function() {
    "use strict";

    var THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    var THREE_LOADED = false;
    var xrActive = false;

    // ---- DOM refs ----
    var display, animCanvas, overlayCanvas, details;

    // ---- Inject button ----
    function injectButton() {
        display = document.getElementById('display');
        animCanvas = document.getElementById('animation');
        overlayCanvas = document.getElementById('overlay');
        details = document.getElementById('details');

        var menu = document.getElementById('menu');
        if (!menu || document.getElementById('xr-menu-btn')) return;
        var projP = menu.querySelector('p:has(#atlantis)');
        if (!projP) return;
        var p = document.createElement('p');
        p.innerHTML = 'XR | <span class="text-button" id="xr-menu-btn">🌐 Immersive</span>';
        projP.parentNode.insertBefore(p, projP.nextSibling);
        document.getElementById('xr-menu-btn').onclick = function() {
            menu.classList.add('invisible');
            loadThreeJS(startXR);
        };
    }

    // ---- Load Three.js ----
    function loadThreeJS(cb) {
        if (window.THREE && window.THREE.Scene) { THREE_LOADED = true; cb(); return; }
        var s = document.createElement('script');
        s.src = THREE_CDN;
        s.onload = function() { THREE_LOADED = true; cb(); };
        s.onerror = function() { alert('Failed to load Three.js'); };
        document.head.appendChild(s);
    }

    // ---- Start ----
    function startXR() {
        if (xrActive) return;
        var THREE = window.THREE;

        // ---- Overlay container ----
        var overlay = document.createElement('div');
        overlay.id = 'xr-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:200;background:#000;display:flex;flex-direction:column;';

        // Top bar
        var tb = document.createElement('div');
        tb.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:210;display:flex;gap:8px;';
        tb.innerHTML =
            '<button class="xr-btn" data-m="desktop" style="background:rgba(226,180,46,0.15);color:#e2b42e;border:1px solid #e2b42e;padding:8px 16px;border-radius:18px;font-size:13px;cursor:pointer;">🖥 Desktop</button>' +
            '<button class="xr-btn" data-m="passthrough" style="background:transparent;color:#888;border:1px solid #555;padding:8px 16px;border-radius:18px;font-size:13px;cursor:pointer;">📷 Passthrough</button>' +
            '<button class="xr-btn" data-m="vr" style="background:transparent;color:#888;border:1px solid #555;padding:8px 16px;border-radius:18px;font-size:13px;cursor:pointer;">🥽 VR</button>';
        overlay.appendChild(tb);

        var exitBtn = document.createElement('button');
        exitBtn.textContent = '✕ Exit';
        exitBtn.style.cssText = 'position:absolute;top:16px;right:16px;z-index:210;background:rgba(0,0,0,0.5);color:#e2b42e;border:1px solid #e2b42e;padding:8px 14px;border-radius:18px;font-size:13px;cursor:pointer;';
        overlay.appendChild(exitBtn);

        // ---- Three.js ----
        var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = false;
        overlay.insertBefore(renderer.domElement, overlay.firstChild);
        document.body.appendChild(overlay);

        display.style.display = 'none';
        if (details) details.style.display = 'none';

        var scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000005);
        var cam = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
        cam.position.set(0, 0, 2.5);

        // ---- Lighting for 3D sphere ----
        scene.add(new THREE.AmbientLight(0xffffff, 1.0));

        // ---- 3D Earth sphere with texture ----
        var texLoader = new THREE.TextureLoader();
        var earthTex = texLoader.load('/natural-earth.png');
        var sphere = new THREE.Mesh(
            new THREE.SphereGeometry(1, 64, 64),
            new THREE.MeshBasicMaterial({ map: earthTex })
        );
        sphere.position.set(0, 0, 0);
        scene.add(sphere);

        // ---- Graticule ----
        var gPts = [];
        for (var lat = -75; lat <= 75; lat += 15) {
            var phi = (90 - lat) * Math.PI / 180;
            for (var lon = 0; lon <= 360; lon += 2) {
                var th = lon * Math.PI / 180;
                gPts.push(new THREE.Vector3(1.002*Math.sin(phi)*Math.cos(th), 1.002*Math.cos(phi), 1.002*Math.sin(phi)*Math.sin(th)));
            }
        }
        for (var lon2 = 0; lon2 < 360; lon2 += 15) {
            var th2 = lon2 * Math.PI / 180;
            for (var lat2 = -90; lat2 <= 90; lat2 += 2) {
                var phi2 = (90 - lat2) * Math.PI / 180;
                gPts.push(new THREE.Vector3(1.002*Math.sin(phi2)*Math.cos(th2), 1.002*Math.cos(phi2), 1.002*Math.sin(phi2)*Math.sin(th2)));
            }
        }
        var gGeo = new THREE.BufferGeometry().setFromPoints(gPts);
        var gMat = new THREE.LineBasicMaterial({ color: 0x2a4a6a, transparent: true, opacity: 0.25 });
        var graticule = new THREE.LineSegments(gGeo, gMat);
        scene.add(graticule);

        // ---- Live wind overlay from D3 ----
        // Create a canvas that captures the D3 wind particles
        var capW = 1024, capH = 768;
        var capCanvas = document.createElement('canvas');
        capCanvas.width = capW; capCanvas.height = capH;
        var capCtx = capCanvas.getContext('2d');

        var windTex = new THREE.CanvasTexture(capCanvas);
        windTex.minFilter = THREE.LinearFilter;
        windTex.magFilter = THREE.LinearFilter;

        // Transparent plane in front of sphere for wind overlay
        var windPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(2.1, 2.1),
            new THREE.MeshBasicMaterial({
                map: windTex,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
            })
        );
        windPlane.position.set(0, 0, 0.01); // slightly in front of sphere
        scene.add(windPlane);

        // ---- Capture D3 canvases to texture ----
        function updateWindTex() {
            capCtx.clearRect(0, 0, capW, capH);
            // Draw wind animation canvas
            if (animCanvas) capCtx.drawImage(animCanvas, 0, 0, capW, capH);
            // Draw overlay canvas
            if (overlayCanvas) capCtx.drawImage(overlayCanvas, 0, 0, capW, capH);
            windTex.needsUpdate = true;
        }

        // ---- Auto-rotate ----
        var rotSpeed = 0.002;
        var rotate = true;

        // ---- State ----
        var mode = 'desktop';
        var xrSess = null;
        var aid = null;

        // ---- Desktop loop ----
        function deskLoop() {
            aid = requestAnimationFrame(deskLoop);
            if (rotate) sphere.rotation.y += rotSpeed;
            updateWindTex();
            renderer.render(scene, cam);
        }
        deskLoop();

        // ---- XR mode ----
        function setMode(m) {
            document.querySelectorAll('.xr-btn').forEach(function(b) {
                var a = b.getAttribute('data-m') === m;
                b.style.cssText = (a ?
                    'background:rgba(226,180,46,0.15);color:#e2b42e;border:1px solid #e2b42e;' :
                    'background:transparent;color:#888;border:1px solid #555;') +
                    'padding:8px 16px;border-radius:18px;font-size:13px;cursor:pointer;';
            });
            if (m === 'desktop') { exitXRSession(); return; }
            enterXR(m);
        }

        function enterXR(m) {
            if (!navigator.xr) return;
            var st = m === 'passthrough' ? 'immersive-ar' : 'immersive-vr';

            navigator.xr.isSessionSupported(st).then(function(ok) {
                if (!ok) throw new Error(st + ' not supported');
                return navigator.xr.requestSession(st, { optionalFeatures: ['local-floor'] });
            }).then(function(s) {
                xrSess = s; mode = m;
                renderer.xr.enabled = true;
                renderer.xr.setReferenceSpaceType('local-floor');

                // Position in XR space
                sphere.position.set(0, 1.5, -2.5);
                windPlane.position.set(0, 1.5, -2.49);
                graticule.position.set(0, 1.5, -2.5);

                s.addEventListener('end', function() {
                    xrSess = null; renderer.xr.enabled = false; mode = 'desktop';
                    sphere.position.set(0,0,0); windPlane.position.set(0,0,0.01); graticule.position.set(0,0,0);
                    scene.background = new THREE.Color(0x000005);
                    renderer.setAnimationLoop(null);
                    cancelAnimationFrame(aid); deskLoop();
                });
                return renderer.xr.setSession(s);
            }).then(function() {
                renderer.setAnimationLoop(function() {
                    if (rotate) sphere.rotation.y += rotSpeed;
                    updateWindTex();
                });
                if (m === 'passthrough') scene.background = null;
            }).catch(function(e) { console.error('[XR]', e); });
        }

        function exitXRSession() {
            if (xrSess) { try { xrSess.end(); } catch(e) {} xrSess = null; }
            renderer.xr.enabled = false; mode = 'desktop';
            sphere.position.set(0,0,0); windPlane.position.set(0,0,0.01); graticule.position.set(0,0,0);
            scene.background = new THREE.Color(0x000005);
            renderer.setAnimationLoop(null);
            if (aid) cancelAnimationFrame(aid); deskLoop();
        }

        // ---- Wire ----
        document.querySelectorAll('.xr-btn').forEach(function(b) {
            b.onclick = function() { setMode(this.getAttribute('data-m')); };
        });
        exitBtn.onclick = function() {
            exitXRSession();
            document.body.removeChild(overlay);
            display.style.display = '';
            if (details) details.style.display = '';
            xrActive = false;
        };
        window.addEventListener('resize', function() {
            var w = window.innerWidth, h = window.innerHeight;
            cam.aspect = w / h; cam.updateProjectionMatrix();
            renderer.setSize(w, h);
        });

        xrActive = true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectButton);
    } else { injectButton(); }

})();