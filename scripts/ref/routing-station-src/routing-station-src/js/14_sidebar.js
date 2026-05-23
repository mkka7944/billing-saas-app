// === 14_sidebar.js ===
// Sidebar

const Sidebar = {
        init() {
            const sb = document.getElementById('sidebar');
            if (sb) {
                // Prevent clicks inside sidebar from bubbling to map (stops accidental auto-close)
                sb.addEventListener('click', (e) => e.stopPropagation());
                sb.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
            }

            // Auto-close on map click for mobile
            const mapC = document.getElementById('main-stage');
            if(mapC) {
                mapC.addEventListener('click', (e) => {
                    // Only if clicking map directly (not controls) and on mobile
                    if(window.innerWidth <= 768 && 
                       document.getElementById('sidebar').classList.contains('open') &&
                       !e.target.closest('.map-controls') &&
                       !e.target.closest('.float-btn') &&
                       !e.target.closest('.gal-btn')) {
                        this.close();
                    }
                });
            }
        },
        toggle() { 
            const sb = document.getElementById('sidebar');
            const btn = document.getElementById('sidebar-toggle');
            
            if (window.innerWidth <= 768) {
                const isOpening = !sb.classList.contains('open');
                sb.classList.toggle('open');
                if (isOpening) sb.classList.remove('collapsed');
                else sb.classList.add('collapsed');
                
                // Refresh map size after transition (0.4s in CSS)
                setTimeout(() => {
                    if(State.map) {
                        State.map.invalidateSize({ animate: true });
                        if (window.innerWidth > 768) this.syncRoutingOverlay();
                    }
                }, 500); 
            } else {
                sb.classList.toggle('collapsed');
                sb.classList.remove('open');
                if (btn) btn.classList.toggle('collapsed-toggle');
                
                // Refresh map size after transition (0.4s in CSS)
                setTimeout(() => {
                    if(State.map) {
                        State.map.invalidateSize({ animate: true });
                        this.syncRoutingOverlay();
                    }
                }, 500); 
            }
        },
        syncRoutingOverlay() {
            const overlay = document.getElementById('routing-station-overlay');
            if(!overlay) return;
            
            // Only sync if it hasn't been manually dragged yet
            if (overlay.dataset.dragged === "true") return;

            const sb = document.getElementById('sidebar');
            const isCollapsed = sb.classList.contains('collapsed');
            overlay.style.left = isCollapsed ? '24px' : 'calc(var(--sidebar-w) + 24px)';
        },
        toggleDesktop() { this.toggle(); }, // Compatibility
        close() { 
            const sb = document.getElementById('sidebar');
            if (!sb) return;

            // Guard: If already closed, don't trigger transitions again
            if (window.innerWidth <= 768 && !sb.classList.contains('open')) return;
            if (window.innerWidth > 768 && sb.classList.contains('collapsed')) return;

            console.log("Sidebar: Closing definitively...");
            sb.classList.remove('open'); 
            if (window.innerWidth > 768) sb.classList.add('collapsed');
            else {
                // For mobile, we also add collapsed to trigger the -100% transform
                sb.classList.add('collapsed');
            }

            const card = document.getElementById('info-card');
            if(card) card.classList.remove('hidden');
            this.syncRoutingOverlay();
        }
    };