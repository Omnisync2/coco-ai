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

let smoothX = 0;
let smoothW = 0;
const SMOOTHING = 0.75;

let trackedObject = null;
const SWITCH_THRESHOLD = 0.25;

let lowLightCooldown = 0;

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

/* SPEECH (CHINESE READY) */
function speak(text, priority = false) {
    if (speechLock && !priority) return;

    speechLock = true;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;

    utterance.onend = () => setTimeout(() => speechLock = false, 250);

    window.speechSynthesis.speak(utterance);
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
function drawCornerBox(x, y, w, h, color = "#00ff00") {
    const c = 18;

    ctx.strokeStyle = color;
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

    /* LOW LIGHT */
    if (brightness < 30) {
        if (now > lowLightCooldown) {
            speak("光线不足", true);
            lastSpoken = "low";
            updateHistory("光线不足");
            lowLightCooldown = now + 3000;
        }
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

        function center(o){
            const [x,y,w]=o.bbox;
            return {x:x+w/2,w};
        }

        let best=null, bestScore=-1;

        for (let obj of topObjects){
            const c=center(obj);
            let bonus=0;

            if(trackedObject){
                const prev=center(trackedObject);
                if(Math.abs(prev.x-c.x)<120) bonus=0.2;
            }

            const score=obj.score*0.6+(c.w/500)*0.2+bonus;

            if(score>bestScore){
                bestScore=score;
                best=obj;
            }
        }

        if(!trackedObject || best!==trackedObject){
            if(bestScore>SWITCH_THRESHOLD) trackedObject=best;
        }

        const top=trackedObject||topObjects[0];

        const names=topObjects.map(p=>p.class);

        const [x,y,w]=top.bbox;

        smoothX=smoothX*SMOOTHING+x*(1-SMOOTHING);
        smoothW=smoothW*SMOOTHING+w*(1-SMOOTHING);

        const cx=smoothX+smoothW/2;
        const mid=canvas.width/2;

        let dir="前方";
        if(cx<mid-80) dir="左侧";
        else if(cx>mid+80) dir="右侧";

        let dist="远";
        if(smoothW>120) dist="近";
        if(smoothW>250) dist="非常近";

        drawCornerBox(x,y,w,top.bbox[3]);

        if(!speechLock){
            speak(`${names[0]} ${dist} 在${dir}`);
        }

    }

    requestAnimationFrame(detect);
}

/* START */
actionBtn.onclick=async()=>{
    actionBtn.style.display="none";
    statusText.innerText="初始化中";

    await setupCamera();
    model=await cocoSsd.load();

    statusDot.classList.add("ready");
    statusText.innerText="就绪";

    speak("系统已启动");

    detect(0);
};
