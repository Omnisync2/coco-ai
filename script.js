const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const actionBtn = document.getElementById('action-btn');
const objectsList = document.getElementById('objects-list');
const warningOverlay = document.getElementById("camera-warning");

let model;
let history = [];

const FPS = 12;
const interval = 1000 / FPS;
let lastTime = 0;

/* SPEECH CONTROL */
let speechLock = false;
let lastSpeech = "";
let speechCooldown = 0;

/* LOW LIGHT */
let lowLightCooldown = 0;
let lowLightSpeaking = false;

/* SMOOTHING */
let smoothX = 0;
let smoothW = 0;
const SMOOTHING = 0.75;

/* CHINESE LABELS */
const zhMap = {
    person: "人",
    chair: "椅子",
    bottle: "瓶子",
    cup: "杯子",
    laptop: "笔记本电脑",
    "cell phone": "手机",
    book: "书",
    sofa: "沙发",
    tv: "电视",
    potted plant: "盆栽",
    microwave: "微波炉",
    oven: "烤箱"
};

/* =========================
   CAMERA
========================= */

async function setupCamera() {

    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: 'environment'
        },
        audio: false
    });

    video.srcObject = stream;

    return new Promise(resolve => {

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

    const msg = new SpeechSynthesisUtterance(text);

    msg.rate = 1.02;
    msg.pitch = 1;
    msg.volume = 1;

    msg.onend = () => {

        setTimeout(() => {
            speechLock = false;
        }, 250);
    };

    speechSynthesis.speak(msg);
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
            .map(i => `<li>${i}</li>`)
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
   CORNER BOX
========================= */

function drawCornerBox(x, y, w, h) {

    const c = 20;

    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 3;

    /* TOP LEFT */
    ctx.beginPath();
    ctx.moveTo(x, y + c);
    ctx.lineTo(x, y);
    ctx.lineTo(x + c, y);
    ctx.stroke();

    /* TOP RIGHT */
    ctx.beginPath();
    ctx.moveTo(x + w - c, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + c);
    ctx.stroke();

    /* BOTTOM LEFT */
    ctx.beginPath();
    ctx.moveTo(x, y + h - c);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.stroke();

    /* BOTTOM RIGHT */
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

    const now = Date.now();

    /* =========================
       LOW LIGHT FIX
    ========================= */

    const brightness = getBrightness(video);

    if (brightness < 30) {

        warningOverlay.classList.add("show");

        if (
            !lowLightSpeaking &&
            now > lowLightCooldown
        ) {

            lowLightSpeaking = true;

            const msg = new SpeechSynthesisUtterance("光线不足");

            msg.rate = 1.02;

            msg.onend = () => {
                lowLightSpeaking = false;
            };

            speechSynthesis.speak(msg);

            updateHistory("光线不足");

            lowLightCooldown = now + 3000;
        }

    } else {

        warningOverlay.classList.remove("show");
    }

    /* =========================
       OBJECT DETECTION
    ========================= */

    const predictions = await model.detect(video);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (predictions.length > 0) {

        let filtered = predictions.filter(
            p => p.score > 0.5
        );

        filtered.sort((a, b) => {

            const scoreA =
                a.score *
                (a.bbox[2] * a.bbox[3]);

            const scoreB =
                b.score *
                (b.bbox[2] * b.bbox[3]);

            return scoreB - scoreA;
        });

        const topObjects = filtered.slice(0, 3);

        const names = topObjects.map(
            p => zhMap[p.class] || p.class
        );

        const top = topObjects[0];

        const [x, y, w, h] = top.bbox;

        /* SMOOTH TRACKING */

        smoothX =
            smoothX * SMOOTHING +
            x * (1 - SMOOTHING);

        smoothW =
            smoothW * SMOOTHING +
            w * (1 - SMOOTHING);

        const centerX = smoothX + smoothW / 2;

        const screenMid = canvas.width / 2;

        /* DIRECTION */

        let direction = "前方";

        if (centerX < screenMid - 80) {
            direction = "左侧";
        }

        else if (centerX > screenMid + 80) {
            direction = "右侧";
        }

        /* DISTANCE */

        let distance = "远";

        if (smoothW > 120) {
            distance = "近";
        }

        if (smoothW > 250) {
            distance = "非常近";
        }

        /* DRAW BOX */

        filtered.forEach(p => {

            const [bx, by, bw, bh] = p.bbox;

            drawCornerBox(
                bx,
                by,
                bw,
                bh
            );

            ctx.fillStyle = "#00ff00";
            ctx.font = "14px Arial";

            ctx.fillText(
                zhMap[p.class] || p.class,
                bx,
                by - 10
            );
        });

        /* SPEECH FIX */

        const sentence =
            `${names[0]}在${direction}，距离${distance}`;

        if (
            !speechLock &&
            sentence !== lastSpeech &&
            now > speechCooldown
        ) {

            lastSpeech = sentence;

            speechCooldown = now + 2500;

            speak(sentence);

            updateHistory(names.join(", "));
        }
    }

    requestAnimationFrame(detect);
}

/* =========================
   START
========================= */

actionBtn.onclick = async () => {

    actionBtn.style.display = "none";

    statusText.innerText = "初始化中";

    try {

        await setupCamera();

        model = await cocoSsd.load({
            base: 'mobilenet_v2'
        });

        statusDot.classList.add("ready");

        statusText.innerText = "就绪";

        speak("系统已启动");

        detect(0);

    } catch (err) {

        console.error(err);

        statusText.innerText = "摄像头错误";

        speak("摄像头错误");
    }
};
