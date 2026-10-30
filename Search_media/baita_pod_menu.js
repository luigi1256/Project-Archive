// ==========================================
// BAITA POD - MENU & UTILS ENGINE
// ==========================================

window.removeIpodMedia = function(event, url) {
  event.stopPropagation();
  let mediaShelf = JSON.parse(localStorage.getItem("nostr_shelf")) || {};
  delete mediaShelf[url];
  localStorage.setItem("nostr_shelf", JSON.stringify(mediaShelf));
  
  localStorage.removeItem(`profile_${url}`);
  localStorage.removeItem(`note_${url}`);
  localStorage.removeItem(`modfile_${url}`);
  
  if (typeof renderIpodPlaylist === 'function') {
    renderIpodPlaylist();
  }
};

function performIpodSearch() {
  const searchBar = document.getElementById("searchBar");
  if (!searchBar) return;
  
  let term = searchBar.value.trim();
  if (term === "") return;

  const urlRegex = /^https?:\/\/[^\s]+$/i;
  if (urlRegex.test(term)) {
    let mediaShelf = JSON.parse(localStorage.getItem("nostr_shelf")) || {};
    if (!mediaShelf[term]) {
      // Rileviamo il tipo per assegnare l'icona corretta nell'etichetta
      let rType = typeof detectResourceType === 'function' ? detectResourceType(term) : 'audio';
      let typeIcon = "🎵";
      if (rType === 'video') typeIcon = "🎬";
      else if (rType === 'image' || rType === 'photo') typeIcon = "🖼️";

      mediaShelf[term] = { 
        label: `${typeIcon} ${term.replace(/^https?:\/\/(www\.)?/, '').substring(0, 22)}...`, 
        type: rType 
      };
      localStorage.setItem("nostr_shelf", JSON.stringify(mediaShelf));
      if (typeof renderIpodPlaylist === 'function') {
        renderIpodPlaylist();
      }
    }
    
    let rType = typeof detectResourceType === 'function' ? detectResourceType(term) : 'audio';
    if (typeof loadIntoIpod === 'function') {
      loadIntoIpod(term, rType);
    }
    searchBar.value = "";
    return;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (typeof renderIpodPlaylist === 'function') {
    renderIpodPlaylist();
  }
});

window.addEventListener('DOMContentLoaded', () => {
  const shelf = document.getElementById('shelf');
  if (shelf && window.innerWidth < 900) {
    shelf.classList.add('collapsed');
  }
});