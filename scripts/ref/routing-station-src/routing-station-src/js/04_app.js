// === 04_app.js ===
// App - filters & render

const App = {
    _markerHit: false,
    
    hideCardsOnMapClick() {
        // Instant - no delay needed since we use _markerHit flag
        if (!this._markerHit) {
            // 1. Hide marker card (modal)
            if (window.SpatialRouter) {
                SpatialRouter.closeMarkerCard();
            } else {
                const modal = document.getElementById('modal-marker-card');
                if (modal && modal.classList.contains('active')) {
                    modal.classList.remove('active');
                }
            }

            // 2. Hide map navigator pager if open
            if (window.MapNavigator && MapNavigator.visible) {
                MapNavigator.toggle(false);
            }
            
            // 3. Collapse map toolbar
            if (window.UIInteractions) {
                UIInteractions.toggleExtraCtrls(true);
            }
        }
        this._markerHit = false;
    },
    
    toggleQuickFilter(key, e) {
        // Determine the new state based on the checkbox or toggle
        let newState;
        const checkbox = document.getElementById(`q-${key}`);
        
        if (e && e.target.tagName === 'INPUT') {
            // When clicking checkbox directly, use its checked state
            newState = e.target.checked;
        } else {
            // When clicking the container, toggle
            newState = !State.quickFilters[key];
        }
        
        // Update state
        State.quickFilters[key] = newState;
        
        if (checkbox) {
            checkbox.checked = newState;
            const container = checkbox.closest('.multi-option');
            if (container) {
                container.classList.toggle('selected', newState);
            }
        }
        this.apply();
    },
    
    handleQuickFilterChange(key, e) {
        // Handle onchange event from checkbox
        State.quickFilters[key] = e.target.checked;
        const container = e.target.closest('.multi-option');
        if (container) {
            container.classList.toggle('selected', e.target.checked);
        }
        this.apply();
    },

    updateSidebarStatus() {
        // Update selection counts (balloons) in filter headers
        const updates = [
            { id: 'f-dist', badgeId: 'badge-f-dist' },
            { id: 'f-tehsil', badgeId: 'badge-f-tehsil' },
            { id: 'f-mc', badgeId: 'badge-f-mc' },
            { id: 'f-pay', badgeId: 'badge-f-pay' },
            { id: 'f-surveyor', badgeId: 'badge-f-surveyor' },
            { id: 'f-quick', badgeId: 'badge-f-quick' },
            { id: 'f-drive', badgeId: 'badge-f-drive' }
        ];

        updates.forEach(upd => {
            const badge = document.getElementById(upd.badgeId);
            if (!badge) return;

            let selected = 0;
            let total = 0;

            if (upd.id === 'f-quick') {
                selected = Object.values(State.quickFilters).filter(v => v).length;
                total = Object.values(State.quickFilters).length;
            } else if (upd.id === 'f-drive') {
                selected = document.getElementById('f-drive-only').checked ? 1 : 0;
                total = 1;
                
                let driveImageCount = 0;
                if (State.filtered && State.syncedData) {
                    driveImageCount = State.filtered.reduce((sum, r) => sum + (State.syncedData[String(r[0]).replace(/\.0$/, '').trim()] || 0), 0);
                }
                let totalDriveImages = State.totalDriveImages || 0;
                if (!totalDriveImages && State.syncedData) {
                    totalDriveImages = Object.values(State.syncedData).reduce((sum, count) => sum + count, 0);
                }
                if (totalDriveImages > 0) {
                    badge.innerText = `${driveImageCount} / ${totalDriveImages} Img`;
                    badge.style.display = 'inline-flex';
                    badge.style.background = '#f0fdf4';
                    badge.style.color = '#15803d';
                    badge.style.borderColor = '#bbf7d0';
                    return; 
                }
            } else {
                selected = this.getSelected(upd.id).length;
                total = this.getMultiSelectItems(upd.id).length;
            }

            if (upd.id === 'f-quick') {
                const active = [];
                if (State.quickFilters.domestic) active.push('Dom');
                if (State.quickFilters.commercial) active.push('Com');

                if (active.length === 2) {
                    badge.innerText = 'All';
                    badge.style.display = 'inline-block';
                } else if (active.length === 1) {
                    badge.innerText = active[0];
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
                return;
            }

            if (selected > 0 && selected < total) {
                badge.innerText = selected;
                badge.style.display = 'inline-flex';
                badge.style.background = '#eff6ff';
                badge.style.color = '#2563eb';
                badge.style.borderColor = '#dbeafe';
            } else if (selected === total && total > 0) {
                badge.innerText = 'All';
                badge.style.display = 'inline-flex';
                badge.style.background = '#edfcf2';
                badge.style.color = '#059669';
                badge.style.borderColor = '#bbf7d0';
            } else {
                badge.style.display = 'none';
            }
        });

        // Update Paid History Count        // Update Paid History Count
        const paidBadge = document.getElementById('badge-paid-count');
        if (paidBadge && typeof PAID_DATA !== 'undefined') {
            const count = Object.keys(PAID_DATA).length;
            if (count > 0) {
                paidBadge.innerText = count;
                paidBadge.style.display = 'inline-flex';
            } else {
                paidBadge.style.display = 'none';
            }
        }
    },

    init() {
        if (window.APP_INITIALIZED) return;
        window.APP_INITIALIZED = true;

        // [QUOTA FIX] Prune local cache if it exceeds browser limits (v2026.05.16)
        try {
            const cache = localStorage.getItem('verified_houses_cache');
            if (cache && cache.length > 4000000) { // ~4MB (safety margin under 5MB)
                console.warn("[App.init] LocalStorage cache large (" + (cache.length/1024/1024).toFixed(2) + "MB). Pruning...");
                const parsed = JSON.parse(cache);
                if (Array.isArray(parsed) && parsed.length > 1000) {
                    const pruned = parsed.slice(-500); // Keep only 500 most recent
                    localStorage.setItem('verified_houses_cache', JSON.stringify(pruned));
                    console.log("[App.init] Pruned cache to 500 records.");
                }
            }
        } catch (e) {
            console.error("[App.init] Cache pruning failed:", e);
            localStorage.removeItem('verified_houses_cache');
        }

        console.warn("GSI TROUBLESHOOTING: If you see 403 / Origin Not Allowed, ensure http://localhost:8000 is added as an Authorized JavaScript Origin in GCP console.");
        State.raw_data = window.RAW_DATA;

        // PERFORMANCE: Build SID_MAP for O(1) lookups if it doesn't exist
        if (!window.SID_MAP && window.RAW_DATA) {
            console.time("SID_MAP_INIT");
            window.SID_MAP = new Map();
            window.RAW_DATA.forEach(r => {
                const cleanKey = String(r[0]).replace(/\.0$/, '').trim();
                window.SID_MAP.set(cleanKey, r);
            });
            console.timeEnd("SID_MAP_INIT");
        }

        this.initMap();
        window.map = State.map; // Explicit for SpatialRouter
        
        // Fix for mobile sizing issues after login/hidden container
        setTimeout(() => {
            if (State.map) State.map.invalidateSize();
        }, 300);

        // [OPTIMIZATION] Immediate Drive Sync on Boot (Relocated from setTimeout)
        if (window.DriveSync) {
            window.DriveSync.fetchAllSyncedData();
        }

        console.log("App initialized.");

        this.initFilters();
        Sidebar.init();
        InfoCard.init();
        if (window.SpatialRouter) SpatialRouter.init();
        if (typeof UniversalSearch !== 'undefined') UniversalSearch.init();
        
        // Populate sidebar KML layers
        if (window.LayerManager) LayerManager.renderSidebarKML();

        // 1. Initial State: Always start fresh for maximum performance
        this.resetFilters();
        this.apply(true);

        // 2. PWA Install Prompt Listener
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later.
            window.deferredPrompt = e;
            // Update UI to notify the user they can install the PWA
            const installBtn = document.getElementById('sidebar-install-btn');
            if (installBtn) installBtn.style.display = 'flex';
        });

        window.addEventListener('appinstalled', (evt) => {
            console.log('RSP was installed');
            const installBtn = document.getElementById('sidebar-install-btn');
            if (installBtn) installBtn.style.display = 'none';
        });

        // INITIAL SYNC: Fetch global verifications on startup

        // Live Zoom Updates
        State.map.on('zoomend', () => {
            const el = document.getElementById('zoom-level-text');
            if (el) el.innerText = `Z: ${State.map.getZoom()}`;
        });
        // Initial call
        const el = document.getElementById('zoom-level-text');
        if (el) el.innerText = `Z: ${State.map.getZoom()}`;

        // Mobile layout for FAB buttons
        this._applyMobileLayout();
        window.addEventListener('resize', () => this._applyMobileLayout());

        // Handle URL Params (QR Code Link)
        // Handle URL parameters for direct linking
        this.handleUrlParams();
    },

    handleUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const sid = urlParams.get('sid');
        if (sid) {
            console.log("Found Survey ID in URL:", sid);

            // FORCE RESET FILTERS TO "ALL"
            // This ensures we search looking at the entire dataset, not just the default view.

            // 1. Select All Districts, Tehsils, MCs
            App.toggleAll('f-dist', true);
            App.toggleAll('f-tehsil', true);
            App.toggleAll('f-mc', true);

            // 2. Clear Date Filters
            this.clearDates();

            // 3. Apply to update State.filtered
            this.apply();

            // Switch to List View
            ViewSwitcher.toList();

            // Wait for List to Populate (now with FULL data)
            setTimeout(() => {
                const searchInput = document.getElementById('lv-search-id');
                if (searchInput) {
                    searchInput.value = sid;
                    ListView.render(); // This filters State.filtered by the search term

                    // Auto-select first result if exact match
                    setTimeout(() => {
                        if (State.filtered.length > 0) {
                            // Find record that exactly matches ID if possible
                            const record = State.filtered.find(r => r[0].toString() === sid) || State.filtered[0];

                            if (record) {
                                ViewSwitcher.toMap();
                                State.map.flyTo([record[1], record[2]], 19);

                                // Open Popup
                                setTimeout(() => {
                                    State.markers.eachLayer(layer => {
                                        if (layer.options.id === sid.toString()) {
                                            layer.openPopup();
                                        }
                                    });
                                }, 800);
                            }
                        }
                    }, 200);
                }
            }, 800);
        }
    },

    resetFilters() {
        State.surveyorFilter = [];
        if (State.fpStart) State.fpStart.clear();
        if (State.fpEnd) State.fpEnd.clear();

        // Uncheck All for Payment status
        this.toggleAll('f-pay', false);
        this.toggleAll('f-dist', false);
        this.toggleAll('f-tehsil', false);
        this.toggleAll('f-mc', false);
        this.toggleAll('f-drive', false);

        // Reset quick filters to active
        State.quickFilters = { urban: true, rural: true, domestic: true, commercial: true };
        ['urban', 'rural', 'domestic', 'commercial'].forEach(key => {
            const cb = document.getElementById(`q-${key}`);
            if (cb) {
                cb.checked = true;
                cb.parentElement.classList.add('selected');
            }
        });

        // NO MARKERS LOADED (as requested)
        State.markers.clearLayers();
        State.filtered = [];
        State.masterFiltered = [];
        State.originalFiltered = []; // CRITICAL: Stop render() from falling back to cached routing data

        const countEl = document.getElementById('stat-count');
        if (countEl) countEl.innerText = "0 / " + (window.RAW_DATA ? RAW_DATA.length : 0);

        this.updateSidebarStatus();
        this.updateSurveyors();

        // Clear any active route pager
        if (window.SpatialRouter) SpatialRouter.toggleRoutePager(false);
    },

    setToday() {
        // "Its sole purpose is to show today survey done"
        // Ensure we clear ALL context to isolate today's records globally
        this.toggleAll('f-dist', true);
        this.toggleAll('f-tehsil', true);
        this.toggleAll('f-mc', true);
        this.toggleAll('f-pay', false);
        this.toggleAll('f-drive', false);
        const input = document.getElementById('lv-search-id');
        if (input) input.value = '';

        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${d}`;

        if (State.fpStart) State.fpStart.setDate(todayStr, false);
        if (State.fpEnd) State.fpEnd.setDate(todayStr, false);

        this.apply();
    },

    clearDates() {
        this.resetFilters();
        // NO AUTO-APPLY: User wants empty map on first attempt
        this.render(); 
    },

    initMap() {
        State.map = L.map('map', {
            zoomControl: false,
            preferCanvas: window.innerWidth <= 768,
            zoomAnimation: true,
            fadeAnimation: true,
            markerZoomAnimation: true,
            inertia: true,
            inertiaDeceleration: 3000,
            updateWhenIdle: true
        }).setView([32.0836, 72.6711], 13);

        // Create a dedicated pane for KML layers to keep them below markers
        State.map.createPane('kmlPane');
        State.map.getPane('kmlPane').style.zIndex = 350;

        // Clear tooltips when clicking on map
        State.map.on('click', (e) => {
            // Clear active marker tooltip on map click
            if (State.activeMarker) {
                State.activeMarker.closeTooltip();
                State.activeMarker = null;
            }

            // Clear verified ghost layers
            if (window.VerifiedLayer && VerifiedLayer.focusLayer) {
                VerifiedLayer.focusLayer.clearLayers();
            }
            
            // Auto-hide marker card and map pager on map click
            App.hideCardsOnMapClick();
        });

        // Clear tooltips when dragging or zooming the map to prevent permanent sticky tooltips
        State.map.on('dragstart zoomstart movestart', () => {
            if (State.activeMarker) {
                State.activeMarker.closeTooltip();
                State.activeMarker = null;
            }
        });

        // Create a dedicated pane for Routing polygons
        State.map.createPane('routingPane');
        State.map.getPane('routingPane').style.zIndex = 650;
        State.map.getPane('routingPane').style.pointerEvents = 'none';

        // Create a dedicated pane for Routing markers to keep them above polygons
        State.map.createPane('routingMarkerPane');
        State.map.getPane('routingMarkerPane').style.zIndex = 660;
        State.map.getPane('routingMarkerPane').style.pointerEvents = 'none';

        State.layers = {
            roads: L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                keepBuffer: 6,
                updateWhenIdle: true
            }),
            sat: L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                keepBuffer: 6,
                updateWhenIdle: true
            })
        };

        State.layers.roads.addTo(State.map);
        State.activeLayer = 'roads';
        // REMOVED Ghost Layer: State.markers.addTo(State.map); 
        // This prevents markers from appearing twice and breaking clustering.
    },

    toggleLayer() {
        const isRoads = State.activeLayer === 'roads';
        this.setLayer(isRoads ? 'sat' : 'roads');
    },

    // Cluster Toggle - Enable/disable marker clustering
    _clusterEnabled: false,
    _clusterGroup: null,

    toggleClustering() {
        const btn = document.getElementById('btn-cluster-toggle');
        
        this._clusterEnabled = !this._clusterEnabled;
        
        if (btn) {
            btn.classList.toggle('active', this._clusterEnabled);
        }

        if (this._clusterEnabled) {
            // Enable clustering
            this.enableClustering();
            if (App.showToast) App.showToast('Clustering enabled');
        } else {
            // Disable clustering
            this.disableClustering();
            if (App.showToast) App.showToast('Clustering disabled');
        }
    },

    enableClustering() {
        // Remove individual markers
        if (State.markerLayer) {
            State.map.removeLayer(State.markerLayer);
        }

        // Create cluster group
        if (!this._clusterGroup) {
            this._clusterGroup = L.markerClusterGroup({
                chunkedLoading: true,
                maxClusterRadius: 60,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false,
                zoomToBoundsOnClick: true,
                disableClusteringAtZoom: 19,
                iconCreateFunction: (cluster) => {
                    const count = cluster.getChildCount();
                    let size = 'small';
                    if (count > 50) size = 'large';
                    else if (count > 10) size = 'medium';
                    
                    return L.divIcon({
                        html: `<div style="background:var(--primary); color:white; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px; border:3px solid white; box-shadow:0 2px 8px rgba(0,0,0,0.3);">${count}</div>`,
                        className: 'marker-cluster marker-cluster-' + size,
                        iconSize: L.point(36, 36)
                    });
                }
            });
        }

        // Add markers to cluster group
        if (State.markers && State.markers.getLayers) {
            this._clusterGroup.addLayers(State.markers.getLayers());
        }

        this._clusterGroup.addTo(State.map);
    },

    disableClustering() {
        // Remove cluster group
        if (this._clusterGroup) {
            State.map.removeLayer(this._clusterGroup);
        }

        // Add back individual markers
        if (State.markerLayer) {
            State.markerLayer.addTo(State.map);
            
            // RESET TOOLTIPS: Prevent persistent tooltips when switching modes
            State.markerLayer.eachLayer(m => {
                if (m.getTooltip()) {
                    m.unbindTooltip();
                    const sid = m.options.id;
                    const row = window.SID_MAP?.get(String(sid));
                    const content = `${sid} | ${row ? row[4] : 'Unknown'}`;
                    this.bindCustomTooltip(m, content);
                }
            });
        }
    },

    setLayer(name) {
        if (!State.layers[name]) return;
        
        // Remove current
        if (State.activeLayer && State.layers[State.activeLayer]) {
            State.map.removeLayer(State.layers[State.activeLayer]);
        }
        
        // Add new
        State.activeLayer = name;
        State.layers[name].addTo(State.map);
        
        // Update UI icon
        const icon = document.getElementById('layer-icon');
        if (icon) {
            icon.innerText = (name === 'roads') ? 'satellite_alt' : 'map';
        }
    },

// // Nearby Markers Popup
    showNearbyMarkersPopup(markers, latlng) {
        const popup = document.getElementById('nearby-markers-popup');
        const list = document.getElementById('nearby-markers-list');
        if (!popup || !list || !markers || markers.length === 0) return;

        // Set initial position if first show (not dragged yet)
        if (!this._nearbyPopupDragged) {
            if (window.innerWidth <= 768) {
                popup.style.left = '12px';
                popup.style.bottom = '200px';
            } else {
                popup.style.left = 'calc(var(--sidebar-w, 320px) + 20px)';
                popup.style.bottom = '200px';
            }
        }

        this._applyMobileLayout();

        popup.style.display = 'flex';
        popup.style.opacity = '1';

        list.innerHTML = '';

        markers.slice(0, 30).forEach(m => {
            const item = document.createElement('div');
            
            const seqIdx = window.SpatialRouter ? SpatialRouter.sequence.findIndex(p => String(p.id) === String(m.id)) : -1;
            
            item.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                list.querySelectorAll('.is-selected').forEach(el => el.classList.remove('is-selected'));
                item.classList.add('is-selected');
                State.nearbyPopupSelectedId = m.id;
                if (window.SpatialRouter) {
                    SpatialRouter.showMarkerCard(m.id);
                }
                State.map.once('moveend', () => {
                    if (State.nearbyPopupSelectedId !== m.id) return;
                    const hitbox = App._findMarkerHitbox(m.id);
                    if (hitbox) {
                        if (State.activeMarker && State.activeMarker !== hitbox) State.activeMarker.closeTooltip();
                        hitbox.openTooltip();
                        State.activeMarker = hitbox;
                    }
                    const vis = App._findVisualMarker(m.id);
                    if (vis) vis.bringToFront();
                });
                State.map.panTo([m.lat, m.lng], { animate: true, duration: 0.3 });
            };
            
            item.innerText = `${m.id}${seqIdx !== -1 ? ' ✓' : ''}`;
            
            if (m.id === State.nearbyPopupSelectedId) {
                item.classList.add('is-selected');
            }
            if (seqIdx !== -1) {
                item.classList.add('in-sequence');
            }
            list.appendChild(item);
        });

        // Drag setup on header
        const header = document.getElementById('nearby-popup-header');
        if (header) {
            this._setupDrag(header, popup);
        }
    },

    _setupDrag(handle, target) {
        const onStart = (e) => {
            e.preventDefault();
            const rect = target.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const offsetX = clientX - rect.left;
            const offsetY = clientY - rect.top;

            const onMove = (ev) => {
                const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
                const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
                target.style.left = (cx - offsetX) + 'px';
                target.style.top = (cy - offsetY) + 'px';
                target.style.bottom = 'auto';
                App._nearbyPopupDragged = true;
            };

            const onEnd = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onEnd);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onEnd);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, { passive: true });
            document.addEventListener('touchend', onEnd);
        };

        handle.addEventListener('mousedown', onStart);
        handle.addEventListener('touchstart', onStart, { passive: true });
    },

closeNearbyMarkersPopup() {
        const popup = document.getElementById('nearby-markers-popup');
        if (popup) popup.style.display = 'none';
        if (this._nearbyPopupTimer) {
            clearTimeout(this._nearbyPopupTimer);
            this._nearbyPopupTimer = null;
        }
},

    // Find the marker hitbox (mHit) in markerLayer by survey ID
    _findMarkerHitbox(sid) {
        const sidStr = String(sid);
        if (!State.markerLayer) return null;
        let found = null;
        State.markerLayer.eachLayer(layer => {
            if (String(layer.options?.id) === sidStr && layer.getTooltip()) found = layer;
        });
        return found;
    },

    // Find the visual marker (m) in markerLayer by survey ID
    _findVisualMarker(sid) {
        const sidStr = String(sid);
        if (!State.markerLayer) return null;
        let found = null;
        State.markerLayer.eachLayer(layer => {
            if (String(layer.options?.id) === sidStr && layer.options.interactive === false) found = layer;
        });
        return found;
    },

    _applyMobileLayout() {
        const isMobile = window.innerWidth <= 768;
        const cs = document.getElementById('btn-cloud-sync-floating');
        const ct = document.getElementById('btn-cluster-toggle');
        const sa = document.getElementById('btn-show-all-markers');

        if (isMobile) {
            [cs, ct, sa].forEach(b => { if (b) { b.style.left = '12px'; b.style.width = '44px'; b.style.height = '44px'; b.style.borderRadius = '50%'; } });
            if (cs) cs.style.bottom = '175px';
            if (ct) ct.style.bottom = '65px';
            if (sa) sa.style.bottom = '120px';
        } else {
            // Desktop - restore original position with sidebar offset
            [cs, ct, sa].forEach(b => { if (b) { b.style.width = '32px'; b.style.height = '32px'; b.style.borderRadius = '50%'; } });
            if (ct) { ct.style.left = 'calc(var(--sidebar-w, 320px) + 20px)'; ct.style.bottom = '70px'; }
            if (sa) { sa.style.left = 'calc(var(--sidebar-w, 320px) + 60px)'; sa.style.bottom = '70px'; }
            if (cs) { cs.style.left = 'calc(var(--sidebar-w, 320px) + 60px)'; cs.style.bottom = '110px'; }
        }
    },
    
    // Show all markers in current map view
    showAllMarkersInView() {
        if (!State.map || !window.RAW_DATA) return;
        
        const popup = document.getElementById('nearby-markers-popup');
        const list = document.getElementById('nearby-markers-list');
        
        // Toggle: if popup is visible, close it
        if (popup && popup.style.display === 'flex') {
            popup.style.opacity = '0';
            setTimeout(() => {
                if (popup) popup.style.display = 'none';
            }, 150);
            return;
        }
        
        const bounds = State.map.getBounds();
        const visibleMarkers = [];
        
        if (!State.filtered) return;
        State.filtered.forEach(r => {
            if (!r[1] || !r[2]) return;
            if (bounds.contains([r[1], r[2]])) {
                visibleMarkers.push({ id: r[0], lat: r[1], lng: r[2], name: r[4] });
            }
        });
        
        if (visibleMarkers.length > 0) {
            // Show popup with all visible markers
            this.showNearbyMarkersPopup(visibleMarkers, State.map.getCenter());
        } else {
            if (App.showToast) App.showToast('No markers in current view');
        }
    },

    // Find nearby markers within radius
    findNearbyMarkers(lat, lng, radiusMeters = 30) {
        if (!window.RAW_DATA || !State.map) return [];

        const center = L.latLng(lat, lng);
        const nearby = [];

        if (!State.filtered) return [];
        State.filtered.forEach(r => {
            if (!r[1] || !r[2]) return;
            const markerPos = L.latLng(r[1], r[2]);
            const dist = center.distanceTo(markerPos);
            if (dist <= radiusMeters) {
                nearby.push({ id: r[0], lat: r[1], lng: r[2], name: r[4] });
            }
        });

        return nearby;
    },

    // Find nearby markers within a visual screen pixel radius (resolves overlapping/tightly packed markers)
    findNearbyMarkersPixel(latOrLatLng, lngOrRadius, radiusPixels = 30) {
        if (!window.RAW_DATA || !State.map) return [];
        if (!State.filtered) return [];

        let lat, lng;
        let rad = radiusPixels;
        if (latOrLatLng && typeof latOrLatLng === 'object' && 'lat' in latOrLatLng) {
            lat = latOrLatLng.lat;
            lng = latOrLatLng.lng;
            rad = typeof lngOrRadius === 'number' ? lngOrRadius : radiusPixels;
        } else {
            lat = latOrLatLng;
            lng = lngOrRadius;
        }

        const clickedPoint = State.map.latLngToContainerPoint([lat, lng]);
        const nearby = [];

        // O(1) Bounding-Box Geofencing: Convert pixel radius to latitude/longitude degree deltas
        const clickedLatLng = L.latLng(lat, lng);
        const edgePoint = State.map.containerPointToLatLng([clickedPoint.x + rad, clickedPoint.y + rad]);
        const latDelta = Math.abs(lat - edgePoint.lat);
        const lngDelta = Math.abs(lng - edgePoint.lng);

        const minLat = lat - latDelta;
        const maxLat = lat + latDelta;
        const minLng = lng - lngDelta;
        const maxLng = lng + lngDelta;

        State.filtered.forEach(r => {
            if (!r[1] || !r[2]) return;
            const mLat = parseFloat(r[1]);
            const mLng = parseFloat(r[2]);
            
            // Perform rapid pre-filter bounding check before Leaflet projection to prevent projection rendering lag
            if (mLat >= minLat && mLat <= maxLat && mLng >= minLng && mLng <= maxLng) {
                const otherPoint = State.map.latLngToContainerPoint([mLat, mLng]);
                const dist = Math.sqrt(Math.pow(clickedPoint.x - otherPoint.x, 2) + Math.pow(clickedPoint.y - otherPoint.y, 2));
                if (dist <= rad) {
                    nearby.push({ id: r[0], lat: mLat, lng: mLng, name: r[4] });
                }
            }
        });

        return nearby;
    },

    toggleFilterGroup(el) {
        const group = el.closest('.filter-group');
        const isCollapsing = !group.classList.contains('collapsed');

        // Accordion: Collapse all others
        document.querySelectorAll('#sidebar .filter-group').forEach(g => {
            if (g === group) return;
            g.classList.add('collapsed');
            g.classList.remove('active-group');
        });

        if (isCollapsing) {
            group.classList.add('collapsed');
            group.classList.remove('active-group');
        } else {
            group.classList.remove('collapsed');
            group.classList.add('active-group');
        }
    },

    initFilters() {
        const dists = Object.keys(HIERARCHY).sort();
        this.renderMultiSelect('f-dist', dists.map(d => ({ v: d, l: d })), 'onDistChange');

        // Default: All Unchecked (No more SARGODHA/MC-1 defaults to prevent lag)
        this.onDistChange();
        this.onTehsilChange();

        // Init Flatpickr if not already
        if (!State.fpStart) {
            const config = {
                dateFormat: "Y-m-d",
                allowInput: true,
                onChange: () => this.apply()
            };
            State.fpStart = flatpickr("#f-start", config);
            State.fpEnd = flatpickr("#f-end", config);
        }
        if (window.VerifiedLayer) VerifiedLayer.init();
        this.updateSidebarStatus();
    },

    renderMultiSelect(id, items, onUpdate) {
        const container = document.getElementById(id);
        if (!container) return;
        container.innerHTML = items.map(item => `
                <div class="multi-option" data-value="${item.v}" onclick="App.handleMultiClick(event, '${id}', '${onUpdate}')">
                    <input type="checkbox" ${item.selected ? 'checked' : ''} onchange="App.handleMultiChange(event, '${id}', '${onUpdate}')">
                    <span>${item.l}</span>
                </div>
            `).join('');
    },

    // Dedicated robust MC/UC multi-select using DOM API
    renderMCUCSelect(items) {
        const container = document.getElementById('f-mc');
        if (!container) return;
        container.innerHTML = ''; // Clear existing

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'multi-option';
            div.setAttribute('data-value', item.v);
            if (item.selected) div.classList.add('selected');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = item.selected || false;
            const span = document.createElement('span');
            span.textContent = item.l;

            div.appendChild(checkbox);
            div.appendChild(span);

            checkbox.addEventListener('change', function (e) {
                e.stopPropagation();
                div.classList.toggle('selected', this.checked);
                // Debounced update to prevent flickering
                if (App._selectionTimeout) clearTimeout(App._selectionTimeout);
                App._selectionTimeout = setTimeout(() => {
                    App.updateSidebarStatus();
                }, 300);
            });

            // Click on row toggles checkbox
            div.addEventListener('click', function (e) {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    div.classList.toggle('selected', checkbox.checked);
                    
                    if (App._selectionTimeout) clearTimeout(App._selectionTimeout);
                    App._selectionTimeout = setTimeout(() => {
                        App.updateSidebarStatus();
                    }, 300);
                }
            });

            container.appendChild(div);
        });
    },

    // Get selected MC/UC values
    getSelectedMCUC() {
        const container = document.getElementById('f-mc');
        if (!container) return [];
        const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb =>
            cb.closest('.multi-option').getAttribute('data-value')
        );
    },

    handleMultiClick(e, id, onUpdate) {
        if (e.target.tagName === 'INPUT') return;
        const row = e.currentTarget;
        const cb = row.querySelector('input');
        cb.checked = !cb.checked;
        row.classList.toggle('selected', cb.checked);
        if (onUpdate && App[onUpdate]) App[onUpdate]();


    },

    handleMultiChange(e, id, onUpdate) {
        const row = e.target.closest('.multi-option');
        row.classList.toggle('selected', e.target.checked);
        if (onUpdate && App[onUpdate]) App[onUpdate]();
    },

    toggleAll(id, state) {
        console.log(`[App.toggleAll] id=${id}, state=${state}`);
        if (id === 'f-quick') {
            Object.keys(State.quickFilters).forEach(key => {
                State.quickFilters[key] = state;
            });
            // Sync UI
            ['urban', 'rural', 'domestic', 'commercial'].forEach(key => {
                const cb = document.getElementById(`q-${key}`);
                if (cb) {
                    cb.checked = state;
                    const opt = cb.closest('.multi-option');
                    if (opt) opt.classList.toggle('selected', state);
                }
            });
            this.apply();
            return;
        }

        const container = document.getElementById(id);
        if (!container) {
            console.warn(`[App.toggleAll] CRITICAL: Container not found for ID: ${id}. Ensure this ID exists in the HTML.`);
            return;
        }

        const checkboxes = container.querySelectorAll('input');
        if (checkboxes.length === 0) {
            console.warn(`[App.toggleAll] WARNING: No checkboxes found in container: ${id}`);
        }

        checkboxes.forEach(cb => {
            cb.checked = state;
            const option = cb.closest('.multi-option');
            if (option) option.classList.toggle('selected', state);
        });

        if (id === 'f-dist') this.onDistChange();
        else if (id === 'f-tehsil') this.onTehsilChange();
        else if (id === 'f-pay' || id === 'f-drive' || id === 'f-surveyor') this.apply();

        this.updateSidebarStatus();
    },

    getSelected(id) {
        const container = document.getElementById(id);
        return Array.from(container.querySelectorAll('.multi-option'))
            .filter(row => row.querySelector('input').checked)
            .map(row => row.getAttribute('data-value'));
    },

    getMultiSelectItems(id) {
        const container = document.getElementById(id);
        return Array.from(container.querySelectorAll('.multi-option')).map(row => ({
            value: row.getAttribute('data-value')
        }));
    },

    setSelected(id, values) {
        const container = document.getElementById(id);
        container.querySelectorAll('.multi-option').forEach(row => {
            const val = row.getAttribute('data-value');
            const checked = values.includes(val);
            row.querySelector('input').checked = checked;
            row.classList.toggle('selected', checked);
        });
    },

    onDistChange() {
        const selectedDists = this.getSelected('f-dist');
        let items = [];

        selectedDists.forEach(d => {
            const tehsils = Object.keys(HIERARCHY[d] || {}).sort();
            tehsils.forEach(t => {
                items.push({ v: t, l: `${d} - ${t}` });
            });
        });

        this.renderMultiSelect('f-tehsil', items, 'onTehsilChange');
        this.onTehsilChange();
    },
    onTehsilChange() {
        const items = this.getAvailableMCUCs();
        const currentlySelected = this.getSelectedMCUC();
        items.forEach(item => {
            item.selected = currentlySelected.includes(item.v);
        });
        this.renderMCUCSelect(items);
        this.updateSidebarStatus();
    },

    getAvailableMCUCs() {
        const selectedDists = this.getSelected('f-dist');
        const selectedTehsils = this.getSelected('f-tehsil');
        let items = [];

        selectedDists.forEach(d => {
            const distData = HIERARCHY[d] || {};
            selectedTehsils.forEach(t => {
                const tehsilData = distData[t] || {};
                for (let m in tehsilData) {
                    items.push({
                        v: m,
                        l: `${t} - ${tehsilData[m].s}`,
                        short: tehsilData[m].s
                    });
                }
            });
        });

        items.sort((a, b) => {
            const aShort = a.short.toUpperCase();
            const bShort = b.short.toUpperCase();
            const aIsMC = aShort.startsWith('MC');
            const bIsMC = bShort.startsWith('MC');
            if (aIsMC && !bIsMC) return -1;
            if (!aIsMC && bIsMC) return 1;
            const aNum = parseInt(aShort.replace(/[^0-9]/g, '')) || 0;
            const bNum = parseInt(bShort.replace(/[^0-9]/g, '')) || 0;
            if (aNum !== bNum) return aNum - bNum;
            return a.l.localeCompare(b.l);
        });
        return items;
    },

    updateSurveyors(highlightName = null) {
        const container = document.getElementById('f-surveyor');
        if (!container) return;

        if (highlightName) State.lastHighlightedSurveyor = highlightName;
        const activeHighlight = highlightName || State.lastHighlightedSurveyor;
        const currentSelected = this.getSelected('f-surveyor');

        // Contextual Sorting: 1. Highlighted (Active View), 2. Selected (Checked), 3. Alphabetical
        const sortedList = [...State.availableSurveyors].sort((a, b) => {
            if (a === activeHighlight) return -1;
            if (b === activeHighlight) return 1;
            const aSel = currentSelected.includes(a);
            const bSel = currentSelected.includes(b);
            if (aSel && !bSel) return -1;
            if (!aSel && bSel) return 1;
            return a.localeCompare(b);
        });

        // Calculate Surveyor Counts for current active filter (excluding surveyor filter itself)
        const survCounts = {};
        if (typeof RAW_DATA !== 'undefined') {
            // Get other filters to show potential counts
            const dists = this.getSelected('f-dist');
            const tehsils = this.getSelected('f-tehsil');
            const mcs = this.getSelectedMCUC();
            const pay = this.getSelected('f-pay');
            const driveOnly = document.getElementById('f-drive-only')?.checked;
            const start = document.getElementById('f-start')?.value || '';
            const end = document.getElementById('f-end')?.value || '';
            const cat_domestic = State.quickFilters.domestic;
            const cat_commercial = State.quickFilters.commercial;

            RAW_DATA.forEach(r => {
                // Check if this record matches ALL other filters
                if (dists.length && !dists.includes(r[10])) return;
                if (tehsils.length && !tehsils.includes(r[11])) return;
                if (mcs.length && !mcs.includes(r[12])) return;
                if (pay.length) {
                    const status = r[16].toLowerCase().replace(' ', '-');
                    if (!pay.includes(status)) return;
                }
                const sid = String(r[0]).replace(/\.0$/, '').trim();
                if (driveOnly && !State.syncedData[sid]) return;

                if (start || end) {
                    const dStr = r[7];
                    if (!dStr || dStr === '0000-00-00' || dStr === '-') return;
                    if (start && dStr < start) return;
                    if (end && dStr > end) return;
                }
                if (cat_domestic || cat_commercial) {
                    const isCom = r[3] === 1;
                    if (isCom && !cat_commercial) return;
                    if (!isCom && !cat_domestic) return;
                }

                if (r[6]) survCounts[r[6]] = (survCounts[r[6]] || 0) + 1;
            });
        }

        container.innerHTML = sortedList.map(name => {
            const isSelected = currentSelected.includes(name);
            const isHighlighted = name === activeHighlight;
            const count = survCounts[name] || 0;
            return `
                    <div class="multi-option ${isSelected ? 'selected' : ''} ${isHighlighted ? 'active-context' : ''}" 
                         data-value="${name}" onclick="App.handleMultiClick(event, 'f-surveyor', 'apply')">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="App.handleMultiChange(event, 'f-surveyor', 'apply')">
                        <span style="${isHighlighted ? 'font-weight:800; color:var(--primary);' : ''}">
                            ${count > 0 ? `<span style="opacity:0.6; font-size:9px; margin-right:4px;">(${count})</span>` : ''}${name}
                        </span>
                    </div>
                `;
        }).join('');
    },

    setSurveyorFilter(selectedValues) {
        // selectedValues is an array from multi-select
        State.surveyorFilter = selectedValues.length > 0 ? selectedValues : [];
        this.apply();
        // If in list view, re-render implies updating the current view
        if (document.getElementById('list-view-stage').classList.contains('active')) {
            State.currentIdx = 0;
            ListView.render();
        }
    },

    apply(isInitial = false) {
        // Routing Persistence: Exit route mode if user changes filters
        if (State.originalFiltered && !isInitial) {
            if (window.SpatialRouter) SpatialRouter.clear(true);
        }

        // Gather all filter criteria upfront
        const dists = this.getSelected('f-dist');
        const tehsils = this.getSelected('f-tehsil');
        const mcs = this.getSelectedMCUC();
        const pay = this.getSelected('f-pay');
        const driveOnly = document.getElementById('f-drive-only')?.checked;
        const start = document.getElementById('f-start')?.value || '';
        const end = document.getElementById('f-end')?.value || '';
        const surv = this.getSelected('f-surveyor');

        // STRICT GUARD: If no MC/UC selected, CLEAR map and exit
        // This prevents "show all" logic which is unusable with large data
        if (mcs.length === 0) {
            State.filtered = [];
            State.masterFiltered = [];
            State.originalFiltered = []; // CRITICAL: Clear routing fallback
            this.updateSidebarStatus();
            this.updateSurveyors();
            this.render();
            return;
        }

        const categories = [];
        if (State.quickFilters.domestic) categories.push('domestic');
        if (State.quickFilters.commercial) categories.push('commercial');

        // DEBUG: Drive Filter Diagnostics
        if (driveOnly) {
            const syncedCount = Object.keys(State.syncedData).length;
            console.group("Drive Filter Debug");
            console.log("Drive Only Filter Enabled");
            console.log(`State.syncedData Keys: ${syncedCount}`);
            if (RAW_DATA.length > 0) {
                const testID = String(RAW_DATA[0][0]).trim();
                console.log(`Sample Comparison ID [${testID}] -> Synced?`, !!State.syncedData[testID]);
                if (syncedCount > 0) {
                    console.log("Sample Keys in Registry:", Object.keys(State.syncedData).slice(0, 5));
                }
            }
            if (syncedCount === 0) {
                console.warn("FILTER WARNING: Show Drive Images is ON but No Synced Data is loaded. All markers will be hidden.");
            }
            console.groupEnd();
        }

        const result = [];
        const availableSurvSet = new Set();
        const seenSIDs = new Set();

        if (typeof RAW_DATA === 'undefined') {
            console.warn("[App.apply] RAW_DATA not found. Skipping filter pass.");
            State.filtered = [];
            State.masterFiltered = [];
            this.updateSidebarStatus();
            this.updateSurveyors();
            this.render();
            return;
        }

        for (let i = 0; i < RAW_DATA.length; i++) {
            const r = RAW_DATA[i];

            // 1. Geography
            if (dists.length && !dists.includes(r[10])) continue;
            if (tehsils.length && !tehsils.includes(r[11])) continue;
            if (mcs.length && !mcs.includes(r[12])) continue;

            // 2. Dates
            if (start || end) {
                const dStr = r[7];
                if (!dStr || dStr === 'NaT' || dStr === '-' || dStr === '0000-00-00') continue;
                if (start && dStr < start) continue;
                if (end && dStr > end) continue;
            }

            // 3. Payment
            if (pay.length) {
                const status = r[16].toLowerCase().replace(' ', '-');
                if (!pay.includes(status)) continue;
            }

            // 4. Drive Sync
            // 5. Drive Sync Marker Logic
            if (driveOnly) {
                const sid = String(r[0]).replace(/\.0$/, '').trim();
                const isSynced = !!State.syncedData[sid];
                if (!isSynced) continue;
            }

            // 5. Category
            if (categories.length > 0) {
                const isCom = r[3] === 1;
                const matchCom = isCom && categories.includes('commercial');
                const matchDom = !isCom && categories.includes('domestic');
                if (!matchCom && !matchDom) continue;
            }

            // Track available surveyors (before surveyor filter)
            if (r[6]) availableSurvSet.add(r[6]);

            // 6. Surveyor Filter (applied last)
            if (surv.length && !surv.includes(r[6])) continue;

            // 7. Duplicate Guard (Global)
            if (seenSIDs.has(r[0])) continue;
            seenSIDs.add(r[0]);

            result.push(r);
        }

        // INDEX STICKINESS: Preserve focus on the current record if it still exists in the new filter
        const currentSID = State.filtered && State.filtered[State.currentIdx] ? String(State.filtered[State.currentIdx][0]) : null;
        
        State.filtered = result;
        State.masterFiltered = [...result]; 
        State.availableSurveyors = Array.from(availableSurvSet).sort();

        if (currentSID) {
            const newIdx = result.findIndex(r => String(r[0]) === currentSID);
            if (newIdx !== -1) {
                State.currentIdx = newIdx;
            } else if (!isInitial && !window._preserveIdx) {
                State.currentIdx = 0;
            }
        } else if (!isInitial && !window._preserveIdx) {
            State.currentIdx = 0;
        }
        
        window._preserveIdx = false; 
        State.payColorMode = pay.length > 0;

        this.updateSidebarStatus();
        this.updateSurveyors();
        this.render(null, isInitial);

        if (!isInitial) {
            if (window.innerWidth <= 768) {
                // Determine if sidebar is open without triggering reflows unnecessarily
                const sb = document.getElementById('sidebar');
                if (sb && sb.classList.contains('open')) {
                    if (!document.getElementById('list-view-stage')?.classList.contains('active')) {
                        console.log("[App.apply] Closing sidebar on mobile...");
                        Sidebar.close();
                    }
                }
            }
        }

        // Session persistence disabled per user request to prioritize stability
    },

    triggerInstall() {
        if (window.deferredPrompt) {
            console.log("[App.triggerInstall] Prompting user...");
            window.deferredPrompt.prompt();
            window.deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('User accepted the Install prompt');
                } else {
                    console.log('User dismissed the Install prompt');
                }
                window.deferredPrompt = null;
                const installBtn = document.getElementById('sidebar-install-btn');
                if (installBtn) installBtn.style.display = 'none';
            });
        } else {
            console.warn("[App.triggerInstall] No deferred prompt available.");
        }
    },

    render(limit = null, forceSyncView = false) {
        // 1. Initial Cleanup
        if (State.markerLayer) {
            State.map.removeLayer(State.markerLayer);
        }

        State.markers.clearLayers();
        State.markerLayer = L.layerGroup();

        // 2. Interaction State
        const isRouterActive = (window.SpatialRouter && SpatialRouter.isRoutingPanelOpen());
        const isRouting = isRouterActive;

        State.markerLayer.addTo(State.map);

        // 3. Statistics & Caps
        // Priority: Always honor active filter (State.filtered). 
        // Fallback to originalFiltered only if filtered is empty but we are in a routing session.
        let dataPool = (State.filtered && State.filtered.length > 0)
            ? State.filtered
            : (isRouting && State.originalFiltered ? State.originalFiltered : []);

        if (isRouting && (!State.originalFiltered || State.originalFiltered.length === 0)) {
            console.log("[RENDER] Routing active - using current filtered pool.");
        }

        const totalCount = dataPool.length;
        const effectiveLimit = limit || State.getEffectiveMarkerLimit();
        const displayCount = Math.min(totalCount, effectiveLimit);
        const data = dataPool.slice(0, effectiveLimit);

        console.log(`[RENDER] Mode: ${isRouting ? 'Routing' : 'Normal'}, Pool: ${dataPool.length}, Display: ${data.length}`);

        const countEl = document.getElementById('stat-count');
        if (countEl) countEl.innerText = `${displayCount} / ${totalCount}`;

        const labelEl = document.getElementById('stat-label');
        if (labelEl) {
            let labelHTML = "Total Survey";
            const mcs = this.getSelectedMCUC ? this.getSelectedMCUC() : [];
            const tehsils = this.getSelected ? this.getSelected('f-tehsil') : [];
            const dists = this.getSelected ? this.getSelected('f-dist') : [];
            if (mcs.length > 0) labelHTML = `Total Survey <span style="font-size:9px; font-weight:400; opacity:0.8; display:block;">(${mcs.length === 1 ? mcs[0] : mcs.length + ' Areas'})</span>`;
            else if (tehsils.length > 0) labelHTML = `Total Survey <span style="font-size:9px; font-weight:400; opacity:0.8; display:block;">(${tehsils.length === 1 ? tehsils[0] : tehsils.length + ' Tehsils'})</span>`;
            else if (dists.length > 0) labelHTML = `Total Survey <span style="font-size:9px; font-weight:400; opacity:0.8; display:block;">(${dists.length === 1 ? dists[0] : dists.length + ' Districts'})</span>`;
            
            // Add Drive Sync Warning if applicable
            const driveOnly = document.getElementById('f-drive-only')?.checked;
            if (driveOnly && Object.keys(State.syncedData).length === 0) {
                labelHTML += `<div style="color:var(--danger); font-size:9px; margin-top:2px;">⚠️ NO DRIVE SYNC DATA</div>`;
            }
            
            labelEl.innerHTML = labelHTML;
        }

        // 4. Rendering Loop
        const bounds = L.latLngBounds();
        let renderErrors = 0;

        data.forEach((r, idx) => {
            try {
                if (!r || !r[1] || !r[2] || isNaN(r[1]) || isNaN(r[2])) return;

                const status = (r[16] || 'unpaid').toLowerCase().replace(' ', '-');
                let color = HIERARCHY?.[r[10]]?.[r[11]]?.[r[12]]?.c || '#2563eb';

                if (State.payColorMode) {
                    if (status === 'paid') color = '#22c55e';
                    else if (status === 'unpaid') color = '#ef4444';
                    else color = '#94a3b8';
                }

                const m = L.circleMarker([r[1], r[2]], {
                    radius: 5,
                    fillColor: color,
                    color: 'rgba(0,0,0,0.6)',
                    weight: 1,
                    fillOpacity: 0.6,
                    interactive: false, // Make visible dot completely non-interactive
                    id: r[0]?.toString()
                });

                // Touch-optimized target size (v2026.05.18)
                const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 768);
                const hitRadius = isTouch ? 26 : 16;

                const mHit = L.circleMarker([r[1], r[2]], {
                    radius: hitRadius,
                    fillColor: 'transparent',
                    color: 'transparent',
                    weight: 0,
                    fillOpacity: 0,
                    bubblingMouseEvents: false,
                    id: r[0]?.toString()
                });
                mHit.addTo(State.markerLayer);

                // Hitbox click handler - Unified with precision overlap conflict picker
                mHit.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    
                    // High-Precision Overlap Detection relative to exact clicked LatLng coordinate
                    const nearby = App.findNearbyMarkersPixel(e.latlng, hitRadius + 5); 
                    if (nearby.length > 1) {
                        App.showNearbyMarkersPopup(nearby, e.latlng);
                        return;
                    }

                    App._markerHit = true;
                    
                    // Priority 1: Pickers (Start/End)
                    if (window.SpatialRouter && SpatialRouter.pickingMode) {
                        SpatialRouter.handleMarkerClick(r[0]);
                        return;
                    }

                    // If drawing area, markers should NOT be interactive
                    if (window.SpatialRouter && SpatialRouter.isDrawing) return;

                    // If routing panel is open AND actively editing/marking, clicking adds to pool
                    if (window.SpatialRouter && SpatialRouter.isMarkingMode()) {
                        SpatialRouter.addManualID(r[0]);
                        return;
                    }

                    // Default Action: Show Image Modal
                    if (window.SpatialRouter) {
                        console.log('[DEBUG mHit.on(click)] Calling showMarkerCard for:', r[0]);
                        SpatialRouter.showMarkerCard(r[0]);
                    }

                    if (State.activeMarker) {
                        State.activeMarker.closeTooltip();
                    }
                    
                    mHit.openTooltip();
                    m.bringToFront();
                    State.activeMarker = mHit;
                });

                // Bind Tooltip safely to the hitbox (mHit) for a larger, responsive hover targets
                this.bindCustomTooltip(mHit, `${r[0]} | ${r[4] || 'Unknown'}`);

                State.markers.addLayer(m);
                m.addTo(State.markerLayer);
                bounds.extend([r[1], r[2]]);

            } catch (err) {
                renderErrors++;
                if (renderErrors < 5) console.error(`[RENDER ERROR] Record ${idx} (#${r?.[0]}):`, err);
            }
        });
        if (renderErrors > 0) console.warn(`[RENDER] Completed with ${renderErrors} individual failures.`);

        if (bounds.isValid()) {
            const currentBounds = State.map.getBounds();
            const threshold = 0.0001; // Tiny threshold to prevent fitBounds loops
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            
            if (forceSyncView && (Math.abs(currentBounds.getSouth() - sw.lat) > threshold || 
                Math.abs(currentBounds.getWest() - sw.lng) > threshold ||
                Math.abs(currentBounds.getNorth() - ne.lat) > threshold ||
                Math.abs(currentBounds.getEast() - ne.lng) > threshold)) {
                
                State.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
            }
        }
        if (window.MapNavigator) MapNavigator.updateUI();

        // Integrate Verified Layer (New Locations)
        if (window.VerifiedLayer) VerifiedLayer.renderLayer();

        if (typeof ListView !== 'undefined' && document.getElementById('list-view-stage')?.classList.contains('active')) {
            ListView.render();
        }
    },

    bindCustomTooltip(marker, content, forcePermanent = false) {
        if (!marker || !content) return;
        
        // UNIFIED TOOLTIP SYSTEM (v2026.04.20.FINAL)
        // This handles both hover and touch (sticky) tooltips.
        const tooltipOptions = {
            permanent: forcePermanent,
            direction: 'top',
            offset: [0, -10],
            className: 'active-nav-tooltip custom-tooltip', 
            opacity: 1,
            sticky: !forcePermanent // Follow mouse only if not fixed
        };

        marker.unbindTooltip();
        marker.bindTooltip(`${content}<div class="tooltip-arrow"><div class="tooltip-arrow-stem"></div><div class="tooltip-arrow-tip"></div></div>`, tooltipOptions);
        
        if (forcePermanent) marker.openTooltip();
    },

    saveSession() {
        return;
    },

    resumeSession() {
        return;
    },

    showToast(msg, duration = 2000) {
        const toast = document.createElement('div');
        toast.className = 'rsp-toast';
        toast.style.cssText = `
            position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
            background: rgba(15, 23, 42, 0.9); color: white; padding: 8px 16px;
            border-radius: 20px; font-size: 12px; font-weight: 700; z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2); animation: fadeInUp 0.3s ease;
        `;
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.5s ease';
            setTimeout(() => toast.remove(), 500);
        }, duration);
    }
};
