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

const FPS = 10;
const interval = 1000 / FPS;
let lastTime = 0;

let speechLock = false;

/* =========================
   CAMERA SETUP
========================= */

async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: 'environment'
        },
        audio: false
    });

    video.srcObject = stream;

    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
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

        if (history.length > 5) {
            history.pop();
        }

        objectsList.innerHTML = history
            .map(i => `<li style="padding:5px;">${i}</li>`)
            .join('');
    }
}

/* =========================
   BRIGHTNESS CHECK (NEW)
========================= */

function getBrightness(video) {
    const tempCanvas = document.createElement("canvas");
    const ctx = tempCanvas.getContext("2d");

    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0);

    const frame = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

    let total = 0;

    for (let i = 0; i < frame.data.length; i += 4) {
        total += (frame.data[i] + frame.data[i + 1] + frame.data[i + 2]) / 3;
    }

    return total / (frame.data.length / 4);
}

/* =========================
   AI DETECTION LOOP
========================= */

async function detect(time) {

    if (!model) return;

    // FPS LIMITER
    if (time - lastTime < interval) {
        requestAnimationFrame(detect);
        return;
    }

    lastTime = time;

    /* =========================
       LOW LIGHT WARNING (NEW)
    ========================= */

    const brightness = getBrightness(video);

    if (brightness < 45) {
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

        let distance = "";

        if (w < 120) distance = "far";
        else if (w < 250) distance = "near";
        else distance = "very close";

        if (w > 320 && !speechLock) {

            if (lastSpoken !== "obstacle ahead") {

                speak("obstacle ahead");

                lastSpoken = "obstacle ahead";

                updateHistory("obstacle ahead");
            }
        }

        else if (confidence > 0.6) {

            const speechText = `${object} ${distance}`;

            if (speechText !== lastSpoken && !speechLock) {

                speak(speechText);

                lastSpoken = speechText;

                updateHistory(speechText);
            }
        }

        predictions.forEach(p => {

            if (p.score > 0.4) {

                const [x, y, w, h] = p.bbox;

                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 4;

                ctx.strokeRect(x, y, w, h);

                ctx.fillStyle = '#00ff00';
                ctx.font = '18px Arial';

                ctx.fillText(
                    `${p.class} ${(p.score * 100).toFixed(0)}%`,
                    x,
                    y > 10 ? y - 5 : 10
                );
            }
        });

    } else {
        lastSpoken = "";
    }

    requestAnimationFrame(detect);
}

/* =========================
   START BUTTON
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

        speak("Camera error. Please check permissions.");

        console.error(err);
    }
});
