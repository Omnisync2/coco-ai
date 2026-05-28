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
let speechCooldownActive = false; // Prevents spamming speech overlapping
let unidentifiedTimeout = null;  // Timer to delay "unidentified" announcements

async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' },
        audio: false 
    });
    video.srcObject = stream;
    return new Promise((resolve) => { video.onloadedmetadata = resolve; });
}

function speak(text) {
    // If the system is already saying this exact thing, don't interrupt
    if (window.speechSynthesis.speaking && lastSpoken === text) return;

    window.speechSynthesis.cancel(); // Clear previous speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    
    // Lock speech temporarily to prevent instant re-triggering
    speechCooldownActive = true;
    utterance.onend = () => { speechCooldownActive = false; };

    window.speechSynthesis.speak(utterance);
}

function updateHistory(item) {
    if (history[0] !== item) {
        history.unshift(item);
        if (history.length > 5) history.pop();
        objectsList.innerHTML = history.map(i => `<li style="padding: 5px; color: #00ff00;">${i}</li>`).join('');
    }
}

async function detect() {
    if (!model) return;
    const predictions = await model.detect(video, 20, 0.2);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (predictions.length > 0) {
        // Sort by highest confidence score just in case
        predictions.sort((a, b) => b.score - a.score);
        
        const topObject = predictions[0].class;
        const confidence = predictions[0].score;

        if (confidence > 0.5) { // Raised slightly to 0.5 to reduce flickering guesses
            // Cancel any pending "unidentified" announcements because we found something good
            clearTimeout(unidentifiedTimeout);
            unidentifiedTimeout = null;

            if (topObject !== lastSpoken && !speechCooldownActive) {
                speak(topObject);
                lastSpoken = topObject;
                updateHistory(topObject);
            }
        } else {
            // Low confidence box found. Instead of instantly shouting "unidentified", 
            // we wait 1.5 seconds. If the camera stabilizes back onto an object before then, this gets canceled.
            if (lastSpoken !== "unidentified" && !unidentifiedTimeout && !speechCooldownActive) {
                unidentifiedTimeout = setTimeout(() => {
                    speak("unidentified object");
                    lastSpoken = "unidentified";
                    updateHistory("unidentified object");
                }, 1500); // 1.5 second delay buffer
            }
        }
        
        // Draw bounding boxes
        predictions.forEach(p => {
            if(p.score > 0.4) { // Only draw boxes for decent guesses
                const [x, y, w, h] = p.bbox;
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 4;
                ctx.strokeRect(x, y, w, h);
            }
        });
    } else { 
        // Completely empty frame. Clear unidentified timer if camera is just totally blank.
        clearTimeout(unidentifiedTimeout);
        unidentifiedTimeout = null;
        lastSpoken = ""; 
    }
    
    requestAnimationFrame(detect);
}

actionBtn.addEventListener('click', async () => {
    actionBtn.style.display = 'none';
    statusText.innerText = 'Initializing...';
    speak("Starting system. Please wait.");
    
    try {
        await setupCamera();
        model = await cocoSsd.load({base: 'mobilenet_v2'});
        if(statusDot) statusDot.classList.add('ready');
        statusText.innerText = 'Ready';
        speak("System ready. Scanning.");
        detect();
    } catch (err) {
        statusText.innerText = 'Error';
        speak("Could not access camera. Please check permissions.");
        console.error(err);
    }
});
        
