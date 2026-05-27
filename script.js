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
let selectedLang = 'en-US'; // Default

// Translation Dictionary
const translations = {
    "cup": { "es-ES": "taza", "en-US": "cup" },
    "person": { "es-ES": "persona", "en-US": "person" },
    "bottle": { "es-ES": "botella", "en-US": "bottle" },
    "cell phone": { "es-ES": "teléfono celular", "en-US": "cell phone" },
    "chair": { "es-ES": "silla", "en-US": "chair" },
    "unidentified object": { "es-ES": "objeto no identificado", "en-US": "unidentified object" }
};

async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    return new Promise((resolve) => { video.onloadedmetadata = resolve; });
}

function speak(text, isTranslation = false) {
    window.speechSynthesis.cancel();
    let speechText = text;
    
    if (isTranslation && translations[text.toLowerCase()]) {
        speechText = translations[text.toLowerCase()][selectedLang] || text;
    }
    
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = selectedLang;
    utterance.rate = 1.1;
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
    const predictions = await model.detect(video, 20, 0.2);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (predictions.length
        
