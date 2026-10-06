const CACHE_PREFIX = 'nostr_profile_';

function getProfileFromCache(hexKey) {
    if (!hexKey) return null;

    try {
        const item = localStorage.getItem(CACHE_PREFIX + hexKey);
        if (item) return JSON.parse(item);
    } catch (e) {}
    
    return null;
}

function setProfileCache(hexKey, profile) {
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