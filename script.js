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
    return new Promise((resolve) => { video.onloadedmetadata = resolve; });
}

function speak(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    window.speechSynthesis.speak(utterance);
}

function updateHistory(item) {
    if (history[0] !== item) {
        history.unshift(item);
        if (history.length > 5) history.pop();
        
        let html = '';
        history.forEach(i => { html += `<li>${i}</li>`; });
        objectsList.innerHTML = html;
    }
}

async function detect() {
    if (!model) return;
    const predictions = await model.detect(video, 20, 0.2);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (predictions.length > 0) {
        const topObject = predictions[0].class;
        const confidence = predictions[0].score;

        if (confidence > 0.4) {
            if (topObject !== lastSpoken) {
                speak(topObject);
                lastSpoken = topObject;
            }
            updateHistory(topObject);
        } else if (lastSpoken !== "unidentified") {
            speak("unidentified");
            lastSpoken = "unidentified";
        }
        
        // Professional Crosshair Targeting
        predictions.forEach(p => {
            const [x, y, w, h] = p.bbox;
            const centerX = x + w / 2;
            const centerY = y + h / 2;
            const size = 30; 

            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 4;
            
            // Draw horizontal line
            ctx.beginPath();
            ctx.moveTo(centerX - size, centerY);
            ctx.lineTo(centerX + size, centerY);
            ctx.stroke();

            // Draw vertical line
            ctx.beginPath();
            ctx.moveTo(centerX, centerY - size);
            ctx.lineTo(centerX, centerY + size);
            ctx.stroke();
        });
        
    } else { lastSpoken = ""; }
    requestAnimationFrame(detect);
}

actionBtn.addEventListener('click', async () => {
    actionBtn.style.display = 'none';
    statusText.innerText = 'Initializing...';
    
    try {
        await setupCamera();
        model = await cocoSsd.load({base: 'mobilenet_v2'});
        statusText.innerText = 'System Ready';
        speak("System ready. Scanning.");
        detect();
    } catch (err) {
        statusText.innerText = 'Error: Check Camera';
    }
});
                           
