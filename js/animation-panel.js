/* Dock sizing only: the composition and timeline are independent of this layout. */
(function () {
    'use strict';
    window.MiceliumAnimationPanel = class {
        constructor(panel) {
            this.panel = panel; this.workspace = panel.parentElement;
            this.preferred = null; this.drag = null; this.raf = 0; this.pending = null;
            const handle = this.handle = document.createElement('div');
            handle.id = 'animate-resize'; handle.hidden = true; handle.tabIndex = 0;
            handle.setAttribute('data-editor-overlay', '');
            handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'horizontal');
            handle.setAttribute('aria-controls', panel.id);
            handle.setAttribute('aria-label', 'Resize animation panel');
            handle.title = 'Drag up or down to resize. Arrow keys adjust height; double-click or Enter resets.';
            handle.innerHTML = '<span aria-hidden="true">DRAG TO RESIZE</span>';
            panel.before(handle);
            handle.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                event.preventDefault(); handle.focus({ preventScroll: true });
                this.drag = { id: event.pointerId, y: event.clientY, height: panel.getBoundingClientRect().height };
                handle.setPointerCapture(event.pointerId);
                document.body.classList.add('animation-panel-resizing');
            });
            handle.addEventListener('pointermove', event => {
                if (this.drag?.id !== event.pointerId) return;
                this.pending = this.drag.height + this.drag.y - event.clientY;
                if (!this.raf) this.raf = requestAnimationFrame(() => {
                    this.raf = 0; this.resize(this.pending); this.pending = null;
                });
            });
            for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
                handle.addEventListener(type, event => { if (this.drag?.id === event.pointerId) this.finishDrag(); });
            }
            handle.addEventListener('dblclick', () => this.reset());
            handle.addEventListener('keydown', event => {
                if (!['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter'].includes(event.key)) return;
                event.preventDefault(); event.stopPropagation();
                const { min, max } = this.bounds(), step = event.shiftKey ? 48 : 16;
                if (event.key === 'Enter') this.reset();
                else this.resize(event.key === 'Home' ? min : event.key === 'End' ? max :
                    panel.getBoundingClientRect().height + (event.key === 'ArrowUp' ? step : -step));
            });
            new ResizeObserver(() => { if (!panel.hidden) this.sync(); }).observe(this.workspace);
        }
        bounds() {
            const player = document.getElementById('videoBottomBar');
            const max = Math.max(80, this.workspace.clientHeight - 160 - this.handle.offsetHeight - player.offsetHeight);
            return { min: Math.min(180, max), max };
        }
        sync() {
            const { min, max } = this.bounds();
            const height = Math.round(Math.max(min, Math.min(max, this.preferred ?? Math.min(360, this.workspace.clientHeight * .36))));
            this.panel.style.height = `${height}px`;
            this.handle.setAttribute('aria-valuemin', String(min));
            this.handle.setAttribute('aria-valuemax', String(max));
            this.handle.setAttribute('aria-valuenow', String(height));
            this.handle.setAttribute('aria-valuetext', `${height} pixels for the animation panel`);
        }
        resize(value) {
            const { min, max } = this.bounds();
            this.preferred = Math.max(min, Math.min(max, value)); this.sync();
        }
        reset() { this.preferred = null; this.sync(); }
        finishDrag() {
            cancelAnimationFrame(this.raf); this.raf = 0;
            if (this.pending !== null) { this.resize(this.pending); this.pending = null; }
            const id = this.drag?.id; this.drag = null;
            if (id !== undefined && this.handle.hasPointerCapture(id)) this.handle.releasePointerCapture(id);
            document.body.classList.remove('animation-panel-resizing');
        }
        show(active) {
            this.handle.hidden = !active;
            if (active) this.sync(); else this.finishDrag();
        }
    };
})();
