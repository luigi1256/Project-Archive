import { SimplePool, generateSecretKey, getPublicKey, finalizeEvent } from 'https://esm.sh/nostr-tools@2.10.3';
import "./cache.js"
import QRCode from 'https://esm.sh/qrcode';
                                            
export async function sendLike(generalRelays, target, targetAuthorPubkey) {
    if (!window.nostr) {
        alert("Estensione NIP-07 non trovata (installa Alby o Nos2x).");
        return;
    }
    
    try {
        const pubkey = await window.nostr.getPublicKey();
        const tags = [["p", targetAuthorPubkey]];
        
        if (target.isAddressable && target.coordinate && target.kind) {
            tags.push(["a", target.coordinate]);
            tags.push(["k", target.kind.toString()]);
        } else if (target.id && target.kind !== undefined) {
            tags.push(["e", target.id, target.relay || ""]);
            tags.push(["k", target.kind.toString()]);
        } else {
            tags.push(["e", target]);
            tags.push(["k", "1"]);
        }

        const unsignedEvent = {
            kind: 7,
            pubkey: pubkey,
            created_at: Math.floor(Date.now() / 1000),
            tags: tags,
            content: "+" 
        };

        const signedEvent = await window.nostr.signEvent(unsignedEvent);
        await publishSignedToRelays(generalRelays, signedEvent);
        
        alert("Like inviato con successo! 💙");

    } catch (err) {
        console.error("Errore durante l'invio del like:", err);
        alert(err.message || "Operazione annullata o errore di firma.");
    }
}


async function publishSignedToRelays(generalRelays, signedEvent) {
    if (!generalRelays || generalRelays.length === 0) {
        throw new Error("Nessun relay fornito.");
    }

    const pool = new SimplePool();
    let relayResults = {};

    const publishPromises = pool.publish(generalRelays, signedEvent);
    const results = await Promise.allSettled(publishPromises);

    let successCount = 0;
    let failedRelays = [];
    
    results.forEach((res, index) => {
        const relayUrl = generalRelays[index];
        
        if (res.status === 'fulfilled') {
            relayResults[relayUrl] = 'success';
            successCount++;
        } else {
            relayResults[relayUrl] = res.reason?.message || 'errore sconosciuto';
            failedRelays.push(`${relayUrl}: ${relayResults[relayUrl]}`);
        }
    });
    
    if (successCount === 0) {
        throw new Error(`Nessun relay ha accettato l'evento. Falliti: ${failedRelays.join(', ')}`);
    }
    
    return relayResults;
}



export async function prepareZapTarget(generalRelays, targetAuthorPubkey) {
    const pool = new SimplePool();

    let profileData = null;

    if (typeof getProfileFromCache === 'function') {
        profileData = getProfileFromCache(targetAuthorPubkey);
    }
    if (!profileData) {
        const profileEvent = await pool.get(generalRelays, { kinds: [0], authors: [targetAuthorPubkey] });
        if (!profileEvent) {
            throw new Error("Profilo dell'autore non trovato sui relay.");
        }
        profileData = JSON.parse(profileEvent.content);
        
    }

    const lud16 = profileData.lud16;
    if (!lud16) {
        throw new Error("L'autore non ha configurato un indirizzo Lightning (lud16).");
    }

    const [name, domain] = lud16.split('@');
    const lnurlpUrl = `https://${domain}/.well-known/lnurlp/${name}`;
    const res = await fetch(lnurlpUrl);
    const lnurlData = await res.json();
    if (lnurlData.status === 'ERROR') {
        throw new Error(`Errore LNURL: ${lnurlData.reason}`);
    }
    return {
        lud16,
        callback: lnurlData.callback,
        minSendable: lnurlData.minSendable,
        maxSendable: lnurlData.maxSendable
    };
}

export async function sendZapPrepared(generalRelays, target, targetAuthorPubkey, amountSats, zapTargetData, qrContainerElement = null) {
    if (!qrContainerElement) {
        qrContainerElement = document.getElementById('qr-container');
    }

    if (!qrContainerElement) {
        console.error("ERRORE: qrContainerElement è null o non trovato!");
        return;
    }

    const millisats = amountSats * 1000;

    if (millisats < zapTargetData.minSendable || millisats > zapTargetData.maxSendable) {
        alert(`Importo non valido. Minimo: ${zapTargetData.minSendable / 1000} sats, Massimo: ${zapTargetData.maxSendable / 1000} sats.`);
        return;
    }

    try {
        let userPubkey;
        let signedZapRequest;

        // 1. NIP-07 o Fallback Burner Key (Anonimo)
        if (window.nostr) {
            userPubkey = await window.nostr.getPublicKey();

            const zapRequest = {
                kind: 9734,
                pubkey: userPubkey,
                created_at: Math.floor(Date.now() / 1000),
                content: "",
                tags: [
                    ["p", targetAuthorPubkey],
                    ["amount", millisats.toString()],
                    ["relays", ...generalRelays]
                ]
            };

            if (target.isAddressable && target.coordinate) {
                zapRequest.tags.push(["a", target.coordinate]);
            } else if (target.id) {
                zapRequest.tags.push(["e", target.id]);
            }

            signedZapRequest = await window.nostr.signEvent(zapRequest);
        } else {
            console.warn("Nessuna estensione NIP-07. Uso una chiave temporanea...");
            
            const burnerSecretKey = generateSecretKey();
            userPubkey = getPublicKey(burnerSecretKey);

            const zapRequest = {
                kind: 9734,
                pubkey: userPubkey,
                created_at: Math.floor(Date.now() / 1000),
                content: "",
                tags: [
                    ["p", targetAuthorPubkey],
                    ["amount", millisats.toString()],
                    ["relays", ...generalRelays]
                ]
            };

            if (target.isAddressable && target.coordinate) {
                zapRequest.tags.push(["a", target.coordinate]);
            } else if (target.id) {
                zapRequest.tags.push(["e", target.id]);
            }

            signedZapRequest = finalizeEvent(zapRequest, burnerSecretKey);
        }

        // 2. Pubblica la richiesta sui relay in background
        publishSignedToRelays(generalRelays, signedZapRequest).catch(err => {
            console.warn("Avviso pubblicazione richiesta zap:", err);
        });

        // 3. Richiedi la fattura BOLT11
        const callbackUrl = `${zapTargetData.callback}?amount=${millisats}&nostr=${encodeURIComponent(JSON.stringify(signedZapRequest))}`;
        const invoiceRes = await fetch(callbackUrl);
        const invoiceData = await invoiceRes.json();

        if (invoiceData.status === 'ERROR') {
            throw new Error(`Errore invoice: ${invoiceData.reason}`);
        }

        const bolt11 = invoiceData.pr;
        const verifyUrl = invoiceData.verify || null;

        // 4. GENERAZIONE QR CODE (qui mancava!)
        qrContainerElement.innerHTML = ''; // Pulisci eventuali QR precedenti
        const canvas = document.createElement('canvas');
        qrContainerElement.appendChild(canvas);

        QRCode.toCanvas(canvas, bolt11, {
            width: 200,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
        }, (error) => {
            if (error) {
                console.error("Errore generazione QR:", error);
                qrContainerElement.innerHTML = `<p style="color:red; font-size:12px;">Errore generazione QR</p>`;
            }
        });

        // Restituisce i dati necessari alla modale per il bottone "Ho pagato"
        return { bolt11, verifyUrl };

    } catch (err) {
        console.error("Errore durante l'invio dello zap:", err);
        alert(err.message || "Errore imprevisto durante lo zap.");
    }
}





















































