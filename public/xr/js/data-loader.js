/**
 * Data Loader - Loads weather data from the original earth.nullschool data pipeline.
 *
 * The GFS JSON format is an array of 2 records:
 *   [0] = U-component of wind (header + flat data array)
 *   [1] = V-component of wind (header + flat data array)
 *
 * Grid layout: 360x181 (1.0 deg), lo1=0, la1=90, dx=1, dy=1
 * Data stored row-major, y from la1 (90 = North Pole) downward.
 */

export class DataLoader {
    constructor() {
        this.basePath = '/data/weather/current';
        this.grid = null;
        this.isLoaded = false;
        this.onProgress = null; // callback(percent)
    }

    /**
     * Load the current wind data and build an interpolation grid.
     * @returns {Promise<{primaryGrid, overlayGrid}>}
     */
    async load() {
        try {
            if (this.onProgress) this.onProgress(0.1);

            const url = `${this.basePath}/current-wind-surface-level-gfs-1.0.json`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load data: ${response.status}`);

            const raw = await response.json();
            if (this.onProgress) this.onProgress(0.4);

            if (!Array.isArray(raw) || raw.length < 2) {
                throw new Error('Unexpected data format: expected array of [U, V] records');
            }

            const uRecord = raw[0];
            const vRecord = raw[1];

            // Validate
            if (!uRecord.header || !uRecord.data || !vRecord.header || !vRecord.data) {
                throw new Error('Invalid record structure');
            }

            // Build combined U/V grid
            this.grid = this._buildGrid(uRecord, vRecord);

            if (this.onProgress) this.onProgress(0.8);
            this.isLoaded = true;
            if (this.onProgress) this.onProgress(1.0);

            console.log(`[DataLoader] Loaded ${uRecord.data.length} data points, grid ${uRecord.header.nx}x${uRecord.header.ny}`);

            return {
                primaryGrid: this.grid,
                overlayGrid: this.grid,
            };
        } catch (err) {
            console.error('[DataLoader] Error:', err);
            throw err;
        }
    }

    /**
     * Build a combined interpolation grid from U and V component records.
     *
     * The data is stored in row-major order with scanMode=0, meaning:
     *   - Points in each row go from lo1 (0) to lo1+dx*(nx-1) (359)
     *   - Rows go from la1 (90 = North pole) to la1+dy*(ny-1) (-90 = South pole)
     *   - With dy=1, each row is 1 degree south of the previous
     */
    _buildGrid(uRecord, vRecord) {
        const h = uRecord.header;
        const nx = h.nx;        // 360
        const ny = h.ny;        // 181
        const lo1 = h.lo1;      // 0
        const la1 = h.la1;      // 90 (North pole first)
        const dx = h.dx;        // 1
        const dy = h.dy;        // 1 (positive, meaning southward)

        const uData = uRecord.data;
        const vData = vRecord.data;

        // Store as latitude-indexed rows for fast lookup
        // latIndex: 0 = 90°N, ny-1 = -90°S
        const rows = [];

        for (let j = 0; j < ny; j++) {
            const row = [];
            const lat = la1 - dy * j; // actual latitude
            for (let i = 0; i < nx; i++) {
                const idx = j * nx + i;
                const u = uData[idx];
                const v = vData[idx];
                const mag = Math.sqrt(u * u + v * v);
                row.push({ u, v, mag });
            }
            rows.push({ lat, row });
        }

        // Build interpolation function
        const interpolate = (lonDeg, latDeg) => {
            // Clamp latitude
            if (latDeg < -90 || latDeg > 90) return null;

            // Wrap longitude to [0, 360)
            let lon = lonDeg % 360;
            if (lon < 0) lon += 360;

            // Find grid cell indices
            const fi = lon / dx; // longitude index (fractional)
            const fj = (la1 - latDeg) / dy; // latitude index (fractional), 0 = 90N, 180 = 90S

            const i = Math.floor(fi);
            const j = Math.floor(fj);

            // Bounds check
            if (j < 0 || j >= ny - 1) return null;

            // Fractional offsets for bilinear interpolation
            const fx = fi - i;
            const fy = fj - j;

            // Get four corner values, wrapping longitude
            const i1 = (i + 1) % nx;

            const v00 = rows[j].row[i];
            const v10 = rows[j].row[i1];
            const v01 = rows[j + 1].row[i];
            const v11 = rows[j + 1].row[i1];

            if (!v00 || !v10 || !v01 || !v11) return null;

            // Bilinear interpolation
            const u = (v00.u * (1 - fx) * (1 - fy) + v10.u * fx * (1 - fy) +
                       v01.u * (1 - fx) * fy + v11.u * fx * fy);

            const v = (v00.v * (1 - fx) * (1 - fy) + v10.v * fx * (1 - fy) +
                       v01.v * (1 - fx) * fy + v11.v * fx * fy);

            const mag = Math.sqrt(u * u + v * v);

            return [u, v, mag];
        };

        // Attach metadata
        interpolate.header = h;
        interpolate.bounds = {
            lonStart: lo1,
            lonEnd: lo1 + dx * (nx - 1),
            latStart: la1 - dy * (ny - 1),
            latEnd: la1,
            nx,
            ny,
        };
        interpolate.rows = rows;

        return interpolate;
    }

    /**
     * Get the current wind interpolation function.
     * @returns {Function|null}  function(lonDeg, latDeg) => [u, v, mag] | null
     */
    getWindField() {
        return this.grid || null;
    }

    dispose() {
        this.grid = null;
    }
}