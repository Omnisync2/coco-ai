const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('status-text');
const actionBtn = document.getElementById('action-btn');
const resetBtn = document.getElementById('reset-btn');
const historyBtn = document.getElementById('history-btn');
const objectsList = document.getElementById('objects-list');

let model;
let lastSpoken = "";
let detectionBuffer = [];
const BUFFER_SIZE = 5; 

// 1. Setup Camera
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

// 2. Text-to-Speech
function speak(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
}

// 3. Main Detection Loop
async function detect() {
    if (!model || video.paused || video.ended) {
        requestAnimationFrame(detect);
        return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const predictions = await model.detect(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let currentPrediction = "unidentified";
    
    if (predictions.length > 0 && predictions[0].score > 0.3) {
        currentPrediction = predictions[0].class;
        
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 4;
        ctx.strokeRect(predictions[0].bbox[0], predictions[0].bbox[1], predictions[0].bbox[2], predictions[0].bbox[3]);
    }

    detectionBuffer.push(currentPrediction);
    if (detectionBuffer.length > BUFFER_SIZE) detectionBuffer.shift();

    const allSame = detectionBuffer.every(val => val === detectionBuffer[0]);
    
    if (allSame && detectionBuffer[0] !== lastSpoken) {
        lastSpoken = detectionBuffer[0];
        speak(lastSpoken);
        
        if (lastSpoken !== "unidentified") {
            const li = document.createElement('li');
            li.textContent = lastSpoken;
            objectsList.prepend(li);
        }
    }

    requestAnimationFrame(detect);
}

// 4. Button Event Listeners
actionBtn.addEventListener('click', async () => {
    actionBtn.style.display = 'none';
    statusText.innerText = 'Starting Camera...';
    
    try {
        await setupCamera();
        statusText.innerText = 'Camera Ready. Loading AI...';
        
        model = await cocoSsd.load();
        
        statusText.innerText = 'System Ready';
        detect();
    } catch (err) {
        statusText.innerText = 'Error: ' + err.message;
        actionBtn.style.display = 'block'; 
    }
});

resetBtn.addEventListener('click', () => {
    window.location.reload();
});

historyBtn.addEventListener('click', () => {
    objectsList.style.display = (objectsList.style.display === 'none') ? 'block' : 'none';
});
