const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const actionBtn = document.getElementById('action-btn');
const objectsList = document.getElementById('objects-list');
const warningOverlay = document.getElementById("camera-warning");

let model;

// =======================
// STATE
// =======================
let lastSpokenTime = 0;
let stableObject = "";
let stableCount = 0;
let lastSpeech = "";

const REQUIRED_STABILITY = 3;
const SPEAK_INTERVAL = 12000;

const FPS = 10;
const interval = 1000 / FPS;
let lastTime = 0;

let speechLock = false;

// =======================
// CAMERA
// =======================
async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
    });

    video.srcObject = stream;

    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            resolve();
        };
    });
}

// =======================
// SPEECH
// =======================
function speak(text) {
    if (speechLock) return;

    speechLock = true;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;

    utterance.onend = () => {
        speechLock = false;
    };

    window.speechSynthesis.speak(utterance);
}

// =======================
// HISTORY
// =======================
let history = [];

function updateHistory(item) {
    if (history[0] !== item) {
        history.unshift(item);
        if (history.length > 5) history.pop();

        objectsList.innerHTML = history
            .map(i => `<li style="padding:5px;">${i}</li>`)
            .join('');
    }
}

// =======================
// BRIGHTNESS CHECK
// =======================
function getBrightness(video) {
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");

    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;

    tempCtx.drawImage(video, 0, 0);

    const frame = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

    let total = 0;

    for (let i = 0; i < frame.data.length; i += 4) {
        total += (frame.data[i] + frame.data[i + 1] + frame.data[i + 2]) / 3;
    }

    return total / (frame.data.length / 4);
}

// =======================
// DETECTION LOOP
// =======================
async function detect(time) {

    if (!model) return;

    if (time - lastTime < interval) {
        requestAnimationFrame(detect);
        return;
    }

    lastTime = time;

    // =======================
    // LOW LIGHT WARNING
    // =======================
    const brightness = getBrightness(video);

    if (brightness < 110) {
        warningOverlay.classList.add("show");
    } else {
        warningOverlay.classList.remove("show");
    }

    const predictions = await model.detect(video);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (predictions.length === 0) {
        stableObject = "";
        stableCount = 0;
        requestAnimationFrame(detect);
        return;
    }

    predictions.sort((a, b) => b.score - a.score);

    const top = predictions[0];

    const object = top.class;
    const confidence = top.score;

    const [x, y, w, h] = top.bbox;

    // =======================
    // FILTER LOW CONFIDENCE
    // =======================
    if (confidence < 0.4) {
        requestAnimationFrame(detect);
        return;
    }

    // =======================
    // DISTANCE (STABLE)
    // =======================
    const area = w * h;
    const normalized = area / (canvas.width * canvas.height);

    let distance = "";

    if (normalized < 0.02) distance = "far";
    else if (normalized < 0.08) distance = "near";
    else distance = "very close";

    // =======================
    // DIRECTION
    // =======================
    const centerX = x + w / 2;
    const mid = canvas.width / 2;
    const deadZone = canvas.width * 0.12;

    let direction = "";

    if (centerX < mid - deadZone) direction = "on your left";
    else if (centerX > mid + deadZone) direction = "on your right";
    else direction = "in front";

    // =======================
    // ALLOWED OBJECTS ONLY
    // =======================
    const allowedObjects = [
        "person",
        "chair",
        "couch",
        "bed",
        "bottle",
        "laptop",
        "cell phone",
        "tv"
    ];

    if (!allowedObjects.includes(object)) {
        requestAnimationFrame(detect);
        return;
    }

    // =======================
    // STABILITY SYSTEM
    // =======================
    const speechText = `${object} ${distance} ${direction}`;

    if (stableObject === speechText) {
        stableCount++;
    } else {
        stableObject = speechText;
        stableCount = 0;
    }

    const now = Date.now();

    const canSpeak =
        stableCount >= REQUIRED_STABILITY &&
        (now - lastSpokenTime > SPEAK_INTERVAL);

    // =======================
    // CONFIDENCE LOGIC
    // =======================
    let finalSpeech = "";

    if (confidence > 0.75) {
        finalSpeech = speechText;
    }
    else if (confidence > 0.55) {
        finalSpeech = `possible ${object} ahead`;
    }
    else {
        finalSpeech = `object detected ahead`;
    }

    if (finalSpeech && canSpeak && !speechLock && finalSpeech !== lastSpeech) {
        speak(finalSpeech);

        lastSpeech = finalSpeech;
        lastSpokenTime = now;

        updateHistory(finalSpeech);
    }

    // =======================
    // OBSTACLE WARNING
    // =======================
    const isClose = normalized > 0.1;

    if (isClose && stableCount >= 2 && !speechLock) {
        if (lastSpeech !== "obstacle ahead") {
            speak("obstacle ahead");
            updateHistory("obstacle ahead");
            lastSpeech = "obstacle ahead";
        }
    }

    // =======================
    // DRAW CORNER HUD
    // =======================
    predictions.forEach(p => {

        if (p.score < 0.5) return;

        const [x, y, w, h] = p.bbox;
        const c = 20;

        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(x, y + c);
        ctx.lineTo(x, y);
        ctx.lineTo(x + c, y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x + w - c, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + c);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, y + h - c);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x + c, y + h);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x + w - c, y + h);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + w, y + h - c);
        ctx.stroke();

        ctx.fillStyle = "#00ff00";
        ctx.font = "14px Arial";

        ctx.fillText(
            `${p.class} ${(p.score * 100).toFixed(0)}%`,
            x,
            y > 20 ? y - 8 : 20
        );
    });

    requestAnimationFrame(detect);
}

// =======================
// START
// =======================
actionBtn.addEventListener('click', async () => {

    actionBtn.style.display = "none";
    statusText.innerText = "Initializing...";

    try {
        await setupCamera();

        model = await cocoSsd.load({
            base: "mobilenet_v2"
        });

        statusDot.classList.add("ready");
        statusText.innerText = "Ready";

        speak("Coco Vision ready. Scanning environment.");

        detect(0);

    } catch (err) {
        console.error(err);
        statusText.innerText = "Error";
        speak("Camera error.");
    }
});
