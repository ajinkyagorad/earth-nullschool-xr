/**
 * XR Bridge — Integrates Three.js/WebXR into the existing D3.js earth page.
 *
 * Flow:
 *   1. D3.js earth loads as normal (desktop view)
 *   2. User clicks "XR" button in menu
 *   3. This script loads Three.js from CDN, creates an XR overlay,
 *      fetches the GFS wind data independently, and enters WebXR mode.
 *   4. Exiting XR returns to the D3.js view.
 */
(function() {
    "use strict";

    // ---- UI ----
    var xrBtn = document.getElementById('xr-enter');
    var xrMenuBtn = document.getElementById('xr-menu'); // button in menu
    var display = document.getElementById('display');
    var details = document.getElementById('details');
    var xrOverlay = null;
    var threeJsLoaded = false;
    var xrActive = false;

    // ---- Create XR overlay container ----
    function createOverlay() {
        if (xrOverlay) return;
        xrOverlay = document.createElement('div');
        xrOverlay.id = 'xr-overlay';
        xrOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:100;display:none;';
        document.body.appendChild(xrOverlay);

        // XR mode toggle (visible in XR mode)
        var toggle = document.createElement('div');
        toggle.id = 'xr-toggle';
        toggle.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:110;display:flex;gap:8px;background:rgba(0,0,0,0.5);padding:6px;border-radius:24px;';
        toggle.innerHTML = 
            '<button id="xr-mode-desktop" class="xr-btn active" style="background:transparent;color:#888;border:1px solid #555;padding:8px 16px;border-radius:18px;font-size:13px;cursor:pointer;">🖥 Desktop</button>' +
            '<button id="xr-mode-passthrough" class="xr-btn" style="background:transparent;color:#888;border:1px solid #555;padding:8px 16px;border-radius:18px;font-size:13px;cursor:pointer;">📷 Passthrough</button>' +
            '<button id="xr-mode-vr" class="xr-btn" style="background:transparent;color:#888;border:1px solid #555;padding:8px 16px;border-radius:18px;font-size:13px;cursor:pointer;">🥽 VR</button>';
        xrOverlay.appendChild(toggle);

        // Exit XR button
        var exitBtn = document.createElement('button');
        exitBtn.id = 'xr-exit';
        exitBtn.textContent = '✕ Exit XR';
        exitBtn.style.cssText = 'position:absolute;top:16px;right:16px;z-index:110;background:rgba(0,0,0,0.5);color:#e2b42e;border:1px solid #e2b42e;padding:8px 14px;border-radius:18px;font-size:13px;cursor:pointer;';
        xrOverlay.appendChild(exitBtn);

        // Loading indicator
        var loading = document.createElement('div');
        loading.id = 'xr-loading';
        loading.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#888;font-size:14px;z-index:120;text-align:center;';
        loading.innerHTML = '<div style="display:inline-block;width:24px;height:24px;border:3px solid #444;border-top-color:#e2b42e;border-radius:50%;animation:xr-spin 0.8s linear infinite;margin-bottom:10px;"></div><div>Loading XR...</div>';
        xrOverlay.appendChild(loading);

        // Spinner keyframe
        if (!document.getElementById('xr-style')) {
            var style = document.createElement('style');
            style.id = 'xr-style';
            style.textContent = '@keyframes xr-spin { to { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }

        // Stats
        var stats = document.createElement('div');
        stats.id = 'xr-stats';
        stats.style.cssText = 'position:absolute;bottom:16px;left:16px;font-size:12px;color:#666;background:rgba(0,0,0,0.4);padding:4px 10px;border-radius:10px;z-index:110;';
        xrOverlay.appendChild(stats);

        return xrOverlay;
    }

    // ---- Show/hide XR overlay ----
    function showOverlay() {
        createOverlay();
        display.style.display = 'none';
        details.style.display = 'none';
        xrOverlay.style.display = 'block';
    }

    function hideOverlay() {
        if (xrOverlay) xrOverlay.style.display = 'none';
        display.style.display = '';
        details.style.display = '';
    }

    // ---- Three.js XR Engine ----
    var engine = null;

    function startXR() {
        if (xrActive) return;
        xrActive = true;

        showOverlay();
        document.getElementById('xr-loading').style.display = '';

        // Dynamically load Three.js and XR modules
        loadThreeJS().then(function() {
            return loadXRModules();
        }).then(function() {
            return initEngine();
        }).catch(function(err) {
            console.error('[XR] Failed:', err);
            document.getElementById('xr-loading').innerHTML = '<div style="color:#e88;">⚠️ XR failed: ' + err.message + '</div>';
            setTimeout(function() {
                exitXR();
            }, 3000);
        });
    }

    function exitXR() {
        if (!xrActive) return;
        xrActive = false;
        if (engine) {
            engine.dispose();
            engine = null;
        }
        hideOverlay();
        threeJsLoaded = false;

        // Re-enable D3 interactions
        var evt = document.createEvent('HTMLEvents');
        evt.initEvent('resize', true, false);
        window.dispatchEvent(evt);
    }

    // ---- Load Three.js dynamically ----
    function loadThreeJS() {
        if (window.THREE && window.THREE.SphereGeometry) {
            threeJsLoaded = true;
            return Promise.resolve();
        }
        return new Promise(function(resolve, reject) {
            var script = document.createElement('script');
            script.type = 'importmap';
            script.textContent = JSON.stringify({
                imports: {
                    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
                    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
                }
            });
            document.head.appendChild(script);

            // Check if module loaded after a short delay
            var check = function() {
                // We can't easily detect import map completion, so we proceed
                resolve();
            };
            setTimeout(check, 500);
        });
    }

    // ---- Load XR engine modules ----
    function loadXRModules() {
        // The XR engine uses dynamic import for Three.js
        return import('./xr/js/xr-engine.js').then(function(mod) {
            window.XREngine = mod.XREngine;
        });
    }

    // ---- Initialize engine ----
    function initEngine() {
        var loadingEl = document.getElementById('xr-loading');
        loadingEl.textContent = 'Loading weather data...';

        engine = new window.XREngine({
            container: xrOverlay,
            statsEl: document.getElementById('xr-stats'),
            loadingEl: loadingEl,
        });

        engine.init().then(function() {
            loadingEl.style.display = 'none';
            engine.startDesktop();

            // Wire up XR mode buttons
            document.getElementById('xr-mode-desktop').addEventListener('click', function() {
                engine.switchMode('desktop');
                setActiveXRBtn('xr-mode-desktop');
            });
            document.getElementById('xr-mode-passthrough').addEventListener('click', function() {
                if (!navigator.xr) return;
                navigator.xr.isSessionSupported('immersive-ar').then(function(supported) {
                    if (supported) engine.switchMode('passthrough');
                    else console.warn('[XR] Passthrough not supported');
                });
                setActiveXRBtn('xr-mode-passthrough');
            });
            document.getElementById('xr-mode-vr').addEventListener('click', function() {
                if (!navigator.xr) return;
                navigator.xr.isSessionSupported('immersive-vr').then(function(supported) {
                    if (supported) engine.switchMode('vr');
                    else console.warn('[XR] VR not supported');
                });
                setActiveXRBtn('xr-mode-vr');
            });
            document.getElementById('xr-exit').addEventListener('click', exitXR);
        });
    }

    function setActiveXRBtn(id) {
        document.querySelectorAll('.xr-btn').forEach(function(b) { b.style.cssText = 'background:transparent;color:#888;border:1px solid #555;padding:8px 16px;border-radius:18px;font-size:13px;cursor:pointer;'; });
        var btn = document.getElementById(id);
        if (btn) btn.style.cssText = 'background:rgba(226,180,46,0.15);color:#e2b42e;border:1px solid #e2b42e;padding:8px 16px;border-radius:18px;font-size:13px;cursor:pointer;';
    }

    // ---- Wire up menu button ----
    function wireXRButton() {
        // Add XR button to menu if not present
        if (!document.getElementById('xr-menu')) {
            var projP = document.querySelector('p:has(#atlantis)');
            if (projP) {
                var spacer = document.createElement('p');
                spacer.innerHTML = 'XR | <span class="text-button" id="xr-menu" title="Enter XR">🌐 Immersive</span>';
                projP.parentNode.insertBefore(spacer, projP.nextSibling);
            }
        }

        document.getElementById('xr-menu').addEventListener('click', function(e) {
            e.preventDefault();
            // Close the menu
            var menu = document.getElementById('menu');
            if (menu) menu.classList.add('invisible');
            startXR();
        });
    }

    // ---- Init when DOM ready ----
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireXRButton);
    } else {
        wireXRButton();
    }

})();