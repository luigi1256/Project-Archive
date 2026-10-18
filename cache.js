const CACHE_PREFIX = 'nostr_profile_';
const SEARCH_INDEX_KEY = 'nostr_search_index';

function getProfileFromCache(hexKey) {
    if (!hexKey) return null;

    try {
        const item = localStorage.getItem(CACHE_PREFIX + hexKey);
        if (item) return JSON.parse(item);
    } catch (e) {}
    
    return null;
}

//function setProfileCache(hexKey, profile) {
//    if (!hexKey || !profile) return;
//    
//    try {
//        const profileString = JSON.stringify(profile);
//        localStorage.setItem(CACHE_PREFIX + hexKey, profileString);
//    } catch (e) {
//        if (e.name === 'QuotaExceededError') {
//            console.warn('Spazio esaurito in localStorage.');
//        }
//    }
//}


function setProfileCache(hexKey, profile) {
    if (!hexKey || !profile) return;
    try {
        localStorage.setItem(CACHE_PREFIX + hexKey, JSON.stringify(profile));
        let searchIndex = {};
        const savedIndex = localStorage.getItem(SEARCH_INDEX_KEY);
        if (savedIndex) {
            try { searchIndex = JSON.parse(savedIndex); } catch(e) {}
        }
        searchIndex[hexKey] = {
            name: (profile.name || '').toLowerCase(),
            display_name: (profile.display_name || '').toLowerCase(),
            nip05: (profile.nip05 || '').toLowerCase()
        };
        localStorage.setItem(SEARCH_INDEX_KEY, JSON.stringify(searchIndex));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            console.warn('Spazio esaurito in localStorage.');
        }
    }
}