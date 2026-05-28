const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const actionBtn = document.getElementById('action-btn');
const objectsList = document.getElementById('objects-list');
const warningOverlay = document.getElementById("camera-warning");

let model;
let lastSpoken = "";
let history = [];

let trackedObject = "";
let lastSpokenTime = 0;
const SPEAK_INTERVAL = 10000;

const FPS = 10;
const interval = 1000 / FPS;
let lastTime = 0;

let speechLock = false;

/* =========================
   CAMERA SETUP
========================= */

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

/* =========================
   SPEECH
========================= */

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

/* =========================
   HISTORY
========================= */

function updateHistory(item) {

    if (history[0] !== item) {

        history.unshift(item);

        if (history.length > 5) history.pop();

        objectsList.innerHTML = history
            .map(i => `<li style="padding:5px;">${i}</li>`)
            .join('');
    }
}

/* =========================
   BRIGHTNESS
========================= */

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

/* =========================
   DETECTION LOOP
========================= */

async function detect(time) {

    if (!model) return;

    if (time - lastTime < interval) {
        requestAnimationFrame(detect);
        return;
    }

    lastTime = time;

    /* LOW LIGHT */
    const brightness = getBrightness(video);

    if (brightness < 80) {
        warningOverlay.classList.add("show");
    } else {
        warningOverlay.classList.remove("show");
    }

    const predictions = await model.detect(video);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (predictions.length > 0) {

        predictions.sort((a, b) => b.score - a.score);

        const top = predictions[0];

        const object = top.class;
        const confidence = top.score;

        const [x, y, w, h] = top.bbox;

        /* =========================
           DISTANCE
        ========================= */

        const area = w * h;

        let distance = "";

        if (area < 50000) distance = "far";
        else if (area < 150000) distance = "near";
        else distance = "very close";

        /* =========================
           DIRECTION (NEW)
        ========================= */

        const centerX = x + w / 2;
        const mid = canvas.width / 2;

        let direction = "";

        if (centerX < mid - 80) {
            direction = "on your left";
        }
        else if (centerX > mid + 80) {
            direction = "on your right";
        }
        else {
            direction = "in front";
        }

        /* =========================
           OBSTACLE WARNING
        ========================= */

        const isClose = area > 120000 && confidence > 0.5;

        if (isClose && !speechLock) {

            if (lastSpoken !== "obstacle ahead") {

                speak("obstacle ahead");

                lastSpoken = "obstacle ahead";
                updateHistory("obstacle ahead");
            }
        }

        /* =========================
           10s SPEECH SYSTEM
        ========================= */

        const now = Date.now();
        const speechText = `${object} ${distance} ${direction}`;

        const isSame = trackedObject === speechText;
        const canSpeakAgain = (now - lastSpokenTime) > SPEAK_INTERVAL;

        if (!isSame || canSpeakAgain) {

            if (!speechLock && confidence > 0.6) {

                speak(speechText);

                trackedObject = speechText;
                lastSpokenTime = now;
                lastSpoken = speechText;

                updateHistory(speechText);
            }
        }

        /* =========================
           HUD BOXES
        ========================= */

        predictions.forEach(p => {

            if (p.score > 0.5) {

                const [x, y, w, h] = p.bbox;

                const corner = 25;

                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 4;

                // corners
                ctx.beginPath();
                ctx.moveTo(x, y + corner);
                ctx.lineTo(x, y);
                ctx.lineTo(x + corner, y);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(x + w - corner, y);
                ctx.lineTo(x + w, y);
                ctx.lineTo(x + w, y + corner);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(x, y + h - corner);
                ctx.lineTo(x, y + h);
                ctx.lineTo(x + corner, y + h);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(x + w - corner, y + h);
                ctx.lineTo(x + w, y + h);
                ctx.lineTo(x + w, y + h - corner);
                ctx.stroke();

                ctx.fillStyle = '#00ff00';
                ctx.font = '16px Arial';

                ctx.fillText(
                    `${p.class} ${(p.score * 100).toFixed(0)}%`,
                    x,
                    y > 20 ? y - 10 : 20
                );
            }
        });

    } else {
        lastSpoken = "";
    }

    requestAnimationFrame(detect);
}

/* =========================
   START
========================= */

actionBtn.addEventListener('click', async () => {

    actionBtn.style.display = 'none';
    statusText.innerText = 'Initializing...';

    try {

        await setupCamera();

        model = await cocoSsd.load({
            base: 'mobilenet_v2'
        });

        statusDot.classList.add('ready');
        statusText.innerText = 'Ready';

        speak("System ready. Scanning.");

        detect(0);

    } catch (err) {

        statusText.innerText = 'Error';
        speak("Camera error.");
        console.error(err);
    }
});
