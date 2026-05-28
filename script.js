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

const FPS = 12;
const interval = 1000 / FPS;
let lastTime = 0;

let speechLock = false;

/* SMOOTHING */
let smoothX = 0;
let smoothW = 0;
const SMOOTHING = 0.75;

/* TRACKING */
let trackedObject = null;
const SWITCH_THRESHOLD = 0.25;

/* SPEECH CONTROL */
let firstSeenTime = 0;
let lastDetectedObject = "";

/* =========================
   CAMERA
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
        }, 250);
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
   CORNER BOX
========================= */

function drawCornerBox(x, y, w, h, color = '#00ff00') {

    const c = 18;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;

    // top-left
    ctx.beginPath();
    ctx.moveTo(x, y + c);
    ctx.lineTo(x, y);
    ctx.lineTo(x + c, y);
    ctx.stroke();

    // top-right
    ctx.beginPath();
    ctx.moveTo(x + w - c, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + c);
    ctx.stroke();

    // bottom-left
    ctx.beginPath();
    ctx.moveTo(x, y + h - c);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.stroke();

    // bottom-right
    ctx.beginPath();
    ctx.moveTo(x + w - c, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - c);
    ctx.stroke();
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

    if (brightness < 30) {
        warningOverlay.classList.add("show");

        if (lastSpoken !== "low light") {
            speak("Low light detected", true);
            lastSpoken = "low light";
            updateHistory("Low light detected");
        }
    } else {
        warningOverlay.classList.remove("show");
        if (lastSpoken === "low light") lastSpoken = "";
    }

    const predictions = await model.detect(video);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (predictions.length > 0) {

        let filtered = predictions.filter(p => p.score > 0.5);

        filtered.sort((a, b) => {
            const scoreA = a.score * (a.bbox[2] * a.bbox[3]);
            const scoreB = b.score * (b.bbox[2] * b.bbox[3]);
            return scoreB - scoreA;
        });

        const topObjects = filtered.slice(0, 3);

        /* =========================
           STABLE TRACKING SYSTEM
        ========================= */

        function center(obj) {
            const [x, y, w, h] = obj.bbox;
            return { x: x + w / 2, w };
        }

        let best = null;
        let bestScore = -Infinity;

        for (let obj of topObjects) {

            const c = center(obj);

            let stabilityBonus = 0;

            if (trackedObject) {
                const prev = center(trackedObject);
                const dist = Math.abs(prev.x - c.x);

                if (dist < 120) {
                    stabilityBonus = 0.2;
                }
            }

            const score =
                obj.score * 0.6 +
                (c.w / 500) * 0.2 +
                stabilityBonus;

            if (score > bestScore) {
                bestScore = score;
                best = obj;
            }
        }

        if (!trackedObject || best !== trackedObject) {
            if (bestScore > SWITCH_THRESHOLD) {
                trackedObject = best;
            }
        }

        const top = trackedObject || topObjects[0];
        const objectNames = topObjects.map(p => p.class);

        const [x, y, w, h] = top.bbox;

        /* SMOOTHING */
        smoothX = smoothX * SMOOTHING + x * (1 - SMOOTHING);
        smoothW = smoothW * SMOOTHING + w * (1 - SMOOTHING);

        const centerX = smoothX + smoothW / 2;
        const screenMid = canvas.width / 2;

        let direction = "front";

        if (centerX < screenMid - 80) direction = "left";
        else if (centerX > screenMid + 80) direction = "right";

        let distance = "";

        if (smoothW < 120) distance = "far";
        else if (smoothW < 250) distance = "near";
        else distance = "very close";

        const speechText = `${objectNames.join(", ")} ahead`;

        if (speechText !== lastDetectedObject) {
            firstSeenTime = Date.now();
            lastDetectedObject = speechText;
        }

        if (
            !speechLock &&
            confidenceCheck(topObjects) &&
            Date.now() - firstSeenTime > 300
        ) {
            speak(`${objectNames[0]} ${distance} on your ${direction}`);
            lastSpoken = speechText;
            updateHistory(objectNames.join(", "));
        }

        /* DRAW OBJECTS */
        filtered.forEach(p => {
            const [x, y, w, h] = p.bbox;

            drawCornerBox(x, y, w, h, '#00ff00');

            const cx = x + w / 2;
            const cy = y + h / 2;

            ctx.fillStyle = '#00ff00';
            ctx.font = '14px Arial';

            ctx.fillText(
                `${p.class} ${(p.score * 100).toFixed(0)}%`,
                cx + 15,
                cy
            );
        });

    } else {
        lastSpoken = "";
        trackedObject = null;
    }

    requestAnimationFrame(detect);
}

/* =========================
   CONFIDENCE CHECK
========================= */

function confidenceCheck(list) {
    return list[0] && list[0].score > 0.6;
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
        console.error(err);
        statusText.innerText = "Camera Error: " + err.name;
        speak("Camera error.");
    }
});
