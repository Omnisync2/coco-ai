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

let lastRun = 0;
const DETECT_INTERVAL = 250; // performance control (4 fps approx)

let speechLock = false;

// stability control
let lastObjectStable = "";
let stableCount = 0;

async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
    });
    video.srcObject = stream;

    return new Promise((resolve) => {
        video.onloadedmetadata = resolve;
    });
}

function speak(text) {
    if (speechLock) return;

    speechLock = true;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;

    utterance.onend = () => {
        speechLock = false;
    };

    window.speechSynthesis.speak(utterance);
}

function updateHistory(item) {
    if (history[0] !== item) {
        history.unshift(item);
        if (history.length > 5) history.pop();

        objectsList.innerHTML = history
            .map(i => `<li style="padding:5px;color:#00ff00;">${i}</li>`)
            .join('');
    }
}

async function detect(timestamp) {
    if (!model) return;

    // throttle detection speed (prevents overload)
    if (timestamp - lastRun < DETECT_INTERVAL) {
        requestAnimationFrame(detect);
        return;
    }
    lastRun = timestamp;

    const predictions = await model.detect(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (predictions.length > 0) {
        predictions.sort((a, b) => b.score - a.score);

        const top = predictions[0];
        const object = top.class;
        const confidence = top.score;

        // stability check (prevents flickering speech)
        if (object === lastObjectStable) {
            stableCount++;
        } else {
            stableCount = 0;
            lastObjectStable = object;
        }

        // MAIN SPEECH LOGIC
        if (confidence > 0.5 && stableCount >= 3) {
            if (object !== lastSpoken && !speechLock) {
                speak(object); // ORIGINAL COCO WORD (UNCHANGED)
                lastSpoken = object;
                updateHistory(object);
            }
        }

        // LOW CONFIDENCE → obstacle ahead (instead of "unidentified object")
        else if (confidence <= 0.5 && stableCount >= 3) {
            if (lastSpoken !== "obstacle" && !speechLock) {
                speak("obstacle ahead");
                lastSpoken = "obstacle";
                updateHistory("obstacle ahead");
            }
        }

        // draw bounding boxes
        predictions.forEach(p => {
            if (p.score > 0.4) {
                const [x, y, w, h] = p.bbox;
                ctx.strokeStyle = "#00ff00";
                ctx.lineWidth = 4;
                ctx.strokeRect(x, y, w, h);
            }
        });

    } else {
        lastObjectStable = "";
        stableCount = 0;
        lastSpoken = "";
    }

    requestAnimationFrame(detect);
}

actionBtn.addEventListener('click', async () => {
    actionBtn.style.display = 'none';
    statusText.innerText = 'Initializing...';

    try {
        await setupCamera();

        model = await cocoSsd.load({ base: 'mobilenet_v2' });

        statusDot.classList.add('ready');
        statusText.innerText = 'Ready';

        speak("System ready. Scanning.");

        detect();

    } catch (err) {
        statusText.innerText = 'Error';
        speak("Camera error. Please check permissions.");
        console.error(err);
    }
});
