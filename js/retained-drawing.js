/* Retain native paths, not a scaled bitmap: camera changes need no style/OpenCV work. */
(function () {
    'use strict';
    const attributes = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit',
        'globalAlpha', 'globalCompositeOperation', 'lineDashOffset'];
    const matrixFields = ['a', 'b', 'c', 'd', 'e', 'f'];
    const pathMethods = ['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'closePath'];
    window.MiceliumDrawing = class {
        static capture(context, paint, { render = true } = {}) {
            const commands = [], originals = new Map(), base = context.getTransform(), inverse = base.inverse();
            let path = new Path2D(), previous = null, matrix = null, transformDirty = true;
            function intercept(name, callback, draws = false) {
                const original = context[name]; originals.set(name, original);
                context[name] = function (...args) { callback(...args); if (render || !draws) return original.apply(this, args); };
            }
            function record(kind, shape, rule) {
                let transform = matrix;
                if (transformDirty) {
                    const current = context.getTransform();
                    transform = matrixFields.every(k => current[k] === base[k]) ? new DOMMatrix() : inverse.multiply(current);
                }
                transformDirty = false;
                if (!matrix || matrixFields.some(k => matrix[k] !== transform[k])) matrix = transform;
                if (!previous || attributes.some(k => previous[k] !== context[k])) {
                    previous = Object.fromEntries(attributes.map(k => [k, context[k]]));
                }
                commands.push({ kind, path: shape, style: previous, matrix, rule });
            }
            for (const name of ['setTransform', 'resetTransform', 'translate', 'scale', 'rotate', 'transform', 'restore'])
                intercept(name, () => { transformDirty = true; });
            intercept('beginPath', () => { path = new Path2D(); }, true);
            for (const name of pathMethods) intercept(name, (...args) => path[name](...args), true);
            for (const kind of ['fill', 'stroke']) intercept(kind, (...args) => {
                const supplied = args[0] instanceof Path2D;
                record(kind, new Path2D(supplied ? args[0] : path), kind === 'fill' ? (supplied ? args[1] : args[0]) || 'nonzero' : undefined);
            }, true);
            for (const kind of ['fill', 'stroke']) intercept(`${kind}Rect`, (x, y, w, h) => {
                const rectangle = new Path2D(); rectangle.rect(x, y, w, h); record(kind, rectangle, 'nonzero');
            }, true);
            try { paint(); }
            finally { for (const [name, original] of originals) context[name] = original; }
            return new this(commands);
        }
        constructor(commands) { this.commands = commands; }
        draw(context) {
            const base = context.getTransform();
            let previous = null, matrix = null;
            context.save();
            try {
                for (const command of this.commands) {
                    if (matrix !== command.matrix) { matrix = command.matrix; context.setTransform(matrix.isIdentity ? base : base.multiply(matrix)); }
                    if (previous !== command.style) {
                        for (const name of attributes) if (!previous || previous[name] !== command.style[name]) context[name] = command.style[name];
                        previous = command.style;
                    }
                    if (command.kind === 'fill') context.fill(command.path, command.rule);
                    else context.stroke(command.path);
                }
            } finally { context.restore(); }
        }
    };
})();
