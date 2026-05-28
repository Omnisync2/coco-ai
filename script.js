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
   SPEECH SYSTEM (POLISHED)
========================= */

function speak(text, priority = false) {
    if (speechLock && !priority) return;

    speechLock = true;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onend = () => {
        setTimeout(() => {
            speechLock = false;
        }, 300);
    };

    window.speechSynthesis.speak(utterance);
}

/* =========================
   HISTORY SYSTEM
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
   DETECTION LOOP
========================= */

async function detect(time) {

    if (!model) return;

    if (time - lastTime < interval) {
        requestAnimationFrame(detect);
        return;
    }

    lastTime = time;

    /* =========================
       LOW LIGHT (FIXED)
    ========================= */

    const brightness = getBrightness(video);

    if (brightness < 30) {

        warningOverlay.classList.add("show");

        if (lastSpoken !== "low light") {
            speak("Low light detected", true);
            lastSpoken = "low light";
            updateHistory("Low light detected");
        }

    } else {

        warningOverlay.classList.remove("show");

        if (lastSpoken === "low light") {
            lastSpoken = "";
        }
    }

    /* =========================
       OBJECT DETECTION
    ========================= */

    const predictions = await model.detect(video);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (predictions.length > 0) {

        predictions.sort((a, b) => b.score - a.score);

        const top = predictions[0];

        const object = top.class;
        const confidence = top.score;

        const [x, y, w, h] = top.bbox;

        /* =========================
           DIRECTION LOGIC (NEW)
        ========================= */

        const centerX = x + w / 2;
        const screenMid = canvas.width / 2;

        let direction = "";

        if (centerX < screenMid - 80) {
            direction = "left";
        } 
        else if (centerX > screenMid + 80) {
            direction = "right";
        } 
        else {
            direction = "ahead";
        }

        if (direction === "ahead") direction = "front";

        /* =========================
           DISTANCE LOGIC
        ========================= */

        let distance = "";

        if (w < 120) distance = "far";
        else if (w < 250) distance = "near";
        else distance = "very close";

        /* =========================
           OBSTACLE WARNING
        ========================= */

        if (w > 320 && !speechLock) {
            if (lastSpoken !== "obstacle ahead") {
                speak("obstacle ahead");
                lastSpoken = "obstacle ahead";
                updateHistory("obstacle ahead");
            }
        }

        /* =========================
           MAIN SPEECH
        ========================= */

        else if (confidence > 0.6) {

            const speechText = `${object} ${distance} on your ${direction}`;

            if (speechText !== lastSpoken && !speechLock) {
                speak(speechText);
                lastSpoken = speechText;
                updateHistory(speechText);
            }
        }

        /* =========================
           DRAW MARKERS
        ========================= */

        predictions.forEach(p => {

            if (p.score > 0.5) {

                const [x, y, w, h] = p.bbox;

                const centerX = x + w / 2;
                const centerY = y + h / 2;

                const size = 20;

                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 3;

                ctx.beginPath();
                ctx.moveTo(centerX - size, centerY);
                ctx.lineTo(centerX + size, centerY);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(centerX, centerY - size);
                ctx.lineTo(centerX, centerY + size);
                ctx.stroke();

                ctx.fillStyle = '#00ff00';
                ctx.font = '16px Arial';

                ctx.fillText(
                    `${p.class} ${(p.score * 100).toFixed(0)}%`,
                    centerX + 25,
                    centerY - 10
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

        console.error(err);
        statusText.innerText = "Camera Error: " + err.name;

        speak("Camera error. Please allow permissions or use a supported browser.");
    }
});
