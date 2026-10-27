// ==========================================
// MEDIA CORE - MULTIMEDIA SHELF & PREVIEW ENGINE
// datectresourcetype
//rendermediashelf
//previamediaitem
// ==========================================

const mediaIcons = {
  image: '🖼️',
  video: '📹',
  audio: '🎵',
  pdf: '📄',
  link: '🔗'
};

function detectResourceType(url) {
  const clean = url.split('?')[0].toLowerCase();
  if (/\.(jpg|jpeg|png|webp|gif|avif)$/.test(clean)) return 'image';
  if (/\.(mp4|webm|mov|m3u8)$/.test(clean)) return 'video';
  if (/\.(mp3|wav|ogg|aac|m4a)$/.test(clean)) return 'audio';
  if (/\.pdf$/.test(clean)) return 'pdf';
  return 'link';
}

function renderMediaShelf(filterType = 'all') {
  const booksDiv = document.getElementById("books");
  if (!booksDiv) return;
  
  booksDiv.innerHTML = "";
  let books = JSON.parse(localStorage.getItem("nostr_shelf")) || {};
  const keys = Object.keys(books);

  if (keys.length === 0) {
    booksDiv.innerHTML = `<div class="text-xs text-emerald-400/50 italic p-2">No media saved on the shelf yet.</div>`;
    return;
  }

  let count = 0;
  for (const term of keys) {
    if (!term.startsWith('http://') && !term.startsWith('https://')) continue;

    const resourceType = detectResourceType(term);
    if (filterType !== 'all' && resourceType !== filterType) continue;

    count++;
    const item = books[term];
    const label = (typeof item === 'object' && item.label) ? item.label : term.replace(/^https?:\/\/(www\.)?/, '').substring(0, 22) + '...';
    const icon = mediaIcons[resourceType] || '🔗';

    const div = document.createElement("div");
    div.className = "flex items-center justify-between gap-2 bg-[#071810] border border-emerald-900/60 px-3 py-1.5 rounded-lg group hover:border-emerald-500 transition-all min-w-[210px] max-w-[280px]";

    const span = document.createElement("span");
    span.className = "truncate flex-1 cursor-pointer font-mono text-xs text-emerald-300";
    span.textContent = `${icon} ${label}`;
    span.title = term;
    span.onclick = () => previewMediaItem(term, resourceType);

    const btn = document.createElement("button");
    btn.className = "text-emerald-500 hover:text-red-400 font-mono text-xs px-1 rounded transition-colors opacity-60 group-hover:opacity-100 cursor-pointer";
    btn.textContent = "✕";
    btn.title = "Remove";
    btn.onclick = (e) => {
      e.stopPropagation();
      delete books[term];
      localStorage.setItem("nostr_shelf", JSON.stringify(books));
      renderMediaShelf(filterType);
    };

    div.appendChild(span);
    div.appendChild(btn);
    booksDiv.appendChild(div);
  }

  if (count === 0) {
    booksDiv.innerHTML = `<div class="text-xs text-emerald-400/50 italic p-2">No items match filter "${filterType}".</div>`;
  }
}

function previewMediaItem(url, type) {
  const library = document.getElementById("library");
  if (!library) {
    window.open(url, '_blank');
    return;
  }

  let mediaElement = '';
  if (type === 'image') {
    mediaElement = `<img src="${url}" class="max-h-96 w-full rounded-lg object-contain bg-black border border-emerald-900" loading="lazy">`;
  } else if (type === 'video') {
    mediaElement = `<video controls playsinline class="max-h-96 w-full rounded-lg bg-black border border-emerald-950"><source src="${url}"></video>`;
  } else if (type === 'audio') {
    mediaElement = `<audio controls class="w-full"><source src="${url}"></audio>`;
  } else if (type === 'pdf') {
    mediaElement = `<div class="p-6 text-center font-mono text-xs space-y-3">📄 Documento PDF rilevato<br><button onclick="window.open('${url}', '_blank')" class="bg-emerald-600 text-emerald-950 px-3 py-1.5 rounded font-bold cursor-pointer">Apri PDF in nuova scheda</button></div>`;
  } else {
    window.open(url, '_blank');
    return;
  }

  library.innerHTML = `
    <div class="bg-[#0f2318] border border-emerald-900 rounded-lg p-4 space-y-3 shadow-lg">
      <div class="flex justify-between items-center font-mono text-xs text-emerald-400 border-b border-emerald-900/40 pb-2">
        <span class="truncate max-w-[80%]">🔗 ${url}</span>
        <button onclick="document.getElementById('library').innerHTML = ''" class="text-red-400 hover:text-red-300 cursor-pointer font-bold px-2 py-0.5 bg-red-950/40 rounded border border-red-900/60">✕ Close</button>
      </div>
      <div class="flex justify-center">${mediaElement}</div>
    </div>
  ` + library.innerHTML;
}


document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("books")) {
    renderMediaShelf('all');
  }
});

// ==========================================
// MEDIA CORE - RELAY SEARCH & TAG 'r' ENGINE
// ==========================================

const DEFAULT_MEDIA_RELAYS = [
  'wss://relay.snort.social',
  'wss://nos.today',
  'wss://nostr.wine'
];

function getStoredRelays() {
  try {
    const saved = JSON.parse(localStorage.getItem('baita_relays') || 'null');
    if (Array.isArray(saved) && saved.length) return saved;
  } catch (e) {}
  return DEFAULT_MEDIA_RELAYS.slice();
}

function queryRelays(filters, relays, timeoutMs = 4200) {
  return new Promise(resolve => {
    const seen = new Map();
    const sockets = [];
    let finished = false;

    const done = () => {
      if (finished) return;
      finished = true;
      sockets.forEach(w => { try { w.close(); } catch (e) {} });
      resolve([...seen.values()]);
    };

    relays.forEach((url, i) => {
      let ws;
      try { ws = new WebSocket(url); } catch (e) { return; }
      sockets.push(ws);
      const subId = 'm' + i + Math.random().toString(36).slice(2, 8);
      ws.onopen = () => ws.send(JSON.stringify(['REQ', subId, ...filters]));
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m[0] === 'EVENT' && m[1] === subId && m[2] && !seen.has(m[2].id)) {
          seen.set(m[2].id, m[2]);
        }
      };
      ws.onerror = () => {};
      setTimeout(() => { try { ws.close(); } catch (e) {} }, timeoutMs);
    });

    setTimeout(done, timeoutMs + 1000);
  });
}

function saveToShelfFromSearch(url) {
  let books = JSON.parse(localStorage.getItem("nostr_shelf")) || {};
  if (!books[url]) {
    books[url] = { label: `🔗 ${url.replace(/^https?:\/\/(www\.)?/, '').substring(0, 22)}...`, type: detectResourceType(url) };
    localStorage.setItem("nostr_shelf", JSON.stringify(books));
    if (typeof renderMediaShelf === 'function') renderMediaShelf('all');
  }
}

async function runSearchByRTag() {
  const searchInput = document.getElementById('searchBar');
  const library = document.getElementById('library');
  if (!library) return;

  const url = searchInput ? searchInput.value.trim() : '';
  library.innerHTML = `<div class="text-center font-mono text-xs text-emerald-400 py-10 animate-pulse">Interrogazione relay in corso...</div>`;

  let filter = { kinds: [1], limit: 50 };
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    filter['#r'] = [url];
  } else if (url) {
    filter.search = url;
  }

  const relays = getStoredRelays();
  const events = await queryRelays([filter], relays);

  const validEvents = events.filter(e => {
    return e.tags.some(t => t[0] === 'r' && /^https?:\/\//i.test(t[1]));
  }).sort((a, b) => b.created_at - a.created_at);

  if (!validEvents.length) {
    library.innerHTML = `<div class="text-center font-mono text-xs text-emerald-500/60 py-10">Nessun contenuto multimediale trovato nei tag <code>r</code>.</div>`;
    return;
  }

  library.innerHTML = validEvents.map(e => {
    const mediaTags = e.tags.filter(t => t[0] === 'r' && /^https?:\/\//i.test(t[1]));
    

    let allMediaHtml = mediaTags.map(tag => {
      const mediaUrl = tag[1];
      const mType = detectResourceType(mediaUrl);

      let mediaHtml = '';
      if (mType === 'image') {
        mediaHtml = `<div class="mt-2 max-h-72 overflow-hidden rounded-lg bg-black border border-emerald-900/60 flex justify-center"><img src="${mediaUrl}" loading="lazy" class="object-contain max-h-72 w-full" alt="Media"></div>`;
      } else if (mType === 'video') {
        mediaHtml = `<div class="mt-2 max-h-72 overflow-hidden rounded-lg bg-black border border-emerald-900/60"><video controls preload="none" playsinline class="w-full max-h-72"><source src="${mediaUrl}"></video></div>`;
      } else if (mType === 'audio') {
        mediaHtml = `<div class="mt-2"><audio controls preload="none" class="w-full"><source src="${mediaUrl}"></audio></div>`;
      } else {
        mediaHtml = `<div class="mt-2 font-mono text-xs text-emerald-400">📄 File / Link: ${mediaUrl}</div>`;
      }

      return `
        <div class="space-y-1 pt-2 border-t border-emerald-900/30 first:border-0 first:pt-0">
          ${mediaHtml}
          <div class="flex gap-2 pt-2 flex-wrap">
             <button onclick="window.open('${mediaUrl}', '_blank')" class="bg-emerald-950 border border-emerald-800 text-emerald-300 hover:text-white font-mono text-xs px-3 py-1.5 rounded cursor-pointer transition-colors">
               🔗 Apri risorsa (${mType})
             </button>
             <button onclick="navigator.clipboard.writeText('${mediaUrl}').then(() => alert('URL copiato negli appunti!'))" class="bg-emerald-950 border border-emerald-800 text-emerald-300 hover:text-white font-mono text-xs px-3 py-1.5 rounded cursor-pointer transition-colors">
               📋 Copia URL
             </button>
             <button onclick="saveToShelfFromSearch('${mediaUrl}')" class="bg-emerald-900/40 border border-emerald-800/60 text-emerald-300 hover:bg-emerald-900 font-mono text-xs px-3 py-1.5 rounded cursor-pointer transition-colors">
               ⭐ Salva in Shelf
             </button>
            </div>
                                                  
        </div>
      `;
    }).join('');

    const dateStr = new Date(e.created_at * 1000).toLocaleString('it-IT');
    const pubkeyShort = e.pubkey.substring(0, 8) + '...' + e.pubkey.slice(-4);

    return `
      <div class="bg-[#0f2318] border border-emerald-900/60 rounded-lg p-4 space-y-3 shadow-md">
        <div class="flex justify-between items-center font-mono text-[11px] text-emerald-400/70 border-b border-emerald-900/40 pb-2">
          <span>👤 ${pubkeyShort}</span>
          <span>🕐 ${dateStr}</span>
        </div>
        <div class="text-sm text-emerald-300 font-sans leading-relaxed">
          ${typeof parseContent === 'function' ? parseContent(e.content) : e.content}
        </div>
        
        <!-- Contenitore di tutti i media della nota -->
        <div class="space-y-3 mt-3">
          ${allMediaHtml}
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// MEDIA CORE - UNIFIED SEARCH & ROUTING HOOK
// ==========================================

// ==========================================
// MEDIA CORE - UNIFIED SEARCH & ROUTING HOOK
// ==========================================
function handleSearchAction() {
  const searchInput = document.getElementById('searchBar');
  if (!searchInput) return;
  
  let term = searchInput.value.trim();
  if (!term) return;

  const nostrBech32Regex = /(nevent1[0-9a-z]+|note1[0-9a-z]+|npub1[0-9a-z]+|nprofile1[0-9a-z]+|naddr1[0-9a-z]+)/i;
  const match = term.match(nostrBech32Regex);
  if (match) {
    const cleanTerm = match[1];
    if (typeof openNostrClient === 'function') {
      openNostrClient(cleanTerm);
    } else {
      window.location.href = `baita_text.html?q=${encodeURIComponent(cleanTerm)}`;
    }
    searchInput.value = "";
    return;
  }

  if (currentSearchMode === 'relay') {

    if (/^https?:\/\//i.test(term)) {
      saveToShelfFromSearch(term);
    }
    runSearchByRTag();
  } else {
   
    if (/^https?:\/\//i.test(term)) {
      const rType = detectResourceType(term);
      if (rType === 'image' || rType === 'video' || rType === 'audio' || rType === 'pdf') {
        renderDirectMediaUrl(term, rType);
      } else {
        window.open(term, '_blank');
      }
    } else {
      const library = document.getElementById('library');
      if (library) {
        library.innerHTML = `
          <div class="bg-[#0f2318] border border-emerald-900 rounded-lg p-4 space-y-2">
            <div class="font-mono text-xs text-emerald-400">🔍 Risultato ricerca locale per: <span class="text-white">${term}</span></div>
            <div class="text-xs text-emerald-300/70 italic">Filtra la tua libreria o esegui azioni locali qui.</div>
          </div>
        `;
      }
    }
  }
}

function executeRelaySearchForUrl(url) {
  saveToShelfFromSearch(url);
  const searchInput = document.getElementById('searchBar');
  if (searchInput) searchInput.value = url;
  runSearchByRTag();
}

function renderDirectMediaUrl(url, type) {
  saveToShelfFromSearch(url);
  const library = document.getElementById('library');
  if (!library) return;
  
  let mediaElement = '';
  if (type === 'image') {
    mediaElement = `<img src="${url}" class="max-h-96 w-full rounded-lg object-contain bg-black border border-emerald-900" loading="lazy">`;
  } else if (type === 'video') {
    mediaElement = `<video controls playsinline class="max-h-96 w-full rounded-lg bg-black border border-emerald-950"><source src="${url}"></video>`;
  }

  library.innerHTML = `
    <div class="bg-[#0f2318] border border-emerald-900 rounded-lg p-4 space-y-3 shadow-lg">
      <div class="flex justify-between items-center font-mono text-xs text-emerald-400 border-b border-emerald-900/40 pb-2">
        <span class="truncate max-w-[75%]">🔗 ${url}</span>
        <div class="flex gap-2">
          <button onclick="navigator.clipboard.writeText('${url}').then(() => alert('URL copiato negli appunti!'))" class="text-emerald-300 hover:text-white font-mono text-xs px-2 py-0.5 bg-emerald-950 rounded border border-emerald-800 cursor-pointer">📋 Copia</button>
          <button onclick="document.getElementById('library').innerHTML = ''" class="text-red-400 hover:text-red-300 cursor-pointer font-bold px-2 py-0.5 bg-red-950/40 rounded border border-red-900/60">✕ Close</button>
        </div>
      </div>
      <div class="flex justify-center">${mediaElement}</div>
    </div>
  `;
}

let currentSearchMode = 'relay'; 

function setSearchMode(mode) {
  currentSearchMode = mode;
  const relayBtn = document.getElementById('modeRelayBtn');
  const localBtn = document.getElementById('modeLocalBtn');
  
  if (!relayBtn || !localBtn) return;

  if (mode === 'relay') {
    relayBtn.classList.add('active', 'bg-[#166534]', 'text-white');
    relayBtn.classList.remove('bg-emerald-950', 'text-emerald-300');
    localBtn.classList.remove('active', 'bg-[#166534]', 'text-white');
    localBtn.classList.add('bg-emerald-950', 'text-emerald-300');
  } else {
    localBtn.classList.add('active', 'bg-[#166534]', 'text-white');
    localBtn.classList.remove('bg-emerald-950', 'text-emerald-300');
    relayBtn.classList.remove('active', 'bg-[#166534]', 'text-white');
    relayBtn.classList.add('bg-emerald-950', 'text-emerald-300');
  }
}

function enhanceShelfCarousel() {
  const booksDiv = document.getElementById("books");
  if (!booksDiv) return;
  const items = booksDiv.querySelectorAll("div.flex");
  
  items.forEach(div => {
    div.className = "flex flex-col justify-between bg-[#071810] border border-emerald-900/60 p-2 rounded-lg hover:border-emerald-500 transition-all relative shrink-0 w-32 h-28";
    const span = div.querySelector("span");
    const btn = div.querySelector("button");
    
    if (span) {
      const url = span.title;
      
      if (/\.(jpg|jpeg|png|webp|gif|avif)$/i.test(url)) {
        span.innerHTML = `
          <div class="w-full h-16 bg-black rounded overflow-hidden mb-1.5 border border-emerald-900/40">
            <img src="${url}" class="object-cover w-full h-full hover:scale-105 transition-transform" loading="lazy">
          </div>
          <span class="truncate block text-[10px] text-emerald-300 font-mono text-center">${span.textContent.replace(/^[^\s]+\s/, '')}</span>
        `;
      } else if (/\.(mp4|webm|mov|m3u8)$/i.test(url)) {
        span.innerHTML = `
          <div class="w-full h-16 bg-black rounded overflow-hidden mb-1.5 border border-emerald-900/40 relative flex items-center justify-center">
            <video src="${url}" class="object-cover w-full h-full" muted playsinline preload="none"></video>
            <span class="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-xs">▶️</span>
          </div>
          <span class="truncate block text-[10px] text-emerald-300 font-mono text-center">${span.textContent.replace(/^[^\s]+\s/, '')}</span>
        `;
      } else {
        span.className = "flex flex-col items-center justify-center w-full h-full cursor-pointer font-mono text-center overflow-hidden";
        const rawText = span.textContent;
        const icon = rawText.charAt(0);
        const label = rawText.substring(2);
        span.innerHTML = `
          <div class="text-xl mb-1">${icon}</div>
          <span class="truncate w-full text-[10px] text-emerald-300">${label}</span>
        `;
      }
    }
    
    if (btn) {
      btn.className = "absolute top-1 right-1 bg-emerald-950/90 text-emerald-400 hover:text-red-400 font-mono text-[10px] px-1.5 py-0.5 rounded border border-emerald-800/80 cursor-pointer z-10 transition-colors shadow-md";
    }
  });
}