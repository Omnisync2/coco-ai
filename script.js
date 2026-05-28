const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const actionBtn = document.getElementById('action-btn');
const objectsList = document.getElementById('objects-list');

let model;
let lastSpoken = "";
let history = [];

async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' },
        audio: false // Explicitly disable audio for camera stream to avoid conflicts
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
        objectsList.innerHTML = history.map(i => `<li style="padding: 5px; color: #00ff00;">${i}</li>`).join('');
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
            speak("unidentified object");
            lastSpoken = "unidentified";
        }
        
        predictions.forEach(p => {
            const [x, y, w, h] = p.bbox;
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, w, h);
        });
    } else { lastSpoken = ""; }
    requestAnimationFrame(detect);
}

actionBtn.addEventListener('click', async () => {
    actionBtn.style.display = 'none';
    statusText.innerText = 'Initializing...';
    speak("Starting system. Please wait.");
    
    try {
        await setupCamera();
        model = await cocoSsd.load({base: 'mobilenet_v2'});
        statusDot.classList.add('ready');
        statusText.innerText = 'Ready';
        speak("System ready. Scanning.");
        detect();
    } catch (err) {
        statusText.innerText = 'Error';
        speak("Could not access camera. Please check permissions.");
    }
});
