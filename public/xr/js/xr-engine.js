/**
 * XR Engine — Self-contained Three.js + WebXR globe for dynamic loading.
 *
 * Used by xr-bridge.js when the user clicks "XR" on the main page.
 * Loads Three.js via CDN import map, fetches wind data independently,
 * and manages the XR lifecycle.
 */

let THREE = null;
let OrbitControls = null;

export class XREngine {
    constructor(opts) {
        this.container = opts.container;
        this.statsEl = opts.statsEl;
        this.loadingEl = opts.loadingEl;

        this.mode = 'desktop'; // 'desktop' | 'passthrough' | 'vr'
        this.isXR = false;
        this.session = null;
        this.running = false;
        this.animId = null;

        // Components
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this.globeGroup = null;
        this.sphere = null;
        this.atmosphere = null;
        this.graticule = null;
        this.particles = null;
        this.windField = null;

        // Particle data
        this.particleCount = 1500;
    }

    async init() {
        // Load Three.js
        const three = await import('three');
        THREE = three;
        const addons = await import('three/addons/controls/OrbitControls.js');
        OrbitControls = addons.OrbitControls;

        this._setupScene();
        this._buildGlobe();
        this._buildParticles();
        this._loadWindData();

        return this;
    }

    _setupScene() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.xr.enabled = false;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.container.insertBefore(this.renderer.domElement, this.container.firstChild);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000005);

        this.camera = new THREE.PerspectiveCamera(40, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.set(0, 0.5, 3.2);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 1.5;
        this.controls.maxDistance = 8.0;
        this.controls.target.set(0, 0, 0);

        this.globeGroup = new THREE.Group();
        this.scene.add(this.globeGroup);

        // Lighting
        this.globeGroup.add(new THREE.AmbientLight(0x404060, 0.5));
        const sun = new THREE.DirectionalLight(0xffffff, 1.5);
        sun.position.set(5, 3, 5);
        this.globeGroup.add(sun);
        const fill = new THREE.DirectionalLight(0x4488ff, 0.3);
        fill.position.set(-3, -1, -5);
        this.globeGroup.add(fill);

        // Stars
        this._buildStars();

        // Resize
        window.addEventListener('resize', () => {
            const w = this.container.clientWidth;
            const h = this.container.clientHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        });

        // XR session events
        this.renderer.xr.addEventListener('sessionstart', () => {
            this.running = true;
            // Position globe in front of user for XR
            this.globeGroup.position.set(0, 1.6, -2.0);
        });
        this.renderer.xr.addEventListener('sessionend', () => {
            this.running = false;
            this.isXR = false;
            this.mode = 'desktop';
            this.renderer.xr.enabled = false;
            this.globeGroup.position.set(0, 0, 0);
            if (this.controls) this.controls.enabled = true;
        });
    }

    _buildGlobe() {
        const R = 1.0;
        const geo = new THREE.SphereGeometry(R, 64, 64);
        const texLoader = new THREE.TextureLoader();
        const map = texLoader.load('/natural-earth.jpg');
        const mat = new THREE.MeshPhongMaterial({
            map: map,
            specular: new THREE.Color(0x222244),
            shininess: 8,
            emissive: new THREE.Color(0x000011),
            color: new THREE.Color(0x224488),
        });
        this.sphere = new THREE.Mesh(geo, mat);
        this.globeGroup.add(this.sphere);

        // Atmosphere
        const atmoGeo = new THREE.SphereGeometry(R * 1.015, 48, 48);
        const atmoMat = new THREE.ShaderMaterial({
            vertexShader: 'varying vec3 vN;varying vec3 vP;void main(){vN=normalize(normalMatrix*normal);vP=(modelViewMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
            fragmentShader: 'varying vec3 vN;varying vec3 vP;void main(){vec3 d=normalize(-vP);float r=1.0-max(0.0,dot(d,vN));r=pow(r,3.0);gl_FragColor=vec4(0.3,0.6,1.0,r*0.6);}',
            transparent: true, side: THREE.FrontSide, depthWrite: false, blending: THREE.AdditiveBlending,
        });
        this.atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
        this.globeGroup.add(this.atmosphere);

        // Graticule
        this._buildGraticule(R);
    }

    _buildGraticule(R) {
        const pts = [];
        for (let lat = -75; lat <= 75; lat += 15) {
            const phi = (90 - lat) * Math.PI / 180;
            for (let lon = 0; lon <= 360; lon += 2) {
                const th = lon * Math.PI / 180;
                pts.push(new THREE.Vector3(R*1.001*Math.sin(phi)*Math.cos(th), R*1.001*Math.cos(phi), R*1.001*Math.sin(phi)*Math.sin(th)));
            }
        }
        for (let lon = 0; lon < 360; lon += 15) {
            const th = lon * Math.PI / 180;
            for (let lat = -90; lat <= 90; lat += 2) {
                const phi = (90 - lat) * Math.PI / 180;
                pts.push(new THREE.Vector3(R*1.001*Math.sin(phi)*Math.cos(th), R*1.001*Math.cos(phi), R*1.001*Math.sin(phi)*Math.sin(th)));
            }
        }
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        const m = new THREE.LineBasicMaterial({ color: 0x2a4a6a, transparent: true, opacity: 0.3, depthWrite: false });
        this.graticule = new THREE.LineSegments(g, m);
        this.globeGroup.add(this.graticule);
    }

    _buildStars() {
        const g = new THREE.BufferGeometry();
        const N = 2000;
        const pos = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            const th = Math.random() * Math.PI * 2;
            const ph = Math.acos(2 * Math.random() - 1);
            const r = 50 + Math.random() * 50;
            pos[i*3] = r * Math.sin(ph) * Math.cos(th);
            pos[i*3+1] = r * Math.cos(ph);
            pos[i*3+2] = r * Math.sin(ph) * Math.sin(th);
        }
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.8, sizeAttenuation: true });
        this.scene.add(new THREE.Points(g, m));
    }

    geoToPos(lon, lat, alt) {
        const phi = (90 - lat) * Math.PI / 180;
        const th = lon * Math.PI / 180;
        const r = 1.0 + (alt || 0.003);
        return new THREE.Vector3(r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
    }

    // ---- Wind Particles ----
    _buildParticles() {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.particleCount * 3);
        const colors = new Float32Array(this.particleCount * 3);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        this.lons = new Float32Array(this.particleCount);
        this.lats = new Float32Array(this.particleCount);
        this.ages = new Float32Array(this.particleCount);
        this.maxAges = new Float32Array(this.particleCount);

        // Init at origin (hidden)
        for (let i = 0; i < this.particleCount; i++) {
            positions[i*3] = 0; positions[i*3+1] = 0; positions[i*3+2] = 0;
            colors[i*3] = 0.4; colors[i*3+1] = 0.6; colors[i*3+2] = 0.9;
            this.ages[i] = 0;
            this.maxAges[i] = 150 + Math.random() * 80;
        }

        const mat = new THREE.PointsMaterial({
            size: 0.015,
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        this.particles = new THREE.Points(geo, mat);
        this.particles.frustumCulled = false;
        this.particles.visible = false;
        this.globeGroup.add(this.particles);

        this._particlePos = positions;
        this._particleCol = colors;
    }

    _randomizeParticle(i) {
        if (!this.windField) return;
        let lon, lat, tries = 0;
        do {
            lon = Math.random() * 360 - 180;
            lat = Math.asin(2 * Math.random() - 1) * 180 / Math.PI;
            tries++;
        } while (tries < 60 && !this.windField(lon, lat));
        this.lons[i] = lon;
        this.lats[i] = lat;
        this.ages[i] = 0;
        const p = this.geoToPos(lon, lat);
        this._particlePos[i*3] = p.x;
        this._particlePos[i*3+1] = p.y;
        this._particlePos[i*3+2] = p.z;
    }

    _scatterParticles() {
        for (let i = 0; i < this.particleCount; i++) {
            this._randomizeParticle(i);
        }
        this.particles.visible = true;
    }

    // ---- Wind Data ----
    async _loadWindData() {
        try {
            const resp = await fetch('/data/weather/current/current-wind-surface-level-gfs-1.0.json');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const raw = await resp.json();
            if (!Array.isArray(raw) || raw.length < 2) throw new Error('Bad format');

            const h = raw[0].header;
            const uData = raw[0].data;
            const vData = raw[1].data;
            const nx = h.nx, ny = h.ny, dx = h.dx, la1 = h.la1;
            const rows = [];
            for (let j = 0; j < ny; j++) {
                const row = [];
                for (let i = 0; i < nx; i++) {
                    const idx = j * nx + i;
                    const u = uData[idx], v = vData[idx];
                    row.push({ u, v, mag: Math.sqrt(u*u + v*v) });
                }
                rows.push(row);
            }

            this.windField = function(lonDeg, latDeg) {
                if (latDeg < -90 || latDeg > 90) return null;
                let lon = lonDeg % 360;
                if (lon < 0) lon += 360;
                const fi = lon / dx;
                const fj = (la1 - latDeg) / dx;
                const i = Math.floor(fi), j = Math.floor(fj);
                if (j < 0 || j >= ny - 1) return null;
                const fx = fi - i, fy = fj - j;
                const i1 = (i + 1) % nx;
                const v00 = rows[j].row ? rows[j].row[i] : rows[j][i];
                const v10 = rows[j].row ? rows[j].row[i1] : rows[j][i1];
                const v01 = rows[j+1] ? (rows[j+1].row ? rows[j+1].row[i] : rows[j+1][i]) : null;
                const v11 = rows[j+1] ? (rows[j+1].row ? rows[j+1].row[i1] : rows[j+1][i1]) : null;
                if (!v00 || !v10 || !v01 || !v11) return null;
                const u = (v00.u*(1-fx)*(1-fy) + v10.u*fx*(1-fy) + v01.u*(1-fx)*fy + v11.u*fx*fy);
                const v = (v00.v*(1-fx)*(1-fy) + v10.v*fx*(1-fy) + v01.v*(1-fx)*fy + v11.v*fx*fy);
                return [u, v, Math.sqrt(u*u + v*v)];
            };

            this._scatterParticles();
            if (this.loadingEl) this.loadingEl.textContent = 'Wind data loaded ✓';
        } catch (err) {
            console.warn('[XR] Wind data failed, using synthetic:', err);
            this.windField = function(lon, lat) {
                const u = 5 * Math.sin(lat * Math.PI / 90) * Math.cos(lon * Math.PI / 180 * 3);
                const v = 3 * Math.cos(lat * Math.PI / 90) * Math.sin(lon * Math.PI / 180 * 2);
                return [u, v, Math.sqrt(u*u + v*v)];
            };
            this._scatterParticles();
        }
    }

    // ---- Render Loop ----
    startDesktop() {
        if (this.animId) cancelAnimationFrame(this.animId);
        this.mode = 'desktop';
        this.isXR = false;
        this.controls.enabled = true;
        this.globeGroup.position.set(0, 0, 0);
        this.scene.background = new THREE.Color(0x000005);
        this._loop();
    }

    _loop() {
        this.animId = requestAnimationFrame(() => this._loop());

        this.controls.update();

        // Update particles
        if (this.particles && this.particles.visible && this.windField) {
            this._updateParticles();
            this.particles.geometry.attributes.position.needsUpdate = true;
            this.particles.geometry.attributes.color.needsUpdate = true;
        }

        this.renderer.render(this.scene, this.camera);
    }

    _updateParticles() {
        const scale = 0.4;
        for (let i = 0; i < this.particleCount; i++) {
            this.ages[i] += 1;
            if (this.ages[i] > this.maxAges[i]) {
                this._randomizeParticle(i);
                continue;
            }
            const lon = this.lons[i];
            const lat = this.lats[i];
            const wind = this.windField(lon, lat);
            if (!wind) { this._randomizeParticle(i); continue; }
            const [u, v, mag] = wind;
            if (mag === null || isNaN(mag)) { this._randomizeParticle(i); continue; }
            this.lons[i] = ((lon + u * scale + 180) % 360) - 180;
            this.lats[i] = Math.max(-85, Math.min(85, lat + v * scale));
            const p = this.geoToPos(this.lons[i], this.lats[i]);
            this._particlePos[i*3] = p.x;
            this._particlePos[i*3+1] = p.y;
            this._particlePos[i*3+2] = p.z;
            // Color
            const t = Math.min(1, (mag || 0) / 25);
            if (t < 0.4) { const s = t/0.4; this._particleCol[i*3]=0.2*s; this._particleCol[i*3+1]=0.2+0.6*s; this._particleCol[i*3+2]=0.4+0.5*s; }
            else if (t < 0.7) { const s=(t-0.4)/0.3; this._particleCol[i*3]=0.2+0.6*s; this._particleCol[i*3+1]=0.8+0.15*s; this._particleCol[i*3+2]=0.9-0.6*s; }
            else { const s=(t-0.7)/0.3; this._particleCol[i*3]=0.8+0.2*s; this._particleCol[i*3+1]=0.95; this._particleCol[i*3+2]=0.3-0.2*s; }
        }
    }

    // ---- XR Mode Switching ----
    async switchMode(target) {
        if (target === this.mode && this.isXR === (target !== 'desktop')) return;

        if (target === 'desktop') {
            await this._exitXRSession();
            this.startDesktop();
            return;
        }

        const sessionMode = target === 'passthrough' ? 'immersive-ar' : 'immersive-vr';
        try {
            this.session = await navigator.xr.requestSession(sessionMode, {
                optionalFeatures: ['local-floor'],
            });

            this.isXR = true;
            this.mode = target;
            this.renderer.xr.enabled = true;
            this.renderer.xr.setReferenceSpaceType('local-floor');

            this.session.addEventListener('end', () => {
                this.session = null;
                this.renderer.xr.enabled = false;
                this.startDesktop();
            });

            await this.renderer.xr.setSession(this.session);
            this.controls.enabled = false;

            if (target === 'passthrough') {
                this.scene.background = null;
            } else {
                this.scene.background = new THREE.Color(0x000005);
            }

            // XR animation loop
            this.renderer.setAnimationLoop((time) => {
                if (this.particles && this.particles.visible && this.windField) {
                    this._updateParticles();
                    this.particles.geometry.attributes.position.needsUpdate = true;
                    this.particles.geometry.attributes.color.needsUpdate = true;
                }
            });

        } catch (err) {
            console.error('[XR] Failed:', err);
            this.startDesktop();
        }
    }

    async _exitXRSession() {
        if (this.session) {
            try { await this.session.end(); } catch(e) {}
            this.session = null;
        }
        this.renderer.xr.enabled = false;
        this.renderer.setAnimationLoop(null);
    }

    dispose() {
        if (this.animId) cancelAnimationFrame(this.animId);
        if (this.session) {
            try { this.session.end(); } catch(e) {}
            this.session = null;
        }
        this.renderer.xr.enabled = false;
        this.renderer.setAnimationLoop(null);
        if (this.particles) {
            this.globeGroup.remove(this.particles);
            this.particles.geometry.dispose();
            this.particles.material.dispose();
        }
        if (this.sphere) {
            this.globeGroup.remove(this.sphere);
            this.sphere.geometry.dispose();
            this.sphere.material.dispose();
        }
        this.renderer.dispose();
    }
}