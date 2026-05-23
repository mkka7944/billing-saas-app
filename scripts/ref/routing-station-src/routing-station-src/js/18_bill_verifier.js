// === 18_bill_verifier.js ===
// Bill Verifier

const BillVerifier = {
        URL: 'https://suthra.punjab.gov.pk/verify-bill',
        open(psid = '') {
            const modal = document.getElementById('modal-verify-bill');
            const iframe = document.getElementById('verify-iframe');
            const loader = document.getElementById('verify-loader');
            const label = document.getElementById('verify-psid-label');
            
            label.innerText = psid ? `VERIFYING PSID: ${psid}` : 'EXTERNAL: SUTHRA PUNJAB';
            loader.style.display = 'flex';
            iframe.src = this.URL;
            modal.style.display = 'flex';
            
            if(psid) {
                console.log("Tip: Copy PSID", psid, "to verify on the portal.");
                
                const copySuccess = () => {
                    App.showToast ? App.showToast("PSID Copied! Click portal & Paste (Ctrl+V)") : console.log("PSID Copied");
                };

                if(navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(psid).then(copySuccess).catch(() => {
                        // If clipboard API fails, try fallback
                        this.fallbackCopy(psid);
                        copySuccess();
                    });
                } else {
                    this.fallbackCopy(psid);
                    copySuccess();
                }
            }
        },
        fallbackCopy(text) {
            try {
                const textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.position = "fixed";  // Avoid scrolling to bottom
                textArea.style.left = "-999999px";
                textArea.style.top = "-999999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                return successful;
            } catch (err) {
                console.error('Fallback copy failed', err);
                return false;
            }
        },
        close() {
            const modal = document.getElementById('modal-verify-bill');
            const iframe = document.getElementById('verify-iframe');
            iframe.src = ''; // Clear src to stop loading
            modal.style.display = 'none';
            // Return to origin if applicable
            if (State.originView === 'dashboard') ViewSwitcher.toDashboard();
        }
    };