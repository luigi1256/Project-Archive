/* ============================================================
   MOLLIER MANAGER – dash.js
   Logica applicativa (da caricare dopo l'HTML).
   Moduli:
     1. Defaults & Storage
     2. Navigazione a schede
     3. Validazione misure (range fisici + salti anomali)
     4. Rendering input stanze
     5. Meteo (manuale / Open-Meteo)
     6. Fisica (umidità assoluta di Mollier)
     7. Motore di strategia (usa i k calibrati)
     8. Calibrazione sperimentale del coefficiente k
     9. Storico snapshot
   ============================================================ */

/* ============================================================
   MODULO 1: DEFAULTS & STORAGE
   ============================================================ */
const STORAGE_KEY_PREFIX = 'mollier_';

const defaultRooms = [
    { name: "Camera da letto", temp: 20.0, hum: 68, size: 15, window: "medium", windowState: "closed", dehu: "mid", system: "radiatore" },
    { name: "Cucina",          temp: 21.5, hum: 60, size: 15, window: "medium", windowState: "closed", dehu: "none", system: "radiatore" },
    { name: "Bagno",           temp: 22.0, hum: 78, size: 8,  window: "small",  windowState: "closed", dehu: "high", system: "radiatore" }
];

let roomsData = [];
let historyData = [];
let calibrations = [];      
let calibSession = null;    
let measureWarnings = {};   

function loadSavedConfig() {
    const savedRooms = localStorage.getItem(STORAGE_KEY_PREFIX + 'rooms_data_v6')
        || localStorage.getItem(STORAGE_KEY_PREFIX + 'rooms_data_v5');
    if (savedRooms) {
        roomsData = JSON.parse(savedRooms);
        roomsData.forEach(r => {
            if (!r.windowState) r.windowState = 'closed';
            if (!r.system) r.system = (r.radiator === false) ? 'nessuno' : 'radiatore';
        });
    } else {
        roomsData = [...defaultRooms];
    }

    const savedHistory = localStorage.getItem(STORAGE_KEY_PREFIX + 'history_data_v6')
        || localStorage.getItem(STORAGE_KEY_PREFIX + 'history_data_v5');
    if (savedHistory) historyData = JSON.parse(savedHistory);

    calibrations = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFIX + 'calibrations_v1') || '[]');
    calibSession = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFIX + 'calib_session_v1') || 'null');

    ['weather_mode|weatherMode', 'heating_status|heatingStatus', 'target_comfort|targetComfortTemp',
     'heating_time|heatingTime', 'city|cityInput', 'press|pressInput', 'man_temp|manExtTemp',
     'man_hum|manExtHum', 'sky|skyCondition', 'wind|windCondition'].forEach(pair => {
        const [key, id] = pair.split('|');
        const saved = localStorage.getItem(STORAGE_KEY_PREFIX + key);
        if (saved !== null && saved !== undefined && document.getElementById(id)) {
            document.getElementById(id).value = saved;
        }
    });
}

function saveConfig() {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'rooms_data_v6', JSON.stringify(roomsData));
    const ids  = ['weatherMode','heatingStatus','targetComfortTemp','heatingTime','cityInput',
                  'pressInput','manExtTemp','manExtHum','skyCondition','windCondition'];
    const keys = ['weather_mode','heating_status','target_comfort','heating_time','city',
                  'press','man_temp','man_hum','sky','wind'];
    ids.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el) localStorage.setItem(STORAGE_KEY_PREFIX + keys[i], el.value);
    });
}

function saveCalibrations() {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'calibrations_v1', JSON.stringify(calibrations));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'calib_session_v1', JSON.stringify(calibSession));
}

/* ============================================================
   MODULO 2: NAVIGAZIONE A SCHEDE
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#tabNav .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#tabNav .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            document.getElementById(btn.dataset.tab).classList.add('active');
            if (btn.dataset.tab === 'tab-strategia') calculateStrategy();
            if (btn.dataset.tab === 'tab-calibrazione') renderCalibration();
        });
    });

    loadSavedConfig();
    toggleWeatherMode();
    renderAll();
});

function switchTab(tabId) {
    const btn = document.querySelector(`#tabNav .tab-btn[data-tab="${tabId}"]`);
    if (btn) btn.click();
}

/* ============================================================
   MODULO 3: VALIDAZIONE MISURE
   Segnala valori fisicamente implausibili o salti bruschi
   rispetto alla rilevazione precedente (storico snapshot o
   ultimo valore ricordato per la stanza). Non blocca l'inserimento,
   mostra solo avvisi visibili.
   ============================================================ */
const TEMP_MIN = -30, TEMP_MAX = 60;       
const HUM_MIN = 1, HUM_MAX = 100;          
const JUMP_TEMP = 5.0;                     
const JUMP_HUM = 20;                       

function validateMeasurement(room, temp, hum) {
    const warnings = [];

    if (temp < TEMP_MIN || temp > TEMP_MAX) {
        warnings.push(`🌡️ Temperatura ${temp}°C fuori range plausibile (${TEMP_MIN}…${TEMP_MAX}°C): possibile errore di battitura.`);
    }
    if (hum < HUM_MIN || hum > HUM_MAX) {
        warnings.push(`💧 Umidità ${hum}% fuori range plausibile (${HUM_MIN}…${HUM_MAX}%): possibile errore di battitura.`);
    }

    const extTemp = parseFloat(document.getElementById('manExtTemp').value) || 0;
    if (Math.abs(temp - extTemp) > 40) {
        warnings.push(`🌡️❗ Differenza enorme con l'esterno (${extTemp}°C): ${(temp - extTemp).toFixed(1)}°C. Verifica i sensori.`);
    }
    const extHum = parseFloat(document.getElementById('manExtHum').value) || 0;
    if (extHum > 0 && Math.abs(hum - extHum) > 55) {
        warnings.push(`💧❗ Umidità molto distante dall'esterna (${extHum}%): verifica se è reale.`);
    }

    const lastSnap = historyData.find(s => s.rooms.some(r => r.name === room.name));
    if (lastSnap) {
        const prev = lastSnap.rooms.find(r => r.name === room.name);
        if (prev) {
            if (Math.abs(temp - prev.temp) > JUMP_TEMP) {
                warnings.push(`🌡️ Salto di ${Math.abs(temp - prev.temp).toFixed(1)}°C rispetto all'ultima rilevazione (${prev.temp}°C, ${lastSnap.time}). Normale solo se è cambiato molto l'ambiente (es. finestra aperta a lungo).`);
            }
            if (Math.abs(hum - prev.hum) > JUMP_HUM) {
                warnings.push(`💧 Salto di ${Math.abs(hum - prev.hum).toFixed(0)}% rispetto all'ultima rilevazione (${prev.hum}%, ${lastSnap.time}).`);
            }
        }
    }

    if (lastRoomValues[room.name]) {
        const prev = lastRoomValues[room.name];
        if (Math.abs(temp - prev.temp) > JUMP_TEMP * 2) {
            warnings.push(`🌡️ Valore molto distante dall'ultimo inserito per questa stanza (${prev.temp}°C). Controlla che sia corretto.`);
        }
        if (Math.abs(hum - prev.hum) > JUMP_HUM * 2) {
            warnings.push(`💧 Umidità molto distante dall'ultimo inserito per questa stanza (${prev.hum}%). Controlla che sia corretto.`);
        }
    }

    return warnings;
}

let lastRoomValues = {};

function checkAndWarn(room, temp, hum) {
    const warnings = validateMeasurement(room, temp, hum);
    if (warnings.length > 0) {
        measureWarnings[room.name] = warnings;
    } else {
        delete measureWarnings[room.name];
    }
    lastRoomValues[room.name] = { temp, hum };
    return warnings;
}

function renderMeasureWarnings(roomName, targetContainerId) {
    const target = document.getElementById(targetContainerId);
    if (!target) return '';
    const warns = measureWarnings[roomName];
    if (!warns || warns.length === 0) return '';
    return target.innerHTML = `
        <div class="mt-2 p-2 bg-orange-50 border border-orange-300 rounded-lg text-[11px] text-orange-900 space-y-1">
            <div class="font-bold">⚠️ Valori da verificare:</div>
            ${warns.map(w => `<div>${w}</div>`).join('')}
        </div>`;
}

/* ============================================================
   MODULO 4: RENDERING INPUT STANZE
   ============================================================ */
function renderAll() {
    renderSizes();
    renderSystems();
    renderTemps();
    renderHistory();
    renderCalibration();
}

function renderSizes() {
    const container = document.getElementById('sizesContainer');
    container.innerHTML = '';
    document.getElementById('roomCount').textContent = roomsData.length;

    roomsData.forEach((room, index) => {
        container.innerHTML += `
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div class="sm:col-span-2 flex gap-2">
                    <input type="text" value="${room.name}" onchange="updateRoomField(${index}, 'name', this.value)" placeholder="Nome stanza"
                           class="w-full px-2 py-1 border border-slate-300 rounded-lg text-sm font-semibold bg-white">
                    ${roomsData.length > 1 ? `<button onclick="removeRoom(${index})" class="text-rose-500 hover:text-rose-700 text-xs font-bold px-2 bg-white border border-rose-200 rounded-lg">✕</button>` : ''}
                </div>
                <div>
                    <label class="text-[10px] text-slate-500 block">Area (mq)</label>
                    <input type="number" value="${room.size}" onchange="updateRoomField(${index}, 'size', this.value)"
                           class="w-full px-2 py-1 border border-slate-300 rounded-lg text-sm bg-white">
                </div>
                <div>
                    <label class="text-[10px] text-slate-500 block">Dim. finestra</label>
                    <select onchange="updateRoomField(${index}, 'window', this.value)" class="w-full px-1 py-1 border border-slate-300 rounded-lg text-xs bg-white">
                        <option value="small"  ${room.window==='small'?'selected':''}>Piccola</option>
                        <option value="medium" ${room.window==='medium'?'selected':''}>Media</option>
                        <option value="large"  ${room.window==='large'?'selected':''}>Grande</option>
                    </select>
                </div>
            </div>`;
    });

    const addBtn = document.getElementById('addRoomBtn');
    if (roomsData.length >= 10) addBtn.classList.add('hidden');
    else addBtn.classList.remove('hidden');
}

function renderSystems() {
    const container = document.getElementById('systemsContainer');
    container.innerHTML = '';

    roomsData.forEach((room, index) => {
        container.innerHTML += `
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div class="font-semibold text-sm text-slate-700">${room.name} <span class="text-slate-400 font-normal text-xs">(${room.size} mq)</span></div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                        <label class="text-[10px] text-slate-500 block">Stato finestra corrente</label>
                        <select onchange="updateRoomField(${index}, 'windowState', this.value)"
                                class="w-full px-2 py-1 border border-slate-300 rounded-lg text-xs bg-white font-medium ${room.windowState==='open' ? 'text-amber-600 bg-amber-50' : 'text-slate-700'}">
                            <option value="closed" ${room.windowState==='closed'?'selected':''}>🚪 Chiusa</option>
                            <option value="open"   ${room.windowState==='open'?'selected':''}>🪟 Aperta</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[10px] text-slate-500 block">Deumidificatore</label>
                        <select onchange="updateRoomField(${index}, 'dehu', this.value)" class="w-full px-1 py-1 border border-slate-300 rounded-lg text-xs bg-white">
                            <option value="high"   ${room.dehu==='high'?'selected':''}>⚡ Potente</option>
                            <option value="mid"    ${room.dehu==='mid'?'selected':''}>🔌 Medio</option>
                            <option value="none"   ${room.dehu==='none'?'selected':''}>❌ Nessuno</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[10px] text-slate-500 block">Riscaldamento</label>
                        <select onchange="updateRoomField(${index}, 'system', this.value)" class="w-full px-1 py-1 border border-slate-300 rounded-lg text-xs bg-white">
                            <option value="radiatore" ${room.system==='radiatore'?'selected':''}>🪵 Termosifone</option>
                            <option value="pompa"     ${room.system==='pompa'?'selected':''}>🌀 Pompa di calcolo</option>
                            <option value="nessuno"   ${room.system==='nessuno'?'selected':''}>❌ Nessuno</option>
                        </select>
                    </div>
                </div>
            </div>`;
    });
}

function renderTemps() {
    const container = document.getElementById('tempsContainer');
    container.innerHTML = '';

    roomsData.forEach((room, index) => {
        container.innerHTML += `
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div class="grid grid-cols-3 gap-2 items-end">
                    <div class="font-semibold text-sm text-slate-700 self-center">${room.name}</div>
                    <div>
                        <label class="text-[10px] text-slate-500 block">Temp. interna (°C)</label>
                        <input type="number" step="0.1" value="${room.temp}" onchange="updateRoomField(${index}, 'temp', this.value)"
                               class="w-full px-2 py-1 border border-slate-300 rounded-lg text-sm bg-white">
                    </div>
                    <div>
                        <label class="text-[10px] text-slate-500 block">Umidità interna (%)</label>
                        <input type="number" step="1" value="${room.hum}" onchange="updateRoomField(${index}, 'hum', this.value)"
                               class="w-full px-2 py-1 border border-slate-300 rounded-lg text-sm bg-white">
                    </div>
                </div>
                <div id="warn_${index}"></div>
            </div>`;
    });

    roomsData.forEach((room, index) => {
        renderMeasureWarnings(room.name, `warn_${index}`);
    });
}

function updateRoomField(index, field, value) {
    if (['temp','hum','size'].includes(field)) roomsData[index][field] = parseFloat(value) || 0;
    else                                       roomsData[index][field] = value;
    saveConfig();

    if (field === 'temp' || field === 'hum') {
        const room = roomsData[index];
        const warns = checkAndWarn(room, room.temp, room.hum);
        if (warns.length > 0 && field === 'hum') {
            renderTemps();
        } else if (warns.length === 0 && field === 'hum') {
            renderTemps();
        } else {
            renderMeasureWarnings(room.name, `warn_${index}`);
        }
    }

    if (field === 'name') { renderSystems(); renderTemps(); renderCalibration(); }
    if (field === 'size') { renderSystems(); }
    calculateStrategy();
}

function addRoom() {
    if (roomsData.length < 10) {
        roomsData.push({ name: `Nuova Stanza ${roomsData.length + 1}`, temp: 20.0, hum: 65, size: 12,
                         window: "medium", windowState: "closed", dehu: "none", system: "radiatore" });
        saveConfig();
        renderAll();
    }
}

function removeRoom(index) {
    if (roomsData.length > 1) {
        const removed = roomsData.splice(index, 1)[0];
        calibrations = calibrations.filter(c => c.roomId !== removed.name);
        if (calibSession && calibSession.roomId === removed.name) calibSession = null;
        delete measureWarnings[removed.name];
        delete lastRoomValues[removed.name];
        saveCalibrations();
        saveConfig();
        renderAll();
    }
}

function resetRooms() {
    if (confirm("Ripristinare le stanze predefinite?")) {
        roomsData = [...defaultRooms];
        measureWarnings = {};
        lastRoomValues = {};
        saveConfig();
        renderAll();
    }
}

/* ============================================================
   MODULO 5: METEO
   ============================================================ */
function toggleWeatherMode() {
    const mode = document.getElementById('weatherMode').value;
    const autoBox = document.getElementById('autoWeatherBox');
    const tempInput = document.getElementById('manExtTemp');
    const humInput = document.getElementById('manExtHum');

    if (mode === 'manual') {
        autoBox.classList.add('hidden');
        autoBox.classList.remove('flex');
        tempInput.removeAttribute('disabled');
        humInput.removeAttribute('disabled');
        document.getElementById('weatherStatus').textContent = "Modalità manuale attiva.";
        calculateStrategy();
    } else {
        autoBox.classList.remove('hidden');
        autoBox.classList.add('flex');
        tempInput.setAttribute('disabled', 'true');
        humInput.setAttribute('disabled', 'true');
        fetchWeather();
    }
    saveConfig();
}

function updateExternal() {
    saveConfig();
    calculateStrategy();
}

async function fetchWeather() {
    const mode = document.getElementById('weatherMode').value;
    if (mode === 'manual') return;

    const cityName = document.getElementById('cityInput').value.trim();
    const statusEl = document.getElementById('weatherStatus');
    if (!cityName) return;

    saveConfig();
    statusEl.textContent = "Ricerca meteo...";
    try {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=it&format=json`);
        const geoData = await geoRes.json();

        if (!geoData.results || geoData.results.length === 0) {
            statusEl.textContent = "Località non trovata.";
            return;
        }

        const { latitude, longitude, name, country } = geoData.results[0];
        statusEl.textContent = `Trovato: ${name} (${country})`;

        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,surface_pressure,weather_code,wind_speed_10m`);
        const weatherData = await weatherRes.json();

        document.getElementById('manExtTemp').value = weatherData.current.temperature_2m;
        document.getElementById('manExtHum').value = weatherData.current.relative_humidity_2m;
        if (weatherData.current.surface_pressure) {
            document.getElementById('pressInput').value = weatherData.current.surface_pressure;
        }

        const code = weatherData.current.weather_code;
        let sky = 'sunny';
        if (code >= 1 && code <= 3)        sky = 'cloudy';
        else if (code >= 51 && code <= 67) sky = 'rain';
        else if (code >= 95)               sky = 'storm';
        else if (code >= 45 && code <= 48) sky = 'fog';
        else if (code >= 71 && code <= 77) sky = 'snow';
        document.getElementById('skyCondition').value = sky;

        const windSpeed = weatherData.current.wind_speed_10m || 0;
        let wind = 'calm';
        if (windSpeed > 35)      wind = 'strong';
        else if (windSpeed > 15) wind = 'moderate';
        document.getElementById('windCondition').value = wind;

        saveConfig();
        calculateStrategy();
    } catch (error) {
        console.error(error);
        statusEl.textContent = "Errore nel recupero API.";
    }
}

/* ============================================================
   MODULO 6: FISICA (umidità assoluta di Mollier)
   ============================================================ */
function calculateAbsoluteHumidity(temp, humidity, pressure) {
    const es = 6.112 * Math.exp((17.67 * temp) / (temp + 243.5));
    const e = es * (humidity / 100);
    return (216.7 * e) / (273.15 + temp);
}

const DEFAULT_K = { small: 0.06, medium: 0.09, large: 0.12 };

function getDefaultK(room) {
    return DEFAULT_K[room.window] || 0.09;
}

function getRoomK(room) {
    const calib = calibrations.find(c => c.roomId === room.name);
    if (calib && calib.k > 0) return { k: calib.k, calibrated: true };
    return { k: getDefaultK(room), calibrated: false };
}

/* ============================================================
   MODULO 7: MOTORE DI STRATEGIA
   ============================================================ */
function calculateStrategy() {
    const container = document.getElementById('roomsContainer');
    if (!container) return;

    const extTemp = parseFloat(document.getElementById('manExtTemp').value) || 15.0;
    const extHum = parseFloat(document.getElementById('manExtHum').value) || 70.0;
    const pressure = parseFloat(document.getElementById('pressInput').value) || 1013.25;
    const sky = document.getElementById('skyCondition').value;
    const wind = document.getElementById('windCondition').value;
    const targetComfort = parseFloat(document.getElementById('targetComfortTemp').value) || 20.5;

    const extAbsHum = calculateAbsoluteHumidity(extTemp, extHum, pressure);
    const heatingStatus = document.getElementById('heatingStatus').value;
    const isHeatingActive = heatingStatus !== 'off';

    let canOpenByWeather = true;
    if (sky === 'rain' || sky === 'storm' || sky === 'snow') {
        canOpenByWeather = false;
    }

    let analyzedRooms = roomsData.map(room => {
        const intAbsHum = calculateAbsoluteHumidity(room.temp, room.hum, pressure);
        const diff = intAbsHum - extAbsHum;
        const canOpen = (diff > 0.5) && canOpenByWeather;
        const kInfo = getRoomK(room);
        const hasWarnings = !!measureWarnings[room.name];

        let urgencyScore = 0;
        if (room.hum > 60) {
            urgencyScore += (room.hum - 60) * 3;
            if (!canOpen) urgencyScore += 20;
            if (room.dehu === 'none') urgencyScore += 25;
        }
        const tempDiff = targetComfort - room.temp;
        if (tempDiff > 0) urgencyScore += tempDiff * 5;
        if (room.windowState === 'open') urgencyScore += 10;
        if (hasWarnings) urgencyScore += 15; 

        urgencyScore = Math.max(0, Math.min(100, Math.round(urgencyScore)));
        return { room, intAbsHum, diff, canOpen, urgencyScore, tempDiff, kInfo, hasWarnings };
    });

    analyzedRooms.sort((a, b) => b.urgencyScore - a.urgencyScore);

    container.innerHTML = '';
    document.getElementById('resultCard').classList.remove('hidden');
    document.getElementById('strategyEmpty').classList.add('hidden');

    analyzedRooms.forEach(({ room, intAbsHum, diff, canOpen, urgencyScore: score, tempDiff, kInfo, hasWarnings }) => {

        let cardBg = "bg-emerald-50 border-emerald-200";
        let badgeBg = "bg-emerald-200 text-emerald-900";
        if (score > 60)      { cardBg = "bg-rose-50 border-rose-200";  badgeBg = "bg-rose-200 text-rose-900"; }
        else if (score > 30) { cardBg = "bg-amber-50 border-amber-200"; badgeBg = "bg-amber-200 text-amber-900"; }

        let statusText = canOpen ? "SÌ - Consigliato aprire" : "NO - Meglio chiudere";
        if (room.windowState === 'open') statusText = "🪟 Finestra ATTUALMENTE APERTA";

        let kValue = kInfo.k;
        let kLabel = kInfo.calibrated
            ? `k calibrato: ${kValue.toFixed(4)}/min 🎯`
            : `k standard (${room.window}): ${kValue.toFixed(2)}/min`;

        if (!kInfo.calibrated) {
            if (wind === 'strong')   kValue *= 1.4;
            if (wind === 'moderate') kValue *= 1.15;
        }

        const baseMinutes = Math.max(5, Math.min(30, Math.round(2.3 / kValue)));

        let tempEvolutionHTML = "";
        if (room.windowState === 'open') {
            const tempDeltaFromExt = extTemp - room.temp;
            const estimated15Min = extTemp + (room.temp - extTemp) * Math.exp(-kValue * 15);
            const estimated30Min = extTemp + (room.temp - extTemp) * Math.exp(-kValue * 30);

            tempEvolutionHTML = `
                <div class="mt-2 p-2 bg-amber-50/80 border border-amber-200 rounded-lg text-[11px] text-amber-900 space-y-1">
                    <div class="font-bold">📈 Trend termico (finestra aperta, k=${kValue.toFixed(3)}/min):</div>
                    <div>• A 15 min stimata: <strong>~${estimated15Min.toFixed(1)} °C</strong></div>
                    <div>• A 30 min stimata: <strong>~${estimated30Min.toFixed(1)} °C</strong></div>
                </div>`;
        } else if (canOpen) {
            tempEvolutionHTML = `<div class="mt-2 text-[11px] text-slate-500">⏱️ Tempo ventilazione consigliato: <strong>~${baseMinutes} min</strong> · ${kLabel}</div>`;
        } else {
            tempEvolutionHTML = `<div class="mt-2 text-[11px] text-slate-500">🛡️ Mantenendo chiuso preservi il microclima attuale.</div>`;
        }

        let heatingAdvice = "";
        const hasHeat = room.system === 'radiatore' || room.system === 'pompa';
        if (tempDiff > 0.5 && hasHeat) {
            const src = room.system === 'pompa' ? 'Pompa di calcolo' : 'Termosifoni';
            heatingAdvice = isHeatingActive
                ? `🔥 <strong>${src} attivi</strong>: colmando il divario termico (-${tempDiff.toFixed(1)}°C dal target).`
                : `🔌 <strong>Impianti spenti</strong>: la stanza è a ${room.temp}°C (sotto il target di ${targetComfort}°C).`;
        } else if (tempDiff <= 0) {
            heatingAdvice = `✅ Comfort termico ottimale (target: ${targetComfort}°C).`;
        }

        let warningsHTML = '';
        if (hasWarnings) {
            warningsHTML = `
                <div class="mt-2 p-2 bg-orange-50 border border-orange-300 rounded-lg text-[11px] text-orange-900 space-y-1">
                    <div class="font-bold">⚠️ Misure da verificare:</div>
                    ${measureWarnings[room.name].map(w => `<div>${w}</div>`).join('')}
                </div>`;
        }

        container.innerHTML += `
            <div class="p-4 rounded-xl border ${cardBg} flex flex-col justify-between shadow-sm space-y-3 bg-opacity-60">
                <div>
                    <div class="flex justify-between items-start">
                        <h3 class="font-bold text-base">${room.name} ${hasWarnings ? '⚠️' : ''}</h3>
                        <span class="text-xs px-2 py-0.5 rounded-full font-semibold ${badgeBg}">Score: ${score}</span>
                    </div>
                    <div class="text-xs mt-1 opacity-90">
                        🌡️ ${room.temp}°C | 💧 Umidità: ${room.hum}% <br>
                        🧪 Umidità Assoluta: <strong>${intAbsHum.toFixed(2)} g/m³</strong> (Est: ${extAbsHum.toFixed(2)} g/m³)
                    </div>
                </div>
                <div class="text-xs bg-white/60 p-2.5 rounded-lg border border-black/5 space-y-1">
                    <div>💡 <strong>Azione:</strong> ${statusText}</div>
                    <div>${heatingAdvice}</div>
                    ${tempEvolutionHTML}
                    ${warningsHTML}
                </div>
            </div>`;
    });
}

/* ============================================================
   MODULO 8: CALIBRAZIONE DEL COEFFICIENTE k
   Due rilevazioni (con finestra aperta) distanti Δt:
       k = ln[ (T1 − Text) / (T2 − Text) ] / Δt
   In alternativa, se le temperature sono troppo vicine, usa
   l'umidità assoluta come tracciante:
       k = ln[ (AH1 − AHext) / (AH2 − AHext) ] / Δt
   ============================================================ */

function startCalibration() {
    const roomIndex = parseInt(document.getElementById('calibRoomSelect').value, 10);
    if (isNaN(roomIndex) || !roomsData[roomIndex]) return;
    const room = roomsData[roomIndex];

    const extTemp = parseFloat(document.getElementById('manExtTemp').value) || 15.0;
    const extHum = parseFloat(document.getElementById('manExtHum').value) || 70.0;
    const pressure = parseFloat(document.getElementById('pressInput').value) || 1013.25;

    const warns = validateMeasurement(room, room.temp, room.hum);
    const blocking = warns.filter(w => w.includes('fuori range'));
    if (blocking.length > 0) {
        alert("Impossibile avviare la calibrazione: i valori inseriti per " + room.name +
              " sembrano errati.\n\n" + blocking.join('\n') +
              "\n\nCorreggi le misure nella scheda Temperature e riprova.");
        return;
    }
    if (warns.length > 0 && !confirm("Attenzione, alcuni valori sembrano anomali:\n\n" +
        warns.join('\n') + "\n\nVuoi comunque avviare la calibrazione?")) {
        return;
    }

    if (room.windowState !== 'open') {
        alert("Per una misura corretta imposta prima lo stato della finestra della stanza su 'Aperta' (scheda Impianti), poi riprova.");
        return;
    }

    calibSession = {
        roomId: room.name,
        t1: room.temp,
        hum1: room.hum,
        abs1: calculateAbsoluteHumidity(room.temp, room.hum, pressure),
        absExt1: calculateAbsoluteHumidity(extTemp, extHum, pressure),
        text: extTemp,
        time: Date.now(),
        timeLabel: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    saveCalibrations();
    renderCalibration();
    calculateStrategy();
}

function endCalibration() {
    if (!calibSession) return;

    const room = roomsData.find(r => r.name === calibSession.roomId);
    if (!room) { calibSession = null; saveCalibrations(); renderCalibration(); return; }

    const extTemp = parseFloat(document.getElementById('manExtTemp').value) || 15.0;
    const extHum = parseFloat(document.getElementById('manExtHum').value) || 70.0;
    const pressure = parseFloat(document.getElementById('pressInput').value) || 1013.25;

    const dtMin = (Date.now() - calibSession.time) / 60000;
    const absExt2 = calculateAbsoluteHumidity(extTemp, extHum, pressure);
    const abs2 = calculateAbsoluteHumidity(room.temp, room.hum, pressure);
    const jumpWarnings = validateMeasurement(room, room.temp, room.hum).filter(w =>
        w.includes('Salto') || w.includes('molto distante') || w.includes('fuori range'));
    if (jumpWarnings.length > 0) {
        if (!confirm("⚠️ La seconda rilevazione sembra anomala:\n\n" +
            jumpWarnings.join('\n') +
            "\n\nUn valore sbagliato invalida il calcolo di k. Vuoi comunque procedere?")) {
            return;
        }
    }

    if (Math.abs(room.temp - calibSession.t1) < 0.1 && Math.abs(room.hum - calibSession.hum1) < 1) {
        if (!confirm("⚠️ La seconda rilevazione è praticamente identica alla prima " +
            `(${calibSession.t1}°C, ${calibSession.hum1}%).\n\nCon finestra aperta dovresti vedere una variazione. ` +
            "La finestra era realmente aperta? I valori sono stati aggiornati?\n\nVuoi comunque procedere?")) {
            return;
        }
    }

    let k = null, method = '';
    const dA1 = calibSession.abs1 - absExt2;
    const dA2 = abs2 - absExt2;
    if (dA1 > 0.05 && dA2 > 0.01 && dA2 < dA1) {
        k = Math.log(dA1 / dA2) / dtMin;
        method = 'umidità assoluta';
    }

    if (k === null || !isFinite(k) || k <= 0) {
        const dT1 = calibSession.t1 - calibSession.text;
        const dT2 = room.temp - calibSession.text;
        if (dT1 > 0.3 && dT2 > 0.05 && dT2 < dT1) {
            k = Math.log(dT1 / dT2) / dtMin;
            method = 'temperatura';
        }
    }

    if (k === null || !isFinite(k) || k <= 0) {
        alert("Non riesco a calcolare k. Serve una differenza apprezzabile tra le due rilevazioni (e condizioni esterne stabili). Attendi qualche minuto in più e ripeti la Rilevazione 2.");
        return;
    }

    k = Math.max(0.005, Math.min(1.0, k));

    calibrations = calibrations.filter(c => c.roomId !== calibSession.roomId);
    calibrations.push({
        roomId: calibSession.roomId,
        k: k,
        method: method,
        t1: calibSession.t1,
        t2: room.temp,
        text: calibSession.text,
        dtMin: Math.round(dtMin),
        date: new Date().toLocaleDateString()
    });

    calibSession = null;
    saveCalibrations();
    renderCalibration();
    calculateStrategy();
}

function cancelCalibration() {
    calibSession = null;
    saveCalibrations();
    renderCalibration();
}

function deleteCalibration(roomId) {
    calibrations = calibrations.filter(c => c.roomId !== roomId);
    saveCalibrations();
    renderCalibration();
    calculateStrategy();
}

function renderCalibration() {
    const select = document.getElementById('calibRoomSelect');
    const sessionBox = document.getElementById('calibSessionBox');
    const listBox = document.getElementById('calibrationsList');
    if (!select || !listBox) return;

    select.innerHTML = roomsData.map((r, i) =>
        `<option value="${i}">${r.name} (${r.temp}°C, ${r.hum}%)</option>`).join('');

    if (sessionBox) {
        if (calibSession) {
            const elapsed = Math.round((Date.now() - calibSession.time) / 60000);
            sessionBox.innerHTML = `
                <div class="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900">
                    <strong>⏳ Calibrazione in corso: ${calibSession.roomId}</strong><br>
                    Rilevazione 1 alle ${calibSession.timeLabel}: ${calibSession.t1}°C, ${calibSession.hum1}%
                    (UA ${calibSession.abs1.toFixed(2)} g/m³) · Esterna: ${calibSession.text}°C<br>
                    Minuti trascorsi: <strong>${elapsed}</strong> — aggiorna le misure interne nella scheda
                    Temperature, poi premi "Rilevazione 2".
                </div>`;
        } else {
            sessionBox.innerHTML = '';
        }
    }

    const startBtn = document.getElementById('calibStartBtn');
    const endBtn = document.getElementById('calibEndBtn');
    const cancelBtn = document.getElementById('calibCancelBtn');
    if (startBtn) startBtn.disabled = !!calibSession;
    if (endBtn) endBtn.disabled = !calibSession;
    if (cancelBtn) cancelBtn.classList.toggle('hidden', !calibSession);
    if (startBtn) startBtn.classList.toggle('opacity-40', !!calibSession);

    if (calibrations.length === 0) {
        listBox.innerHTML = `<p class="text-slate-400 italic text-sm">Nessuna calibrazione salvata. Esegui una misura con le rilevazioni qui sopra.</p>`;
        return;
    }

    listBox.innerHTML = calibrations.map(c => {
        const room = roomsData.find(r => r.name === c.roomId);
        const defaultK = room ? getDefaultK(room) : null;
        const compare = defaultK
            ? (c.k > defaultK * 1.15 ? 'sopra la media (buona ventilazione)'
               : c.k < defaultK * 0.85 ? 'sotto la media (scambio lento)' : 'in linea con la media')
            : '';
        return `
        <div class="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-start gap-2">
            <div class="text-xs text-slate-700">
                <strong>${c.roomId}</strong> — k = <strong>${c.k.toFixed(4)} /min</strong>
                <span class="text-slate-500">(via ${c.method}, Δt ${c.dtMin} min, ${c.date})</span><br>
                <span class="text-slate-500">${compare}</span>
            </div>
            <button onclick="deleteCalibration('${c.roomId.replace(/'/g, "\\'")}')" class="text-rose-500 hover:text-rose-700 text-xs font-bold px-2 py-1 bg-white border border-rose-200 rounded-lg">Elimina</button>
        </div>`;
    }).join('');
}


/* ============================================================
   MODULO 9: STORICO SNAPSHOT & ESPORTAZIONE (JSON / CSV)
   ============================================================ */

function recordSnapshot() {
    const timestamp = new Date().toLocaleString();
    const extTempInput = document.getElementById('manExtTemp');
    const extHumInput = document.getElementById('manExtHum');
    
    const extTemp = extTempInput ? (parseFloat(extTempInput.value) || 0) : 0;
    const extHum = extHumInput ? (parseFloat(extHumInput.value) || 0) : 0;
    
    const snapshot = {
        timestamp: timestamp,
        external: { 
            temp: extTemp, 
            hum: extHum 
        },
        extTemp: extTemp,
        extHum: extHum,
        rooms: roomsData.map(room => ({
            name: room.name,
            temp: room.temp,
            hum: room.hum,
            size: room.size,
            windowState: room.windowState,
            absHum: parseFloat(calculateAbsoluteHumidity(room.temp, room.hum, 1013.25).toFixed(2))
        }))
    };

    historyData.unshift(snapshot);
    if (historyData.length > 50) historyData.pop(); 
    localStorage.setItem(STORAGE_KEY_PREFIX + 'history_data_v6', JSON.stringify(historyData));
    renderHistory();
}

function clearHistory() {
    if (confirm("Vuoi cancellare tutto lo storico?")) {
        historyData = [];
        localStorage.removeItem(STORAGE_KEY_PREFIX + 'history_data_v6');
        renderHistory();
    }
}

function renderHistory() {
    const container = document.getElementById('historyContainer');
    if (!container) return;
    if (historyData.length === 0) {
        container.innerHTML = `<p class="text-slate-400 italic text-sm">Nessun dato storico salvato. Clicca su "Salva Snapshot".</p>`;
        return;
    }

    container.innerHTML = '';
    historyData.forEach((snap) => {
        const timeStr = snap.timestamp || snap.time || '';
        const extTemp = (snap.external && snap.external.temp !== undefined) ? snap.external.temp : (snap.extTemp !== undefined ? snap.extTemp : 0);
        const extHum = (snap.external && snap.external.hum !== undefined) ? snap.external.hum : (snap.extHum !== undefined ? snap.extHum : 0);

        const roomsSummary = snap.rooms.map(r =>
            `<strong>${r.name}:</strong> ${r.temp}°C, ${r.hum}% (${r.windowState === 'open' ? '🪟 Aperta' : '🚪 Chiusa'})`
        ).join(' | ');

        container.innerHTML += `
            <div class="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex flex-col gap-1">
                <div class="flex justify-between font-semibold text-slate-700 text-sm">
                    <span>🕒 ${timeStr}</span>
                    <span class="text-blue-600">Est: ${extTemp}°C, ${extHum}%</span>
                </div>
                <div class="text-slate-600 text-[11px]">${roomsSummary}</div>
            </div>`;
    });
}

function exportJSON() {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFIX + 'history_data_v6') || JSON.stringify(historyData));
    
    if (history.length === 0) {
        alert("Nessuno storico disponibile da esportare.");
        return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(history, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `mollier_storico_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function exportCSV() {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFIX + 'history_data_v6') || JSON.stringify(historyData));
    
    if (history.length === 0) {
        alert("Nessuno storico disponibile da esportare.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,Data/Ora,Temp Esterna,Umidita Esterna,Stanza,Temperatura Interna,Umidita Interna,Umidita Assoluta (g/m3),Stato Finestra\n";

    history.forEach(snapshot => {
        const timestamp = snapshot.timestamp || snapshot.time || '';
        const extTemp = (snapshot.external && snapshot.external.temp !== undefined) 
            ? snapshot.external.temp 
            : (snapshot.extTemp !== undefined ? snapshot.extTemp : '');
            
        const extHum = (snapshot.external && snapshot.external.hum !== undefined) 
            ? snapshot.external.hum 
            : (snapshot.extHum !== undefined ? snapshot.extHum : '');
        
        if (snapshot.rooms && Array.isArray(snapshot.rooms)) {
            snapshot.rooms.forEach(room => {
                csvContent += `"${timestamp}",${extTemp},${extHum},"${room.name || 'Stanza'}",${room.temp || ''},${room.hum || ''},${room.absHum || ''},"${room.windowState || ''}"\n`;
            });
        }
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `mollier_storico_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
}