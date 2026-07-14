/**
 * Particles - Three.js wind particle system for the globe.
 *
 * Simple Points-based system with small dots colored by wind speed.
 * Particle position and color are updated per frame in the CPU.
 */

import * as THREE from 'three';

export class WindParticles {
    /**
     * @param {import('three').Scene} scene
     * @param {import('./globe.js').Globe} globe
     * @param {number} [count=1500]
     */
    constructor(scene, globe, count = 1500) {
        this.scene = scene;
        this.globe = globe;
        this.count = count;

        this.windField = null;
        this.active = false;

        // Per-particle data
        this.positions = new Float32Array(count * 3);
        this.colors = new Float32Array(count * 3);
        this.lons = new Float32Array(count);
        this.lats = new Float32Array(count);
        this.ages = new Float32Array(count);

        this.velocityScale = 0.4;
        this.maxAge = 150;

        this._build();
        // Start with all particles at origin
        this._reset();
    }

    _build() {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

        // Critical: size is in world units. Globe radius = 1, so 0.015 is tiny on the globe surface.
        // sizeAttenuation:true makes this ~6 CSS pixels at default camera distance.
        const mat = new THREE.PointsMaterial({
            size: 0.015,
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        this.mesh = new THREE.Points(geo, mat);
        this.mesh.frustumCulled = false;
        this.mesh.visible = false;
        this.scene.add(this.mesh);
    }

    _reset() {
        for (let i = 0; i < this.count; i++) {
            this.positions[i * 3] = 0;
            this.positions[i * 3 + 1] = 0;
            this.positions[i * 3 + 2] = 0;
            this.colors[i * 3] = 0.4;
            this.colors[i * 3 + 1] = 0.6;
            this.colors[i * 3 + 2] = 0.9;
            this.lons[i] = 0;
            this.lats[i] = 0;
            this.ages[i] = Math.random() * this.maxAge;
        }
        this._syncGeo();
    }

    _syncGeo() {
        const geo = this.mesh.geometry;
        geo.attributes.position.array.set(this.positions);
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.array.set(this.colors);
        geo.attributes.color.needsUpdate = true;
    }

    _randomizeParticle(i) {
        if (!this.windField) return;

        let lon, lat, tries = 0;
        do {
            lon = Math.random() * 360 - 180;
            lat = Math.asin(2 * Math.random() - 1) * 180 / Math.PI;
            tries++;
        } while (tries < 60 && this.windField(lon, lat) === null);

        this.lons[i] = lon;
        this.lats[i] = lat;
        this.ages[i] = 0;

        const p = this.globe.geoToPosition(lon, lat, 0.002);
        this.positions[i * 3] = p.x;
        this.positions[i * 3 + 1] = p.y;
        this.positions[i * 3 + 2] = p.z;
    }

    /**
     * Set the wind field function and activate particles.
     */
    setWindField(fn) {
        this.windField = fn;
        // Scatter particles on the globe
        for (let i = 0; i < this.count; i++) {
            this._randomizeParticle(i);
        }
        this.mesh.visible = true;
        this.active = true;
        this._syncGeo();
        console.log(`[Particles] Activated ${this.count} particles, size=0.015 world units`);
    }

    /**
     * Per-frame update: advance particle positions along wind field.
     */
    update(time) {
        if (!this.active || !this.windField) return;

        const dt = 1.0;
        const scale = this.velocityScale;

        for (let i = 0; i < this.count; i++) {
            this.ages[i] += dt;
            if (this.ages[i] > this.maxAge) {
                this._randomizeParticle(i);
                continue;
            }

            const lon = this.lons[i];
            const lat = this.lats[i];
            const wind = this.windField(lon, lat);

            if (!wind) {
                this._randomizeParticle(i);
                continue;
            }

            const [u, v, mag] = wind;
            if (mag === null || isNaN(mag)) {
                this._randomizeParticle(i);
                continue;
            }

            // Advance position
            this.lons[i] = ((lon + u * scale * dt + 180) % 360) - 180;
            this.lats[i] = Math.max(-85, Math.min(85, lat + v * scale * dt));

            const p = this.globe.geoToPosition(this.lons[i], this.lats[i], 0.002);
            this.positions[i * 3] = p.x;
            this.positions[i * 3 + 1] = p.y;
            this.positions[i * 3 + 2] = p.z;

            // Color by wind speed: blue→cyan→yellow→white
            const t = Math.min(1, (mag || 0) / 25);
            if (t < 0.4) {
                const s = t / 0.4;
                this.colors[i * 3] = 0.2 * s;
                this.colors[i * 3 + 1] = 0.2 + 0.6 * s;
                this.colors[i * 3 + 2] = 0.4 + 0.5 * s;
            } else if (t < 0.7) {
                const s = (t - 0.4) / 0.3;
                this.colors[i * 3] = 0.2 + 0.6 * s;
                this.colors[i * 3 + 1] = 0.8 + 0.15 * s;
                this.colors[i * 3 + 2] = 0.9 - 0.6 * s;
            } else {
                const s = (t - 0.7) / 0.3;
                this.colors[i * 3] = 0.8 + 0.2 * s;
                this.colors[i * 3 + 1] = 0.95;
                this.colors[i * 3 + 2] = 0.3 - 0.2 * s;
            }
        }

        const geo = this.mesh.geometry;
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}