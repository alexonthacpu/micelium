/* Inspection camera: independent from keyed zoom, timeline time and export framing. */
(function () {
    'use strict';
    window.MiceliumAnimationViewport = class {
        constructor(viewport, enabled, redraw) {
            this.viewport = viewport; this.enabled = enabled; this.redraw = redraw;
            this.x = 0; this.y = 0; this.zoom = 1; this.raf = 0;
            const pointers = new Map();
            const point = event => { const r = viewport.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; };
            const onCanvas = event => !!event.target.closest('#canvas-holder');
            const measure = () => {
                const values = [...pointers.values()];
                if (values.length < 2) return { ...values[0], distance: 0 };
                return { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2,
                    distance: Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y) };
            };
            viewport.addEventListener('pointerdown', event => {
                if (!enabled() || !onCanvas(event) || event.button !== 0) return;
                event.preventDefault(); viewport.setPointerCapture(event.pointerId);
                pointers.set(event.pointerId, point(event)); viewport.classList.add('dragging');
            });
            viewport.addEventListener('pointermove', event => {
                if (!pointers.has(event.pointerId)) return;
                if (!enabled()) { pointers.clear(); viewport.classList.remove('dragging'); return; }
                const before = measure(); pointers.set(event.pointerId, point(event)); const after = measure();
                this.x += after.x - before.x; this.y += after.y - before.y;
                if (before.distance && after.distance) this.zoomAt(after.distance / before.distance, after.x, after.y);
                else this.schedule();
            });
            const release = event => {
                pointers.delete(event.pointerId);
                if (!pointers.size) viewport.classList.remove('dragging');
            };
            for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(name, release);
            viewport.addEventListener('wheel', event => {
                if (!enabled() || !onCanvas(event)) return;
                event.preventDefault(); event.stopImmediatePropagation();
                const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
                if (event.ctrlKey || event.metaKey || event.altKey) {
                    const p = point(event); this.zoomAt(Math.exp(-event.deltaY * unit * .007), p.x, p.y);
                } else { this.x -= event.deltaX * unit; this.y -= event.deltaY * unit; this.schedule(); }
            }, { capture: true, passive: false });
            let gestureZoom = 1;
            viewport.addEventListener('gesturestart', event => {
                if (!enabled() || !onCanvas(event)) return;
                event.preventDefault(); event.stopImmediatePropagation(); gestureZoom = this.zoom;
            }, { capture: true, passive: false });
            viewport.addEventListener('gesturechange', event => {
                if (!enabled() || !onCanvas(event)) return;
                event.preventDefault(); event.stopImmediatePropagation();
                const p = point(event); this.zoomAt(gestureZoom * event.scale / this.zoom, p.x, p.y);
            }, { capture: true, passive: false });
            viewport.addEventListener('gestureend', event => {
                if (!enabled() || !onCanvas(event)) return;
                event.preventDefault(); event.stopImmediatePropagation();
            }, { capture: true, passive: false });
        }
        schedule() {
            if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; if (this.enabled()) this.redraw(); });
        }
        zoomAt(factor, x, y) {
            const next = Math.min(32, Math.max(.1, this.zoom * factor));
            const cx = this.viewport.clientWidth / 2, cy = this.viewport.clientHeight / 2;
            this.x = x - cx - (x - cx - this.x) * next / this.zoom;
            this.y = y - cy - (y - cy - this.y) * next / this.zoom;
            this.zoom = next; this.schedule();
        }
        reset() { this.x = 0; this.y = 0; this.zoom = 1; this.schedule(); }
        snapshot() { return { x: this.x, y: this.y, zoom: this.zoom }; }
    };
})();
