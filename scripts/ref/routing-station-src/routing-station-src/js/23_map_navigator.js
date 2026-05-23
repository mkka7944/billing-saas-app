// === 23_map_navigator.js ===
// Map Navigator

const MapNavigator = {
    visible: false,
    _initMapClickHandler() {
        // MODIFICATION: Auto-hide on map click has been removed as it was causing 
        // persistent regressions and accidental collapses on mobile devices.
        // The pager must now be closed explicitly via the compass button or by 
        // switching views.
        this._mapClickBound = true;
    },
    toggle(forceState) {
        this.visible = (forceState !== undefined) ? forceState : !this.visible;
        const btn = document.getElementById('btn-nav-toggle');
        if (btn) btn.classList.toggle('active', this.visible);

        // GLOBAL GUARD: Prevent map interactions from hiding the pager while it's active
        if (window.State) State.isMapPagerActive = this.visible;

        // Clean up Audit Mode if pager is closed
        if (!this.visible && window.VerifiedLayer && window.VerifiedLayer.auditMode) {
            VerifiedLayer.auditMode = false;
            const auditBtn = document.getElementById('btn-verified-audit');
            if (auditBtn) {
                auditBtn.innerHTML = '<span class="material-icons-round" style="font-size:18px;">analytics</span> START VERIFIED AUDIT';
                auditBtn.classList.remove('active');
            }
            App.apply();
        }

        this.updateUI();
    },
    show() {
        // Initialize map click handler to hide navigator when clicking on map
        this._initMapClickHandler();
        
        // Decoupling: Do NOT open map pager if route pager is active
        if (window.SpatialRouter && typeof SpatialRouter.isRoutePagerActive === 'function' && SpatialRouter.isRoutePagerActive()) {
            console.log("MapNavigator: Suppressing show because RoutePager is active");
            return;
        }

        // CRITICAL: Set move time immediately to lock the pager from auto-hiding logic in App.js
        this._lastMoveTime = Date.now();

        this.visible = true;
        if (window.State) State.isMapPagerActive = true;
        
        const btn = document.getElementById('btn-nav-toggle');
        if (btn) btn.classList.add('active');

        // Auto collapse the right-side extra controls for better visibility
        if (window.UIInteractions && typeof UIInteractions.toggleExtraCtrls === 'function') {
            UIInteractions.toggleExtraCtrls(true);
        }

        this.updateUI();
    },
    updateUI() {
        // Clear any pending update to prevent race conditions during rapid moves
        if (this._updateTimer) clearTimeout(this._updateTimer);

        this._updateTimer = setTimeout(() => {
            const pager = document.getElementById('map-pager');
            if (!pager) return;

            // Audit Mode Bridge
            const isAudit = window.VerifiedLayer && window.VerifiedLayer.auditMode;
            const source = isAudit ? window.VerifiedLayer.auditData : State.filtered;
            const idx = isAudit ? window.VerifiedLayer.auditIndex : State.currentIdx;

            // CRITICAL: Only hide if NOT meant to be visible or if no source exists.
            // prevents "flicker" where navigator hides briefly during view transitions.
            if (!source || source.length === 0 || !this.visible) {
                if (pager.style.display !== 'none') {
                    pager.style.setProperty('display', 'none', 'important');
                }
                return;
            }

            if (pager.style.display !== 'flex') {
                pager.style.setProperty('display', 'flex', 'important');
            }

            // Update index display with bounds safety
            const safeIdx = Math.max(0, Math.min(idx, source.length - 1));
            document.getElementById('map-nav-idx').innerText = safeIdx + 1;
            document.getElementById('map-nav-total').innerText = source.length;
        }, 30);
    },
    move(dir) {
        const isAudit = window.VerifiedLayer && window.VerifiedLayer.auditMode;
        const source = isAudit ? window.VerifiedLayer.auditData : State.filtered;
        const idx = isAudit ? window.VerifiedLayer.auditIndex : State.currentIdx;

        if (!source || source.length === 0) return;
        let len = source.length;
        let newIdx = (idx + dir + len) % len;

        if (isAudit) {
            window.VerifiedLayer.auditIndex = newIdx;
            window.VerifiedLayer.syncToCurrentAudit();
            App.apply();
        } else {
            State.currentIdx = newIdx;
            const record = State.filtered[State.currentIdx];
            if (record) {
                const sid = record[0];
                // Show marker card instead of gallery directly
                if (window.SpatialRouter && typeof SpatialRouter.showMarkerCard === 'function') {
                    SpatialRouter.showMarkerCard(sid);
                }
                // Also fly to the marker on map
                if (record[1] && record[2] && window.State && State.map) {
                    State.map.flyTo([record[1], record[2]], 19, { padding: [50, 50], duration: 0.4 });
                }
            }
        }
        this._lastMoveTime = Date.now();
        this.updateUI();
    }
};

// Expose Globals explicitly for inline event handlers and external access
window.State = State;
window.App = App;
window.Sidebar = Sidebar;
window.InfoCard = InfoCard;
window.Settings = Settings;
window.Gallery = Gallery;
window.DriveSync = DriveSync;
window.LayerManager = LayerManager || {};
window.ViewSwitcher = ViewSwitcher;
window.ListView = ListView;
window.PerformanceLog = PerformanceLog;
window.BillVerifier = BillVerifier;
window.PaidBills = PaidBills;
window.UniversalSearch = UniversalSearch;
window.Stats = Stats;
window.SpatialRouter = SpatialRouter;
window.MapNavigator = MapNavigator;

// Map Rotation Controller