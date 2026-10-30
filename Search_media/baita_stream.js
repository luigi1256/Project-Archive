// ==========================================
// BAITA STREAM - Gestione Piattaforme & Baita Pad
// ==========================================

function isStreamPlatformUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return (
    url.includes('youtube.com') ||
    url.includes('youtu.be') ||
    url.includes('soundcloud.com') ||
    url.includes('twitch.tv') ||
    url.includes('spotify.com')
  );
}

function getStreamEmbedUrl(url) {
  if (!url) return '';
  if (url.includes('youtube.com/watch?v=')) {
    const videoId = new URL(url).searchParams.get('v');
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1&playsinline=1`;
  }
  if (url.includes('youtu.be/')) {
    const videoId = url.split('youtu.be/')[1].split('?')[0];
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1&playsinline=1`;
  }
  if (url.includes('youtube.com/embed/')) {
    let cleanUrl = url.replace('youtube.com', 'youtube-nocookie.com');
    return cleanUrl + (cleanUrl.includes('?') ? '&' : '?') + 'autoplay=1&enablejsapi=1';
  }
  if (url.includes('soundcloud.com')) {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true`;
  }
  return url;
}

document.addEventListener("DOMContentLoaded", () => {

  // 1. Intercettiamo in modo sicuro la funzione loadIntoIpod se esiste già
  if (typeof window.loadIntoIpod === 'function') {
    const originalLoadIntoIpod = window.loadIntoIpod;

    window.loadIntoIpod = function(url, type, label = '') {
      const container = document.querySelector('.ipod-container');
      const screen = document.querySelector('.ipod-screen');
      const screenContent = document.getElementById('ipodScreenContent');
      const titleEl = document.getElementById('ipodTitle');
      const subtitleEl = document.getElementById('ipodSubtitle');
      const statusEl = document.getElementById('ipodStatus');
      const centerBtn = document.getElementById('ipodCenterBtn');
      const progressArea = document.querySelector('.ipod-progress-area');

      // Se è un URL di piattaforma o di tipo stream
      if (isStreamPlatformUrl(url) || type === 'stream') {
        // Spegniamo i player nativi per evitare conflitti audio/video sotto
        const audioPlayer = document.getElementById('ipodAudioPlayer');
        let videoPlayer = document.getElementById('ipodPodVideoPlayer');
        if (audioPlayer) { audioPlayer.pause(); audioPlayer.src = ""; }
        if (videoPlayer) { videoPlayer.pause(); videoPlayer.remove(); }

        // Attiviamo la modalità tablet "Baita Pad"
        if (container) container.classList.add('baita-pad-mode');
        if (screen) screen.classList.add('baita-pad-screen');

        if (progressArea) progressArea.style.display = 'none';
        if (statusEl) statusEl.innerText = "STREAM PAD";
        if (centerBtn) centerBtn.innerText = "PLAYING";

        if (titleEl) titleEl.innerText = label || url.split('/').pop() || "Stream media";
        if (subtitleEl) subtitleEl.innerText = "BAITA PAD - TABLET VIEW";

        if (screenContent) {
          let embedUrl = getStreamEmbedUrl(url);

          let savedNotesKey = `baita_notes_${btoa(url).replace(/=/g, '')}`;
          let savedNotes = localStorage.getItem(savedNotesKey) || '';

          screenContent.innerHTML = `
            <div style="width: 100%; height: 100%; min-height: 300px; background: #050e0a; border-radius: 6px; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box; padding: 4px;">
              
              <!-- Contenitore Video / Stream in 16:9 -->
              <div style="width: 100%; height: 210px; background: #000; border-radius: 4px; overflow: hidden; flex-shrink: 0;">
                <iframe src="${embedUrl}" 
                        style="width: 100%; height: 100%; border: none;" 
                        referrerpolicy="strict-origin-when-cross-origin" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                        allowfullscreen>
                </iframe>
              </div>

              <!-- Blocco Appunti Personali / Commenti -->
              <div style="flex: 1; display: flex; flex-direction: column; gap: 4px; background: #0b1d13; border: 1px solid var(--baita-card-border, #065f46); border-radius: 4px; padding: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: var(--baita-accent-green, #10b981);">
                  <span>📝 NOTE PERSONALI / COMMENTI</span>
                  <span id="noteSaveStatus" style="opacity: 0.7;">Salvato</span>
                </div>
                <textarea id="baitaPersonalNote" 
                          placeholder="Scrivi qui i tuoi appunti o commenti per questo stream..." 
                          style="width: 100%; flex: 1; background: #04100c; color: #d1fae5; border: 1px solid #065f46; border-radius: 3px; padding: 4px; font-family: monospace; font-size: 10px; resize: none; outline: none; box-sizing: border-box;"
                >${savedNotes}</textarea>
              </div>

            </div>
          `;

          setTimeout(() => {
            const textarea = document.getElementById('baitaPersonalNote');
            const statusSpan = document.getElementById('noteSaveStatus');
            if (textarea) {
              textarea.addEventListener('input', () => {
                localStorage.setItem(savedNotesKey, textarea.value);
                if (statusSpan) {
                  statusSpan.innerText = "Salvataggio...";
                  setTimeout(() => { statusSpan.innerText = "Salvato"; }, 500);
                }
              });
            }
          }, 100);
        }
       
                                                
        return; // Interrompiamo qui perché gestito dallo stream
      }

      // Altrimenti, se è un file normale (audio, video locale, foto), rimuoviamo la modalità pad e passiamo al pod originale
      if (container) container.classList.remove('baita-pad-mode');
      if (screen) screen.classList.remove('baita-pad-screen');

      originalLoadIntoIpod(url, type, label);
    };
  }

  // 2. Aggiungiamo i link di streaming nello scaffale (se renderIpodPlaylist è disponibile)
  setTimeout(() => {
    if (typeof window.renderIpodPlaylist === 'function') {
      const originalRenderPlaylist = window.renderIpodPlaylist;
      window.renderIpodPlaylist = function(filterType = null) {
        originalRenderPlaylist(filterType);

        let mediaShelf = JSON.parse(localStorage.getItem("nostr_shelf")) || {};
        let streamKeys = Object.keys(mediaShelf).filter(isStreamPlatformUrl);

        if (filterType && filterType !== 'stream') return;

        const playlistDiv = document.getElementById("books");
        if (!playlistDiv) return;

        streamKeys.forEach((url) => {
          const item = mediaShelf[url];
          const label = (typeof item === 'object' && item.label) ? item.label : url.split('/').pop();
          let typeIcon = "📺";

          const div = document.createElement("div");
          div.className = "book flex justify-between items-center group py-1 px-1.5 rounded hover:bg-emerald-950/30 transition-colors";

          const span = document.createElement("span");
          span.className = "truncate flex-1 cursor-pointer pr-2 font-mono text-xs flex items-center gap-1.5 text-emerald-300/90 hover:text-emerald-200 transition-colors";
          span.innerHTML = `<span class="opacity-80">${typeIcon}</span> <span class="truncate">${label}</span>`;
          span.title = `${url} (stream)`;
          
          span.onclick = () => {
            loadIntoIpod(url, 'stream', label);
          };

          const btn = document.createElement("button");
          btn.className = "text-emerald-500/60 hover:text-red-400 font-mono text-xs px-1.5 py-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer";
          btn.textContent = "✕";
          btn.title = "Rimuovi dalla playlist";
          btn.onclick = (e) => {
            e.stopPropagation();
            if (typeof removeIpodMedia === 'function') {
              removeIpodMedia(e, url);
            } else {
              delete mediaShelf[url];
              localStorage.setItem("nostr_shelf", JSON.stringify(mediaShelf));
              renderIpodPlaylist(filterType);
            }
          };

          div.appendChild(span);
          div.appendChild(btn);
          playlistDiv.appendChild(div);
        });
      };

      // Aggiorniamo la playlist
      renderIpodPlaylist();
    }
  }, 100);

});