/* Browser-native video and frame-accurate PNG sequences, using existing JSZip. */
(function () {
    'use strict';
    const videoTypes = [
        { mime: 'video/webm;codecs=vp9', ext: 'webm', label: 'WebM video' },
        { mime: 'video/webm;codecs=vp8', ext: 'webm', label: 'WebM video' },
        { mime: 'video/mp4;codecs=avc1', ext: 'mp4', label: 'MP4 video' },
        { mime: 'video/mp4', ext: 'mp4', label: 'MP4 video' }
    ];
    const abort = signal => { if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError'); };
    const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));
    const toBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to encode PNG')), 'image/png'));
    function download(blob, filename) {
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    async function sequence({ render, duration, fps, signal, progress, metadata }) {
        const zip = new JSZip(), count = Math.ceil(duration * fps - 1e-9);
        let bytes = 0;
        for (let frame = 0; frame < count; frame++) {
            abort(signal);
            const blob = await toBlob(render(frame / fps)); bytes += blob.size;
            if (bytes > 192 * 1024 * 1024) throw new Error('Sequence exceeds 192 MB. Reduce resolution or frame rate.');
            zip.file(`frames/frame_${String(frame).padStart(5, '0')}.png`, await blob.arrayBuffer());
            progress((frame + 1) / count * .9, `Rendering frame ${frame + 1} / ${count}`); await yieldTask();
        }
        zip.file('animation.json', JSON.stringify({ ...metadata, duration, fps, frameCount: count, frameTimes: 'frame index / fps; terminal endpoint excluded' }, null, 2));
        abort(signal);
        const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, info => {
            abort(signal); progress(.9 + info.percent / 100 * .1, 'Packing PNG sequence');
        });
        abort(signal); return { blob, ext: 'zip' };
    }
    async function video({ render, duration, fps, signal, progress, type }) {
        const canvas = render(0), stream = canvas.captureStream(fps);
        let recorder;
        try { recorder = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: 12000000 }); }
        catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
        const chunks = [];
        let timer, started, settled = false;
        return new Promise((resolve, reject) => {
            function cleanup() { clearTimeout(timer); signal.removeEventListener('abort', cancel); stream.getTracks().forEach(track => track.stop()); }
            function fail(error) {
                if (settled) return; settled = true; cleanup();
                if (recorder.state !== 'inactive') recorder.stop(); reject(error);
            }
            function cancel() { fail(new DOMException('Export cancelled', 'AbortError')); }
            recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
            recorder.onerror = event => fail(event.error || new Error('Video encoder failed'));
            recorder.onstop = () => {
                if (settled) return; settled = true; cleanup();
                const blob = new Blob(chunks, { type: recorder.mimeType });
                if (!blob.size) reject(new Error('Empty video. Try PNG sequence.'));
                else resolve({ blob, ext: type.ext });
            };
            function step() {
                if (settled) return;
                try {
                    abort(signal);
                    const elapsed = Math.min(duration, (performance.now() - started) / 1000);
                    if (elapsed >= duration) { recorder.stop(); return; }
                    const frame = Math.min(Math.ceil(duration * fps) - 1, Math.floor(elapsed * fps)); render(frame / fps);
                    const track = stream.getVideoTracks()[0];
                    if (track.requestFrame) track.requestFrame();
                    else {
                        // Mark held/cached frames dirty so their duration is captured too.
                        const ctx = canvas.getContext('2d'); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
                        ctx.globalCompositeOperation = 'copy'; ctx.globalAlpha = 1; ctx.drawImage(canvas, 0, 0); ctx.restore();
                    }
                    progress(elapsed / duration, `Recording ${elapsed.toFixed(1)} / ${duration.toFixed(1)} s`);
                    timer = setTimeout(step, Math.max(1, (frame + 1) / fps * 1000 - (performance.now() - started)));
                } catch (error) { fail(error); }
            }
            signal.addEventListener('abort', cancel, { once: true });
            recorder.onstart = () => { started = performance.now(); step(); };
            try { abort(signal); recorder.start(250); } catch (error) { fail(error); }
        });
    }
    window.MiceliumAnimationExport = {
        videoTypes: () => typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function' || !HTMLCanvasElement.prototype.captureStream ? [] : videoTypes.filter(type => MediaRecorder.isTypeSupported(type.mime)).filter((type, i, all) => all.findIndex(other => other.ext === type.ext) === i),
        async run(options) {
            abort(options.signal);
            const result = options.type ? await video(options) : await sequence(options);
            abort(options.signal);
            download(result.blob, `micelium_animation_${options.metadata.width}x${options.metadata.height}_${options.fps}fps.${result.ext}`);
        }
    };
})();
