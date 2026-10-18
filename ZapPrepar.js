import { prepareZapTarget, sendZapPrepared } from './likes_zap.js';

const defaultRelays = [      
    'wss://relay.damus.io',  
    'wss://nos.lol',         
    'wss://relay.primal.net'     
];                           

// Aggiungiamo window. davanti per renderla accessibile dall'HTML onclick
export async function openZapModal(targetAuthorPubkey, targetEventId)  {
    // 1. Crea la modale dinamicamente al momento del click (stile Focus Mode)
    const modal = document.createElement('div');
    modal.className = 'zap-modal-overlay';
    
    modal.innerHTML = `
        <div class="zap-content" style="background: #1e1e1e; color: #fff; padding: 16px; border-radius: 8px; width: 320px; max-width: 90vw; font-family: sans-serif; box-shadow: 0 4px 20px rgba(0,0,0,0.5); position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000; max-height: 85vh; overflow-y: auto; -webkit-overflow-scrolling: touch; box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-weight: bold; color: #bb86fc; font-size: 14px;">⚡ Invia uno Zap</span>
                <button class="close-modal" style="background: #333; color: #fff; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">✕</button>
            </div>
            
            <div id="zap-status" style="font-size: 12px; color: #888; margin-bottom: 10px;">Verifica profilo autore...</div>

            <div class="zap-amounts" style="display: flex; gap: 6px; margin-bottom: 10px;">
                <button class="zap-btn" data-amount="21" style="flex:1; background:#2a2a2a; color:#fff; border:1px solid #bb86fc; padding:6px; border-radius:4px; cursor:pointer; font-size: 12px;">21</button>
                <button class="zap-btn" data-amount="100" style="flex:1; background:#333; color:#fff; border:1px solid #333; padding:6px; border-radius:4px; cursor:pointer; font-size: 12px;">100</button>
                <button class="zap-btn" data-amount="1000" style="flex:1; background:#333; color:#fff; border:1px solid #333; padding:6px; border-radius:4px; cursor:pointer; font-size: 12px;">1000</button>
            </div>

            <div style="margin-bottom: 10px;">
                <label style="font-size: 11px; color: #aaa; display: block; margin-bottom: 3px;">Sats personalizzati:</label>
                <input type="number" class="custom-zap-amount" value="21" style="width:100%; box-sizing:border-box; background:#121212; border:1px solid #333; color:#fff; padding:6px; border-radius:4px; font-size: 13px;">
            </div>

            <button class="send-zap-btn" disabled style="width:100%; background:#bb86fc; color:#121212; border:none; padding:8px; border-radius:4px; font-weight:bold; cursor:not-allowed; opacity: 0.6; font-size: 13px;">Conferma e Invia</button>
            
            <div id="qr-container" style="margin-top: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center;"></div>

            <!-- Sezione Mobile: Link Wallet, Invoice e Copia -->
            <div id="mobile-payment-section" style="display: none; margin-top: 10px; text-align: center;">
                <a id="wallet-link" href="#" style="display: block; background: #bb86fc; color: #121212; text-decoration: none; padding: 8px; border-radius: 4px; font-weight: bold; margin-bottom: 8px; font-size: 13px;">Paga con il Wallet ⚡</a>
                <p id="invoice-text" style="font-size: 10px; color: #888; word-break: break-all; background: #121212; padding: 6px; border-radius: 4px; max-height: 50px; overflow-y: auto; text-align: left; margin-bottom: 6px; font-family: monospace;"></p>
                <button id="copy-invoice-btn" style="width: 100%; background: #333; color: #fff; border: 1px solid #444; padding: 5px; border-radius: 4px; font-size: 11px; cursor: pointer;">Copia Invoice</button>
            </div>

            <button class="i-paid-btn" style="display: none; width: 100%; margin-top: 10px; background: #2a2a2a; color: #bb86fc; border: 1px solid #bb86fc; padding: 8px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 13px;">Ho pagato ⚡</button>
        </div>
    `;
     
    document.body.appendChild(modal);

    let currentZapData = null;
    let selectedAmount = 21;

    const statusEl = modal.querySelector('#zap-status');
    const sendBtn = modal.querySelector('.send-zap-btn');
    const customInput = modal.querySelector('.custom-zap-amount');
    const qrContainer = modal.querySelector('#qr-container');
    // new
    const mobileSection = modal.querySelector('#mobile-payment-section');
    const walletLink = modal.querySelector('#wallet-link');
    const invoiceText = modal.querySelector('#invoice-text');
    const copyBtn = modal.querySelector('#copy-invoice-btn');
    let currentInvoice = null;

    if (!statusEl || !sendBtn || !customInput || !qrContainer) {
    console.error("Errore: Qualche elemento della modale non è stato trovato nel DOM!", { statusEl, sendBtn, customInput, qrContainer });
}

    // 2. Gestione dei pulsanti rapidi e input
    modal.querySelectorAll('.zap-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            modal.querySelectorAll('.zap-btn').forEach(b => {
                b.style.border = '1px solid #333';
                b.style.background = '#333';
            });
            e.target.style.border = '1px solid #bb86fc';
            e.target.style.background = '#2a2a2a';
            
            selectedAmount = parseInt(e.target.dataset.amount);
            customInput.value = selectedAmount;
        });
    });

    copyBtn.addEventListener('click', () => {                     
        if (!currentInvoice) return;                              
        navigator.clipboard.writeText(currentInvoice).then(() => {
            copyBtn.innerText = "Copiato! ✓";                    
            setTimeout(() => {                                    
                copyBtn.innerText = "Copia Invoice";              
            }, 2000);                                             
        });                                                       
    });                                                           


    customInput.addEventListener('input', (e) => {
        selectedAmount = parseInt(e.target.value) || 0;
    });

    // 3. AVVIO IN BACKGROUND: Risolve il profilo e l'endpoint LNURL
    (async () => {
        try {
            currentZapData = await prepareZapTarget(defaultRelays, targetAuthorPubkey);
            statusEl.innerText = `Pronto a zappare ${currentZapData.lud16}!`;
            sendBtn.disabled = false;
            sendBtn.style.cursor = 'pointer';
            sendBtn.style.opacity = '1';
        } catch (err) {
            console.error("Errore preparazione zap:", err);
            statusEl.innerText = err.message || "L'autore non supporta gli Zap.";
        }
    })();

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    modal.querySelector('.close-modal').addEventListener('click', () => {
        modal.remove();
    });

    
    const iPaidBtn = modal.querySelector('.i-paid-btn');
let savedVerifyUrl = null;

sendBtn.addEventListener('click', async () => {
    if (!currentZapData || selectedAmount <= 0) return;

    sendBtn.disabled = true;
    statusEl.innerText = "Generazione fattura...";

    try {
        const targetEvent = { id: targetEventId }; 
        
        const result = await sendZapPrepared(
            defaultRelays, 
            targetEvent, 
            targetAuthorPubkey, 
            selectedAmount, 
            currentZapData, 
            qrContainer
        );
        
        if (result && result.bolt11) {
            currentInvoice = result.bolt11;
            walletLink.href = `lightning:${currentInvoice}`;
            invoiceText.innerText = currentInvoice;
            mobileSection.style.display = 'block';
        }

        if (result && result.verifyUrl) {
            savedVerifyUrl = result.verifyUrl;
        }

        statusEl.innerText = "Scansiona il QR e poi clicca su 'Ho pagato'";
        iPaidBtn.style.display = 'block'; 

    } catch (err) {
        console.error("Errore invio:", err);
        statusEl.innerText = "Errore durante la creazione dello zap.";
        sendBtn.disabled = false;
    }
    });

    iPaidBtn.addEventListener('click', async () => {
    iPaidBtn.disabled = true;
    iPaidBtn.innerText = "Verifica in corso...";

    
    if (savedVerifyUrl) {
        try {
            const res = await fetch(savedVerifyUrl);
            const data = await res.json();

            if (data.settled === true) {
                statusEl.innerText = "Pagamento verificato con successo! ⚡";
                iPaidBtn.innerText = "Completato!";
                setTimeout(() => modal.remove(), 2000);
                return;
            } else {
                statusEl.innerText = "Il pagamento non risulta ancora confermato. Riprova tra un attimo.";
                iPaidBtn.disabled = false;
                iPaidBtn.innerText = "Ho pagato ⚡";
                return;
            }
        } catch (e) {
            console.warn("Errore durante il fetch del verify:", e);
        }
    }

    statusEl.innerText = "Pagamento eseguito! Grazie per lo zap ⚡";
    iPaidBtn.innerText = "Fatto";
    setTimeout(() => {
        modal.remove();
    }, 1500);
});
}









