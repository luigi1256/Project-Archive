const CACHE_PREFIX = 'nostr_profile_';

function getHexKey(key) {
    if (!key) return null;
    if (key.startsWith('npub')) {
        try {
            const decoded = nip19.decode(key);
            if (decoded.type === 'npub') return decoded.data;
        } catch (e) {
            return null;
        }
    }
    return key; 
}

function getProfileFromCache(key) {
    const hexKey = getHexKey(key);
    if (!hexKey) return null;

    try {
        const item = localStorage.getItem(CACHE_PREFIX + hexKey);
        if (item) return JSON.parse(item);
    } catch (e) {}
    
    return null;
}

function setProfileCache(key, profile) {
    const hexKey = getHexKey(key);
    if (!hexKey || !profile) return;
    
    try {
        const profileString = JSON.stringify(profile);
        localStorage.setItem(CACHE_PREFIX + hexKey, profileString);
    } catch (e) {
        
        if (e.name === 'QuotaExceededError') {
            console.warn('Spazio esaurito in localStorage.');
        }
    }
}