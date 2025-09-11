/* global fabric, gifler, FFmpeg, FFmpegUtil */
(function(){
    const $ = (sel)=>document.querySelector(sel);
    const logBox = $('#log');
    function log(msg){
        const time = new Date().toLocaleTimeString();
        const el = document.createElement('div');
        el.textContent = `[${time}] ${msg}`;
        logBox.prepend(el);
    }

    // Canvas setup
    const canvasEl = document.getElementById('stage');
    const canvas = new fabric.Canvas(canvasEl, {
        preserveObjectStacking: true,
        backgroundColor: '#111111'
    });

    // Controls style
    fabric.Object.prototype.set({
        transparentCorners: false,
        cornerColor: '#7c3aed',
        cornerStyle: 'circle',
        borderColor: '#7c3aed',
        cornerSize: 10
    });

    // UI elements
    const fileInput = document.getElementById('fileInput');
    const btnDelete = document.getElementById('btnDelete');
    const btnFront = document.getElementById('btnFront');
    const btnBack = document.getElementById('btnBack');
    const canvasW = document.getElementById('canvasW');
    const canvasH = document.getElementById('canvasH');
    const bgColor = document.getElementById('bgColor');
    const btnResize = document.getElementById('btnResize');
    const btnRec = document.getElementById('btnRec');
    const btnStop = document.getElementById('btnStop');
    const btnSaveWebM = document.getElementById('btnSaveWebM');
    const btnToMP4 = document.getElementById('btnToMP4');
    const btnToGIF = document.getElementById('btnToGIF');
    const fpsInput = document.getElementById('fps');

    // State for animated GIFs rendered by gifler
    const animatedLayers = new Map(); // id -> { stop: fn }

    function resizeCanvas(width, height){
        canvas.setWidth(width);
        canvas.setHeight(height);
        canvas.setBackgroundColor(bgColor.value, canvas.renderAll.bind(canvas));
        canvas.calcOffset();
        canvas.requestRenderAll();
    }
    resizeCanvas(parseInt(canvasW.value,10), parseInt(canvasH.value,10));

    bgColor.addEventListener('input', ()=>{
        canvas.setBackgroundColor(bgColor.value, canvas.renderAll.bind(canvas));
    });

    btnResize.addEventListener('click', ()=>{
        resizeCanvas(parseInt(canvasW.value,10), parseInt(canvasH.value,10));
    });

    btnDelete.addEventListener('click', ()=>{
        const active = canvas.getActiveObjects();
        active.forEach(obj=>{
            // stop gif if any
            if(obj.type === 'image' && obj._isGif && animatedLayers.has(obj.__gifKey)){
                try{ animatedLayers.get(obj.__gifKey).stop(); }catch(e){}
                animatedLayers.delete(obj.__gifKey);
            }
            canvas.remove(obj);
        });
        canvas.discardActiveObject();
        canvas.requestRenderAll();
    });

    btnFront.addEventListener('click', ()=>{
        const active = canvas.getActiveObjects();
        active.forEach(obj=> obj.bringToFront());
        canvas.requestRenderAll();
    });
    btnBack.addEventListener('click', ()=>{
        const active = canvas.getActiveObjects();
        active.forEach(obj=> obj.sendToBack());
        canvas.requestRenderAll();
    });

    function loadImageFile(file){
        return new Promise((resolve,reject)=>{
            const url = URL.createObjectURL(file);
            if(file.type === 'image/gif'){
                // Create a fabric Image backed by an offscreen canvas updated by gifler
                const placeholder = document.createElement('canvas');
                const ctx = placeholder.getContext('2d');
                gifler(url).get(anim=>{
                    const { width, height } = anim.frames[0].dims;
                    placeholder.width = width;
                    placeholder.height = height;
                    const draw = (ctx2, frame)=>{
                        if(frame.disposalType === 2){
                            ctx2.clearRect(0,0,width,height);
                        }
                        ctx2.putImageData(frame.buffer, frame.x, frame.y);
                    };
                    const stop = anim.animateInCanvas(placeholder, draw);
                    fabric.Image.fromURL(placeholder.toDataURL('image/png'), img=>{
                        img.set({ left: 100, top: 100, selectable: true });
                        img._isGif = true;
                        img.__gifKey = `${Date.now()}_${Math.random()}`;
                        animatedLayers.set(img.__gifKey, { stop });
                        resolve(img);
                    }, { crossOrigin: 'anonymous' });
                });
            } else {
                fabric.Image.fromURL(url, img=>{
                    img.set({ left: 100, top: 100, selectable: true });
                    resolve(img);
                }, { crossOrigin: 'anonymous' });
            }
        });
    }

    fileInput.addEventListener('change', async (e)=>{
        const files = Array.from(e.target.files || []);
        for(const file of files){
            try{
                const imgObj = await loadImageFile(file);
                canvas.add(imgObj);
            }catch(err){
                log(`無法載入 ${file.name}: ${err}`);
            }
        }
        canvas.requestRenderAll();
        fileInput.value = '';
    });

    // Recording
    let mediaRecorder = null;
    let recordedChunks = [];
    function getCanvasStream(){
        const fps = Math.min(60, Math.max(1, Number(fpsInput.value)||30));
        return canvasEl.captureStream(fps);
    }

    function updateRecordingButtons(isRecording){
        btnRec.disabled = isRecording;
        btnStop.disabled = !isRecording;
        btnSaveWebM.disabled = recordedChunks.length === 0 || isRecording;
        btnToMP4.disabled = btnSaveWebM.disabled;
        btnToGIF.disabled = btnSaveWebM.disabled;
    }
    updateRecordingButtons(false);

    btnRec.addEventListener('click', ()=>{
        const stream = getCanvasStream();
        recordedChunks = [];
        const options = { mimeType: 'video/webm;codecs=vp9' };
        try{
            mediaRecorder = new MediaRecorder(stream, options);
        }catch(e){
            // fallback
            mediaRecorder = new MediaRecorder(stream);
        }
        mediaRecorder.ondataavailable = (ev)=>{
            if(ev.data && ev.data.size>0){ recordedChunks.push(ev.data); }
        };
        mediaRecorder.onstop = ()=>{
            updateRecordingButtons(false);
            log('錄製完成');
        };
        mediaRecorder.start();
        updateRecordingButtons(true);
        log('開始錄製');
    });

    btnStop.addEventListener('click', ()=>{
        if(mediaRecorder && mediaRecorder.state !== 'inactive'){
            mediaRecorder.stop();
        }
    });

    function downloadBlob(blob, filename){
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
    }

    btnSaveWebM.addEventListener('click', ()=>{
        if(recordedChunks.length===0){ return; }
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        downloadBlob(blob, 'canvas.webm');
    });

    // ffmpeg.wasm helpers
    let ffmpeg = null;
    async function ensureFFmpeg(){
        if(ffmpeg) return ffmpeg;
        ffmpeg = new FFmpeg.FFmpeg();
        const { toBlobURL } = FFmpegUtil;
        const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.8/dist/umd';
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
        });
        return ffmpeg;
    }

    async function transcodeWebMTo(format){
        if(recordedChunks.length===0){ return null; }
        const webmBlob = new Blob(recordedChunks, { type: 'video/webm' });
        const webmBuf = new Uint8Array(await webmBlob.arrayBuffer());
        const ff = await ensureFFmpeg();
        const inputName = 'input.webm';
        const outName = format === 'mp4' ? 'out.mp4' : 'out.gif';
        await ff.writeFile(inputName, webmBuf);
        if(format==='mp4'){
            await ff.exec(['-i', inputName, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23', outName]);
        } else {
            await ff.exec(['-i', inputName, '-vf', 'fps=12,scale=-2:720:flags=lanczos', '-loop', '0', outName]);
        }
        const data = await ff.readFile(outName);
        await ff.deleteFile(inputName);
        await ff.deleteFile(outName);
        return new Blob([data.buffer], { type: format==='mp4' ? 'video/mp4' : 'image/gif' });
    }

    btnToMP4.addEventListener('click', async ()=>{
        btnToMP4.disabled = true; btnToGIF.disabled = true;
        log('轉檔為 MP4 中，首次使用需載入 ffmpeg.wasm，請稍候...');
        try{
            const blob = await transcodeWebMTo('mp4');
            if(blob) downloadBlob(blob, 'canvas.mp4');
        }catch(e){
            log('轉檔 MP4 失敗: ' + e.message);
        } finally {
            btnToMP4.disabled = false; btnToGIF.disabled = false;
        }
    });

    btnToGIF.addEventListener('click', async ()=>{
        btnToMP4.disabled = true; btnToGIF.disabled = true;
        log('轉檔為 GIF 中，首次使用需載入 ffmpeg.wasm，請稍候...');
        try{
            const blob = await transcodeWebMTo('gif');
            if(blob) downloadBlob(blob, 'canvas.gif');
        }catch(e){
            log('轉檔 GIF 失敗: ' + e.message);
        } finally {
            btnToMP4.disabled = false; btnToGIF.disabled = false;
        }
    });

    // Enable save buttons when we have chunks
    const chunkObserver = new MutationObserver(()=>{
        btnSaveWebM.disabled = recordedChunks.length === 0;
        btnToMP4.disabled = recordedChunks.length === 0;
        btnToGIF.disabled = recordedChunks.length === 0;
    });
    // We cannot observe array changes directly; tie enabling after stop
    // Already handled in onstop; above observer is a placeholder if we later reflect in DOM

    log('就緒：上傳圖片開始創作！');
})();


