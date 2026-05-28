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

let speechLock = false;

/* LOW LIGHT CONTROL */
let lowLightCooldown = 0;
let lowLightSpeaking = false;

/* SMOOTHING */
let smoothX = 0;
let smoothW = 0;
const SMOOTHING = 0.75;

/* CHINESE MAP */
const zhMap = {
    person: "人",
    chair: "椅子",
    bottle: "瓶子",
    cup: "杯子",
    laptop: "笔记本电脑",
    cell phone: "手机",
    book: "书",
    sofa: "沙发",
    tv: "电视"
};

/* CAMERA */
async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
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

/* SPEECH */
function speak(text) {
    if (speechLock) return;

    speechLock = true;
    window.speechSynthesis.cancel();

    const msg = new SpeechSynthesisUtterance(text);
    msg.rate = 1.05;

    msg.onend = () => {
        setTimeout(() => speechLock = false, 200);
    };

    speechSynthesis.speak(msg);
}

/* HISTORY */
function updateHistory(item) {
    if (history[0] !== item) {
        history.unshift(item);
        if (history.length > 5) history.pop();
        objectsList.innerHTML = history.map(i => `<li>${i}</li>`).join('');
    }
}

/* BRIGHTNESS */
function getBrightness(video) {
    const c = document.createElement("canvas");
    const ctx2 = c.getContext("2d");

    c.width = video.videoWidth;
    c.height = video.videoHeight;

    ctx2.drawImage(video, 0, 0);

    const frame = ctx2.getImageData(0, 0, c.width, c.height);

    let total = 0;
    for (let i = 0; i < frame.data.length; i += 4) {
        total += (frame.data[i] + frame.data[i+1] + frame.data[i+2]) / 3;
    }

    return total / (frame.data.length / 4);
}

/* CORNER BOX */
function drawCornerBox(x, y, w, h) {
    const c = 18;
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(x, y+c); ctx.lineTo(x,y); ctx.lineTo(x+c,y); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x+w-c,y); ctx.lineTo(x+w,y); ctx.lineTo(x+w,y+c); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x,y+h-c); ctx.lineTo(x,y+h); ctx.lineTo(x+c,y+h); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x+w-c,y+h); ctx.lineTo(x+w,y+h); ctx.lineTo(x+w,y+h-c); ctx.stroke();
}

/* LOOP */
async function detect(time) {
    if (!model) return;

    if (time - lastTime < interval) {
        requestAnimationFrame(detect);
        return;
    }

    lastTime = time;

    const brightness = getBrightness(video);
    const now = Date.now();

    /* LOW LIGHT FIX */
    if (brightness < 30) {

        warningOverlay.classList.add("show");

        if (!lowLightSpeaking && now > lowLightCooldown) {

            lowLightSpeaking = true;
            speechSynthesis.cancel();

            const msg = new SpeechSynthesisUtterance("光线不足");

            msg.onend = () => {
                lowLightSpeaking = false;
            };

            speechSynthesis.speak(msg);

            updateHistory("光线不足");

            lowLightCooldown = now + 3000;
        }

    } else {
        warningOverlay.classList.remove("show");
        lowLightSpeaking = false;
    }

    const predictions = await model.detect(video);

    ctx.clearRect(0,0,canvas.width,canvas.height);

    if (predictions.length > 0) {

        let filtered = predictions.filter(p => p.score > 0.5);

        filtered.sort((a,b) =>
            (b.score*b.bbox[2]*b.bbox[3]) -
            (a.score*a.bbox[2]*a.bbox[3])
        );

        const topObjects = filtered.slice(0,3);

        const names = topObjects.map(p => zhMap[p.class] || p.class);

        const top = topObjects[0];
        const [x,y,w,h] = top.bbox;

        smoothX = smoothX*SMOOTHING + x*(1-SMOOTHING);
        smoothW = smoothW*SMOOTHING + w*(1-SMOOTHING);

        const cx = smoothX + smoothW/2;
        const mid = canvas.width/2;

        let dir = "前方";
        if (cx < mid - 80) dir = "左侧";
        else if (cx > mid + 80) dir = "右侧";

        let dist = "远";
        if (smoothW > 120) dist = "近";
        if (smoothW > 250) dist = "非常近";

        drawCornerBox(x,y,w,h);

        if (!speechLock) {
            speak(`${names[0]}在${dir}，距离${dist}`);
            updateHistory(names.join(", "));
        }
    }

    requestAnimationFrame(detect);
}

/* START */
actionBtn.onclick = async () => {

    actionBtn.style.display = "none";
    statusText.innerText = "初始化中";

    await setupCamera();
    model = await cocoSsd.load();

    statusDot.classList.add("ready");
    statusText.innerText = "就绪";

    speak("系统已启动");

    detect(0);
};
