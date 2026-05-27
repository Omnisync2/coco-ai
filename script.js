const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const actionBtn = document.getElementById('action-btn');
const objectsList = document.getElementById('objects-list');

let model;
let lastSpoken = "";

async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
    });
    video.srcObject = stream;
    return new Promise((resolve) => { video.onloadedmetadata = resolve; });
}

async function detect() {
    // Threshold 0.2 makes it more sensitive
    const predictions = await model.detect(video, 20, 0.2);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    objectsList.innerHTML = '';

    if (predictions.length > 0) {
        const topObject = predictions[0].class;
        const confidence = predictions[0].score;

        // If high confidence, speak the object
        if (confidence > 0.4 && topObject !== lastSpoken) {
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(new SpeechSynthesisUtterance(topObject));
            lastSpoken = topObject;
        } 
        // If it sees something but is confused (low confidence), say "Unidentified"
        else if (confidence <= 0.4 && lastSpoken !== "unidentified") {
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(new SpeechSynthesisUtterance("Unidentified object"));
            lastSpoken = "unidentified";
        }

        predictions.forEach(prediction => {
            const [x, y, width, height] = prediction.bbox;
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, width, height);
            const li = document.createElement('li');
            li.innerText = prediction.class;
            objectsList.appendChild(li);
        });
    } else {
        lastSpoken = ""; // Reset when nothing is seen
    }
    requestAnimationFrame(detect);
}

actionBtn.addEventListener('click', async () => {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance("Starting camera"));
    actionBtn.style.display = 'none';
    statusText.innerText = 'Loading Model...';
    
    try {
        await setupCamera();
        model = await cocoSsd.load({base: 'mobilenet_v2'});
        statusDot.classList.add('ready');
        statusText.innerText = 'Ready';
        detect();
    } catch (err) {
        statusText.innerText = 'Error';
    }
});
