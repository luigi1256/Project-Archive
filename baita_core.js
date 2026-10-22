// ==========================================
// BAITA CORE - SHELF & SEARCH ENGINE
// ==========================================

function renderShelf() {
  const booksDiv = document.getElementById("books");
  if (!booksDiv) return;
  
  booksDiv.innerHTML = "";
  let books = JSON.parse(localStorage.getItem("nostr_shelf")) || {};
  const keys = Object.keys(books);

  if (keys.length === 0) {
    booksDiv.innerHTML = `<div class="text-xs text-emerald-400/50 italic p-2">Nessun elemento nello scaffale.</div>`;
    return;
  }

  for (const term of keys) {
    const item = books[term];
    const label = (typeof item === 'object' && item.label) ? item.label : term;

    const div = document.createElement("div");
    div.className = "book flex justify-between items-center group";

    const span = document.createElement("span");
    span.className = "truncate flex-1 cursor-pointer pr-2 font-mono text-xs";
    span.textContent = label;
    span.title = term;
    span.onclick = () => openNostrClient(term);

    const btn = document.createElement("button");
    btn.className = "text-emerald-200 hover:text-red-400 font-mono text-xs px-1.5 py-0.5 rounded transition-colors opacity-70 group-hover:opacity-100 cursor-pointer";
    btn.textContent = "✕";
    btn.title = "Rimuovi dallo scaffale";
    btn.onclick = (e) => removeBook(e, term);

    div.appendChild(span);
    div.appendChild(btn);
    booksDiv.appendChild(div);
  }
}

window.removeBook = function(event, term) {
  event.stopPropagation();
  let books = JSON.parse(localStorage.getItem("nostr_shelf")) || {};
  delete books[term];
  localStorage.setItem("nostr_shelf", JSON.stringify(books));
  
  localStorage.removeItem(`profile_${term}`);
  localStorage.removeItem(`note_${term}`);
  localStorage.removeItem(`modfile_${term}`);
  
  renderShelf();
};

function openNostrClient(term) {
  let cleanTerm = term.replace(/^nostr:/i, "").trim();

  if (cleanTerm.startsWith("npub1") || cleanTerm.startsWith("nprofile1")) {
    window.location.href = `profile.html?npub=${encodeURIComponent(cleanTerm)}`;
  } else if (cleanTerm.startsWith("note1") || cleanTerm.startsWith("nevent1")) {
    window.location.href = `note.html?nevent=${encodeURIComponent(cleanTerm)}`;
  } else if (cleanTerm.startsWith("naddr1")) {
    window.location.href = `modfile.html?naddr=${encodeURIComponent(cleanTerm)}`;
  } else if (cleanTerm.startsWith("http://") || cleanTerm.startsWith("https://")) {
    window.open(cleanTerm, '_blank');
  } else {
    
    if (cleanTerm.startsWith("#")) cleanTerm = cleanTerm.substring(1);
    window.location.href = `baita_text.html?q=${encodeURIComponent(cleanTerm)}`;
  }
}

function performSearch() {
  const searchBar = document.getElementById("searchBar");
  if (!searchBar) return;
  
  let term = searchBar.value.trim();
  if (term === "") return;

  const urlRegex = /^https?:\/\/[^\s]+$/i;
  if (urlRegex.test(term)) {
    let books = JSON.parse(localStorage.getItem("nostr_shelf")) || {};
    if (!books[term]) {
      books[term] = { label: `🔗 ${term.replace(/^https?:\/\/(www\.)?/, '').substring(0, 22)}...`, type: 'url' };
      localStorage.setItem("nostr_shelf", JSON.stringify(books));
      renderShelf();
    }
    window.open(term, '_blank');
    searchBar.value = "";
    return;
  }

  const nostrBech32Regex = /(nevent1[0-9a-z]+|note1[0-9a-z]+|npub1[0-9a-z]+|nprofile1[0-9a-z]+|naddr1[0-9a-z]+)/i;
  const match = term.match(nostrBech32Regex);
  if (match) {
    term = match[1];
  }

  let books = JSON.parse(localStorage.getItem("nostr_shelf")) || {};
  if (!books[term]) {
    let prefixIcon = '🔍';
    if (term.startsWith('npub') || term.startsWith('nprofile')) prefixIcon = '👤';
    else if (term.startsWith('note') || term.startsWith('nevent')) prefixIcon = '💬';
    else if (term.startsWith('naddr')) prefixIcon = '📚';
    
    books[term] = {
      label: `${prefixIcon} ${term.length > 20 ? term.substring(0, 10) + '...' : term}`,
      type: term.startsWith('npub') || term.startsWith('nprofile') ? 'profile' : (term.startsWith('naddr') ? 'modfile' : 'text')
    };
    localStorage.setItem("nostr_shelf", JSON.stringify(books));
    renderShelf();
  }

  openNostrClient(term);
  searchBar.value = "";
}

function parseContent(text) {
  if (!text) return "";
  let parsed = text;

  const urlRegex = /(?<!href="|src=")(https?:\/\/[^\s]+)/g;
  parsed = parsed.replace(urlRegex, (url) => {
    let clean = url.replace(/[.,!?)]$/, '');
    let trailing = url.slice(clean.length);
    
    if (/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(clean)) {
      return `<br><a href="${clean}" target="_blank" title="Clicca per ingrandire"><img src="${clean}" class="mt-2 max-h-60 sm:max-h-80 w-full rounded-lg object-cover border border-emerald-900/60 hover:border-emerald-500 transition-all" loading="lazy"></a><br>${trailing}`;
    }
    
    if (/\.(mp4|webm|mov)(\?.*)?$/i.test(clean)) {
      return `<br><video controls class="mt-2 max-h-60 sm:max-h-80 w-full rounded-lg border border-emerald-900/60"><source src="${clean}"></video><br>${trailing}`;
    }
    
    if (/\.(mp3|ogg|wav)(\?.*)?$|soundcloud\.com/i.test(clean)) {
      return `<br><audio controls class="mt-2 w-full"><source src="${clean}"></audio><br>${trailing}`;
    }
    
    return `<a href="${clean}" target="_blank" class="text-purple-400 hover:underline break-all" title="${clean}">${clean}</a>${trailing}`;
  });

  const nostrRegex = /(?<![a-zA-Z0-9_?&=/#"'=-])(?:nostr:)?(npub1[a-z0-9]+|nprofile1[0-9a-z]+|note1[a-z0-9]+|nevent1[0-9a-z]+|naddr1[0-9a-z]+)/gi;
  parsed = parsed.replace(nostrRegex, (match, entity) => {
    let url = '#';
    let label = entity.substring(0, 8) + '...';
    
    if (entity.startsWith('npub') || entity.startsWith('nprofile')) {
      label = '👤 ' + label;
      url = `profile.html?npub=${entity}`;
    } else if (entity.startsWith('note') || entity.startsWith('nevent')) {
      label = '💬 ' + label;
      url = `note.html?nevent=${entity}`;    
    } else if (entity.startsWith('naddr')) {
      label = '📚 ' + label;
      url = `modfile.html?naddr=${entity}`;
    }
    
    return `<a href="${url}" target="_blank" class="text-purple-400 bg-purple-950/60 border border-purple-800/60 px-1 py-0.5 rounded text-[11px] sm:text-xs inline-block font-mono hover:underline max-w-full truncate align-bottom">${label}</a>`;
  });

  const hashtagRegex = /(?<![a-zA-Z0-9_?&=/#"'=-])(#[\w-]+)/g;
  parsed = parsed.replace(hashtagRegex, (match, tag) => {
    let cleanTag = tag.substring(1); 
    let url = `baita_text.html?q=${encodeURIComponent(cleanTag)}`;
    return `<a href="${url}" class="text-emerald-400 hover:underline font-semibold">${tag}</a>`;
  });

  return parsed;
}


function toggleShelf() {
  const shelf = document.getElementById('shelf');
  const overlay = document.getElementById('sidebarOverlay');
  if (shelf) shelf.classList.toggle('collapsed');
  
  if (overlay) {
    overlay.classList.toggle('opacity-0');
    overlay.classList.toggle('pointer-events-none');
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderShelf();
});