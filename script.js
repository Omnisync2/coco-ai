const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const actionBtn = document.getElementById('action-btn');
const objectsList = document.getElementById('objects-list');

let model;
let lastSpoken = "";
let history = []; // This stores the last 5 identified objects

async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
    });
    video.srcObject = stream;
    return new Promise((resolve) => { video.onloadedmetadata = resolve; });
}

// Function to handle professional-sounding speech
function speak(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1; // Slightly faster for a "smart" feel
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
}

// Function to track recent detections
function updateHistory(item) {
    if (history[0] !== item) {
        history.unshift(item);
        if (history.length > 5) history.pop();
        
        objectsList.innerHTML = history.map(i => `<li style="padding: 5px; border-bottom: 1px solid #333;">${i}</li>`).join('');
    }
}

async function detect() {
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
        } 
        else if (lastSpoken !== "unidentified") {
            speak("Unidentified object");
            lastSpoken = "unidentified";
        }

        predictions.forEach(prediction => {
            const [x, y, width, height] = prediction.bbox;
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, width, height);
        });
    } else {
        lastSpoken = ""; 
    }
    requestAnimationFrame(detect);
}

actionBtn.addEventListener('click', async () => {
    speak("System active. Initializing camera and sensors.");
    actionBtn.style.display = 'none';
    statusText.innerText = 'Loading AI Model...';
    
    try {
        await setupCamera();
        model = await cocoSsd.load({base: 'mobilenet_v2'});
        statusDot.classList.add('ready');
        statusText.innerText = 'Ready';
        speak("System ready. Begin scanning.");
        detect();
    } catch (err) {
        statusText.innerText = 'Error';
        speak("Failed to initialize. Please check camera permissions.");
    }
});
        
