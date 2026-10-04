const CACHE_PREFIX = 'nostr_profile_';

function getProfileFromCache(key) {
    if (!key) return null;

    try {
        const item = localStorage.getItem(CACHE_PREFIX + key);
        if (item) return JSON.parse(item);
    } catch(e) {}
    
    if (key.startsWith('npub')) {
        try {
            const decoded = nip19.decode(key);
            if (decoded.type === 'npub') {
                const hexItem = localStorage.getItem(CACHE_PREFIX + decoded.data);
                if (hexItem) return JSON.parse(hexItem);
            }
        } catch(e) {}
    }

    try {
        const npubKey = nip19.npubEncode(key);
        const npubItem = localStorage.getItem(CACHE_PREFIX + npubKey);
        if (npubItem) return JSON.parse(npubItem);
    } catch(e) {}
    
    return null;
}

function setProfileCache(key, profile) {
    if (!key || !profile) return;
    
    const profileString = JSON.stringify(profile);
    localStorage.setItem(CACHE_PREFIX + key, profileString);
    if (key.startsWith('npub')) {
        try {
            const decoded = nip19.decode(key);
            if (decoded.type === 'npub') {
                localStorage.setItem(CACHE_PREFIX + decoded.data, profileString);
            }
        } catch(e) {}
    } else {
        try {
            const npubKey = nip19.npubEncode(key);
            localStorage.setItem(CACHE_PREFIX + npubKey, profileString);
        } catch(e) {}
    }
}