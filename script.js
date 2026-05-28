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

        if (history.length > 5) {
            history.pop();
        }

        objectsList.innerHTML = history
            .map(i => `<li style="padding:5px;">${i}</li>`)
            .join('');
    }
}

/* =========================
   BRIGHTNESS CHECK
========================= */

function getBrightness(video) {

    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");

    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;

    tempCtx.drawImage(video, 0, 0);

    const frame = tempCtx.getImageData(
        0,
        0,
        tempCanvas.width,
        tempCanvas.height
    );

    let total = 0;

    for (let i = 0; i < frame.data.length; i += 4) {

        total += (
            frame.data[i] +
            frame.data[i + 1] +
            frame.data[i + 2]
        ) / 3;
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

    /* LOW LIGHT WARNING */

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

        /* BETTER DISTANCE */

        const area = w * h;

        let distance = "";

        if (area < 50000) {
            distance = "far";
        }
        else if (area < 150000) {
            distance = "near";
        }
        else {
            distance = "very close";
        }

        /* SPEECH */

        if (area > 200000 && !speechLock) {

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

        /* =========================
           HUD CORNER BOXES
        ========================= */

        predictions.forEach(p => {

            if (p.score > 0.5) {

                const [x, y, w, h] = p.bbox;

                const corner = 25;

                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 4;

                // TOP LEFT
                ctx.beginPath();
                ctx.moveTo(x, y + corner);
                ctx.lineTo(x, y);
                ctx.lineTo(x + corner, y);
                ctx.stroke();

                // TOP RIGHT
                ctx.beginPath();
                ctx.moveTo(x + w - corner, y);
                ctx.lineTo(x + w, y);
                ctx.lineTo(x + w, y + corner);
                ctx.stroke();

                // BOTTOM LEFT
                ctx.beginPath();
                ctx.moveTo(x, y + h - corner);
                ctx.lineTo(x, y + h);
                ctx.lineTo(x + corner, y + h);
                ctx.stroke();

                // BOTTOM RIGHT
                ctx.beginPath();
                ctx.moveTo(x + w - corner, y + h);
                ctx.lineTo(x + w, y + h);
                ctx.lineTo(x + w, y + h - corner);
                ctx.stroke();

                /* LABEL */

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
