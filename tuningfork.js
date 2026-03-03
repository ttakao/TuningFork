/**
 * 電子音叉 プログラム (低周波安定化版)
 */

let ctx;
let oscillator;
let gainNode;
let analyser;
let animationId;
let isPlaying = false;

const MIN_FREQ = 20;    
const MAX_FREQ = 2000; 

const getEl = (id) => document.getElementById(id);

/**
 * オーディオ初期化
 */
function initAudio() {
    if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = ctx.createAnalyser();
        // 20Hzの波形を数周期分保持するために大きなバッファを確保
        analyser.fftSize = 16384; 
    }
}

function playSound() {
    initAudio();
    if (isPlaying) return;
    if (ctx.state === 'suspended') ctx.resume();

    oscillator = ctx.createOscillator();
    gainNode = ctx.createGain();

    const waveforms = document.getElementsByName("waveform");
    let type = "sine";
    for (let i = 0; i < waveforms.length; i++) {
        if (waveforms[i].checked) {
            type = waveforms[i].value;
            break;
        }
    }
    oscillator.type = type;
    
    const freq = parseFloat(getEl("freq").value) || 440;
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

    const vol = parseFloat(getEl("volume").value) || 0.1;
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.05);

    oscillator.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start();
    isPlaying = true;
    
    getEl("status").style.display = "block";
    getEl("play").disabled = true;

    draw();
}

function stopSound() {
    if (!isPlaying) return;
    const now = ctx.currentTime;
    
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.1);
    
    oscillator.stop(now + 0.2);
    
    setTimeout(() => {
        isPlaying = false;
        cancelAnimationFrame(animationId);
        getEl("status").style.display = "none";
        getEl("play").disabled = false;
        clearCanvas();
    }, 200);
}

/**
 * 波形描画
 * 低周波でもトリガーが外れないよう探索範囲を調整
 */
function draw() {
    const canvas = getEl("visualizer");
    const canvasCtx = canvas.getContext("2d");
    const bufferLength = analyser.frequencyBinCount; // fftSizeの半分(8192)
    const dataArray = new Uint8Array(bufferLength);

    if (canvas.width !== canvas.clientWidth) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }

    function render() {
        animationId = requestAnimationFrame(render);
        analyser.getByteTimeDomainData(dataArray);

        canvasCtx.fillStyle = "#222";
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        const currentFreq = parseFloat(getEl("freq").value) || 440;

        // 1. トリガーポイント探索
        // 低周波（周期が長い）に対応するため、探索範囲を広げる
        let triggerIndex = 0;
        const searchRange = bufferLength / 2; 
        for (let i = 1; i < searchRange; i++) {
            if (dataArray[i - 1] < 128 && dataArray[i] >= 128) {
                triggerIndex = i;
                break;
            }
        }

        // 2. 表示倍率の調整
        const samplesPerCycle = ctx.sampleRate / currentFreq;
        let totalSamplesToShow = samplesPerCycle * 2.5; 
        
        // バッファを超えないように制限（右側が消えるのを防ぐ）
        const availableSamples = bufferLength - triggerIndex;
        if (totalSamplesToShow > availableSamples) {
            totalSamplesToShow = availableSamples;
        }

        const sliceWidth = canvas.width / totalSamplesToShow;

        // 3. 描画
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = "rgb(0, 255, 0)";
        canvasCtx.beginPath();

        let x = 0;
        for (let i = 0; i < totalSamplesToShow; i++) {
            const v = dataArray[i + triggerIndex] / 128.0;
            const y = v * (canvas.height / 2);

            if (i === 0) {
                canvasCtx.moveTo(x, y);
            } else {
                canvasCtx.lineTo(x, y);
            }
            x += sliceWidth;
            if (x > canvas.width) break; 
        }
        canvasCtx.stroke();
    }
    render();
}

function clearCanvas() {
    const canvas = getEl("visualizer");
    if (!canvas) return;
    const canvasCtx = canvas.getContext("2d");
    canvasCtx.fillStyle = "#222";
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = "rgb(0, 255, 0)";
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, canvas.height / 2);
    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
}

// イベントリスナー
getEl("play").addEventListener("click", playSound);
getEl("stop").addEventListener("click", stopSound);

getEl("freqSlider").addEventListener("input", (e) => {
    const freq = Math.round(MIN_FREQ + (MAX_FREQ - MIN_FREQ) * e.target.value);
    getEl("freq").value = freq;
    if (isPlaying && oscillator) {
        oscillator.frequency.setTargetAtTime(freq, ctx.currentTime, 0.03);
    }
});

getEl("freq").addEventListener("input", (e) => {
    let freq = parseFloat(e.target.value);
    if (freq > 0) {
        const val = (freq - MIN_FREQ) / (MAX_FREQ - MIN_FREQ);
        getEl("freqSlider").value = Math.max(0, Math.min(1, val));
        if (isPlaying && oscillator) {
            oscillator.frequency.setTargetAtTime(freq, ctx.currentTime, 0.03);
        }
    }
});

getEl("volume").addEventListener("input", (e) => {
    if (isPlaying && gainNode) {
        gainNode.gain.setTargetAtTime(e.target.value, ctx.currentTime, 0.03);
    }
});