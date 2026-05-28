const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('status-text');
const actionBtn = document.getElementById('action-btn');
const objectsList = document.getElementById('objects-list');

let model;
let lastSpoken = "";
let history = [];

// 1. Force the camera to be ready before doing anything
async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' }, 
        audio: false 
    });
    video.srcObject = stream;
    
    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            video.play();
            resolve();
        };
    });
}

function speak(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
}

// 2. The brain: Only runs if the video is actually playing
async function detect() {
    if (!model || video.paused || video.ended) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const predictions = await model.detect(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (predictions.length > 0) {
        const p = predictions[0];
        if (p.score > 0.4) {
            const centerX = p.bbox[0] + p.bbox[2] / 2;
            let dir = (centerX < canvas.width / 3) ? "on your left" : 
                      (centerX > (canvas.width / 3) * 2) ? "on your right" : "ahead";
            
            let message = `${p.class} ${dir}`;
            if (message !== lastSpoken) {
                speak(message);
                lastSpoken = message;
            }
            
            // UI update
            if (history[0] !== message) {
                history.unshift(message);
                if (history.length > 3) history.pop();
                objectsList.innerHTML = history.map(i => `<li>${i}</li>`).join('');
            }
        }
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 4;
        ctx.strokeRect(p.bbox[0], p.bbox[1], p.bbox[2], p.bbox[3]);
    }
    requestAnimationFrame(detect);
}

// 3. Sequential Loading: One step at a time
actionBtn.addEventListener('click', async () => {
    try {
        actionBtn.innerText = "Loading Camera...";
        await setupCamera();
        
        actionBtn.innerText = "Loading AI...";
        model = await cocoSsd.load();
        
        actionBtn.style.display = 'none';
        statusText.innerText = 'System Active';
        
        detect();
    } catch (e) {
        statusText.innerText = "Error: " + e.message;
        console.error(e);
    }
});
                
