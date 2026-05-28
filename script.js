const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('status-text');
const actionBtn = document.getElementById('action-btn');
const objectsList = document.getElementById('objects-list');

let model;
let lastSpoken = "";
let history = [];

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

function updateHistory(item) {
    if (history[0] !== item) {
        history.unshift(item);
        if (history.length > 5) history.pop();
        objectsList.innerHTML = history.map(i => `<li>${i}</li>`).join('');
    }
}

async function detect() {
    if (!model) return;
    
    // Set canvas dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const predictions = await model.detect(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (predictions.length > 0) {
        const topObject = predictions[0].class;
        
        if (predictions[0].score > 0.4) {
            if (topObject !== lastSpoken) {
                speak(topObject);
                lastSpoken = topObject;
            }
            updateHistory(topObject);
        }

        // Draw basic box
        predictions.forEach(p => {
            const [x, y, w, h] = p.bbox;
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, w, h);
        });
    }
    
    requestAnimationFrame(detect);
}

actionBtn.addEventListener('click', async () => {
    actionBtn.style.display = 'none';
    statusText.innerText = 'Initializing...';
    try {
        await setupCamera();
        model = await cocoSsd.load();
        statusText.innerText = 'Ready';
        detect();
    } catch (err) {
        statusText.innerText = 'Error: ' + err.message;
    }
});
            
