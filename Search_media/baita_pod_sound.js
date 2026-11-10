// ==========================================
// BAITA POD (VLC STYLE QUEUE) + NOSTR BRIDGE
// ==========================================
let ipodPlaylistQueue = []; 
let ipodIndex = 0;
let currentMediaType = 'audio'; 
let nostrTracks = [];
const seenTrackIds = new Set();
const NOSTR_RELAYS = [
  'wss://offchain.pub',
  'wss://nos.lol',
  'wss://relay.nostr.net'
];

if (typeof window.ipodCurrentVolume === 'undefined') {
  window.ipodCurrentVolume = 1.0;
}

// ==========================================
// 1. VALIDAZIONE E UTILITY
// ==========================================

function isValidMediaKey(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('nevent1') || url.startsWith('naddr1') || url.startsWith('npub1') || url.startsWith('nprofile1')) {
    return false;
  }
  
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('blob:') && !url.startsWith('data:')) {
    return false;
  }

  let rType = typeof detectResourceType === 'function' ? detectResourceType(url) : 'audio';
  return ['audio', 'video', 'image', 'photo'].includes(rType);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function initVlcQueue(forceReloadFromStorage = false) {
  if (ipodPlaylistQueue.length === 0 || forceReloadFromStorage) {
    let mediaShelf = JSON.parse(localStorage.getItem("nostr_shelf")) || {};
    let keys = Object.keys(mediaShelf).filter(isValidMediaKey);
    
    ipodPlaylistQueue = keys.map(url => {
      let item = mediaShelf[url];
      let label = (typeof item === 'object' && item.label) ? item.label : url.split('/').pop();
      let type = typeof detectResourceType === 'function' ? detectResourceType(url) : 'audio';
      if (type === 'image') type = 'photo';
      return { url, type, label };
    });
  }
  renderIpodPlaylist();
}

let currentFallbackIndex = 0;

function loadIntoIpod(url, type, label = '', artist = '', cover = '', fallbacks = []) {
  const audioPlayer = document.getElementById('ipodAudioPlayer');
  let videoPlayer = document.getElementById('ipodPodVideoPlayer');
  
  const screenContent = document.getElementById('ipodScreenContent');
  const titleEl = document.getElementById('ipodTitle');
  const subtitleEl = document.getElementById('ipodSubtitle');
  const statusEl = document.getElementById('ipodStatus');
  const centerBtn = document.getElementById('ipodCenterBtn');
  const progressArea = document.querySelector('.ipod-progress-area');

  if (!audioPlayer || !screenContent) return;

  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  audioPlayer.src = "";

  if (videoPlayer) {
    videoPlayer.pause();
    videoPlayer.currentTime = 0;
    videoPlayer.remove(); 
  }

  currentMediaType = type;
  titleEl.innerText = label || url.split('/').pop() || "Media file";
  
  if (artist) {
    subtitleEl.innerText = `${artist} (${ipodIndex + 1}/${ipodPlaylistQueue.length})`;
  } else {
    subtitleEl.innerText = `${type.toUpperCase()} (${ipodIndex + 1}/${ipodPlaylistQueue.length})`;
  }

  screenContent.innerHTML = '';

  const handleMediaError = () => {
    if (fallbacks && currentFallbackIndex < fallbacks.length) {
      let nextUrl = fallbacks[currentFallbackIndex];
      currentFallbackIndex++;
      if (statusEl) statusEl.innerText = `FALLBACK (${currentFallbackIndex}/${fallbacks.length})...`;
      
      if (type === 'audio') {
        audioPlayer.src = nextUrl;
        audioPlayer.play().catch(() => {});
      } else if (type === 'video' && videoPlayer) {
        videoPlayer.src = nextUrl;
        videoPlayer.play().catch(() => {});
      }
    } else {
      if (statusEl) statusEl.innerText = "OFFLINE / ERROR";
    }
  };

  if (type === 'audio') {
    if (progressArea) progressArea.style.display = 'block';
    currentFallbackIndex = 0; 
    audioPlayer.src = url;
    audioPlayer.volume = window.ipodCurrentVolume;
    audioPlayer.onerror = handleMediaError;

    audioPlayer.play().then(() => {
      statusEl.innerText = artist ? "PLAYING (NOSTR)" : "PLAYING";
      updateActiveTrackUI(url);
      if (centerBtn) centerBtn.innerText = "PAUSE";
    }).catch(e => {
      handleMediaError();
    });

    if (cover) {
      screenContent.innerHTML = `
        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #000; overflow: hidden;">
          <img src="${cover}" style="width: 100%; height: 100%; object-fit: contain; display: block;" alt="Cover">
        </div>
      `;
    } else {
      screenContent.innerHTML = `<div style="color: var(--baita-accent-green); font-size: 11px;">🎵 Audio playing</div>`;
    }
  
  } else if (type === 'video') {
    if (progressArea) progressArea.style.display = 'block';

    currentFallbackIndex = 0;
    videoPlayer = document.createElement('video');
    videoPlayer.id = 'ipodPodVideoPlayer';
    videoPlayer.src = url;
    videoPlayer.playsInline = true;
    videoPlayer.autoplay = true;
    videoPlayer.volume = window.ipodCurrentVolume;
    videoPlayer.style.cssText = "width: 100%; height: 100%; max-height: 120px; object-fit: contain; border-radius: 4px; background: #000; margin: auto;";
    
    videoPlayer.onerror = handleMediaError;
    screenContent.appendChild(videoPlayer);

    videoPlayer.play().then(() => {
      statusEl.innerText = "PLAYING (V)";
      if (centerBtn) centerBtn.innerText = "PAUSE";
    }).catch(e => {
      handleMediaError();
    });

    videoPlayer.addEventListener('timeupdate', () => {
      if (!videoPlayer.duration) return;
      updateProgressBar(videoPlayer.currentTime, videoPlayer.duration);
    });         
    
  } else if (type === 'image' || type === 'photo') {
    if (progressArea) progressArea.style.display = 'none';
    statusEl.innerText = "PHOTO";
    if (centerBtn) centerBtn.innerText = "VIEW";
    
    screenContent.innerHTML = `
      <div style="display: flex !important; align-items: center !important; justify-content: center !important; width: 100% !important; height: 100% !important; overflow: hidden !important; background: #000 !important; border-radius: 4px !important;">
        <img src="${url}" onerror="this.onerror=null; if('${(fallbacks[0]||'')}') this.src='${fallbacks[0]}';" style="width: 100% !important; height: 100% !important; object-fit: contain !important; display: block !important; margin: auto !important;">
      </div>
    `;
  }
  
  renderIpodPlaylist();
}

const originalPreviewMediaItem = window.previewMediaItem;
window.previewMediaItem = function(url, type) {
  if (typeof originalPreviewMediaItem === 'function') {
    originalPreviewMediaItem(url, type);
  }
  
  if (!isValidMediaKey(url)) return;

  let existingIndex = ipodPlaylistQueue.findIndex(item => item.url === url);
  if (existingIndex === -1) {
    let label = url.split('/').pop();
    ipodPlaylistQueue.push({ url, type: type === 'image' ? 'photo' : type, label });
    ipodIndex = ipodPlaylistQueue.length - 1;
  } else {
    ipodIndex = existingIndex;
  }

  loadIntoIpod(url, type, ipodPlaylistQueue[ipodIndex].label);
};

function ipodTogglePlay() {
  const audioPlayer = document.getElementById('ipodAudioPlayer');
  const videoPlayer = document.getElementById('ipodPodVideoPlayer');
  const statusEl = document.getElementById('ipodStatus');
  const centerBtn = document.getElementById('ipodCenterBtn');

  if (currentMediaType === 'audio' && audioPlayer && audioPlayer.src) {
    if (audioPlayer.paused) {
      audioPlayer.play();
      if (statusEl) statusEl.innerText = "PLAYING";
      if (centerBtn) centerBtn.innerText = "PAUSE";
    } else {
      audioPlayer.pause();
      if (statusEl) statusEl.innerText = "PAUSED";
      if (centerBtn) centerBtn.innerText = "PLAY";
    }
  } else if (currentMediaType === 'video' && videoPlayer) {
    if (videoPlayer.paused) {
      videoPlayer.play();
      if (statusEl) statusEl.innerText = "PLAYING (VID)";
      if (centerBtn) centerBtn.innerText = "PAUSE";
    } else {
      videoPlayer.pause();
      if (statusEl) statusEl.innerText = "PAUSED";
      if (centerBtn) centerBtn.innerText = "PLAY";
    }
  }
}

function ipodMenuAction() {
  toggleIpodShelf();
}

function ipodNextMedia() {
  if (ipodPlaylistQueue.length === 0) return;
  ipodIndex = (ipodIndex + 1) % ipodPlaylistQueue.length;
  let nextItem = ipodPlaylistQueue[ipodIndex];
  loadIntoIpod(nextItem.url, nextItem.type, nextItem.label, nextItem.artist, nextItem.cover, nextItem.fallbacks);
}

function ipodPrevMedia() {
  if (ipodPlaylistQueue.length === 0) return;
  ipodIndex = (ipodIndex - 1 + ipodPlaylistQueue.length) % ipodPlaylistQueue.length;
  let prevItem = ipodPlaylistQueue[ipodIndex];
  loadIntoIpod(prevItem.url, prevItem.type, prevItem.label, prevItem.artist, prevItem.cover, prevItem.fallbacks);
}

function ipodToggleShuffle() {
  if (ipodPlaylistQueue.length > 1) {
    for (let i = ipodPlaylistQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ipodPlaylistQueue[i], ipodPlaylistQueue[j]] = [ipodPlaylistQueue[j], ipodPlaylistQueue[i]];
    }
    ipodIndex = 0;
    renderIpodPlaylist();
    loadIntoIpod(ipodPlaylistQueue[0].url, ipodPlaylistQueue[0].type, ipodPlaylistQueue[0].label, ipodPlaylistQueue[0].artist, ipodPlaylistQueue[0].cover);
  }
  const statusEl = document.getElementById('ipodStatus');
  if (statusEl) statusEl.innerText = "SHUFFLED";
}

function ipodAdjustVolume(delta) {
  const audioPlayer = document.getElementById('ipodAudioPlayer');
  const videoPlayer = document.getElementById('ipodPodVideoPlayer');
  const activePlayer = (currentMediaType === 'video') ? videoPlayer : audioPlayer;

  if (!activePlayer) return;

  let newVolume = activePlayer.volume + delta;
  activePlayer.volume = Math.min(1, Math.max(0, newVolume));
  window.ipodCurrentVolume = activePlayer.volume; 
  const statusEl = document.getElementById('ipodStatus');

  if (statusEl) {
    const volPercent = Math.round(activePlayer.volume * 100);
    statusEl.innerText = `VOL: ${volPercent}%`;
    
    clearTimeout(window._volTimeout);
    window._volTimeout = setTimeout(() => {
      if (!activePlayer.paused) {
        statusEl.innerText = currentMediaType === 'video' ? "PLAYING (V)" : "PLAYING";
      } else {
        statusEl.innerText = "PAUSED";
      }
    }, 1500);
  }
}

function renderIpodPlaylist(filterType = null) {
  const playlistDiv = document.getElementById("books"); 
 
  if (!playlistDiv) return;
    playlistDiv.innerHTML = "";
    let queueToDisplay = ipodPlaylistQueue;

  if (filterType) {
    queueToDisplay = queueToDisplay.filter(item => item.type === filterType);
  }
 
  if (selectedGenres.length > 0) {
    queueToDisplay = queueToDisplay.filter(item => {
      if (!item.genres && !item.tags) return false;
      let itemTags = item.genres || item.tags || [];
      return selectedGenres.some(g => itemTags.includes(g));
    });
  }

  if (queueToDisplay.length === 0) {
    playlistDiv.innerHTML = `<div class="text-xs text-emerald-400/50 italic p-2">No trace found with the selected filters.</div>`;
    return;
  }

  queueToDisplay.forEach((item, index) => {
    let typeIcon = "🎵"; 
    if (item.type === 'video') typeIcon = "🎬";
    else if (item.type === 'image' || item.type === 'photo') typeIcon = "🖼️";

    const isActive = (index === ipodIndex);

    const div = document.createElement("div");
    div.className = `book flex justify-between items-center group py-1.5 px-2 rounded transition-colors ${isActive ? 'bg-emerald-900/60 border-emerald-500/50' : 'hover:bg-emerald-950/30'}`;

    const span = document.createElement("span");
    span.className = `truncate flex-1 cursor-pointer pr-2 font-mono text-xs flex items-center gap-1.5 ${isActive ? 'text-emerald-200 font-bold' : 'text-emerald-300/90 hover:text-emerald-200'}`;
    
    let displayLabel = item.artist ? `${item.artist} - ${item.label}` : item.label;
    span.innerHTML = `<span class="opacity-80">${typeIcon}</span> <span class="truncate">${index + 1}. ${displayLabel}</span>`;
    span.title = `${item.url} (${item.type})`;
    
    span.onclick = () => {
      ipodIndex = index;
      loadIntoIpod(item.url, item.type, item.label, item.artist, item.cover);
    };

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity";

    const btnRemove = document.createElement("button");
    btnRemove.className = "text-emerald-500/60 hover:text-red-400 font-mono text-xs px-1.5 py-0.5 rounded transition-colors cursor-pointer";
    btnRemove.textContent = "✕";
    btnRemove.title = "Remove from queue";
    btnRemove.onclick = (e) => {
      e.stopPropagation(); 
      ipodPlaylistQueue.splice(index, 1);
      if (ipodIndex >= ipodPlaylistQueue.length) ipodIndex = Math.max(0, ipodPlaylistQueue.length - 1);
      renderIpodPlaylist();
    };

    actionsDiv.appendChild(btnRemove);
    div.appendChild(span);
    div.appendChild(actionsDiv);
    playlistDiv.appendChild(div);
  });
}


// ==========================================
// 3. INTEGRAZIONE NOSTR (KIND 36787) - AGGIORNATA
// ==========================================

async function fetchNostrTracks() {
  const statusEl = document.getElementById('nostrStatus');
  const trackListEl = document.getElementById('nostrTrackList');
  const authorInput = document.getElementById('nostrSearchAuthor');
  
  if (statusEl) statusEl.innerText = "Connection to Relays in progress...";
  if (trackListEl) trackListEl.innerHTML = "";
  let filter = { kinds: [36787], limit: 20 };
  if (authorInput && authorInput.value.trim() !== "") {
    let authorVal = authorInput.value.trim();
    let pubkeyHex = authorVal;

    if (/^[0-9a-fA-F]{64}$/.test(pubkeyHex)) {
      if (statusEl) statusEl.innerText = "Search by author (36787)...";
      fetchNostrTracksByAuthor(pubkeyHex);
      return; 
    }
    else {authorInput.value=""}
  }

  const socket = new WebSocket(NOSTR_RELAYS[1]);

  socket.onopen = () => {
    if (statusEl && !filter.authors) statusEl.innerText = "Track Search Event 36787...";
    const req = JSON.stringify([
      "REQ", 
      "baita_music_sub", 
      filter
    ]);
    socket.send(req);
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data[0] === "EVENT" && data[2]) {
      const nostrEvent = data[2];                                   
      const dTagEntry = nostrEvent.tags.find(t => t[0] === 'd');
      if (!dTagEntry || !dTagEntry[1]) return;               
      const dTagValue = dTagEntry[1];                        
      
      if (!seenTrackIds.has(dTagValue)) {                    
        seenTrackIds.add(dTagValue);                           
        parseAndAddNostrTrack(nostrEvent);
        renderDynamicTagSidebar();
      }
    } else if (data[0] === "EOSE") {
      if (statusEl) statusEl.innerText = `Found ${nostrTracks.length} tracks...`;
      renderDynamicTagSidebar();
      socket.close();
    }
  };
  
  socket.onerror = () => {
    if (statusEl) statusEl.innerText = "Connection error";
  };
}

function parseAndAddNostrTrack(event) {
  const tags = event.tags || [];
  const mediaTag = tags.find(t => t[0] === 'media' || t[0] === 'url' || t[0] === 'audio');
  const fallbackTag = tags.find(t => t[0] === 'fallback' || t[0] === 'alt_url');
  let imetaUrls = [];
  tags.filter(t => t[0] === 'imeta').forEach(t => {
    t.slice(1).forEach(param => {
      if (param.startsWith('url ')) imetaUrls.push(param.replace('url ', ''));
      if (param.startsWith('fallback ')) imetaUrls.push(param.replace('fallback ', ''));
    });
  });

  const titleTag = tags.find(t => t[0] === 'title' || t[0] === 'name' || t[0] === 'd');
  const artistTag = tags.find(t => t[0] === 'artist' || t[0] === 'author');
  const imageTag = tags.find(t => t[0] === 'image' || t[0] === 'picture' || t[0] === 'cover'); 
  const genreTags = tags.filter(t => t[0] === 't' || t[0] === 'genre').map(t => t[1].toLowerCase());

  let urls = [];
  if (mediaTag && mediaTag[1]) urls.push(mediaTag[1]);
  if (fallbackTag && fallbackTag[1]) urls.push(fallbackTag[1]);
  imetaUrls.forEach(u => { if (!urls.includes(u)) urls.push(u); });

  if (urls.length === 0) return;

  const cleanText = (text, fallback) => {
    if (!text) return fallback;
    let cleaned = text.replace(/['">\s]+$/, '').replace(/^['">\s]+/, '');
    return cleaned.trim() || fallback;
  };

  const track = {
    id: event.id,
    pubkey: event.pubkey, 
    title: cleanText(titleTag ? titleTag[1] : "", "Track Music"),
    artist: cleanText(artistTag ? artistTag[1] : "", "Anon Artist"),
    cover: imageTag ? imageTag[1] : "",
    url: urls[0],        
    fallbacks: urls.slice(1), 
    type: 'audio',
    genres: genreTags
  };

  nostrTracks.push(track);

  let existingIndex = ipodPlaylistQueue.findIndex(item => item.url === track.url);
  if (existingIndex === -1) {
    ipodPlaylistQueue.push({
      url: track.url,
      fallbacks: track.fallbacks,
      type: 'audio',
      label: track.title,
      artist: track.artist,
      pubkey: track.pubkey,
      cover: track.cover,
      genres: genreTags
    });
  }

  renderNostrTracksList(); 
  renderIpodPlaylist();
}


function renderNostrTracksList() {
  const trackListEl = document.getElementById('nostrTrackList');
  if (!trackListEl) return;
  trackListEl.innerHTML = "";

  const titleQuery = document.getElementById('nostrSearchTitle')?.value.toLowerCase().trim() || "";
  let authorRaw = document.getElementById('nostrSearchAuthor')?.value.trim() || "";
  const authorQuery =  authorRaw.toLowerCase();

  nostrTracks.forEach((track) => {
    const titleMatch = track.title.toLowerCase().includes(titleQuery);
    const authorMatch = track.artist.toLowerCase().includes(authorQuery) || 
                        track.pubkey.toLowerCase().includes(authorQuery);
    
    if (!titleMatch || !authorMatch) return; 

    const card = document.createElement('div');
    card.className = 'nostr-track-card';
    card.dataset.url = track.url;
    if (window.currentPlayingUrl === track.url) {
      card.classList.add('is-playing');
    }
    
    card.onclick = () => {
      let queueIndex = ipodPlaylistQueue.findIndex(item => item.url === track.url);
      if (queueIndex !== -1) {
        ipodIndex = queueIndex;
      }
      playNostrTrack(track);
    };

    const fallbackCover = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="%23a78bfa"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';

    const img = document.createElement('img');
    img.src = track.cover || fallbackCover;
    img.className = 'nostr-track-cover';
    img.onerror = function() {
      this.src = fallbackCover;
    };

    const meta = document.createElement('div');
    meta.className = 'nostr-track-meta';
    meta.innerHTML = `
      <div class="nostr-track-title">${escapeHtml(track.title)}</div>
      <div class="nostr-track-artist">${escapeHtml(track.artist)}</div>
    `;

    const filterBtn = document.createElement('button');
    filterBtn.className = 'nostr-filter-author-btn';
    filterBtn.title = "Filtra per questo autore";
    filterBtn.innerText = "👤";
    filterBtn.onclick = (e) => {
      e.stopPropagation();
      const authorInput = document.getElementById('nostrSearchAuthor');
      if (authorInput) {
        authorInput.value = track.pubkey; 
        filterNostrTracks(); 
      }
    };

    const playIcon = document.createElement('div');
    playIcon.className = 'nostr-play-icon';
    playIcon.innerText = '▶';

    card.appendChild(img);
    card.appendChild(meta);
    card.appendChild(filterBtn);
    card.appendChild(playIcon);

    trackListEl.appendChild(card);
  });
}

function filterNostrTracks() {
  renderNostrTracksList();
}

window.currentPlayingUrl = null;

function playNostrTrack(track) {
  window.currentPlayingUrl = track.url;  
  document.querySelectorAll('.nostr-track-card').forEach(card => {
    if (card.dataset.url === track.url) {
      card.classList.add('is-playing');
    } else {
      card.classList.remove('is-playing');
    }
  });

  loadIntoIpod(track.url, 'audio', track.title, track.artist, track.cover);
}

function updateActiveTrackUI(playingUrl) {
  window.currentPlayingUrl = playingUrl;
  
  document.querySelectorAll('.nostr-track-card').forEach(card => {
    if (card.dataset.url === playingUrl) {
      card.classList.add('is-playing');
    } else {
      card.classList.remove('is-playing');
    }
  });

  document.querySelectorAll('.book').forEach(book => {
    if (book.dataset.url === playingUrl) {
      book.classList.add('is-playing');
    } else {
      book.classList.remove('is-playing');
    }
  });
}


async function fetchNostrTracksByAuthor(pubkeyHex) {
  const statusEl = document.getElementById('nostrStatus');
  if (statusEl) statusEl.innerText = `Search by author: ${pubkeyHex.slice(0, 8)}...`;
  const trackListEl = document.getElementById('nostrTrackList');
  const socket = new WebSocket(NOSTR_RELAYS[2]);
  socket.onopen = () => {
    const req = JSON.stringify([
      "REQ", 
      "baita_author_sub", 
      { kinds: [36787], authors: [pubkeyHex], limit: 20 }
    ]);
    socket.send(req);
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data[0] === "EVENT" && data[2]) {
      const eventObj = data[2];
      const dTagEntry = eventObj.tags.find(t => t[0] === 'd');
      if (!dTagEntry || !dTagEntry[1]) return; 
      const dTagValue = dTagEntry[1];
      
      if (!seenTrackIds.has(dTagValue)) {
        seenTrackIds.add(dTagValue); 
        parseAndAddNostrTrack(eventObj);
        renderDynamicTagSidebar();
      }
    } else if (data[0] === "EOSE") {
      if (statusEl) statusEl.innerText = `Found ${nostrTracks.length} tracks...`;
      renderDynamicTagSidebar();
      socket.close();
    }
  };
  
  socket.onerror = () => {
    if (statusEl) statusEl.innerText = "Connection error";
  };
}

// ==========================================
// 4. EVENT LISTENERS E INIZIALIZZAZIONE
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  initVlcQueue(true);

  const audioPlayer = document.getElementById('ipodAudioPlayer');
  if (audioPlayer) {
    audioPlayer.volume = window.ipodCurrentVolume;

    audioPlayer.addEventListener('timeupdate', () => {
      if (!audioPlayer.duration) return;
      updateProgressBar(audioPlayer.currentTime, audioPlayer.duration);
    });

    audioPlayer.addEventListener('ended', () => {
      ipodNextMedia();
    });

    audioPlayer.addEventListener('loadedmetadata', () => {
      const durationEl = document.getElementById('ipodDuration');
      if (durationEl && audioPlayer.duration) {
        const m = Math.floor(audioPlayer.duration / 60);
        const s = Math.floor(audioPlayer.duration % 60);
        durationEl.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }
    });
  }

  const progressTrack = document.querySelector('.ipod-progress-track');
  if (progressTrack) {
    progressTrack.style.cursor = 'pointer';
    progressTrack.addEventListener('click', (e) => {
      const rect = progressTrack.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const percentage = clickX / width;

      let activePlayer = (currentMediaType === 'video') ? document.getElementById('ipodPodVideoPlayer') : document.getElementById('ipodAudioPlayer');

      if (activePlayer && activePlayer.duration) {
        activePlayer.currentTime = percentage * activePlayer.duration;
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;

    let activePlayer = (currentMediaType === 'video') ? document.getElementById('ipodPodVideoPlayer') : document.getElementById('ipodAudioPlayer');
    const jumpTime = 5; 
    const volumeStep = 0.1; 

    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (!activePlayer || !activePlayer.duration) return;
      activePlayer.currentTime = Math.min(activePlayer.duration, activePlayer.currentTime + jumpTime);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (!activePlayer || !activePlayer.duration) return;
      activePlayer.currentTime = Math.max(0, activePlayer.currentTime - jumpTime);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      ipodAdjustVolume(volumeStep);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      ipodAdjustVolume(-volumeStep);
    } else if (e.key === " ") {
      e.preventDefault();
      ipodTogglePlay();
    }
  });
});

function updateProgressBar(currentTime, duration) {
  const percent = (currentTime / duration) * 100;
  const progressBar = document.getElementById('ipodProgressBar');
  if (progressBar) {
    progressBar.style.width = percent + '%';
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentTimeEl = document.getElementById('ipodCurrentTime');
  const durationEl = document.getElementById('ipodDuration');
  
  if (currentTimeEl) currentTimeEl.innerText = formatTime(currentTime);
  if (durationEl) durationEl.innerText = formatTime(duration);
}

function toggleIpodShelf() {
  const shelf = document.getElementById('shelf');
  const overlay = document.getElementById('sidebarOverlay');
  
  if (shelf) {
    shelf.classList.toggle('collapsed');
  }
  
  if (overlay) {
    overlay.classList.toggle('opacity-0');
    overlay.classList.toggle('pointer-events-none');
  }
}

window.filterAndOpenIpodShelf = function(type) {
  const shelf = document.getElementById('shelf');

  if (shelf && (shelf.classList.contains('hidden') || shelf.classList.contains('collapsed'))) {
    toggleIpodShelf();
  }
  
  if (typeof renderIpodPlaylist === 'function') {
    renderIpodPlaylist(type);
  }
};

let selectedGenres = [];

function toggleGenreFilter(genre) {
  if (genre === null) {
    selectedGenres = [];
    fetchNostrTracks(); 
  } else {
    const index = selectedGenres.indexOf(genre);
    if (index > -1) {
      selectedGenres.splice(index, 1);
    } else {
      selectedGenres.push(genre);
    }
    fetchNostrTracksByTag(selectedGenres);
  }
  updateGenreButtonStyles();
}

async function fetchNostrTracksByTag(tags) {
  if (tags.length === 0) return fetchNostrTracks();
  const statusEl = document.getElementById('nostrStatus');
  if (statusEl) statusEl.innerText = `Search by tag: ${tags.join(', ')}...`;
  const socket = new WebSocket(NOSTR_RELAYS[0]);

  socket.onopen = () => {
    const req = JSON.stringify([
      "REQ", 
      "baita_tag_sub", 
      { kinds: [36787], "#t": tags, limit: 20 }
    ]);
    socket.send(req);
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data[0] === "EVENT" && data[2]) {
      const eventObj=data[2];
      const dTagEntry = eventObj.tags.find(t => t[0] === 'd');
      if (!dTagEntry || !dTagEntry[1]) return; 
      const dTagValue = dTagEntry[1];
      if (!seenTrackIds.has(dTagValue)) {
        seenTrackIds.add(dTagValue); 
        parseAndAddNostrTrack(data[2]);
        renderDynamicTagSidebar();
      }
    } else if (data[0] === "EOSE") {
      if (statusEl) statusEl.innerText = `Found ${nostrTracks.length} tracks...`;
      renderDynamicTagSidebar();
      socket.close();
    }
  };
}

function updateGenreButtonStyles() {
  const buttons = document.querySelectorAll('.genre-filter-btn');
  buttons.forEach(btn => {
    const g = btn.getAttribute('data-genre');
    if ((g === 'all' && selectedGenres.length === 0) || selectedGenres.includes(g)) {
      btn.className = "genre-filter-btn text-left px-2 py-1 rounded bg-emerald-900/80 text-emerald-200 font-bold border border-emerald-500/50 transition-colors text-xs flex items-center justify-between";
    } else {
      btn.className = "genre-filter-btn text-left px-2 py-1 rounded hover:bg-emerald-950/40 text-emerald-300 transition-colors text-xs flex items-center justify-between";
    }
  });
}

function renderDynamicTagSidebar() {
  const tagListContainer = document.getElementById('dynamicTagList');
  const totalCountEl = document.getElementById('nostrTotalCount');
  if (!tagListContainer) return;

  tagListContainer.innerHTML = "";
  if (totalCountEl) totalCountEl.innerText = `(${nostrTracks.length})`;

  let tagCounts = {};
  nostrTracks.forEach(track => {
    if (track.genres && Array.isArray(track.genres)) {
      track.genres.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });

  let sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);

  if (sortedTags.length === 0) {
    tagListContainer.innerHTML = `<div class="text-xs text-emerald-400/50 italic p-1">No tags found in the tracks.</div>`;
    return;
  }

  const tagIcons = {
    'music': "🎧",
    'lofi': '☕',
    'techno': '⚡',
    'hip-hop': '🎤',
    'alternative': '🎸',
    'rock': '🎸',
    'podcast': '🎙️',
    'jazz': '🎷',
    'ambient': '🌌',
    'dark ambient': '⛚',
    'electronic': '💻',
    'gruuv': '🕺',         
    'house': '🏠',          
    'tech-house': '🎛️',
    'disco': '🪩',
    'funk': '🤹',          
    'deep-house': '🌊',
    'black metal': '🦇',    
    'metal': '🤘',
    'death-metal': '💀',
    'doom-metal': '⚰️',
    'punk': '🧷',
    'goth': '🕸️',
    'synthwave': '🌆',
    'vaporwave': '🌴',
    'classical': '🎻',
    'pop': '✨',
    'rnb': '💫',
    'reggae': '🦁',
    'acoustic': '🪵'
  };

  sortedTags.forEach(tag => {
    let icon = tagIcons[tag.toLowerCase()] || '🏷️';
    let count = tagCounts[tag];
    let isSelected = selectedGenres.includes(tag);

    const btn = document.createElement('button');
    btn.className = `genre-filter-btn text-left px-2 py-1 rounded transition-colors text-xs flex items-center justify-between ${
      isSelected 
        ? 'bg-emerald-900/80 text-emerald-200 font-bold border border-emerald-500/50' 
        : 'hover:bg-emerald-950/40 text-emerald-300'
    }`;
    btn.setAttribute('data-genre', tag);
    btn.innerHTML = `
      <span class="flex items-center gap-1.5 truncate"><span>${icon}</span> <span class="capitalize">${escapeHtml(tag)}</span></span>
      <span class="text-[10px] opacity-60 font-mono">(${count})</span>
    `;
    
    btn.onclick = () => toggleGenreFilter(tag);
    tagListContainer.appendChild(btn);
  });
}