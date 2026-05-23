// === 11_verified_layer.js ===
// VerifiedLayer

// Recently Verified Layer Manager
const VerifiedLayer = {
    selectedMCs: [],
    showBase: false,
    layer: null,
    ghostLayer: null,
    lineLayer: null,
    syncTimer: null,
    searchID: null,
    auditMode: false,
    auditIndex: 0,
    auditData: [],
    focusedSID: null,

    init() {
        this.layer = L.layerGroup();
        this.ghostLayer = L.layerGroup();
        this.lineLayer = L.layerGroup();
        this.focusLayer = L.layerGroup();
        this.updateList();
    },

    updateList() {
        const container = document.getElementById('f-verified-mc');
        if (!container || !window.ALL_VERIFIED_DATA) return;

        console.log("[VerifiedLayer] updateList starting. window.ALL_VERIFIED_DATA:", window.ALL_VERIFIED_DATA ? window.ALL_VERIFIED_DATA.length : "null");

        // Group by MC (requires lookup in RAW_DATA via SID_MAP)
        const mcGroups = {};
        window.ALL_VERIFIED_DATA.forEach(v => {
            const record = window.SID_MAP ? window.SID_MAP.get(String(v.survey_id)) : null;
            if (record) {
                const mc = record[12];
                if (!mcGroups[mc]) mcGroups[mc] = 0;
                mcGroups[mc]++;
            } else {
                // console.warn("[VerifiedLayer] SID not found in map:", v.survey_id);
            }
        });

        console.log("[VerifiedLayer] mcGroups summary:", mcGroups);

        const sorted = Object.entries(mcGroups).sort((a, b) => b[1] - a[1]);

        if (sorted.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8; font-size:11px;">No verified locations found.</div>';
            return;
        }

        container.innerHTML = sorted.map(([mc, count]) => `
                <div class="multi-option ${this.selectedMCs.includes(mc) ? 'selected' : ''}" data-value="${mc}" onclick="VerifiedLayer.toggleMC(this)">
                    <input type="checkbox" ${this.selectedMCs.includes(mc) ? 'checked' : ''} onchange="VerifiedLayer.handleSync(this)">
                    <span style="display:flex; justify-content:space-between;">
                        <b>${mc}</b>
                        <span style="opacity:0.6; font-size:10px;">(${count})</span>
                    </span>
                </div>
            `).join('');
    },

    toggleMC(el) {
        const cb = el.querySelector('input');
        cb.checked = !cb.checked;
        el.classList.toggle('selected', cb.checked);
        this.syncState();
        App.apply();
    },

    handleSync(cb) {
        cb.closest('.multi-option').classList.toggle('selected', cb.checked);
        this.syncState();
        App.apply();
    },

    syncState() {
        const checkboxes = document.querySelectorAll('#f-verified-mc input:checked');
        this.selectedMCs = Array.from(checkboxes).map(cb => cb.closest('.multi-option').getAttribute('data-value'));
        this.showBase = document.getElementById('f-verified-show-base')?.checked || false;

        // If in audit mode, we need to refresh the audit list based on selected MCs
        if (this.auditMode) this.refreshAuditData();
    },

    toggleAll(state) {
        const checkboxes = document.querySelectorAll('#f-verified-mc input');
        checkboxes.forEach(cb => {
            cb.checked = state;
            cb.closest('.multi-option').classList.toggle('selected', state);
        });
        this.syncState();
        App.apply();
    },

    search() {
        const input = document.getElementById('v-search-sid');
        if (!input) return;
        const val = input.value.trim();
        this.searchID = val ? val : null;

        if (this.searchID) {
            // Flash the search box to indicate success
            input.parentElement.style.background = 'rgba(34, 197, 94, 0.1)';
            setTimeout(() => input.parentElement.style.background = '', 500);
            this.focusHouse(this.searchID); // Also focus it
        }

        App.apply();
    },

    destroyClearBtn() {
        const btn = document.getElementById('btn-clear-v-focus');
        if (btn) btn.remove();
    },

    focusHouse(sid) {
        // Temporarily disabled to streamline map navigation
        return;
    },
    
    clearFocus() {
        // Temporarily disabled to streamline map navigation
        return;
    },

    renderConnection(v, record, isFocused, targetLayer) {
        const vLat = v.latitude || record[1];
        const vLng = v.longitude || record[2];
        const oLat = record[1];
        const oLng = record[2];
        const layer = targetLayer || this.lineLayer;

        if (oLat && oLng) {
            // 1. Connection Line
            const points = [[vLat, vLng], [oLat, oLng]];
            L.polyline(points, {
                color: '#8b5cf6',
                weight: isFocused ? 3 : 2,
                opacity: isFocused ? 0.9 : 0.7,
                className: 'verified-conn-line'
            }).addTo(layer);

            // 2. Ghost Marker (Original)
            const ghostClass = isFocused ? 'marker-ghost marker-ghost-focused' : 'marker-ghost';
            const ghost = L.circleMarker([oLat, oLng], {
                radius: isFocused ? 7 : 5,
                fillColor: 'white',
                color: '#8b5cf6',
                weight: isFocused ? 3 : 2,
                fillOpacity: 0.9,
                className: ghostClass
            });

            App.bindCustomTooltip(ghost, `Original Position: ${v.survey_id}`);
            ghost.addTo(isFocused ? this.focusLayer : this.ghostLayer);
        }
    },

    toggleAudit() {
        const btn = document.getElementById('btn-verified-audit');
        this.auditMode = !this.auditMode;

        if (this.auditMode) {
            btn.innerHTML = '<span class="material-icons-round" style="font-size:18px;">close</span> EXIT AUDIT MODE';
            btn.classList.add('active');
            this.refreshAuditData();
            this.auditIndex = 0;

            if (this.auditData.length > 0) {
                MapNavigator.show();
                this.syncToCurrentAudit();
            } else {
                if (App.showToast) App.showToast("No verified data found for selected MCs.");
                this.auditMode = false;
                btn.innerHTML = '<span class="material-icons-round" style="font-size:18px;">analytics</span> START VERIFIED AUDIT';
                btn.classList.remove('active');
            }
        } else {
            btn.innerHTML = '<span class="material-icons-round" style="font-size:18px;">analytics</span> START VERIFIED AUDIT';
            btn.classList.remove('active');
            this.auditData = [];
            if (MapNavigator.visible) MapNavigator.toggle(false); // Close pager safely
        }
        App.apply();
    },

    refreshAuditData() {
        if (!window.ALL_VERIFIED_DATA) return;

        // Filter by selected MCs
        this.auditData = window.ALL_VERIFIED_DATA.filter(v => {
            const record = window.SID_MAP ? window.SID_MAP.get(String(v.survey_id)) : null;
            if (!record) return false;
            const mc = record[12];
            return this.selectedMCs.includes(mc);
        });

        // Sort by Survey ID (Highest to Lowest)
        this.auditData.sort((a, b) => parseInt(b.survey_id) - parseInt(a.survey_id));
    },

    syncToCurrentAudit() {
        if (this.auditData.length === 0) return;
        const current = this.auditData[this.auditIndex];
        if (current) {
            const record = window.SID_MAP ? window.SID_MAP.get(String(current.survey_id)) : null;
            if (record) {
                State.map.flyTo([current.latitude || record[1], current.longitude || record[2]], 19);
            }
        }
    },

    toggleGhost() {
        const cb = document.getElementById('f-verified-show-base');
        if (cb) {
            cb.checked = !cb.checked;
            this.showBase = cb.checked;
            App.apply();
        }
    },

    renderLayer() {
        if (!State.map) return;
        if (this.layer) this.layer.clearLayers();
        if (this.ghostLayer) this.ghostLayer.clearLayers();
        if (this.lineLayer) this.lineLayer.clearLayers();
        if (this.focusLayer) this.focusLayer.clearLayers();

        if (this.selectedMCs.length === 0 && !this.searchID && !this.auditMode && !this.focusedSID) return;

        // Unified rendering loop
        window.ALL_VERIFIED_DATA.forEach(v => {
            const sidStr = String(v.survey_id).trim();
            const record = window.SID_MAP ? window.SID_MAP.get(sidStr) : null;
            if (!record) return;

            const mc = record[12];
            const isFilt = this.selectedMCs.includes(mc);
            const isFoc = sidStr === String(this.focusedSID).trim();
            const isSearch = sidStr === String(this.searchID).trim();
            const isAudit = this.auditMode && (String(this.auditData[this.auditIndex]?.survey_id) === sidStr);

            if (isFilt || isFoc || isSearch || isAudit) {
                this.renderItem(v, record, isFoc);
            }
        });

        if (!State.map.hasLayer(this.layer)) this.layer.addTo(State.map);
        if (!State.map.hasLayer(this.lineLayer)) this.lineLayer.addTo(State.map);
        if (!State.map.hasLayer(this.focusLayer)) this.focusLayer.addTo(State.map);

        if (this.showBase && !State.map.hasLayer(this.ghostLayer)) this.ghostLayer.addTo(State.map);
        else if (!this.showBase) State.map.removeLayer(this.ghostLayer);
    },

    renderItem(v, record, isFocused) {
        const vLat = v.latitude || record[1];
        const vLng = v.longitude || record[2];

        if (vLat && vLng) {
            // 1. Verified Icon (Main Layer)
            const iconSize = isFocused ? [16, 16] : [12, 12];
            const iconAnchor = isFocused ? [8, 8] : [6, 6];
            
            const m = L.marker([vLat, vLng], {
                icon: L.divIcon({
                    className: isFocused ? 'marker-verified-square focused' : 'marker-verified-square',
                    iconSize: iconSize,
                    iconAnchor: iconAnchor
                })
            });

            App.bindCustomTooltip(m, `<div style="text-align:center;"><b>VERIFIED LOCATION</b><br>${v.survey_id}<br><small>By: ${v.verified_by}</small></div>`);

            m.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                App._markerHit = true;
                this.focusHouse(v.survey_id);
            });

            m.addTo(this.layer);

            // 2. Connection Line & Original Point
            // Draw if: Global "Show Base" is ON, OR it is explicitly Focused/Audited
            const showDetails = this.showBase || this.auditMode || isFocused;
            if (showDetails) {
                this.renderConnection(v, record, isFocused, isFocused ? this.focusLayer : this.lineLayer);
            }
        }
    }
};
window.VerifiedLayer = VerifiedLayer;