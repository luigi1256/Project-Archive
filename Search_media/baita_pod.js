// ==========================================
// BAITA POD - BRIDGE CONNECTOR (Libreria <-> iPod)
// ==========================================

let ipodCurrentPlaylist = [];
let ipodIndex = 0;
let currentMediaType = 'audio'; 

if (typeof window.ipodCurrentVolume === 'undefined') {
  window.ipodCurrentVolume = 1.0;
}

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

function loadIntoIpod(url, type, label = '') {
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
  subtitleEl.innerText = type.toUpperCase();
  screenContent.innerHTML = '';

  if (type === 'audio') {
    if (progressArea) progressArea.style.display = 'block';

    audioPlayer.src = url;
    audioPlayer.volume = window.ipodCurrentVolume;
    audioPlayer.play().then(() => {
      statusEl.innerText = "PLAYING";
      if (centerBtn) centerBtn.innerText = "PAUSE";
    }).catch(e => statusEl.innerText = "STANDBY");

    screenContent.innerHTML = `<div style="color: var(--baita-accent-green); font-size: 11px;">🎵 Audio in riproduzione</div>`;
  
  } else if (type === 'video') {
    if (progressArea) progressArea.style.display = 'block';

    videoPlayer = document.createElement('video');
    videoPlayer.id = 'ipodPodVideoPlayer';
    videoPlayer.src = url;
    videoPlayer.playsInline = true;
    videoPlayer.autoplay = true;
    videoPlayer.volume = window.ipodCurrentVolume;
    videoPlayer.style.cssText = "width: 100%; height: 100%; max-height: 120px; object-fit: contain; border-radius: 4px; background: #000; margin: auto;";
    
    screenContent.appendChild(videoPlayer);

    videoPlayer.play().then(() => {
      statusEl.innerText = "PLAYING (V)";
      if (centerBtn) centerBtn.innerText = "PAUSE";
    }).catch(e => {
      statusEl.innerText = "TAP PLAY";
      if (centerBtn) centerBtn.innerText = "PLAY";
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
      <div style="display: flex !important; align-items: center !important; justify-content: center !important; width: 100% !important; height: 100% !important; max-height: 120px !important; overflow: hidden !important; background: #000 !important; border-radius: 4px !important;">
        <img src="${url}" style="max-height: 110px !important; max-width: 100% !important; width: auto !important; height: auto !important; object-fit: contain !important; display: block !important; margin: auto !important;">
      </div>
    `;
  }
} 

const originalPreviewMediaItem = window.previewMediaItem;
window.previewMediaItem = function(url, type) {
  if (typeof originalPreviewMediaItem === 'function') {
    originalPreviewMediaItem(url, type);
  }
  loadIntoIpod(url, type);
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
  let books = JSON.parse(localStorage.getItem("nostr_shelf")) || {};
  let keys = Object.keys(books).filter(isValidMediaKey);
  if (keys.length === 0) return;
  
  ipodIndex = (ipodIndex + 1) % keys.length;
  let nextUrl = keys[ipodIndex];
  let rType = typeof detectResourceType === 'function' ? detectResourceType(nextUrl) : 'audio';
  loadIntoIpod(nextUrl, rType);
}

function ipodPrevMedia() {
  let books = JSON.parse(localStorage.getItem("nostr_shelf")) || {};
  let keys = Object.keys(books).filter(isValidMediaKey);
  if (keys.length === 0) return;
  
  ipodIndex = (ipodIndex - 1 + keys.length) % keys.length;
  let prevUrl = keys[ipodIndex];
  let rType = typeof detectResourceType === 'function' ? detectResourceType(prevUrl) : 'audio';
  loadIntoIpod(prevUrl, rType);
}

function ipodToggleShuffle() {
  const statusEl = document.getElementById('ipodStatus');
  if (statusEl) {
    statusEl.innerText = statusEl.innerText === "SHUFFLE" ? "PLAYING" : "SHUFFLE";
  }
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
  let mediaShelf = JSON.parse(localStorage.getItem("nostr_shelf")) || {};
  let keys = Object.keys(mediaShelf).filter(isValidMediaKey);

  if (filterType) {
    keys = keys.filter(url => {
      let rType = typeof detectResourceType === 'function' ? detectResourceType(url) : 'audio';
      return rType === filterType;
    });
  }

  if (keys.length === 0) {
    playlistDiv.innerHTML = `<div class="text-xs text-emerald-400/50 italic p-2">Nessun media in playlist.</div>`;
    return;
  }

  keys.forEach((url, index) => {
    const item = mediaShelf[url];
    const label = (typeof item === 'object' && item.label) ? item.label : url.split('/').pop();
    
    let rType = typeof detectResourceType === 'function' ? detectResourceType(url) : 'audio';

    let typeIcon = "🎵"; 
    if (rType === 'video') {
      typeIcon = "🎬";
    } else if (rType === 'image' || rType === 'photo') {
      typeIcon = "🖼️";
    }

    const div = document.createElement("div");
    // Usiamo group per coordinare l'apparizione del bottone di chiusura al passaggio del mouse sulla riga
    div.className = "book flex justify-between items-center group py-1 px-1.5 rounded hover:bg-emerald-950/30 transition-colors";

    // 1. Elemento testuale/URL (cliccabile per riprodurre il media)
    const span = document.createElement("span");
    span.className = "truncate flex-1 cursor-pointer pr-2 font-mono text-xs flex items-center gap-1.5 text-emerald-300/90 hover:text-emerald-200 transition-colors";
    
    span.innerHTML = `<span class="opacity-80">${typeIcon}</span> <span class="truncate">${label}</span>`;
    span.title = `${url} (${rType})`;
    
    span.onclick = () => {
      ipodIndex = index;
      loadIntoIpod(url, rType, label);
    };

  
    const btn = document.createElement("button");
    btn.className = "text-emerald-500/60 hover:text-red-400 font-mono text-xs px-1.5 py-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer";
    btn.textContent = "✕";
    btn.title = "Rimuovi dalla playlist";
    btn.onclick = (e) => {
      e.stopPropagation(); 
      removeIpodMedia(e, url);
    };

    div.appendChild(span);
    div.appendChild(btn);
    playlistDiv.appendChild(div);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderIpodPlaylist();

  const audioPlayer = document.getElementById('ipodAudioPlayer');
  if (audioPlayer) {
    audioPlayer.volume = window.ipodCurrentVolume;

    audioPlayer.addEventListener('timeupdate', () => {
      if (!audioPlayer.duration) return;
      updateProgressBar(audioPlayer.currentTime, audioPlayer.duration);
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