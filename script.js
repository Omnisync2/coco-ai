const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('status-text');
const actionBtn = document.getElementById('action-btn');
const objectsList = document.getElementById('objects-list');

let model;
let lastSpoken = "";

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

async function detect() {
    if (!model) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const predictions = await model.detect(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (predictions.length > 0) {
        const top = predictions[0];
        
        if (top.score > 0.4) {
            if (top.class !== lastSpoken) {
                speak(top.class);
                lastSpoken = top.class;
                
                // Add to list
                const li = document.createElement('li');
                li.textContent = top.class;
                objectsList.prepend(li);
            }
        }
        
        // Draw simple box
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 4;
        ctx.strokeRect(top.bbox[0], top.bbox[1], top.bbox[2], top.bbox[3]);
        
    } else {
        if (lastSpoken !== "unidentified") {
            speak("unidentified");
            lastSpoken = "unidentified";
        }
    }
    requestAnimationFrame(detect);
}

actionBtn.addEventListener('click', async () => {
    actionBtn.style.display = 'none';
    statusText.innerText = 'Loading...';
    try {
        await setupCamera();
        model = await cocoSsd.load();
        statusText.innerText = 'System Ready';
        detect();
    } catch (err) {
        statusText.innerText = 'Error: ' + err.message;
    }
});
        
