/**
 * XR Manager - Handles WebXR session creation, mode switching, and lifecycle.
 *
 * Supports three modes:
 *   'desktop'    - Standard 3D view on monitor (no XR)
 *   'passthrough' - immersive-ar mode (real world visible behind globe)
 *   'vr'          - immersive-vr mode (fully virtual)
 *
 * Events emitted via onModeChange callback:
 *   { mode: 'desktop'|'passthrough'|'vr', session: XRSession|null }
 */

export class XRManager {
    /**
     * @param {import('three').Renderer} renderer
     * @param {import('three').Camera} camera
     * @param {Function} onModeChange  callback(modeInfo)
     */
    constructor(renderer, camera, onModeChange) {
        this.renderer = renderer;
        this.camera = camera;
        this.onModeChange = onModeChange;

        this.mode = 'desktop';   // 'desktop' | 'passthrough' | 'vr'
        this.session = null;
        this.isInXR = false;

        // Check for WebXR support
        this.xrSupported = false;
        this._checkSupport();

        // Bind methods
        this._onSessionEnd = this._onSessionEnd.bind(this);
    }

    async _checkSupport() {
        if (navigator.xr) {
            // Check for immersive-ar (passthrough)
            const arSupported = await navigator.xr.isSessionSupported('immersive-ar');
            // Check for immersive-vr
            const vrSupported = await navigator.xr.isSessionSupported('immersive-vr');
            this.xrSupported = arSupported || vrSupported;
            console.log(`[XR] AR: ${arSupported}, VR: ${vrSupported}`);
            return { arSupported, vrSupported };
        }
        console.log('[XR] WebXR not available');
        this.xrSupported = false;
        return { arSupported: false, vrSupported: false };
    }

    async getSupport() {
        if (!navigator.xr) return { ar: false, vr: false };
        const ar = await navigator.xr.isSessionSupported('immersive-ar');
        const vr = await navigator.xr.isSessionSupported('immersive-vr');
        return { ar, vr };
    }

    /**
     * Switch to a given mode. If entering XR, creates a session.
     * @param {'desktop'|'passthrough'|'vr'} targetMode
     * @param {HTMLElement} [xrButton] - button used to trigger user gesture
     */
    async switchMode(targetMode) {
        if (targetMode === this.mode && this.isInXR === (targetMode !== 'desktop')) {
            return;
        }

        if (targetMode === 'desktop') {
            await this._exitXR();
            this.mode = 'desktop';
            this.isInXR = false;
            this.renderer.xr.enabled = false;
            this.renderer.setAnimationLoop(null);
            this.onModeChange({ mode: 'desktop', session: null });
            return;
        }

        // Enter XR mode
        const sessionMode = targetMode === 'passthrough' ? 'immersive-ar' : 'immersive-vr';
        const referenceType = targetMode === 'passthrough' ? 'local-floor' : 'local-floor';

        if (!navigator.xr) {
            console.warn('[XR] WebXR not available, falling back to desktop');
            this.onModeChange({ mode: 'desktop', session: null, error: 'WebXR not supported' });
            return;
        }

        const supported = await navigator.xr.isSessionSupported(sessionMode);
        if (!supported) {
            console.warn(`[XR] ${sessionMode} not supported on this device`);
            this.onModeChange({ mode: 'desktop', session: null, error: `${sessionMode} not supported` });
            return;
        }

        try {
            // Exit any existing session first
            if (this.session) {
                await this._exitXR();
            }

            this.session = await navigator.xr.requestSession(sessionMode, {
                optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'hit-test']
            });

            this.mode = targetMode;
            this.isInXR = true;

            // Configure renderer for XR
            this.renderer.xr.enabled = true;
            this.renderer.xr.setReferenceSpaceType(referenceType);

            // Listen for session end
            this.session.addEventListener('end', this._onSessionEnd);

            // Set the session on the renderer
            await this.renderer.xr.setSession(this.session);

            this.onModeChange({ mode: targetMode, session: this.session });
        } catch (err) {
            console.error('[XR] Failed to start session:', err);
            this.mode = 'desktop';
            this.isInXR = false;
            this.renderer.xr.enabled = false;
            this.onModeChange({ mode: 'desktop', session: null, error: err.message });
        }
    }

    async _exitXR() {
        if (this.session) {
            this.session.removeEventListener('end', this._onSessionEnd);
            try {
                await this.session.end();
            } catch (e) {
                // ignore
            }
            this.session = null;
        }
        this.renderer.xr.enabled = false;
        this.isInXR = false;
    }

    _onSessionEnd() {
        console.log('[XR] Session ended');
        this.session = null;
        this.isInXR = false;
        this.mode = 'desktop';
        this.renderer.xr.enabled = false;
        this.renderer.setAnimationLoop(null);
        this.onModeChange({ mode: 'desktop', session: null });
    }

    /**
     * Dispose of XR resources.
     */
    dispose() {
        if (this.session) {
            this.session.end().catch(() => {});
            this.session = null;
        }
    }
}