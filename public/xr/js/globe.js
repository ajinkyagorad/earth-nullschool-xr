/**
 * Globe - Three.js 3D Earth globe with texture, atmosphere, and graticule.
 *
 * Provides:
 *  - Textured sphere with coastlines/land
 *  - Semi-transparent atmosphere glow
 *  - Graticule (latitude/longitude grid)
 *  - Auto-rotation (optional)
 *  - Raycasting for click interaction
 */

import * as THREE from 'three';

export class Globe {
    /**
     * @param {import('three').Scene} scene
     */
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.radius = 1.0;
        this.autoRotate = false;
        this.autoRotateSpeed = 0.002; // radians per frame

        // Components
        this.sphere = null;
        this.atmosphere = null;
        this.graticule = null;
        this.cloudLayer = null;

        // Callbacks
        this.onReady = null;
        this._ready = false;

        // Build the globe
        this._build();
    }

    _build() {
        const radius = this.radius;

        // ---- Earth sphere with texture ----
        const earthGeo = new THREE.SphereGeometry(radius, 64, 64);

        // Try loading the earth texture; fallback to a procedural color
        const textureLoader = new THREE.TextureLoader();
        const earthMap = textureLoader.load(
            '/natural-earth.jpg',
            () => console.log('[Globe] Earth texture loaded'),
            undefined,
            () => console.warn('[Globe] Earth texture failed to load, using fallback')
        );

        // Use a fallback material if texture fails
        const earthMat = new THREE.MeshPhongMaterial({
            map: earthMap,
            specular: new THREE.Color(0x222244),
            shininess: 8,
            emissive: new THREE.Color(0x000011),
            color: new THREE.Color(0x224488),
        });

        this.sphere = new THREE.Mesh(earthGeo, earthMat);
        this.group.add(this.sphere);

        // ---- Graticule (wireframe lat/lon grid) ----
        this._buildGraticule(radius);

        // ---- Atmosphere glow ----
        this._buildAtmosphere(radius);

        // ---- Cloud layer (semi-transparent) ----
        // Use a simple noise texture or just a translucent white sphere
        // For now we skip clouds; could be added later

        // ---- Stars background ----
        this._buildStars();

        // ---- Lighting ----
        const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
        this.group.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
        sunLight.position.set(5, 3, 5);
        this.group.add(sunLight);

        const fillLight = new THREE.DirectionalLight(0x4488ff, 0.3);
        fillLight.position.set(-3, -1, -5);
        this.group.add(fillLight);

        // The sphere geometry is created with Y-up. We rotate so Z is up for WebXR comfort
        // Actually, let's keep Y-up (Three.js default) and rotate the whole group for earth orientation
        // Earth's north pole is +Y
    }

    _buildGraticule(radius) {
        const points = [];
        const step = 15; // degrees between lines

        // Latitudes (parallels)
        for (let lat = -75; lat <= 75; lat += step) {
            const phi = (90 - lat) * Math.PI / 180;
            for (let lon = 0; lon <= 360; lon += 2) {
                const theta = lon * Math.PI / 180;
                const x = radius * 1.001 * Math.sin(phi) * Math.cos(theta);
                const y = radius * 1.001 * Math.cos(phi);
                const z = radius * 1.001 * Math.sin(phi) * Math.sin(theta);
                points.push(new THREE.Vector3(x, y, z));
            }
        }

        // Longitudes (meridians)
        for (let lon = 0; lon < 360; lon += step) {
            const theta = lon * Math.PI / 180;
            for (let lat = -90; lat <= 90; lat += 2) {
                const phi = (90 - lat) * Math.PI / 180;
                const x = radius * 1.001 * Math.sin(phi) * Math.cos(theta);
                const y = radius * 1.001 * Math.cos(phi);
                const z = radius * 1.001 * Math.sin(phi) * Math.sin(theta);
                points.push(new THREE.Vector3(x, y, z));
            }
        }

        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({
            color: 0x2a4a6a,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
        });
        this.graticule = new THREE.LineSegments(geo, mat);
        this.group.add(this.graticule);
    }

    _buildAtmosphere(radius) {
        const atmoGeo = new THREE.SphereGeometry(radius * 1.015, 48, 48);
        const atmoMat = new THREE.ShaderMaterial({
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vPosition;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vNormal;
                varying vec3 vPosition;
                void main() {
                    vec3 viewDir = normalize(-vPosition);
                    float rim = 1.0 - max(0.0, dot(viewDir, vNormal));
                    rim = pow(rim, 3.0);
                    gl_FragColor = vec4(0.3, 0.6, 1.0, rim * 0.6);
                }
            `,
            transparent: true,
            side: THREE.FrontSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this.atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
        this.group.add(this.atmosphere);
    }

    _buildStars() {
        const starsGeo = new THREE.BufferGeometry();
        const starCount = 2000;
        const positions = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);

        for (let i = 0; i < starCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 50 + Math.random() * 50;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi);
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
            sizes[i] = 0.5 + Math.random() * 1.5;
        }

        starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starsGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const starMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.15,
            transparent: true,
            opacity: 0.8,
            sizeAttenuation: true,
        });
        const stars = new THREE.Points(starsGeo, starMat);
        this.group.add(stars);
    }

    /**
     * Convert geographic coordinates [lon, lat] in degrees to a 3D position on the globe surface.
     */
    geoToPosition(lon, lat, altitude = 0) {
        const phi = (90 - lat) * Math.PI / 180;
        const theta = lon * Math.PI / 180;
        const r = this.radius + altitude;
        return new THREE.Vector3(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
        );
    }

    /**
     * Convert a 3D position on the globe to geographic coordinates [lon, lat] in degrees.
     */
    positionToGeo(pos) {
        const r = pos.length();
        if (r === 0) return [0, 0];
        const lat = 90 - Math.acos(pos.y / r) * 180 / Math.PI;
        const lon = Math.atan2(pos.z, pos.x) * 180 / Math.PI;
        return [lon, lat];
    }

    /**
     * Update the globe orientation.
     * @param {number} lon  rotation around Y (degrees)
     * @param {number} lat  rotation around X (degrees)
     */
    setOrientation(lon, lat) {
        this.group.rotation.y = lon * Math.PI / 180;
        this.group.rotation.x = lat * Math.PI / 180;
    }

    /**
     * Get current orientation as [lon, lat] degrees.
     */
    getOrientation() {
        return [
            this.group.rotation.y * 180 / Math.PI,
            this.group.rotation.x * 180 / Math.PI,
        ];
    }

    /**
     * Update auto-rotation. Call each frame.
     */
    update() {
        if (this.autoRotate) {
            this.group.rotation.y += this.autoRotateSpeed;
        }
    }

    /**
     * Get the globe's world matrix for raycasting.
     */
    getWorldPosition() {
        const pos = new THREE.Vector3();
        this.sphere.getWorldPosition(pos);
        return pos;
    }

    /**
     * Dispose of GPU resources.
     */
    dispose() {
        this.scene.remove(this.group);
        this.group.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }
}