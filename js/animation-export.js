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
        zip.file('animation.json', JSON.stringify({ ...metadata, duration, fps, frameCount: count, frameTimes: '(startFrame + frame index) / fps; last selected frame included; terminal timeline endpoint excluded' }, null, 2));
        abort(signal);
        const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, info => {
            abort(signal); progress(.9 + info.percent / 100 * .1, 'Packing PNG sequence');
        });
        abort(signal); return { blob, ext: 'zip' };
    }
    async function realtimeVideo({ render, duration, fps, signal, progress, type, bitrate = 24000000 }) {
        const first = render(0), canvas = document.createElement('canvas');
        canvas.width = first.width; canvas.height = first.height;
        const context = canvas.getContext('2d');
        context.drawImage(first, 0, 0);
        const stream = canvas.captureStream(fps);
        let recorder;
        try { recorder = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: bitrate }); }
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
                    const frame = Math.min(Math.ceil(duration * fps) - 1, Math.floor(elapsed * fps));
                    // Paint every capture, including cached/held compositions, onto a dedicated surface.
                    context.drawImage(render(frame / fps), 0, 0);
                    const track = stream.getVideoTracks()[0];
                    if (track.requestFrame) track.requestFrame();
                    progress(elapsed / duration, `Recording ${elapsed.toFixed(1)} / ${duration.toFixed(1)} s`);
                    timer = setTimeout(step, Math.max(1, (frame + 1) / fps * 1000 - (performance.now() - started)));
                } catch (error) { fail(error); }
            }
            signal.addEventListener('abort', cancel, { once: true });
            recorder.onstart = () => { started = performance.now(); step(); };
            try { abort(signal); recorder.start(250); } catch (error) { fail(error); }
        });
    }
    function framePlan({ duration, fps, startFrame = 0, endFrame = Math.ceil(duration * fps - 1e-9) - 1 }) {
        const total = Math.ceil(duration * fps - 1e-9);
        if (!Number.isFinite(duration) || duration <= 0 || ![12, 15, 24, 25, 30, 50, 60].includes(fps) ||
            !Number.isInteger(startFrame) || !Number.isInteger(endFrame) || startFrame < 0 || endFrame >= total || startFrame > endFrame) {
            throw new Error('Choose a valid frame range within the animation.');
        }
        return { startFrame, endFrame, frameCount: endFrame - startFrame + 1 };
    }
    let available = [];
    async function supportedTypes({ width = 720, height = 480, fps = 30, bitrate = 24000000 } = {}) {
        const result = [];
        if (typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined') {
            for (const type of [
                { ext: 'webm', mime: 'video/webm', codec: 'vp09.00.10.08', muxCodec: 'V_VP9', label: 'WebM · frame by frame' },
                { ext: 'mp4', mime: 'video/mp4', codec: 'avc1.420034', muxCodec: 'avc', label: 'MP4 · frame by frame' }
            ]) {
                try {
                    const config = { codec: type.codec, width, height, bitrate, framerate: fps, latencyMode: 'quality' };
                    if ((await VideoEncoder.isConfigSupported(config)).supported) result.push({ ...type, offline: true });
                } catch (_) { /* Unsupported codec; PNG sequence always remains available. */ }
            }
        }
        if (!result.length && typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function' && HTMLCanvasElement.prototype.captureStream) {
            result.push(...videoTypes.filter(t => MediaRecorder.isTypeSupported(t.mime)).filter((t, i, all) => all.findIndex(o => o.ext === t.ext) === i)
                .map(t => ({ ...t, label: t.label + ' · realtime', offline: false })));
        }
        available = result; return result;
    }
    async function encodedVideo({ render, duration, fps, signal, progress, type, bitrate = 24000000 }) {
        const count = Math.ceil(duration * fps - 1e-9), first = render(0);
        const library = type.ext === 'mp4' ? window.Mp4Muxer : window.WebMMuxer;
        const target = new library.ArrayBufferTarget();
        const muxer = new library.Muxer({ target, video: { codec: type.muxCodec, width: first.width, height: first.height, frameRate: fps },
            ...(type.ext === 'mp4' ? { fastStart: 'in-memory' } : {}), firstTimestampBehavior: 'strict' });
        let failure = null, bytes = 0, encoded = 0;
        const encoder = new VideoEncoder({
            output(chunk, metadata) {
                try {
                    bytes += chunk.byteLength;
                    if (bytes > 512 * 1024 * 1024) throw new Error('Video exceeds 512 MB. Export a shorter range or reduce bitrate.');
                    muxer.addVideoChunk(chunk, metadata); encoded++;
                } catch (error) { failure = error; }
            }, error(error) { failure = error; }
        });
        try {
            const config = { codec: type.codec, width: first.width, height: first.height, bitrate, framerate: fps, latencyMode: 'quality' };
            if (type.ext === 'mp4') config.avc = { format: 'avc' };
            if (!(await VideoEncoder.isConfigSupported(config)).supported) throw new Error('This video size or codec is unavailable. Choose another format or PNG sequence.');
            encoder.configure(config);
            for (let i = 0; i < count; i++) {
                abort(signal); if (failure) throw failure;
                const timestamp = Math.round(i * 1000000 / fps), next = Math.round((i + 1) * 1000000 / fps);
                const frame = new VideoFrame(i ? render(i / fps) : first, { timestamp, duration: next - timestamp });
                try { encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 }); } finally { frame.close(); }
                // Bound encoder memory, and wait for actual encoded output under load.
                if (encoder.encodeQueueSize >= 4) await encoder.flush();
                progress((i + 1) / count * .95, `Encoding frame ${i + 1} / ${count}`); await yieldTask();
            }
            await encoder.flush(); abort(signal); if (failure) throw failure;
            if (encoded !== count) throw new Error(`Incomplete video: ${encoded} / ${count} frames. Try PNG sequence.`);
            muxer.finalize(); progress(1, `Encoded ${count} / ${count} frames`);
            return { blob: new Blob([target.buffer], { type: type.mime }), ext: type.ext };
        } finally { if (encoder.state !== 'closed') encoder.close(); }
    }
    window.MiceliumAnimationExport = {
        videoTypes: () => available, supportedTypes, framePlan,
        async run(options) {
            abort(options.signal);
            const plan = framePlan(options), fps = options.fps;
            const selected = { ...options, duration: plan.frameCount / fps,
                render: time => options.render((plan.startFrame + Math.round(time * fps)) / fps),
                metadata: { ...options.metadata, ...plan, sourceDuration: options.duration, bitrate: options.type ? options.bitrate : undefined } };
            const result = options.type ? await (options.type.offline ? encodedVideo(selected) : realtimeVideo(selected)) : await sequence(selected);
            abort(options.signal);
            download(result.blob, `myclm_animation_${options.metadata.width}x${options.metadata.height}_${fps}fps_${plan.startFrame}-${plan.endFrame}.${result.ext}`);
        }
    };
    supportedTypes();
})();
