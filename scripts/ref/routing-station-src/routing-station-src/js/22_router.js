const SpatialRouter = {
    currentPage: 1,
    chunkSize: 25,
    initialized: false,
    isDrawing: false,
    isLocked: false,
    points: [],
    capturedIDs: [],
    sequence: [],
    startId: null,
    endId: null,
    undoStack: [],
    redoStack: [],
    backgroundLayers: [],
    drawnPolygons: [],
    currentDrawLayer: null,
    activeTab: 'editor',
    isEditing: false,
    pickingMode: null,
    activePolygon: null,
    activeDisplayRoutes: [],
    batchRouteSequences: [],
    batchRoutePolygons: [],
    collapsedGroups: new Set(),
    verifiedSIDs: new Map(),

    init() {
        window.SpatialRouter = this;
        this.initialized = true;
    },



    async showMarkerCard(sid) {
        if (!sid) return;
        
        console.log('[DEBUG showMarkerCard] Called with sid:', sid);
        
        // SAFETY: Always clear any contextual HUDs (Pinning, Crosshair) when moving markers
        this.resetHUD();

        // Open Map Navigator when marker is clicked
        if (window.MapNavigator && typeof MapNavigator.show === 'function') {
            MapNavigator.show();
        }

        // Decoupling: Ensure map toolbars stay visible if we are in an active navigation flow
        const navActive = window.MapNavigator && MapNavigator.visible;
        if (!navActive && window.UIInteractions && UIInteractions.toggleExtraCtrls) {
            // UIInteractions.toggleExtraCtrls(true);
        }

        const sidStr = String(sid).trim();
        const row = window.SID_MAP ? window.SID_MAP.get(sidStr) : null;
        if (!row) {
            console.warn(`Marker details not found for SID: ${sidStr}`);
            return;
        }

        document.getElementById('marker-card-title').innerText = `#${sidStr}`;
        const name = decodePII(row[4]) || 'Unknown';
        const addr = decodePII(row[5]) || 'No Address';
        const surveyor = row[6] || 'Unknown Surveyor';
        document.getElementById('marker-card-sub').innerHTML = `<b>${name}</b> &bull; ${addr}`;
        document.getElementById('marker-card-surveyor').innerText = surveyor;
        document.getElementById('marker-card-date-time').innerText = `${row[7] || '-'} | ${row[8] || '-'}`;
        document.getElementById('marker-card-mc').innerText = row[12] || '-';

        const imgEl = document.getElementById('marker-card-img');
        const portalImg = (Array.isArray(row[9]) && row[9].length > 0) ? row[9][0] : '';
        if (portalImg && portalImg.startsWith('http')) {
            imgEl.src = portalImg;
        } else {
            imgEl.src = 'https://placehold.co/400x400?text=No+Structure+Image';
        }

        imgEl.onclick = () => {
            if (typeof Gallery !== 'undefined' && typeof Gallery.open === 'function') {
                Gallery.open(imgEl.src, String(sid));
            } else if (App && typeof App.openGallery === 'function') {
                App.openGallery(String(sid));
            }
        };

        const cacheKey = `${sid}_${window.ACTIVE_BILLING_MONTH}`;
        let verifierInfo = this.verifiedSIDs.get(cacheKey);

        // INSTANT SYNC: Check global data if not in local cache
        if (!verifierInfo && window.ALL_VERIFIED_DATA) {
            const globalVerif = window.ALL_VERIFIED_DATA.find(v => String(v.survey_id) === String(sidStr));
            if (globalVerif) {
                verifierInfo = globalVerif;
                this.verifiedSIDs.set(cacheKey, globalVerif);
            }
        }

        const btnManual = document.getElementById('btn-manual-pin');
        if (btnManual) {
            // TOOLBAR MODE: View Only (non-interactive)
            btnManual.onclick = () => this.startManualPin(sid, false);
            btnManual.disabled = false;
            btnManual.style.opacity = '1';
            btnManual.style.background = '#8b5cf6';
        }

        // ACCOUNTABILITY BADGE SYNC
        const statusBadge = document.getElementById('marker-card-status-badge');
        const statusText = document.getElementById('marker-status-text');
        if (statusBadge && statusText) {
            if (verifierInfo) {
                statusBadge.classList.add('verified');
                statusText.innerHTML = `Verified by ${verifierInfo.verified_by || 'Unknown'} <small style="display:block; opacity:0.7; font-size:9px;">@ ${verifierInfo.verified_at?.split('T')[0] || '-'}</small>`;
                statusBadge.querySelector('.material-icons-round').innerText = 'verified';
            } else {
                statusBadge.classList.remove('verified');
                statusText.innerText = 'Unverified';
                statusBadge.querySelector('.material-icons-round').innerText = 'history';
            }
        }

        // STATIC DELIVERY INDICATOR SYNC
        const deliveryIndicator = document.getElementById('btn-delivery-modal');
        if (deliveryIndicator) {
            const staging = State.unsavedChanges[sidStr];
            const isDeliveredStaged = staging && staging.is_delivered;
            const isDeliveredCommitted = verifierInfo && verifierInfo.is_delivered;
            
            if (isDeliveredStaged || isDeliveredCommitted) {
                deliveryIndicator.classList.add('active');
                deliveryIndicator.title = "Marked as Delivered";
            } else {
                deliveryIndicator.classList.remove('active');
                deliveryIndicator.title = "Not Delivered";
            }
        }

        const btnListView = document.getElementById('btn-modal-list-view');
        if (btnListView) {
            btnListView.onclick = () => {
                this.closeMarkerCard();
                if (window.ListView && ListView.jumpFromMap) {
                    ListView.jumpFromMap(sid);
                } else {
                    const sidIdx = State.filtered.findIndex(r => String(r[0]) === String(sid));
                    if (sidIdx !== -1) State.currentIdx = sidIdx;
                    if (typeof ViewSwitcher !== 'undefined') ViewSwitcher.toList(false);
                }
            };
        }

        const modal = document.getElementById('modal-marker-card');
        const isActive = modal.classList.contains('active');

        modal.style.display = 'flex';
        modal.style.visibility = 'visible';

        if (!isActive) {
            const content = modal.querySelector('.marker-card-content');
            if (content) content.style.transform = 'translateY(-10px) scale(0.98)';

            setTimeout(() => {
                modal.classList.add('active');
                if (content) content.style.transform = 'translateY(0) scale(1)';
            }, 10);
        } else {
            modal.classList.add('active');
        }

        // Tight focus for better visibility
        if (window.map && row[1] && row[2]) {
            const lat = parseFloat(row[1]);
            const lng = parseFloat(row[2]);
            const center = window.map.getCenter();
            const dist = Math.sqrt(Math.pow(center.lat - lat, 2) + Math.pow(center.lng - lng, 2));
            if (dist > 0.0001 || window.map.getZoom() < 19) {
                window.map.flyTo([lat, lng], 19, { padding: [50, 50], duration: 0.4 });
            }
        }

        // SYNC: Update Map Navigator and Index
        if (window.App && window.State) {
            if (typeof App.updateSurveyors === 'function') App.updateSurveyors(row[6]);
            const sIdx = State.filtered.findIndex(record => record[0]?.toString() === sidStr);
            if (sIdx !== -1) {
                State.currentIdx = sIdx;
                
                // TOOLTIP ENHANCEMENT: Maintain persistent tooltip for the active marker
                if (window.State && State.markerLayer) {
                    State.markerLayer.eachLayer(layer => {
                        if (layer.options.id === sidStr) {
                            if (State.activeMarker && State.activeMarker !== layer) {
                                // Revert previous marker to hover-only mode
                                const prevRow = window.SID_MAP.get(String(State.activeMarker.options.id));
                                if (prevRow) {
                                    App.bindCustomTooltip(State.activeMarker, `<b>#${prevRow[0]}</b><br>${decodePII(prevRow[4]) || 'House'}`, false);
                                }
                                State.activeMarker.closeTooltip();
                            }
                            // Forced persistent style for active interaction
                            const content = `<b>#${sidStr}</b><br>${decodePII(row[4]) || 'House'}`;
                            App.bindCustomTooltip(layer, content, true);
                            State.activeMarker = layer;
                        }
                    });
                }

                // If Navigator was visible, make sure it updates its UI
                if (window.MapNavigator && MapNavigator.visible) MapNavigator.updateUI();
            }
        }
    },

    closeMarkerCard() {
        const modal = document.getElementById('modal-marker-card');
        if (!modal || !modal.classList.contains('active')) return;

        modal.classList.remove('active');

        modal.style.pointerEvents = 'none';

        // Immediate visual reset to prevent "empty panel" flicker
        const content = modal.querySelector('.marker-card-content');
        if (content) {
            content.style.transform = 'translateY(10px) scale(0.98)';
        }

        // The CSS handles opacity/visibility transitions.
        // We only set display: none to completely remove it from interaction after transition.
        setTimeout(() => {
            if (!modal.classList.contains('active')) {
                modal.style.display = 'none';
                modal.style.visibility = '';
                modal.style.pointerEvents = '';
                // TOOLTIP SYNC: Close active persistent tooltip when card is closed
                if (window.State && State.activeMarker) {
                    State.activeMarker.closeTooltip();
                    State.activeMarker = null;
                }
            }
        }, 300);
    },

    refreshToolbar(sid) {
        const modal = document.getElementById('modal-marker-card');
        if (!modal || !modal.classList.contains('active')) return;
        
        // Only refresh if the card is showing this specific record
        const title = document.getElementById('marker-card-title')?.innerText || '';
        if (title !== `#${sid}`) return;

        const sidStr = String(sid).trim();
        const verifierInfo = this.verifiedSIDs.get(`${sidStr}_${window.ACTIVE_BILLING_MONTH}`) || (window.ALL_VERIFIED_DATA && window.ALL_VERIFIED_DATA.find(v => String(v.survey_id) === sidStr));

        // REFLEX: Static Delivery Indicator
        const deliveryIndicator = document.getElementById('btn-delivery-modal');
        if (deliveryIndicator) {
            const staging = State.unsavedChanges[sidStr];
            const isDeliveredStaged = staging && staging.is_delivered;
            const isDeliveredCommitted = verifierInfo && verifierInfo.is_delivered;
            
            if (isDeliveredStaged || isDeliveredCommitted) {
                deliveryIndicator.classList.add('active');
            } else {
                deliveryIndicator.classList.remove('active');
            }
        }
    },
    async saveHouseIntelligence(sid, options = {}) {
        console.log("[SaveIntel] Starting save for:", sid, options);
        
        try {
            if (!window._supabase) throw new Error("Supabase client not found.");
            console.log("[SaveIntel] Supabase client found");

            const sidStr = String(sid).trim();
            const row = window.SID_MAP ? window.SID_MAP.get(sidStr) : null;
            if (!row) throw new Error("Survey record not found in SID_MAP.");
            console.log("[SaveIntel] SID_MAP row found:", row ? "yes" : "no");
            
            const surveyorName = row[6] || 'Unknown Surveyor';
            const currentRoute = this.editingRouteName || (this.activeDisplayRoutes && this.activeDisplayRoutes.length > 0 ? this.activeDisplayRoutes[0] : 'Unknown Route');

            // Use pending pins if they exist, otherwise fallback to existing verified data or survey data
            const staging = State.unsavedChanges[sidStr];
            const pin = staging || {};
            const existing = (window.ALL_VERIFIED_DATA || []).find(v => String(v.survey_id) === sidStr);
            console.log("[SaveIntel] staging:", staging, "existing:", existing ? "yes" : "no");

            const finalLat = pin.lat || (existing && existing.latitude !== undefined ? existing.latitude : parseFloat(row[1]));
            const finalLng = pin.lng || (existing && existing.longitude !== undefined ? existing.longitude : parseFloat(row[2]));
            console.log("[SaveIntel] finalLat:", finalLat, "finalLng:", finalLng);

            // Final Validation Layer: Street and Sequence are mandatory
            const streetVal = options.street_no;
            const seqVal = parseInt(options.sequence_no);
            console.log("[SaveIntel] streetVal:", streetVal, "seqVal:", seqVal, "isNaN(seqVal):", isNaN(seqVal));
            
            if (!streetVal || isNaN(seqVal) || seqVal <= 0) {
                const errMsg = "Missing mandatory house intelligence data (Street/Sequence > 0). street=" + streetVal + ", seq=" + seqVal;
                console.error("[SaveIntel] VALIDATION FAILED:", errMsg);
                throw new Error(errMsg);
            }
            console.log("[SaveIntel] Validation passed");

            const payload = {
                survey_id: sidStr,
                latitude: finalLat,
                longitude: finalLng,
                surveyor_name: surveyorName,
                route_name: currentRoute,
                default_lat: parseFloat(row[1]),
                default_lng: parseFloat(row[2]),
                billing_month: window.ACTIVE_BILLING_MONTH,
                street_no: options.street_no || null,
                is_right: options.is_right === true,
                sequence_no: parseInt(options.sequence_no) || 0,
                is_delivered: options.is_delivered === true,
                delivered_at: options.is_delivered ? new Date().toISOString() : null,
                verified_by: window.USER ? window.USER.email : 'anonymous',
                verified_at: new Date().toISOString()
            };
            console.log("[SaveIntel] Payload prepared:", payload);

            // CRITICAL: Clear existing record first to ensure clean state and avoid constraint errors
            console.log("[SaveIntel] Deleting existing record...");
            const delResult = await window._supabase
                .from('verified_houses')
                .delete()
                .eq('survey_id', sidStr)
                .eq('billing_month', window.ACTIVE_BILLING_MONTH);
            console.log("[SaveIntel] Delete result:", delResult);

            console.log("[SaveIntel] Upserting new record...");
            const { data: upsertData, error } = await window._supabase.from('verified_houses').upsert([payload]);
            console.log("[SaveIntel] Upsert result. error:", error, "data:", upsertData);
            
            if (error) {
                console.error("Supabase Save Error:", error);
                throw error;
            }

            // Update Local Cache with FULL payload
            if (!window.ALL_VERIFIED_DATA) window.ALL_VERIFIED_DATA = [];
            window.ALL_VERIFIED_DATA = window.ALL_VERIFIED_DATA.filter(v => String(v.survey_id) !== sidStr);
            window.ALL_VERIFIED_DATA.push({...payload});
            try { localStorage.setItem('verified_houses_cache', JSON.stringify(window.ALL_VERIFIED_DATA)); } catch(e) { console.warn("Quota Exceeded", e); }
            console.log("[SaveIntel] Local cache updated with", payload.survey_id);

            // Clear staging state after successful save
            if (State.unsavedChanges[sidStr]) delete State.unsavedChanges[sidStr];
            
            if (App.showToast) App.showToast("Intelligence Saved Successfully!");
            
            // Close panel and re-render list to show saved data immediately
            if (window.ListView) {
                ListView.toggleActionPanel(sidStr, false);
                ListView.render();
            }
            return true;
        } catch (e) {
            console.error("[SaveIntel] ERROR:", e);
            if (App.showToast) App.showToast(`Error Saving: ${e.message}`);
            return false;
        }
    },

    async getHouseCoordinates(sid) {
        const sidStr = String(sid);
        
        // 1. Check local cache first
        if (window.ALL_VERIFIED_DATA) {
            const found = window.ALL_VERIFIED_DATA.find(v => String(v.survey_id) === sidStr);
            if (found && found.latitude && found.longitude) {
                return { lat: found.latitude, lng: found.longitude };
            }
        }

        // 2. Lazy fetch from Supabase if missing or metadata-only
        try {
            console.log(`[LazyLoad] Fetching coordinates for #${sidStr}...`);
            const { data, error } = await window._supabase
                .from('verified_houses')
                .select('latitude, longitude')
                .eq('survey_id', sidStr)
                .order('verified_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            if (data) {
                // Update local record so we don't fetch again
                if (window.ALL_VERIFIED_DATA) {
                    const idx = window.ALL_VERIFIED_DATA.findIndex(v => String(v.survey_id) === sidStr);
                    if (idx !== -1) {
                        window.ALL_VERIFIED_DATA[idx].latitude = data.latitude;
                        window.ALL_VERIFIED_DATA[idx].longitude = data.longitude;
                    }
                }
                return { lat: data.latitude, lng: data.longitude };
            }
        } catch (e) {
            console.warn("[LazyLoad] Failed to fetch coordinates:", e);
        }

        return { lat: null, lng: null };
    },

    async fetchVerifiedData() {
        // Fetch all verified data from Supabase to ensure local cache is up-to-date
        try {
            if (!window._supabase) return;
            const { data, error } = await window._supabase
                .from('verified_houses')
                .select('*')
                .eq('billing_month', window.ACTIVE_BILLING_MONTH);
            
            if (error) {
                console.warn("[VerifiedData] Fetch error:", error);
                return;
            }
            
            if (data && Array.isArray(data)) {
                window.ALL_VERIFIED_DATA = data;
                try { localStorage.setItem('verified_houses_cache', JSON.stringify(data)); } catch(e) { console.warn("Quota Exceeded", e); }
                console.log("[VerifiedData] Refreshed local cache with", data.length, "records");
            }
        } catch (e) {
            console.warn("[VerifiedData] Failed to refresh:", e);
        }
    },

    async verifyHouseLocation(sid, origLat, origLng, options = {}) {
        const btnSelector = `#btn-verify-house-${sid}, #btn-verify-house`;
        const buttons = document.querySelectorAll(btnSelector);

        buttons.forEach(btn => {
            btn.disabled = true;
            btn.innerHTML = '<span class="material-icons-round spinning">refresh</span>';
        });

        try {
            // Ensure Supabase is available globally
            if (!window._supabase) {
                throw new Error("Supabase client (window._supabase) not found. Check initialization.");
            }

            let newLat, newLng;

            if (options.manualLat && options.manualLng) {
                // Use manually provided coordinates
                newLat = options.manualLat;
                newLng = options.manualLng;
                console.log(`[Verify] Using manual coordinates: ${newLat}, ${newLng}`);
            } else {
                // Use GPS
                if (!navigator.geolocation) {
                    throw new Error("Geolocation not supported.");
                }

                const getPos = (opts) => new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, opts));
                let position;
                try {
                    position = await getPos({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
                } catch (e) {
                    console.warn("High-accuracy failed or timed out, trying standard accuracy...");
                    if (App.showToast) App.showToast("GPS taking long, using network location...");
                    position = await getPos({ enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 });
                }
                newLat = position.coords.latitude;
                newLng = position.coords.longitude;
            }

            const cleanSid = String(sid).replace(/\.0$/, '').trim();
            const row = window.SID_MAP ? window.SID_MAP.get(cleanSid) : null;
            const surveyorName = row ? (row[6] || 'Unknown Surveyor') : 'Unknown Surveyor';

            buttons.forEach(btn => {
                btn.innerHTML = '<span class="material-icons-round spinning">cloud_upload</span>';
            });

            const currentRoute = this.editingRouteName || (this.activeDisplayRoutes && this.activeDisplayRoutes.length > 0 ? this.activeDisplayRoutes[0] : 'Unknown Route');

            const payload = {
                survey_id: String(sid),
                latitude: newLat,
                longitude: newLng,
                surveyor_name: surveyorName,
                route_name: currentRoute,
                default_lat: origLat,
                default_lng: origLng,
                billing_month: ACTIVE_BILLING_MONTH,
                verified_by: window.USER ? window.USER.email : 'anonymous',
                verified_at: new Date().toISOString()
            };

            console.log("Saving verification payload:", payload);

            // CRITICAL: Delete any existing record for this house + month to prevent duplicates
            // Especially important when User B corrects User A's work.
            await window._supabase
                .from('verified_houses')
                .delete()
                .eq('survey_id', String(sid))
                .eq('billing_month', ACTIVE_BILLING_MONTH);

            const { data, error } = await window._supabase.from('verified_houses').upsert([payload]);

            if (error) {
                console.error("Supabase Save Error:", error);
                throw new Error(error.message || "Supabase insert rejected");
            }

            console.log("Verification saved successfully!");
            const cacheKey = `${sid}_${ACTIVE_BILLING_MONTH}`;
            const verInfo = {
                survey_id: String(sid),
                verified_by: payload.verified_by,
                verified_at: payload.verified_at,
                latitude: newLat,
                longitude: newLng
            };
            this.verifiedSIDs.set(cacheKey, { verified_by: payload.verified_by });

            // SYNC: Push to global verified data array for immediate stats update
            if (window.ALL_VERIFIED_DATA) {
                // Remove existing if it was a re-verification to prevent duplicates in list
                window.ALL_VERIFIED_DATA = window.ALL_VERIFIED_DATA.filter(v => String(v.survey_id) !== String(sid));
                window.ALL_VERIFIED_DATA.push(verInfo);
            }

            if (App.showToast) App.showToast(`Pinned at: ${newLat.toFixed(5)}, ${newLng.toFixed(5)}`);

            // REFRESH: Update VerifiedLayer and App to show comparison
            if (window.VerifiedLayer) {
                if (window.SID_MAP) {
                    const record = SID_MAP.get(String(sid));
                    if (record && record[12]) {
                        const mc = record[12];
                        if (!VerifiedLayer.selectedMCs.includes(mc)) {
                            VerifiedLayer.selectedMCs.push(mc);
                        }
                    }
                }
                if (VerifiedLayer.updateList) VerifiedLayer.updateList();
            }

            if (window.App && App.render) App.render();

            buttons.forEach(btn => {
                btn.style.background = '#475569';
                btn.style.color = 'white';
                btn.style.borderColor = '#475569';
                btn.innerHTML = '<span class="material-icons-round">check_circle</span>';
                btn.disabled = true;
            });

            // AUTOMATION: Automatically mark as delivered for the current month
            if (typeof ListView !== 'undefined' && ListView.markDelivered) {
                await ListView.markDelivered(sid, { silent: true, forceStatus: 'delivered' });
            }

            if (!options.skipModal) {
                this.showMarkerCard(sid);
            }
        } catch (err) {
            console.error("Verification Catch-All Error:", err);
            const msg = err.message || "Failed to save location";
            if (App.showToast) App.showToast(`Error: ${msg}`);
            buttons.forEach(btn => {
                btn.disabled = false;
                btn.innerHTML = '<span class="material-icons-round">my_location</span>';
            });
        }
    },

    startManualPin(sid, isInteractive = true) {
        if (!sid) return;
        const sidStr = String(sid).trim();
        const row = window.SID_MAP ? window.SID_MAP.get(sidStr) : null;
        if (!row) {
            console.error("Record not found in SID_MAP for manual pinning:", sidStr);
            return;
        }

        // Capture dirty fields before view context switch (Only if interactive)
        if (isInteractive) {
            const streetEl = document.getElementById(`intel-street-${sid}`);
            const seqEl = document.getElementById(`intel-seq-${sid}`);
            const sideR = document.getElementById(`intel-side-r-${sid}`);
            const delivered = document.getElementById(`intel-delivered-${sid}`);
            
            const streetVal = streetEl ? streetEl.value : null;
            const seqVal = seqEl ? parseInt(seqEl.value) : 0;
            const sideRVal = sideR ? sideR.checked : false;
            const deliveredVal = delivered ? delivered.checked : false;

            // Save to unsavedChanges (STAGING AREA)
            if (!State.unsavedChanges[sidStr]) State.unsavedChanges[sidStr] = {};
            State.unsavedChanges[sidStr].street_no = streetVal;
            State.unsavedChanges[sidStr].sequence_no = seqVal;
            State.unsavedChanges[sidStr].is_right = sideRVal;
            State.unsavedChanges[sidStr].is_delivered = deliveredVal;
            console.log("[startManualPin] Saved to staging:", State.unsavedChanges[sidStr]);
        }

        State.pinningOrigin = document.getElementById('list-view-stage').classList.contains('active') ? 'list' : 'map';
        State.pinningViewSid = sidStr; // Store SID for return navigation

        if (isInteractive) this.closeMarkerCard();
        this.resetHUD(); // Clear any existing HUDs
        
        if (window.ViewSwitcher && typeof ViewSwitcher.toMap === 'function') ViewSwitcher.toMap();

        // Switch to satellite for visual clarity during pin operations
        if (window.App && App.setLayer) App.setLayer('sat');

        const staging = State.unsavedChanges[sidStr] || {};
        const existing = window.ALL_VERIFIED_DATA ? window.ALL_VERIFIED_DATA.find(v => String(v.survey_id) === sidStr) : null;
        
        const targetLat = staging.lat || (existing && existing.latitude !== undefined ? existing.latitude : parseFloat(row[1]));
        const targetLng = staging.lng || (existing && existing.longitude !== undefined ? existing.longitude : parseFloat(row[2]));

        // VIEW MODE: Show cancel button and pin markers (non-interactive)
        if (!isInteractive) {
            // Create connection line from portal to manual pin
            const portalLat = parseFloat(row[1]);
            const portalLng = parseFloat(row[2]);
            
            State.manualPinLine = L.polyline([[portalLat, portalLng], [targetLat, targetLng]], {
                color: '#3b82f6',
                weight: 4,
                dashArray: '8, 4',
                opacity: 0.9
            }).addTo(State.map);
            
            // Portal location marker (Red circle)
            State.pinningRefMarker = L.circleMarker([portalLat, portalLng], {
                radius: 10,
                fillColor: '#ef4444',
                color: '#ef4444',
                weight: 2,
                fillOpacity: 0.4
            }).addTo(State.map);
            App.bindCustomTooltip(State.pinningRefMarker, `Portal: ${sidStr}`);
            
            // Manual pin location marker (Green circle)
            State.manualPinMarker = L.circleMarker([targetLat, targetLng], {
                radius: 10,
                fillColor: '#22c55e',
                color: '#22c55e',
                weight: 2,
                fillOpacity: 0.4
            }).addTo(State.map);
            App.bindCustomTooltip(State.manualPinMarker, `Manual Pin: ${sidStr}`);

            const mapContainer = document.getElementById('main-stage');
            if (mapContainer) {
                // Create cancel button
                const viewCancelBtn = document.createElement('button');
                viewCancelBtn.id = 'btn-view-pin-cancel';
                viewCancelBtn.innerHTML = `<span class="material-icons-round" style="font-size:18px;">arrow_back</span> Back`;
                viewCancelBtn.style.cssText = `
                    position: absolute;
                    bottom: 80px;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 10000;
                    background: #1e293b;
                    color: white;
                    border: none;
                    border-radius: 24px;
                    padding: 10px 20px;
                    font-size: 13px;
                    font-weight: 800;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    cursor: pointer;
                    white-space: nowrap;
                `;
                viewCancelBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.returnFromViewPin(sidStr);
                };
                mapContainer.appendChild(viewCancelBtn);
                viewCancelBtn.style.display = 'flex';
            }
            
            // Fly to show both markers
            const bounds = L.latLngBounds([[portalLat, portalLng], [targetLat, targetLng]]);
            State.map.flyToBounds(bounds, { padding: [50, 50], duration: 0.5 });
            return;
        }

        if (State.map) {
            State.map.flyTo([targetLat, targetLng], 19, { duration: 0.5 });
        }

        State.isPinning = isInteractive;
        State.pinningSID = sid;
        State.pinningOrigLat = targetLat;
        State.pinningOrigLng = targetLng;

        // NEW: Add reference marker for portal location on a high-visibility pane
        if (State.map) {
            if (State.pinningRefMarker) State.map.removeLayer(State.pinningRefMarker);
            
            // Draw a prominent connecting line if we have an offset from the original
            const origLat = parseFloat(row[1]);
            const origLng = parseFloat(row[2]);
            if (State.pinningRefLine) State.map.removeLayer(State.pinningRefLine);
            if (Math.abs(origLat - targetLat) > 0.00001 || Math.abs(origLng - targetLng) > 0.00001) {
                State.pinningRefLine = L.polyline([[origLat, origLng], [targetLat, targetLng]], {
                    color: '#f43f5e', weight: 4, dashArray: '5, 8', opacity: 0.85, interactive: false // Bright rose, obvious dash
                }).addTo(State.map);
            }

            State.pinningRefMarker = L.circleMarker([origLat, origLng], {
                radius: 12,
                color: '#f43f5e',
                fillColor: '#f43f5e',
                fillOpacity: 0.7,
                weight: 3,
                dashArray: '4, 4',
                pane: 'routingMarkerPane' // High Z-index pane (660)
            }).addTo(State.map)
                .bindTooltip("Portal Position", { permanent: true, direction: 'top', className: 'portal-ref-tooltip' });
        }

        if (isInteractive) {
            // Show HUD and Crosshair only in interactive mode
            const hud = document.getElementById('pinning-hud');
            const crosshair = document.getElementById('map-crosshair');
            const sidDisplay = document.getElementById('pinning-sid-display');
            
            if (hud) hud.style.display = 'flex';
            if (crosshair) crosshair.style.display = 'flex';
            if (sidDisplay) sidDisplay.innerText = `House #${sid}`;

            if (App.showToast) App.showToast("Target the house with the crosshair and click Confirm");
        } else if (App.showToast) {
            App.showToast(`Viewing Verified Location for #${sid}`);
        }
    },


    confirmManualPin() {
        if (!State.isPinning || !State.pinningSID) return;

        const center = State.map.getCenter();
        const sidStr = String(State.pinningSID);

        // MERGE new coordinates into existing staging (preserve user's edits)
        if (!State.unsavedChanges[sidStr]) State.unsavedChanges[sidStr] = {};
        State.unsavedChanges[sidStr].lat = center.lat;
        State.unsavedChanges[sidStr].lng = center.lng;
        State.unsavedChanges[sidStr].isManualPinned = true;
        console.log("[confirmManualPin] Updated staging with pin:", State.unsavedChanges[sidStr]);

        // Return to source view to complete the workflow
        const origin = State.pinningOrigin;
        this.resetHUD(); 
        
        if (App.showToast) App.showToast("Location Locked! Now fill details and click SAVE in the card.");
        
        if (origin === 'list' && window.ViewSwitcher) {
            ViewSwitcher.toList(false); // Do NOT reset index
            
            // Ensure Action Panel for this house is open
            setTimeout(() => {
                if (window.ListView) ListView.toggleActionPanel(sidStr, true);
            }, 300);
        } else if (App.showToast) {
             App.showToast("Pin Saved! Return to List to complete other details.");
        }
    },

    cancelManualPin(isSilent = false) {
        this.resetHUD();
        if (State.pinningOrigin === 'list' && !isSilent) {
            if (window.ViewSwitcher) ViewSwitcher.toList(false);
        }
        State.pinningOrigin = null;
        if (!isSilent && App.showToast) App.showToast("Pinning canceled");
    },

    returnFromViewPin(sid) {
        // Remove view cancel button
        const cancelBtn = document.getElementById('btn-view-pin-cancel');
        if (cancelBtn) cancelBtn.remove();
        
        // Clean up all markers and line
        if (State.map) {
            if (State.pinningRefMarker) {
                State.map.removeLayer(State.pinningRefMarker);
                State.pinningRefMarker = null;
            }
            if (State.manualPinMarker) {
                State.map.removeLayer(State.manualPinMarker);
                State.manualPinMarker = null;
            }
            if (State.manualPinLine) {
                State.map.removeLayer(State.manualPinLine);
                State.manualPinLine = null;
            }
        }
        
        // Return to list view at the same record
        if (window.ViewSwitcher) {
            ViewSwitcher.toList(false);
            // Find the index of the same record
            const idx = State.filtered.findIndex(r => String(r[0]) === String(sid));
            if (idx !== -1) {
                State.currentIdx = idx;
            }
            // Re-render list to show the same record
            if (window.ListView && ListView.render) ListView.render();
        }
    },

    resetHUD(clearVerifiedFocus = false) {
        State.isPinning = false;
        State.pinningSID = null;

        // CRITICAL: We only clear focus if explicitly requested (e.g. starting a new pin/draw)
        // prevents marker navigation from wiping connection lines/focus HUDs
        if (clearVerifiedFocus && window.VerifiedLayer && typeof VerifiedLayer.clearFocus === 'function') {
            VerifiedLayer.clearFocus();
        }

        // Remove reference marker
        if (State.pinningRefMarker && State.map) {
            State.map.removeLayer(State.pinningRefMarker);
            State.pinningRefMarker = null;
        }
        if (State.pinningRefLine && State.map) {
            State.map.removeLayer(State.pinningRefLine);
            State.pinningRefLine = null;
        }

        const hud = document.getElementById('pinning-hud');
        const crosshair = document.getElementById('map-crosshair');
        if (hud) hud.style.display = 'none';
        if (crosshair) crosshair.style.display = 'none';

        // Ensure MapNavigator is visible if in navigation mode, but do NOT flip its state
        if (window.MapNavigator && MapNavigator.visible) {
            MapNavigator.updateUI();
        }
    },

    cleanMCName(name) {
        if (!name) return 'Unknown Area';
        let cleaned = String(name)
            .replace(/Municipal Committee/gi, 'MC')
            .replace(/Union Council/gi, 'UC')
            .replace(/\s*(Bhalwal|Sargodha|Mianwali|Khushab|Tehsil)\s*/gi, '')
            .replace(/_Route_\d+/gi, '') // Remove route suffix
            .trim();
        // Standardize format to MC-X or UC-X
        const match = cleaned.match(/(MC|UC)[-\s]*(\d+)/i);
        if (match) return `${match[1].toUpperCase()}-${match[2]}`;
        return cleaned || 'Unknown Area';
    },

    getRouteArea(route) {
        if (!route) return 'Unknown Area';
        
        // 1. Explicit Metadata (Injected by Build Script)
        if (route.area) {
            const area = this.cleanMCName(route.area);
            if (area !== 'Unknown Area') return area;
        }

        // 2. Name-based Extraction (For Cloud-synced routes)
        if (route.name) {
            const nameArea = this.cleanMCName(route.name);
            if (nameArea !== 'Unknown Area') return nameArea;
        }

        // 3. Coordinate-based Lookup (Fallback for loaded routes)
        if (route.sequence && route.sequence.length > 0) {
            const isMapReady = window.SID_MAP instanceof Map;
            const sid = String(route.sequence[0].surveyId || route.sequence[0].id);
            const row = isMapReady ? window.SID_MAP.get(sid) : null;
            if (row && row[12]) return this.cleanMCName(row[12]);
        }

        return 'Unknown Area';
    },

    naturalCompare(a, b) {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    },

    toggleMCGroup(group) {
        const wasCollapsed = this.collapsedGroups.has(group);

        // Accordion logic: First, collapse all known groups
        (State.savedRoutes || []).forEach(route => {
            const area = this.getRouteArea(route);
            this.collapsedGroups.add(area);
        });

        // If the clicked group was collapsed before, open it now
        if (wasCollapsed) {
            this.collapsedGroups.delete(group);
        }
        // Otherwise it remains collapsed (toggled off)

        this.renderRouteManager();
        this.renderSavedList();
    },

    saveSnapshot() {
        this.undoStack.push({
            sequence: JSON.parse(JSON.stringify(this.sequence)),
            capturedIDs: [...this.capturedIDs],
            startId: this.startId,
            endId: this.endId
        });
        if (this.undoStack.length > 20) this.undoStack.shift();
        this.redoStack = [];
    },
    undo() {
        if (!this.undoStack.length) { if (App.showToast) App.showToast('Nothing to undo.'); return; }
        this.redoStack.push({
            sequence: JSON.parse(JSON.stringify(this.sequence)),
            capturedIDs: [...this.capturedIDs],
            startId: this.startId,
            endId: this.endId
        });
        const snap = this.undoStack.pop();
        this.sequence = snap.sequence;
        this.capturedIDs = snap.capturedIDs;
        this.startId = snap.startId;
        this.endId = snap.endId;
        this.syncState();
        this.renderRoute();
    },

    redo() {
        if (!this.redoStack.length) { if (App.showToast) App.showToast('Nothing to redo.'); return; }
        this.undoStack.push({
            sequence: JSON.parse(JSON.stringify(this.sequence)),
            capturedIDs: [...this.capturedIDs],
            startId: this.startId,
            endId: this.endId
        });
        const snap = this.redoStack.pop();
        this.sequence = snap.sequence;
        this.capturedIDs = snap.capturedIDs;
        this.startId = snap.startId;
        this.endId = snap.endId;
        this.syncState();
        this.renderRoute();
    },

    setEditMode(val) {
        this.isEditing = val;
        const toolbar = document.getElementById('routing-toolbar-row');
        if (toolbar) toolbar.style.display = (this.activeTab === 'editor' && val) ? 'flex' : (this.activeTab === 'editor' ? 'flex' : 'none');
    },

    _applyRoutes(data) {
        if (data && Array.isArray(data)) {
            // CRITICAL: Do NOT overwrite window.RAW_ROUTES as it contains the build-time area metadata
            State.savedRoutes = data;

            // Initialize Accordion state: collapse all areas by default
            data.forEach(route => {
                const area = this.getRouteArea(route);
                this.collapsedGroups.add(area);
            });

            if (this.renderSavedList) this.renderSavedList();
            if (this.renderRouteManager) this.renderRouteManager();
        }
    },

    async loadRoutes(filename = null, isInitial = false) {
        try {
            // OPTIMIZATION: Fetch metadata only to reduce initial egress
            const { data, error } = await window._supabase
                .from('saved_routes')
                .select('id, route_name, created_at')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const formattedData = data.map(item => {
                const route = {
                    id: item.id,
                    name: item.route_name,
                    created_at: item.created_at,
                    sequence: null, // Lazy-loaded later
                    area: null
                };

                // SMART MERGE: Lookup pre-calculated area from Build Script (RAW_ROUTES)
                if (window.RAW_ROUTES) {
                    const localMatch = window.RAW_ROUTES.find(r => r.name === item.route_name || r.id === item.id);
                    if (localMatch && localMatch.area) {
                        route.area = localMatch.area;
                    }
                }
                return route;
            });

            this._applyRoutes(formattedData);
            if (!isInitial && App.showToast) App.showToast("Cloud routes synced.");
        } catch (e) {
            console.warn("LoadRoutes error:", e);
            if (isInitial && window.RAW_ROUTES) this._applyRoutes(window.RAW_ROUTES);
        }
    },

    syncState() {
        if (!State.originalFiltered || State.originalFiltered.length === 0) {
            State.originalFiltered = [...(State.filtered || [])];
        }
        this.updateStats();
    },

    dumpDiagnostics() {
        console.group("SpatialRouter Diagnostics");
        console.log("Pool Size:", this.capturedIDs.length);
        console.log("Seq Size:", this.sequence.length);
        console.groupEnd();
    },

    async checkServerHealth() {
        const badge = document.getElementById('sync-server-badge');
        if (!badge) return;
        try {
            const { error } = await window._supabase
                .from('saved_routes')
                .select('id', { count: 'exact', head: true });
            if (error) throw error;
            badge.innerHTML = '<span style="font-size:8px;">☁ CLOUD</span>';
            badge.style.background = '#ecfdf5';
            badge.style.color = '#10b981';
            badge.style.borderColor = '#a7f3d0';
        } catch (e) {
            badge.innerHTML = '<span style="font-size:8px;">⚠ NO CLOUD</span>';
            badge.style.background = '#fef2f2';
            badge.style.color = '#ef4444';
            badge.style.borderColor = '#fecaca';
        }
    },

    toggleUI() {
        if (window.USER && window.USER.role !== 'admin') {
            if (App.showToast) App.showToast("Unauthorized: Admins only.");
            return;
        }
        const overlay = document.getElementById('routing-station-overlay');
        if (!overlay) return;

        const isActive = overlay.classList.toggle('active');
        overlay.style.display = isActive ? 'flex' : 'none';

        if (isActive) {
            this.activeTab = 'editor';
            this.switchTab('editor');
        } else {
            this.cancelDrawing();
            this.setEditMode(false);
        }
    },

    clear() {
        this.resetCurrentRoute();
    },

    clearMapDisplay() {
        // Clear persistent display layer
        if (this._displayLayer) { State.map.removeLayer(this._displayLayer); this._displayLayer = null; }
        this.activeDisplayRoutes = [];
        this.activeTab = 'manager';
        this._sidebarDisplayIdx = null; // Un-highlight
        this.editingRouteIdx = null; // Un-highlight
        this.setEditMode(false);
        this.toggleRoutePager(false);
        const modal = document.getElementById('modal-marker-card');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none'; // Immediate hide for clearMapDisplay
        }
        // Also clear editor state
        this.isBatchMode = false;
        this.batchRouteSequences = [];
        this.batchRoutePolygons = [];
        this.sequence = [];
        this.capturedIDs = [];
        if (this.sequenceLayer) { this.sequenceLayer.clearLayers(); }
        if (this.routeLayer) { State.map.removeLayer(this.routeLayer); this.routeLayer = null; }
        // Uncheck all display checkboxes
        document.querySelectorAll('.display-selector').forEach(cb => cb.checked = false);
        this.renderRoute();
        this.renderRouteManager();
        this.renderSavedList();

        if (App.showToast) App.showToast('Routing displays cleared.');
    },

switchTab(tab) {
        this.activeTab = tab;
        const pEditor = document.getElementById('routing-editor-panel');
        const pManager = document.getElementById('routing-manager-panel');
        const tEditor = document.getElementById('tab-editor');
        const tManager = document.getElementById('tab-manager');
        const toolbar = document.getElementById('routing-toolbar-row');

        if (pEditor) pEditor.style.display = tab === 'editor' ? 'flex' : 'none';
        if (pManager) pManager.style.display = tab === 'manager' ? 'flex' : 'none';
        if (tEditor) tEditor.classList.toggle('active', tab === 'editor');
        if (tManager) tManager.classList.toggle('active', tab === 'manager');
        if (toolbar) toolbar.style.display = tab === 'editor' ? 'flex' : 'none';

        const info = document.getElementById('active-routes-info');
        if (info) info.style.display = (tab === 'editor' && this.activeDisplayRoutes.length > 0) ? 'flex' : 'none';

        if (tab === 'editor') this.renderRoute();
        else this.renderRouteManager();
    },

    renderRouteManager() {
        const list = document.getElementById('route-manager-list');
        if (!list) return;

        list.innerHTML = '';
        if (!State.savedRoutes || !State.savedRoutes.length) {
            list.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">No saved routes found.</div>';
            return;
        }

        // Pre-process and sort routes by Area
        const routesWithMeta = State.savedRoutes.map((route, originalIdx) => {
            const area = this.getRouteArea(route);
            return { originalIdx, route, area };
        });

        // Sort primarily by Area (Natural Sort), secondarily by Original Route Name (Natural Sort)
        routesWithMeta.sort((a, b) => {
            const areaCmp = this.naturalCompare(a.area, b.area);
            if (areaCmp !== 0) return areaCmp;
            return this.naturalCompare(a.route.name || '', b.route.name || '');
        });

        const areaStats = {};
        let totalOverallPts = 0;
        routesWithMeta.forEach(r => {
            if (!areaStats[r.area]) areaStats[r.area] = { routes: 0, pts: 0 };
            areaStats[r.area].routes++;
            const pts = r.route.sequence ? r.route.sequence.length : 0;
            areaStats[r.area].pts += pts;
            totalOverallPts += pts;
        });

        // Update global "Designed Routes" header if it exists
        const overallHeader = document.getElementById('designed-routes-total');
        if (overallHeader) overallHeader.innerText = `(${routesWithMeta.length} routes, ${totalOverallPts} pts)`;

        let lastArea = null;
        let localIdx = 0;

        routesWithMeta.forEach(({ originalIdx, route, area }) => {
            if (area !== lastArea) {
                localIdx = 0;
                const isCollapsed = this.collapsedGroups.has(area);
                const stats = areaStats[area] || { routes: 0, pts: 0 };
                const header = document.createElement('div');
                header.style.cssText = 'padding:6px 8px; font-weight:800; font-size:11px; text-transform:uppercase; color:var(--primary); background:#f1f5f9; border-radius:6px; margin: 8px 0 4px 0; letter-spacing: 0.5px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;';
                header.onclick = () => this.toggleMCGroup(area);
                header.innerHTML = `<span>${area} <span style="color: darkorange; font-weight: bold; margin-left: 6px; font-size: 10px; text-transform: none;">(${stats.routes} routes, ${stats.pts} pts)</span></span> <span class="material-icons-round" style="font-size:14px;">${isCollapsed ? 'expand_more' : 'expand_less'}</span>`;
                list.appendChild(header);
                lastArea = area;
            }

            localIdx++;

            if (this.collapsedGroups.has(area)) return;

            const ptCount = route.sequence ? route.sequence.length : 0;
            const isActive = (this.editingRouteIdx === originalIdx) || (this._sidebarDisplayIdx === originalIdx);
            const activeStyle = isActive ? 'background: #eff6ff; border-left: 3px solid #3b82f6;' : '';

            const displayName = route.name || `Route ${localIdx}`;

            const item = document.createElement('div');
            item.className = 'v6-card';
            item.style.cssText = `padding: 8px; ${activeStyle}`;
            item.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px; width:100%;" onclick="event.stopPropagation()">
                <!-- Export Select -->
                <div style="display:flex; flex-direction:column; align-items:center; gap:2px; flex-shrink:0;" title="Select for Export" onclick="event.stopPropagation()">
                    <span class="material-icons-round" style="font-size:12px; color:#94a3b8;">file_download</span>
                    <input type="checkbox" class="route-selector" value="${originalIdx}" onclick="event.stopPropagation()" />
                </div>
                <!-- Display Select -->
                <div style="display:flex; flex-direction:column; align-items:center; gap:2px; flex-shrink:0;" title="Select for Map Display" onclick="event.stopPropagation()">
                    <span class="material-icons-round" style="font-size:12px; color:#16a34a;">visibility</span>
                    <input type="checkbox" class="display-selector" value="${originalIdx}" onclick="event.stopPropagation()" />
                </div>
                <div class="v6-badge" style="flex:0 0 24px; ${isActive ? 'background:#3b82f6; color:white;' : ''}">${localIdx}</div>
                <div class="v6-card-body" style="flex:1; min-width:0; padding:0 4px;" onclick="event.stopPropagation()">
                    <div class="v6-card-title" style="font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${isActive ? 'color:#1e40af;' : ''}" title="${displayName}">${displayName}</div>
                    <div class="v6-card-sub" style="font-size: 9px;"><span style="color: darkorange; font-weight: bold;">${ptCount} pts</span> | ${route.timestamp || ''}</div>
                </div>
                <div style="display:flex; align-items:center; gap:4px; margin-left:auto; flex-shrink:0;">
                    <button onclick="event.stopPropagation(); SpatialRouter.loadRoute(${originalIdx})" class="v6-action-btn" style="color:var(--primary)" title="Load for Edit">
                        <span class="material-icons-round" style="font-size:18px;">file_open</span>
                    </button>
                    <button onclick="event.stopPropagation(); SpatialRouter.deleteRouteServer(${originalIdx})" class="v6-action-btn" style="color:#ef4444" title="Delete Permanent">
                        <span class="material-icons-round" style="font-size:18px;">delete</span>
                    </button>
                </div>
            </div>
        `;
            list.appendChild(item);
        });
    },

    toggleSelectAllRoutes(checked, type = 'export') {
        const selector = type === 'export' ? '.route-selector' : '.display-selector';
        document.querySelectorAll(selector).forEach(cb => cb.checked = checked);
    },

    loadRoute(idx) {
        const r = State.savedRoutes[idx];
        if (!r || !r.sequence) return;
        this.isBatchMode = false;
        this.batchRouteSequences = [];
        this.batchRoutePolygons = [];

        // RESET PAGER STATE: Ensure new route starts from scratch
        this.currentPage = 1;
        this._activeMarkerIdx = -1;

        this.resetCurrentRoute();
        this.editingRouteIdx = idx;
        this.editingRouteId = r.id; // Store Supabase ID
        this.editingRouteName = r.name || `Route ${idx + 1}`;
        this.capturedIDs = r.sequence.map(p => String(p.surveyId || p.id));
        this.sequence = r.sequence.map(p => ({ id: String(p.surveyId || p.id), lat: p.lat, lng: p.lng, name: p.name }));
        this.activeDisplayRoutes = [this.editingRouteName];
        if (r.polygon) {
            this.activePolygon = L.polygon(r.polygon, { color: '#3b82f6', fillOpacity: 0.1, weight: 2 });
        }
        this.setEditMode(true);
        this.renderRoute();
        if (App.showToast) App.showToast(`Editing: ${this.editingRouteName}`);

        // Initialization for Marker 1
        this.updatePagerInfo(this.sequence.length);
        setTimeout(() => this.changeMarker(0, false), 400);

        // Route highlighting & global UI updates
        this.updateWatermark(this.editingRouteName);
        this.toggleClearRouteButton(true);
        this.renderRouteManager();

        // Sync MapNavigator
        const seqOrder = new Map(r.sequence.map((p, i) => [String(p.surveyId || p.id), i]));
        State.filtered = (window.RAW_DATA || [])
            .filter(row => seqOrder.has(String(row[0])))
            .sort((rowA, rowB) => seqOrder.get(String(rowA[0])) - seqOrder.get(String(rowB[0])));
        State.currentIdx = 0;

        this.renderDisplayLayer();
        this.toggleRoutePager(true);
        if (window.MapNavigator) MapNavigator.updateUI();

        // Refinement: Start at first marker on load
        this._activeMarkerIdx = 0;
        setTimeout(() => this.changeMarker(0), 400);
    },

    batchLoadDisplay() {
        const selected = Array.from(document.querySelectorAll('.display-selector:checked'));

        // Clear previous display layer
        if (this._displayLayer) { State.map.removeLayer(this._displayLayer); this._displayLayer = null; }
        this.activeDisplayRoutes = [];

        if (selected.length === 0) {
            // Update info bar
            const info = document.getElementById('active-routes-info');
            if (info) info.style.display = 'none';
            if (App.showToast) App.showToast("Display routes cleared.");
            return;
        }

        // Build persistent display layer (independent of editor)
        this._displayLayer = L.layerGroup().addTo(State.map);
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

        selected.forEach((cb, rIdx) => {
            const idx = parseInt(cb.value);
            const r = State.savedRoutes[idx];
            if (!r || !r.sequence) return;

            this.activeDisplayRoutes.push(r.name || `Route ${idx + 1}`);
            const color = colors[rIdx % colors.length];
            const pts = [];

            r.sequence.forEach((p, sIdx) => {
                const lat = p.lat, lng = p.lng;
                pts.push([lat, lng]);
                const m = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'route-marker-square',
                        html: sIdx + 1
                    }),
                    pane: 'routingMarkerPane'
                }).addTo(this._displayLayer);
                App.bindCustomTooltip(m, `#${p.surveyId || p.id}`);
                m.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    App._markerHit = true;
                    this.highlightMarker(String(p.surveyId || p.id), lat, lng);
                });
            });

            if (pts.length > 1) {
                L.polyline(pts, { color: color, weight: 3, opacity: 0.7, dashArray: '6,4' }).addTo(this._displayLayer);
            }
            if (r.polygon) {
                L.polygon(r.polygon, { color: '#94a3b8', fillOpacity: 0.08, weight: 1.5, dashArray: '5,5', interactive: false }).addTo(this._displayLayer);
            }
        });

        // Update info bar
        const info = document.getElementById('active-routes-info');
        if (info && this.activeTab === 'editor') info.style.display = this.activeDisplayRoutes.length > 0 ? 'flex' : 'none';

        if (App.showToast) App.showToast(`Displaying ${selected.length} routes (background).`);
    },

    async deleteRouteServer(idx) {
        const r = State.savedRoutes[idx];
        if (!r) return;
        const warningMsg = `⚠️ WARNING: You are about to PERMANENTLY delete the route "${r.name}" from the cloud.\n\nThis action CANNOT BE UNDONE.\n\nAre you absolutely sure you want to delete this route?`;
        if (!confirm(warningMsg)) return;

        try {
            const { error } = await window._supabase
                .from('saved_routes')
                .delete()
                .eq('id', r.id);

            if (error) throw error;

            State.savedRoutes.splice(idx, 1);
            this.renderRouteManager();
            if (App.showToast) App.showToast("Route deleted from Cloud.");
        } catch (e) {
            console.error("Supabase error during delete:", e);
            if (App.showToast) App.showToast("Failed to delete from Cloud.");
        }
    },


    batchExport() {
        const selected = Array.from(document.querySelectorAll('.route-selector:checked')).map(cb => parseInt(cb.value));
        if (selected.length === 0) { if (App.showToast) App.showToast("No routes selected."); return; }

        const isMapReady = window.SID_MAP instanceof Map;
        let allPoints = [];

        selected.forEach(idx => {
            const r = State.savedRoutes[idx];
            if (r && r.sequence) {
                r.sequence.forEach((p, i) => {
                    let area = '';
                    const sid = String(p.surveyId || p.id);
                    const row = isMapReady ? window.SID_MAP.get(sid) : null;
                    if (row && row[12]) area = this.cleanMCName(row[12]);

                    allPoints.push({
                        area: area || 'Unknown Area',
                        routeSeq: i + 1,
                        routeName: r.name || 'Untitled',
                        sid: sid,
                        name: p.name || '',
                        lat: p.lat,
                        lng: p.lng
                    });
                });
            }
        });

        // Sort completely by Area
        allPoints.sort((a, b) => a.area.localeCompare(b.area));

        let csv = "Global Seq,Route Seq,Route Name,Survey ID,Name,MC/Area,Lat,Lng\n";
        let globalSeq = 1;
        allPoints.forEach(pt => {
            csv += `${globalSeq},${pt.routeSeq},"${pt.routeName}","${pt.sid}","${pt.name}","${pt.area}",${pt.lat},${pt.lng}\n`;
            globalSeq++;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Batch_Routes_Export_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        if (App.showToast) App.showToast(`Exported ${selected.length} routes.`);
    },

    importRouteFile(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                if (Array.isArray(json)) {
                    State.savedRoutes = [...(State.savedRoutes || []), ...json];
                } else if (json.sequence) {
                    State.savedRoutes.push(json);
                }
                this.renderRouteManager();
                if (App.showToast) App.showToast("Route imported successfully.");
            } catch (err) {
                console.error(err);
                if (App.showToast) App.showToast("Invalid route file.");
            }
        };
        reader.readAsText(file);
    },

    isRoutingPanelOpen() {
        const overlay = document.getElementById('routing-station-overlay');
        return overlay && overlay.style.display !== 'none';
    },

    isMarkingMode() {
        return this.isRoutingPanelOpen() && this.activeTab === 'editor' && this.isEditing;
    },

    clearArea() {
        if (this.selectionLayer) this.selectionLayer.clearLayers();
        this.points = [];
    },

    autoNumber() {
        if (this.capturedIDs.length === 0) return;
        if (this.isLocked) { if (App.showToast) App.showToast("Sequence is locked."); return; }
        this.saveSnapshot();
        const sortedIDs = [...this.capturedIDs].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
        this.sequence = sortedIDs.map(id => {
            const cleanId = String(id).replace(/\.0$/, '').trim();
            const row = window.SID_MAP ? window.SID_MAP.get(cleanId) : null;
            return row ? { id: String(id), lat: parseFloat(row[1]), lng: parseFloat(row[2]), name: decodePII(row[4]) } : null;
        }).filter(Boolean);
        this.renderRoute();
    },

    toggleLock() {
        this.isLocked = !this.isLocked;
        const btn = document.getElementById('btn-lock-seq');
        if (btn) {
            btn.innerHTML = `<span class="material-icons-round">${this.isLocked ? 'lock' : 'lock_open'}</span>`;
            btn.style.color = this.isLocked ? '#ef4444' : '#64748b';
        }
        if (App.showToast) App.showToast(this.isLocked ? "Sequence Locked" : "Sequence Unlocked");
    },

    sortBySequenceNumber() {
        if (this.sequence.length === 0) return;
        this.saveSnapshot();
        // Re-order capturedIDs to match sequence order
        // IDs in sequence first, then IDs not in sequence (pool)
        const seqIds = this.sequence.map(p => p.id);
        const poolIds = this.capturedIDs.filter(id => !seqIds.includes(String(id)));
        this.capturedIDs = [...seqIds, ...poolIds];
        this.renderRoute();
        if (App.showToast) App.showToast("Sorted list by sequence.");
    },

    setStart(id) {
        if (this.isLocked) return;
        this.saveSnapshot();
        const sid = String(id);
        this.startId = sid;
        const seqIdx = this.sequence.findIndex(p => String(p.id) === sid);
        let item = null;
        if (seqIdx !== -1) item = this.sequence.splice(seqIdx, 1)[0];
        else {
            const cleanSid = String(sid).replace(/\.0$/, '').trim();
            const row = window.SID_MAP ? window.SID_MAP.get(cleanSid) : null;
            if (row) item = { id: sid, lat: parseFloat(row[1]), lng: parseFloat(row[2]), name: decodePII(row[4]) };
        }
        if (item) {
            this.sequence.unshift(item);
            if (!this.capturedIDs.includes(sid)) this.capturedIDs.push(sid);
        }
        this.renderRoute();
    },

    setEnd(id) {
        if (this.isLocked) return;
        this.saveSnapshot();
        const sid = String(id);
        this.endId = sid;
        const seqIdx = this.sequence.findIndex(p => String(p.id) === sid);
        let item = null;
        if (seqIdx !== -1) item = this.sequence.splice(seqIdx, 1)[0];
        else {
            const cleanSid = String(sid).replace(/\.0$/, '').trim();
            const row = window.SID_MAP ? window.SID_MAP.get(cleanSid) : null;
            if (row) item = { id: sid, lat: parseFloat(row[1]), lng: parseFloat(row[2]), name: decodePII(row[4]) };
        }
        if (item) {
            this.sequence.push(item);
            if (!this.capturedIDs.includes(sid)) this.capturedIDs.push(sid);
        }
        this.renderRoute();
    },

    sortByID(direction = 'asc') {
        this.saveSnapshot();
        const cmp = (a, b) => direction === 'asc' ? String(a).localeCompare(String(b), undefined, { numeric: true }) : String(b).localeCompare(String(a), undefined, { numeric: true });
        this.capturedIDs.sort(cmp);
        this.sequence.sort((a, b) => cmp(a.id, b.id));
        this.renderRoute();
    },


    isPointInPoly(pt, polyPts) {
        const x = pt[0], y = pt[1];
        let inside = false;
        for (let i = 0, j = polyPts.length - 1; i < polyPts.length; j = i++) {
            const xi = polyPts[i].lat, yi = polyPts[i].lng;
            const xj = polyPts[j].lat, yj = polyPts[j].lng;

            // Harden: Avoid vertical segment division errors and range checks
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi + 0.0000000001) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    },

    harvest(polyPts = null) {
        const dataPool = window.RAW_DATA || [];
        // Build explicit whitelist from current filter
        const filterSet = new Set();
        if (State.filtered && State.filtered.length > 0) {
            State.filtered.forEach(r => filterSet.add(String(r[0]).replace(/\.0$/, '').trim()));
        }
        const pts = polyPts || this.points;
        if (!pts || pts.length < 3) return [];

        this.saveSnapshot();
        const newIds = [];
        
        // Fast numerical pre-filtering using Leaflet bounding box
        const bounds = L.latLngBounds(pts);
        
        dataPool.forEach(row => {
            if (!row[1] || !row[2]) return;
            const lat = parseFloat(row[1]);
            const lng = parseFloat(row[2]);
            const sid = String(row[0]).replace(/\.0$/, '').trim();
            
            // Skip if not in current filter (when filter is active)
            if (filterSet.size > 0 && !filterSet.has(sid)) return;
            
            // Numerical boundary filter (super fast, completes in <2ms for all 170,504 records)
            if (lat >= bounds.getSouth() && lat <= bounds.getNorth() &&
                lng >= bounds.getWest() && lng <= bounds.getEast()) {
                if (this.isPointInPoly([lat, lng], pts)) {
                    newIds.push(sid);
                }
            }
        });

        if (this.drawnPolygons) {
            this.drawnPolygons.forEach(p => p.setStyle({ color: '#94a3b8', fillOpacity: 0.1, weight: 1.5 }));
        }

        return newIds;
    },

    setPickingMode(type) {
        this.pickingMode = type;
        document.body.classList.add('picking-point');
        if (App.showToast) App.showToast(`Click a marker to set ${type.toUpperCase()}`);
    },
    pickStart() { this.setPickingMode('start'); },
    pickEnd() { this.setPickingMode('end'); },

    addManualPoint(row) {
        if (this.isLocked) return;
        this.saveSnapshot();
        const sid = String(row[0]);
        if (this.sequence.find(p => String(p.id) === sid)) return;
        if (!this.capturedIDs.includes(sid)) this.capturedIDs.push(sid);
        this.sequence.push({ id: sid, lat: parseFloat(row[1]), lng: parseFloat(row[2]), name: decodePII(row[4]) });
        this.renderRoute();
    },

    addManualID(id) {
        const cleanId = String(id).replace(/\.0$/, '').trim();
        const row = window.SID_MAP ? window.SID_MAP.get(cleanId) : null;
        if (row) this.addManualPoint(row);
    },

    updateSequenceManual(sid, newPos) {
        let pos = parseInt(newPos);
        if (isNaN(pos) || pos < 1) { this.renderRoute(); return; }

        this.saveSnapshot();
        const sidStr = String(sid);
        const idx = this.sequence.findIndex(p => String(p.id) === sidStr);

        if (idx === -1) {
            // If not in sequence, find in RAW_DATA and add it at the requested position
            const cleanSid = String(sidStr).replace(/\.0$/, '').trim();
            const row = window.SID_MAP ? window.SID_MAP.get(cleanSid) : null;
            if (row) {
                const item = { id: sidStr, lat: parseFloat(row[1]), lng: parseFloat(row[2]), name: decodePII(row[4]) };
                this.sequence.splice(pos - 1, 0, item);
                if (!this.capturedIDs.includes(sidStr)) this.capturedIDs.push(sidStr);
            }
        } else {
            // Move existing item to new position
            const item = this.sequence.splice(idx, 1)[0];
            this.sequence.splice(pos - 1, 0, item);
        }

        // Sync capturedIDs order with sequence
        const seqIds = this.sequence.map(p => p.id);
        const poolIds = this.capturedIDs.filter(id => !seqIds.includes(String(id)));
        this.capturedIDs = [...seqIds, ...poolIds];

        this.renderRoute();
        this.syncState();
        if (App.showToast) App.showToast(`Moved #${sid} to position ${pos}`);
    },

    removeFromSequence(id) {
        this.saveSnapshot();
        const sid = String(id);
        this.sequence = this.sequence.filter(p => String(p.id) !== sid);
        this.capturedIDs = this.capturedIDs.filter(cid => String(cid) !== sid);
        this.renderRoute();
    },

    assignToSequence(id, pos) {
        this.saveSnapshot();
        const sid = String(id);
        if (this.sequence.find(p => String(p.id) === sid)) return;
        const cleanSid = String(sid).replace(/\.0$/, '').trim();
        const row = window.SID_MAP ? window.SID_MAP.get(cleanSid) : null;
        if (!row) return;
        const idx = Math.max(0, Math.min((pos || this.sequence.length + 1) - 1, this.sequence.length));
        this.sequence.splice(idx, 0, { id: sid, lat: parseFloat(row[1]), lng: parseFloat(row[2]), name: decodePII(row[4]) });
        this.renderRoute();
    },

    removeFromSequenceOnly(id) {
        this.saveSnapshot();
        this.sequence = this.sequence.filter(p => String(p.id) !== String(id));
        this.renderRoute();
    },

    handleMarkerClick(id) {
        if (this.pickingMode) {
            if (this.pickingMode === 'start') this.setStart(id);
            else if (this.pickingMode === 'end') this.setEnd(id);
            this.pickingMode = null;
            document.body.classList.remove('picking-point');
            return true;
        }
        return false;
    },

    updateStats() {
        const countEl = document.getElementById('route-count');
        const statsEl = document.getElementById('route-stats');
        const navText = document.getElementById('route-nav-text');

        const hasData = this.capturedIDs.length > 0;
        if (statsEl) statsEl.style.display = hasData ? 'flex' : 'none';
        if (countEl) countEl.innerText = `${this.sequence.length} / ${this.capturedIDs.length}`;
        if (navText) navText.innerText = `${this.sequence.length} Seq`;
    },

    toggleSize(forceMinimize = false) {
        const body = document.getElementById('routing-body');
        const overlay = document.getElementById('routing-station-overlay');
        if (!body || !overlay) return;
        const isMinimized = body.style.display === 'none';
        const shouldHide = forceMinimize || !isMinimized;
        body.style.display = shouldHide ? 'none' : 'flex';
        overlay.style.height = shouldHide ? 'auto' : (overlay.dataset.prevHeight || '60vh');
        if (!shouldHide) overlay.dataset.prevHeight = overlay.style.height;
    },

    simpleOptimize() {
        if (this.capturedIDs.length < 2) return;
        this.saveSnapshot();
        const pool = this.capturedIDs.map(id => {
            const cleanId = String(id).replace(/\.0$/, '').trim();
            const row = window.SID_MAP ? window.SID_MAP.get(cleanId) : null;
            return { id: String(id), lat: parseFloat(row[1]), lng: parseFloat(row[2]), name: decodePII(row[4]) };
        });
        const optimized = [];
        let current = pool.shift();
        optimized.push(current);
        while (pool.length > 0) {
            let bestIdx = 0, minDist = Infinity;
            for (let i = 0; i < pool.length; i++) {
                const d = Math.sqrt(Math.pow(current.lat - pool[i].lat, 2) + Math.pow(current.lng - pool[i].lng, 2));
                if (d < minDist) { minDist = d; bestIdx = i; }
            }
            current = pool.splice(bestIdx, 1)[0];
            optimized.push(current);
        }
        this.sequence = optimized;
        this.renderRoute();
    },

    resetCurrentRoute() {
        this.sequence = [];
        this.capturedIDs = [];
        this.editingRouteIdx = null;
        this._sidebarDisplayIdx = null; // Fix sticky highlight
        this.editingRouteId = null;
        this.editingRouteName = null;
        this.activeDisplayRoutes = [];
        if (this.activePolygon) {
            State.map.removeLayer(this.activePolygon);
            this.activePolygon = null;
        }
        this.activePolygonPts = [];
        this.setEditMode(false);
        this.renderRoute();
        this.toggleRoutePager(false);
        this.renderRouteManager();
        this.renderSavedList();
    },

    reverseSequence() {
        this.saveSnapshot();
        this.sequence.reverse();
        this.renderRoute();
    },

    moveInSequence(dir) {
        if (this.sequence.length === 0) return;
        this._seqNavIdx = ((this._seqNavIdx || 0) + dir + this.sequence.length) % this.sequence.length;
        const p = this.sequence[this._seqNavIdx];
        if (p && State.map) {
            if (!this.isMarkingMode()) {
                State.map.panTo([p.lat, p.lng]);
            }
            this.highlightMarker(p.id);
            this.highlightListItem(p.id);
            const navText = document.getElementById('route-nav-text');
            if (navText) navText.innerText = `${this._seqNavIdx + 1}/${this.sequence.length}`;
        }
    },

    renderSavedList() {
        const side = document.getElementById('side-route-list');
        if (!side) return;
        side.innerHTML = '';
        if (!State.savedRoutes || !State.savedRoutes.length) {
            side.innerHTML = '<div style="text-align:center; padding:12px; color:#94a3b8; font-size:11px;">No saved routes found</div>';
            return;
        }

        // Pre-process and sort routes by Area
        const isMapReady = window.SID_MAP instanceof Map;
        const routesWithMeta = State.savedRoutes.map((route, originalIdx) => {
            const area = this.getRouteArea(route);
            return { originalIdx, route, area };
        });

        // Sort primarily by Area (Natural Sort), secondarily by Original Route Name (Natural Sort)
        routesWithMeta.sort((a, b) => {
            const areaCmp = this.naturalCompare(a.area, b.area);
            if (areaCmp !== 0) return areaCmp;
            return this.naturalCompare(a.route.name || '', b.route.name || '');
        });

        const areaStats = {};
        let totalOverallPts = 0;
        routesWithMeta.forEach(r => {
            if (!areaStats[r.area]) areaStats[r.area] = { routes: 0, pts: 0 };
            areaStats[r.area].routes++;
            const pts = (r.route.sequence && r.route.sequence.length) ? r.route.sequence.length : 0;
            areaStats[r.area].pts += pts;
            totalOverallPts += pts;
        });

        // Update global "Designed Routes" header
        const overallHeader = document.getElementById('designed-routes-total');
        if (overallHeader) {
            if (totalOverallPts > 0) overallHeader.innerText = `(${routesWithMeta.length} routes, ${totalOverallPts} pts)`;
            else overallHeader.innerText = `(${routesWithMeta.length} routes)`;
        }

        let lastArea = null;
        let localIdx = 0;

        routesWithMeta.forEach(({ originalIdx, route, area }) => {
            if (area !== lastArea) {
                localIdx = 0; // Reset local counter for the new area
                const isCollapsed = this.collapsedGroups.has(area);
                const stats = areaStats[area] || { routes: 0, pts: 0 };
                const header = document.createElement('div');
                header.style.cssText = 'padding:4px 8px; font-weight:800; font-size:11px; text-transform:uppercase; color:var(--primary); background:#f1f5f9; border-radius:6px; margin: 8px 0 4px 0; letter-spacing: 0.5px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;';
                header.onclick = (e) => { e.stopPropagation(); this.toggleMCGroup(area); };
                header.innerHTML = `<span>${area} <span style="color: darkorange; font-weight: bold; margin-left: 6px; font-size: 10px; text-transform: none;">(${stats.routes} routes, ${stats.pts} pts)</span></span> <span class="material-icons-round" style="font-size:14px;">${isCollapsed ? 'expand_more' : 'expand_less'}</span>`;
                side.appendChild(header);
                lastArea = area;
            }

            localIdx++;

            if (this.collapsedGroups.has(area)) return;

            const ptCount = (route.sequence && route.sequence.length) ? route.sequence.length : 0;
            const isActive = (this.editingRouteIdx === originalIdx) || (this._sidebarDisplayIdx === originalIdx);
            const activeStyle = isActive ? 'background: #eff6ff; border-left: 3px solid #3b82f6;' : 'background: #fff; border: 1px solid #e2e8f0;';

            const displayName = route.name || `Route ${localIdx}`;

            const div = document.createElement('div');
            div.style.cssText = `display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:8px; cursor:pointer; transition:background 0.2s; ${activeStyle}`;
            div.onmouseenter = () => div.style.background = isActive ? '#eff6ff' : '#f1f5f9';
            div.onmouseleave = () => div.style.background = isActive ? '#eff6ff' : '#fff';

            div.innerHTML = `
                    <div style="width:22px; height:22px; background:#eff6ff; color:var(--primary); border-radius:4px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:10px; flex-shrink:0;">${localIdx}</div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:700; font-size:10px; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${displayName}">${displayName}</div>
                        <div style="font-size:8px; color:#94a3b8;"><span style="color: darkorange; font-weight: bold;">${ptCount > 0 ? ptCount + ' pts' : '(Fetch details...)'}</span></div>
                    </div>
                    <button onclick="event.stopPropagation(); SpatialRouter.toggleSidebarRouteDisplay(${originalIdx})" title="${isActive ? 'Hide' : 'Show'} on Map" style="background:none; border:none; cursor:pointer; padding:2px; color:${isActive ? '#ef4444' : '#10b981'}; flex-shrink:0;">
                        <span class="material-icons-round" style="font-size:16px;">${isActive ? 'visibility_off' : 'visibility'}</span>
                    </button>
                    <button onclick="event.stopPropagation(); SpatialRouter.openRouteInListView(${originalIdx})" title="Open in List View" style="background:none; border:none; cursor:pointer; padding:2px; color:#06b6d4; flex-shrink:0;">
                        <span class="material-icons-round" style="font-size:16px;">view_list</span>
                    </button>
                    <button onclick="event.stopPropagation(); SpatialRouter.clearMapDisplay()" title="Clear Map Display" style="background:none; border:none; cursor:pointer; padding:2px; color:#ef4444; flex-shrink:0;">
                        <span class="material-icons-round" style="font-size:16px;">close</span>
                    </button>
                `;
            div.onclick = () => { this.toggleSidebarRouteDisplay(originalIdx); };
            side.appendChild(div);
        });
    },

    async ensureRouteData(idx) {
        const r = State.savedRoutes[idx];
        if (!r) return false;
        if (r.sequence && r.sequence.length > 0) return true;

        if (App.showToast) App.showToast(`Downloading route: ${r.name || '...'}`, 2000);
        try {
            const { data, error } = await window._supabase
                .from('saved_routes')
                .select('route_data')
                .eq('id', r.id)
                .single();
            
            if (error) throw error;
            if (data && data.route_data) {
                // Merge loaded data into state
                State.savedRoutes[idx].sequence = data.route_data.sequence;
                State.savedRoutes[idx].points = data.route_data.points || [];
                State.savedRoutes[idx].polygon = data.route_data.polygon || null;
                return true;
            }
            throw new Error("Empty route data");
        } catch (err) {
            console.error("Lazy Load failed:", err);
            if (App.showToast) App.showToast("Cloud connection failed.");
            return false;
        }
    },

    async toggleSidebarRouteDisplay(idx) {
        const r = State.savedRoutes[idx];
        if (!r) return;

        // Toggle: if already displayed, remove
        if (this._sidebarDisplayIdx === idx && this._displayLayer) {
            State.map.removeLayer(this._displayLayer);
            this._displayLayer = null;
            this._sidebarDisplayIdx = null;
            this.activeDisplayRoutes = [];
            if (App.showToast) App.showToast('Route hidden.');
            this.toggleRoutePager(false);
            this.renderRouteManager();
            return;
        }

        // Fetch details before showing on map
        const success = await this.ensureRouteData(idx);
        if (!success) return;

        this._sidebarDisplayIdx = idx;
        const updatedRoute = State.savedRoutes[idx];
        this.activeDisplayRoutes = [updatedRoute.name];
        this.currentPage = 1;

        this.renderDisplayLayer();
        this.toggleRoutePager(true);
        this.renderRouteManager();
        if (App.showToast) App.showToast(`Showing: ${updatedRoute.name}`);

        this._activeMarkerIdx = 0;
        this.updatePagerInfo(updatedRoute.sequence.length);
        setTimeout(() => this.changeMarker(0, false), 400);

        // Sync MapNavigator
        const seqOrder = new Map(updatedRoute.sequence.map((p, i) => [String(p.surveyId || p.id), i]));
        State.filtered = (window.RAW_DATA || [])
            .filter(row => seqOrder.has(String(row[0])))
            .sort((rowA, rowB) => seqOrder.get(String(rowA[0])) - seqOrder.get(String(rowB[0])));
        State.currentIdx = 0;
        if (window.MapNavigator) MapNavigator.updateUI();
    },

    renderDisplayLayer() {
        if (this._sidebarDisplayIdx === null) return;
        const r = State.savedRoutes[this._sidebarDisplayIdx];
        if (!r || !r.sequence) return;

        if (this._displayLayer) { State.map.removeLayer(this._displayLayer); this._displayLayer = null; }
        this._displayLayer = L.layerGroup().addTo(State.map);

        this.updateWatermark(r.name);

        const isMapReady = window.SID_MAP instanceof Map;
        const pts = [];
        const deliveryCol = typeof ACTIVE_BILLING_MONTH !== 'undefined' ? `delivery_${ACTIVE_BILLING_MONTH}` : null;
        const deliveryData = deliveryCol && r[deliveryCol] ? r[deliveryCol] : {};

        const totalMarkers = r.sequence.length;

        const totalChunks = Math.ceil(r.sequence.length / this.chunkSize) || 1;
        if (this.currentPage > totalChunks) this.currentPage = totalChunks;
        if (this.currentPage < 1) this.currentPage = 1;

        // JITTER FIX: If we are navigating markers via changeMarker, skip fitBounds
        // as changeMarker handles its own flyTo. Only fitBounds if no marker is being actively tracked.
        const isNavigatingMarker = this._activeMarkerIdx !== undefined && this._activeMarkerIdx !== null && this._activeMarkerIdx !== -1;

        this.updatePagerInfo(totalMarkers);

        const rpPrev = document.getElementById('rp-prev');
        if (rpPrev) rpPrev.disabled = this.currentPage === 1;
        const rpFirst = document.getElementById('rp-first');
        if (rpFirst) rpFirst.disabled = this.currentPage === 1;

        const rpNext = document.getElementById('rp-next');
        if (rpNext) rpNext.disabled = this.currentPage === totalChunks;
        const rpLast = document.getElementById('rp-last');
        if (rpLast) rpLast.disabled = this.currentPage === totalChunks;

        const startIdx = (this.currentPage - 1) * this.chunkSize;
        const chunk = r.sequence.slice(startIdx, startIdx + this.chunkSize);

        // Draw full polyline
        r.sequence.forEach(p => { pts.push([p.lat, p.lng]); });
        if (pts.length > 1) {
            L.polyline(pts, { color: '#3b82f6', weight: 4, opacity: 0.6, dashArray: '6,4' }).addTo(this._displayLayer);
        }
        if (r.polygon) {
            L.polygon(r.polygon, { color: '#94a3b8', fillOpacity: 0.08, weight: 1.5, dashArray: '5,5', interactive: false }).addTo(this._displayLayer);
        }

        const chunkPts = [];
        chunk.forEach((p, relativeIdx) => {
            const sIdx = startIdx + relativeIdx;
            chunkPts.push([p.lat, p.lng]);
            const sid = String(p.surveyId || p.id);
            const isDelivered = deliveryData[sid] === 'delivered';

            const styleStr = isDelivered ? 'background: #10b981; color: white; border-color: #059669; border-width: 2px;' : '';
            const m = L.marker([p.lat, p.lng], {
                icon: L.divIcon({
                    className: `route-marker-square ${isDelivered ? 'delivered' : ''}`,
                    html: `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; border-radius:inherit; ${styleStr}">${sIdx + 1}</div>`
                }),
                sid: sid, // Ensure sid is stored in options for lookup
                pane: 'routingMarkerPane'
            }).addTo(this._displayLayer);

            m.bindTooltip(`#${sid}`, { permanent: false, direction: 'top', offset: [0, -10] });
            m.on('click', () => { 
                App._markerHit = true;
                m.closeTooltip(); 
                if (!this.isMarkingMode()) {
                    this.showMarkerCard(sid); 
                }
            });
        });

        if (chunkPts.length > 0 && !isNavigatingMarker && !this.isMarkingMode()) {
            State.map.fitBounds(L.latLngBounds(chunkPts), { padding: [50, 50], animate: true, duration: 0.8 });
        }

        // LISTVIEW SYNC: Only show current 25 houses in ListView
        const chunkSIDs = new Set(chunk.map(p => String(p.surveyId || p.id)));
        State.filtered = (window.RAW_DATA || []).filter(row => chunkSIDs.has(String(row[0])));
        if (typeof ListView !== 'undefined' && document.getElementById('list-view-stage')?.classList.contains('active')) {
            ListView.render();
        }
    },

    changePage(delta) {
        if (this._sidebarDisplayIdx === null) return;
        const r = State.savedRoutes[this._sidebarDisplayIdx];
        if (!r || !r.sequence) return;
        const totalChunks = Math.ceil(r.sequence.length / this.chunkSize) || 1;
        let targetPage = this.currentPage + delta;

        if (targetPage >= 1 && targetPage <= totalChunks) {
            this.currentPage = targetPage;
            // Refinement: Jump to first marker of the new segment
            this._activeMarkerIdx = (this.currentPage - 1) * this.chunkSize;

            // CRITICAL FIX: Explicitly render the new page's markers
            this.renderDisplayLayer();

            // Then handle marker navigation (highlights/flyTo)
            this.changeMarker(0);
        }
    },

    changeMarker(delta, skipCard = false) {
        if (this._sidebarDisplayIdx === null) return;
        const r = State.savedRoutes[this._sidebarDisplayIdx];
        if (!r || !r.sequence || r.sequence.length === 0) return;

        if (this._activeMarkerIdx === undefined || this._activeMarkerIdx === null) {
            this._activeMarkerIdx = -1;
        }

        const totalPoints = r.sequence.length;
        this._activeMarkerIdx = this._activeMarkerIdx + delta;

        // Constrain index to sequence bounds
        if (this._activeMarkerIdx < 0) this._activeMarkerIdx = 0;
        if (this._activeMarkerIdx >= totalPoints) this._activeMarkerIdx = totalPoints - 1;

        // Automatically change pages if we navigate outside the current chunk
        const targetPage = Math.floor(this._activeMarkerIdx / this.chunkSize) + 1;
        if (targetPage !== this.currentPage) {
            this.currentPage = targetPage;
            this.renderDisplayLayer(); // Re-render the layer for the new page
        } else {
            this.updatePagerInfo(totalPoints);
        }

        const activePt = r.sequence[this._activeMarkerIdx];
        if (!activePt) return;

        // IDENTITY FIX: Use surveyId if available, fallback to id
        const surveyID = String(activePt.surveyId || activePt.id);
        console.log(`Pager moving to idx ${this._activeMarkerIdx}, SID: ${surveyID}, skipCard: ${skipCard}`);

        // 1. Hover/Fly Map to the point (Zoom level 19 for focus)
        State.map.flyTo([activePt.lat, activePt.lng], 19, { padding: [100, 100], duration: 0.5 });

        // 1.5 Auto-Collapse map controls to save screen space
        if (window.UIInteractions && typeof UIInteractions.toggleExtraCtrls === 'function') {
            UIInteractions.toggleExtraCtrls(true);
        }

        // 2. Highlight map marker with pulse
        this.highlightMarker(surveyID, activePt.lat, activePt.lng, skipCard);
    },



    updatePagerInfo(totalPoints) {
        const rpInfo = document.getElementById('rp-info');
        if (!rpInfo) return;
        const currentMarker = (this._activeMarkerIdx !== undefined && this._activeMarkerIdx !== null && this._activeMarkerIdx !== -1) ? (this._activeMarkerIdx + 1) : 1;
        const totalChunks = Math.ceil(totalPoints / this.chunkSize) || 1;
        rpInfo.innerHTML = `
            <div class="rp-info-main">Marker ${currentMarker} <span style="font-size:10px; opacity:0.6; font-weight:400;">/ ${totalPoints}</span></div>
            <div class="rp-info-sub">Chunk ${this.currentPage} of ${totalChunks}</div>
        `;
    },

    async openRouteInListView(idx) {
        const success = await this.ensureRouteData(idx);
        if (!success) return;

        this.toggleSidebarRouteDisplay(idx);
        const r = State.savedRoutes[idx];

        // Switch to list view (pass false to skip index reset)
        if (window.ViewSwitcher) {
            ViewSwitcher.toList(false);
            if (App.showToast) App.showToast(`List View: ${r.name}`);
        }
    },

    updateWatermark(routeName) {
        const wm = document.getElementById('route-watermark-text');
        if (wm) {
            wm.innerText = routeName || '';
        }
    },

    isRoutePagerActive() {
        const pager = document.getElementById('route-pager-container');
        return pager && pager.classList.contains('active');
    },

    toggleRoutePager(show) {
        const pager = document.getElementById('route-pager-container');
        if (pager) {
            if (show) {
                pager.classList.add('active');
                if (window.MapNavigator) MapNavigator.toggle(false); // Hide map pager when route pager opens
            } else {
                pager.classList.remove('active');
            }

            if (show && window.UIInteractions && typeof UIInteractions.toggleExtraCtrls === 'function') {
                // Force collapse twice with a delay to ensure it sticks on mobile
                UIInteractions.toggleExtraCtrls(true);
                setTimeout(() => UIInteractions.toggleExtraCtrls(true), 300);
            }
        }
    },

    renderRoute() {
        const list = document.getElementById('route-list');
        const init = document.getElementById('route-initial-state');
        if (!list) return;

        // BATCH MODE: grouped per-route sections
        if (this.isBatchMode && this.batchRouteSequences.length > 0) {
            list.innerHTML = '';
            if (init) init.style.display = 'none';
            const fragment = document.createDocumentFragment();

            this.batchRouteSequences.forEach((seq, rIdx) => {
                const header = document.createElement('div');
                header.style.cssText = 'padding:6px 8px; font-size:10px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; background:#f8fafc; border-radius:6px; margin-top:' + (rIdx > 0 ? '8px' : '0') + '; display:flex; align-items:center; gap:6px;';
                header.innerHTML = `<span class="material-icons-round" style="font-size:14px; color:var(--primary)">route</span> ${this.activeDisplayRoutes[rIdx] || 'Route ' + (rIdx + 1)} <span style="margin-left:auto; color:#94a3b8;">${seq.length} pts</span>`;
                fragment.appendChild(header);

                seq.forEach((p, sIdx) => {
                    const item = document.createElement('div');
                    item.className = 'v6-card';
                    item.setAttribute('data-sid', p.id);
                    const isStart = sIdx === 0;
                    const isEnd = sIdx === seq.length - 1;
                    item.innerHTML = `
                            <div class="v6-badge" style="background:${isStart ? '#10b981' : isEnd ? '#ef4444' : '#eff6ff'}; color:${isStart || isEnd ? 'white' : 'var(--primary)'}; font-size:10px;">${sIdx + 1}</div>
                            <div class="v6-card-body">
                                <div class="v6-card-title">#${p.id}</div>
                                <div class="v6-card-sub">${p.name || ''} | ${isStart ? 'Start' : isEnd ? 'End' : 'Seq'}</div>
                            </div>
                        `;
                    item.onclick = (e) => {
                        e.stopPropagation();
                        if (!this.isMarkingMode()) {
                            State.map.panTo([p.lat, p.lng]);
                        }
                        this.highlightMarker(p.id, p.lat, p.lng);
                    };
                    fragment.appendChild(item);
                });
            });

            list.appendChild(fragment);
            this.refreshMapMarkers();
            this.updateStats();
            return;
        }

        // SINGLE MODE
        list.innerHTML = '';
        const count = this.capturedIDs.length;

        if (count === 0) {
            if (init) init.style.display = 'flex';
            this.refreshMapMarkers();
            this.updateStats();
            return;
        }
        if (init) init.style.display = 'none';

        // O(1) Indexing of sequence entries for maximum performance
        const sequenceMap = new Map();
        const sequenceIndices = new Map();
        this.sequence.forEach((p, idx) => {
            const cleanPId = String(p.id).replace(/\.0$/, '').trim();
            sequenceMap.set(cleanPId, p);
            sequenceIndices.set(cleanPId, idx);
        });

        const fragment = document.createDocumentFragment();
        this.capturedIDs.forEach(sid => {
            const cleanSid = String(sid).replace(/\.0$/, '').trim();
            const row = window.SID_MAP ? window.SID_MAP.get(cleanSid) : null;
            const seqEntry = sequenceMap.get(cleanSid);
            const lat = row ? parseFloat(row[1]) : (seqEntry ? seqEntry.lat : null);
            const lng = row ? parseFloat(row[2]) : (seqEntry ? seqEntry.lng : null);
            const name = row ? decodePII(row[4]) : (seqEntry ? seqEntry.name : '');
            if (lat === null) return;

            const seqIdx = sequenceIndices.has(cleanSid) ? sequenceIndices.get(cleanSid) : -1;
            const isStart = seqIdx === 0;
            const isEnd = seqIdx !== -1 && seqIdx === this.sequence.length - 1;

            let area = row && row[12] ? this.cleanMCName(row[12]) : '';
            const item = document.createElement('div');
            item.className = 'v6-card';
            item.setAttribute('data-sid', sid);

            item.innerHTML = `
                    <div class="v6-badge" style="background:${isStart ? '#10b981' : isEnd ? '#ef4444' : ''}; padding:0; overflow:hidden; width:26px; height:24px;">
                        <input type="number" min="1" max="${this.sequence.length + 1}" value="${seqIdx === -1 ? '' : seqIdx + 1}" placeholder="-"
                               style="width:100%; height:100%; border:none; background:transparent; color:${(isStart || isEnd) ? 'white' : 'var(--primary)'}; text-align:center; font-size:10px; font-weight:800; outline:none; padding:0;"
                               onchange="SpatialRouter.updateSequenceManual('${sid}', this.value)"
                               onclick="event.stopPropagation()">
                    </div>
                    <div class="v6-card-body">
                        <div class="v6-card-title">#${sid}</div>
                        <div class="v6-card-sub">${area || name || ''} | ${seqIdx === -1 ? 'Pool' : (isStart ? 'Start' : isEnd ? 'End' : 'Sequenced')}</div>
                    </div>
                    <button onclick="event.stopPropagation(); ListView.jumpFromMap('${sid}')" class="v6-action-btn" style="color:#64748b; margin-right:4px;" title="View Details">
                        <span class="material-icons-round" style="font-size:16px;">visibility</span>
                    </button>
                    <button onclick="event.stopPropagation(); SpatialRouter.${seqIdx === -1 ? 'addToSequence' : 'removeFromSequence'}('${sid}')" class="v6-action-btn" style="color:${seqIdx === -1 ? '#10b981' : '#ef4444'}" title="${seqIdx === -1 ? 'Add to Route' : 'Remove from Route'}">
                        <span class="material-icons-round" style="font-size:18px;">${seqIdx === -1 ? 'library_add' : 'remove_circle'}</span>
                    </button>
                `;
            item.onclick = (e) => {
                e.stopPropagation();
                if (!this.isMarkingMode()) {
                    State.map.panTo([lat, lng]);
                }
                this.highlightMarker(sid, lat, lng);
            };
            fragment.appendChild(item);
        });

        list.appendChild(fragment);
        this.refreshMapMarkers();
        this.updateStats();
    },

    refreshMapMarkers() {
        if (!this.sequenceLayer) this.sequenceLayer = L.layerGroup().addTo(State.map);
        this.sequenceLayer.clearLayers();

        if (this.routeLayer) State.map.removeLayer(this.routeLayer);
        this.routeLayer = L.layerGroup().addTo(State.map);

        // BATCH MODE: per-route markers + separate polylines
        if (this.isBatchMode && this.batchRouteSequences.length > 0) {
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

            this.batchRouteSequences.forEach((seq, rIdx) => {
                const color = colors[rIdx % colors.length];
                const pts = [];

                seq.forEach((p, sIdx) => {
                    pts.push([p.lat, p.lng]);
                    const m = L.marker([p.lat, p.lng], {
                        icon: L.divIcon({
                            className: 'route-marker-square',
                            html: sIdx + 1
                        }),
                        pane: 'routingMarkerPane'
                    }).addTo(this.sequenceLayer);

                    m.on('click', (e) => {
                        L.DomEvent.stopPropagation(e);
                        App._markerHit = true;
                        this.highlightMarker(p.id, p.lat, p.lng);
                        this.highlightListItem(p.id);
                    });
                    App.bindCustomTooltip(m, `#${p.id || sid}`);
                    m.bindPopup(() => this._buildMarkerPopup(p.id), { closeButton: false, offset: [0, -5] });
                    m.on('popupopen', () => m.closeTooltip());
                });

                if (pts.length > 1) {
                    L.polyline(pts, { color: color, weight: 3, opacity: 0.7, dashArray: '6,4' }).addTo(this.routeLayer);
                }
            });

            (this.batchRoutePolygons || []).forEach(p => {
                L.polygon(p, { color: '#94a3b8', fillOpacity: 0.08, weight: 1.5, dashArray: '5,5', interactive: false }).addTo(this.routeLayer);
            });
            return;
        }

        // SINGLE MODE
        this.capturedIDs.forEach(sid => {
            const cleanSid = String(sid).replace(/\.0$/, '').trim();
            const row = window.SID_MAP ? window.SID_MAP.get(cleanSid) : null;
            const seqEntry = this.sequence.find(p => String(p.id) === String(sid));
            const lat = row ? parseFloat(row[1]) : (seqEntry ? seqEntry.lat : null);
            const lng = row ? parseFloat(row[2]) : (seqEntry ? seqEntry.lng : null);
            if (lat === null) return;
            const idx = this.sequence.findIndex(p => String(p.id) === String(sid));

            const m = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: idx === -1 ? 'route-marker-pool-dot' : 'route-marker-square',
                    html: idx === -1 ? '' : (idx + 1)
                }),
                pane: 'routingMarkerPane'
            }).addTo(this.sequenceLayer);

            m.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                App._markerHit = true;
                const currentIdx = this.sequence.findIndex(p => String(p.id) === String(sid));
                if (currentIdx === -1) this.addToSequence(sid);
                else this.removeFromSequence(sid);
                this.highlightMarker(sid, lat, lng);
                this.highlightListItem(sid);
            });

            // Option 1: Right-Click to jump to ListView
            m.on('contextmenu', (e) => {
                L.DomEvent.stopPropagation(e);
                if (window.ListView && ListView.jumpFromMap) {
                    ListView.jumpFromMap(sid);
                }
            });

            m.bindTooltip(`#${sid}`, { permanent: false, direction: 'top', offset: [0, -10] });

            if (!this._markerMap) this._markerMap = {};
            this._markerMap[sid] = m;
        });

        if (this.activePolygon && this.activePolygon._latlngs) {
            const polyCoords = this.activePolygon.getLatLngs()[0];
            L.polygon(polyCoords, { color: '#94a3b8', fillOpacity: 0.08, weight: 1.5, dashArray: '5,5', interactive: false }).addTo(this.routeLayer);
        }

        if (this.sequence && this.sequence.length > 1) {
            const pts = this.sequence.map(p => [p.lat, p.lng]);
            L.polyline(pts, { color: '#3b82f6', weight: 4, opacity: 0.8 }).addTo(this.routeLayer);
        }
    },

    highlightListItem(sid) {
        const list = document.getElementById('route-list');
        if (!list) return;
        const target = list.querySelector(`[data-sid="${sid}"]`);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.style.transition = 'background 0.3s';
            target.style.background = '#e0f2fe'; // Highlight color
            setTimeout(() => target.style.background = 'white', 1500);
        }
        this.highlightMarker(sid);
    },

    _buildMarkerPopup(sid) {
        const isMapReady = window.SID_MAP instanceof Map;
        const sidStr = String(sid).replace(/\.0$/, '').trim();
        const r = isMapReady ? window.SID_MAP.get(sidStr) : null;
        if (!r) return `<div style="font-size:10px; padding:4px;">ID: ${sid}</div>`;
        let shortMC = 'MC-?';
        if (r[12]) {
            const match = r[12].match(/(MC|UC)[- ]?(\\d+)/i);
            shortMC = match ? `${match[1].toUpperCase()}-${match[2]}` : r[12].split(' ')[0];
        }
        const dateVal = r[7] && r[7] !== '-' ? r[7] : (r[18] && r[18] !== '-' ? r[18] : 'No Date');
        return `
                <div class="pop-card compact" style="position:relative; padding: 4px 8px; min-width: 140px; line-height: 1.2;">
                    <div style="display:flex; justify-content:space-between; font-weight:800; font-size:12px; border-bottom:1px solid #f1f5f9; margin-bottom:4px; padding-bottom:2px;">
                        <a href="javascript:void(0)" onclick="ListView.jumpFromMap('${r[0]}')" style="color:var(--primary); text-decoration:none;">#${r[0]}</a>
                        <span style="color:#64748b; font-size:10px; font-weight:400;">${r[6] || '--'}</span>
                    </div>
                    <div style="font-size:10px; color:#94a3b8; display:flex; justify-content:space-between; align-items:center;">
                        <span>${dateVal} | ${r[8] || '--'}</span>
                        <b style="color:#475569; font-family:monospace;">${shortMC}</b>
                    </div>
                </div>
            `;
    },

    highlightMarker(sid, optLat, optLng, skipCard = false) {
        let lat = optLat, lng = optLng;
        if (lat === undefined || lng === undefined) {
            const isMapReady = window.SID_MAP instanceof Map;
            const row = isMapReady ? window.SID_MAP.get(String(sid)) : null;
            if (!row) return;
            lat = parseFloat(row[1]);
            lng = parseFloat(row[2]);
        }

        // Center map on the marker (but skip if marking to prevent "jerks")
        if (State.map && !this.isMarkingMode()) {
            State.map.setView([lat, lng], 18);
        }

        const pulse = L.circleMarker([lat, lng], {
            radius: 28,
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.35,
            weight: 3,
            pane: 'routingMarkerPane'
        }).addTo(State.map);

        let op = 0.35;
        const timer = setInterval(() => {
            op -= 0.025;
            if (op <= 0) {
                clearInterval(timer);
                State.map.removeLayer(pulse);
            } else {
                pulse.setStyle({ fillOpacity: op, opacity: op * 2 });
            }
        }, 40);

        // Automatically pop up the modal card unless skipped or in marking mode
        if (!skipCard && !this.isMarkingMode()) {
            this.showMarkerCard(sid);
        }
    },

    clearActiveRoute() {
        if (this.sequence.length > 0) {
            if (!confirm('You have an unsaved route sequence. Are you sure you want to clear it?')) {
                return;
            }
        }
        // 1. Clear Map Displays (Both Editor & Viewer)
        if (this.activePolygon) {
            State.map.removeLayer(this.activePolygon);
            this.activePolygon = null;
        }
        if (this.drawnPolygons) {
            this.drawnPolygons.forEach(p => State.map.removeLayer(p));
            this.drawnPolygons = [];
        }
        if (this._displayLayer) {
            State.map.removeLayer(this._displayLayer);
            this._displayLayer = null;
        }
        if (this.routeLayer) this.routeLayer.clearLayers();
        if (this.sequenceLayer) this.sequenceLayer.clearLayers();

        // 2. Clear State Logic
        this.capturedIDs = [];
        this.sequence = [];
        this._sidebarDisplayIdx = null;
        this._activeMarkerIdx = null;
        this.activeDisplayRoutes = [];
        this.batchRouteSequences = [];
        this.batchRoutePolygons = [];
        this.isBatchMode = false;
        this.editingRouteIdx = null;
        this.editingRouteId = null;
        this.editingRouteName = null;

        // 3. UI Resets
        this.resetCurrentRoute();
        this.activeTab = 'manager';
        this.setEditMode(false);
        this.toggleRoutePager(false);
        this.renderRoute();
        this.renderRouteManager();
        this.renderSavedList();

        if (App.showToast) App.showToast('All routes cleared.');
    },

    startDrawing(mode = 'append') {
        if (this.isDrawing) return this.finishDrawing();
        if (mode === 'new') this.clearActiveRoute();

        this.setEditMode(true);
        this.isDrawing = true;
        this.points = [];
        State.map.getContainer().style.cursor = 'crosshair';
        this.currentDrawLayer = L.layerGroup().addTo(State.map);

        // Show Done/Cancel buttons
        const btnDone = document.getElementById('btn-finish-draw');
        const btnCancel = document.getElementById('btn-cancel-draw');
        if (btnDone) btnDone.style.display = 'flex';
        if (btnCancel) btnCancel.style.display = 'flex';

        this._boundClick = (e) => {
            this.points.push(e.latlng);
            this.currentDrawLayer.clearLayers();
            const poly = L.polygon(this.points, { color: '#3b82f6', fillOpacity: 0.1, weight: 2 }).addTo(this.currentDrawLayer);

            // Shadow Markers Preview
            if (this.points.length > 2) {
                const polyPts = this.points.map(p => ({ lat: p.lat, lng: p.lng }));
                const searchPool = State.filtered || [];
                const bounds = L.latLngBounds(this.points);
                searchPool.forEach(row => {
                    if (!row[1] || !row[2]) return;
                    const lat = parseFloat(row[1]);
                    const lng = parseFloat(row[2]);
                    if (lat >= bounds.getSouth() && lat <= bounds.getNorth() &&
                        lng >= bounds.getWest() && lng <= bounds.getEast()) {
                        if (this.isPointInPoly([lat, lng], polyPts)) {
                            L.circleMarker([lat, lng], { radius: 2, color: '#94a3b8', fillOpacity: 0.5, stroke: false, pane: 'routingPane' }).addTo(this.currentDrawLayer);
                        }
                    }
                });
            }
            L.circleMarker(e.latlng, { radius: 3, color: '#3b82f6' }).addTo(this.currentDrawLayer);
        };
        this._boundContext = (e) => {
            e.originalEvent.preventDefault();
            this.finishDrawing();
        };

        State.map.on('click', this._boundClick);
        State.map.on('contextmenu', this._boundContext);
        if (App.showToast) App.showToast("Drawing: Click to add points, Click Done to capture.");
    },

    saveStateToPolygon(poly) {
        if (!poly) return;
        poly._routeState = {
            sequence: JSON.parse(JSON.stringify(this.sequence)), // Deep copy
            capturedIDs: [...this.capturedIDs],
            startId: this.startId,
            endId: this.endId
        };
    },

    restoreStateFromPolygon(poly) {
        if (!poly || !poly._routeState) return;
        const s = poly._routeState;
        this.sequence = JSON.parse(JSON.stringify(s.sequence));
        this.capturedIDs = [...s.capturedIDs];
        this.startId = s.startId;
        this.endId = s.endId;
        this.renderRoute();
    },

    finishDrawing() {
        if (!this.isDrawing) return;

        // Hide Done/Cancel buttons
        const btnDone = document.getElementById('btn-finish-draw');
        const btnCancel = document.getElementById('btn-cancel-draw');
        if (btnDone) btnDone.style.display = 'none';
        if (btnCancel) btnCancel.style.display = 'none';

        State.map.off('click', this._boundClick);
        State.map.off('contextmenu', this._boundContext);
        State.map.getContainer().style.cursor = '';

        if (this.points.length > 2) {
            if (!this.drawnPolygons) this.drawnPolygons = [];
            const polyPts = this.points.map(p => ({ lat: p.lat, lng: p.lng }));

            // If there was a previous active polygon, save its state and deactivate it
            if (this.activePolygon) {
                this.saveStateToPolygon(this.activePolygon);
                this.activePolygon.setStyle({ color: '#94a3b8', weight: 1.5 });
            }

            // Harvest new IDs
            const ids = this.harvest(polyPts);
            if (ids.length > 0 && App.showToast) App.showToast(`Found ${ids.length} items.`);

            // Exit batch mode
            this.isBatchMode = false;
            this.batchRouteSequences = [];
            this.batchRoutePolygons = [];
            this.activeDisplayRoutes = [];

            // Create interactive polygon
            const poly = L.polygon(this.points, {
                color: '#3b82f6',
                fillOpacity: 0.1,
                weight: 3,
                interactive: false,
                pane: 'routingPane'
            }).addTo(State.map);

            // Initialize state for new polygon
            poly._routeState = {
                sequence: [],
                capturedIDs: ids,
                startId: null,
                endId: null
            };

            // Set as active
            this.activePolygon = poly;
            this.capturedIDs = ids; // Load initial harvest
            this.sequence = [];     // Start with empty sequence
            this.startId = null;
            this.endId = null;
            this.renderRoute(); // Show new items
            this.switchTab('editor'); // Auto-switch focus to editor list panel

            poly.on('click', (e) => {
                L.DomEvent.stopPropagation(e);

                // If clicking the ALREADY ACTIVE polygon, do nothing
                if (this.activePolygon === poly) return;

                // Save state of current active polygon before switching
                if (this.activePolygon) {
                    this.saveStateToPolygon(this.activePolygon);
                    this.activePolygon.setStyle({ color: '#94a3b8', weight: 1.5 });
                }

                // Activate clicked polygon and restore state
                this.activePolygon = poly;
                poly.setStyle({ color: '#3b82f6', weight: 3 });
                this.restoreStateFromPolygon(poly);

                if (App.showToast) App.showToast(`Switched to area: ${this.capturedIDs.length} items.`);
            });

            this.drawnPolygons.push(poly);
            State.map.removeLayer(this.currentDrawLayer);
        } else if (this.currentDrawLayer) {
            State.map.removeLayer(this.currentDrawLayer);
        }
        this.isDrawing = false;
    },

    cancelDrawing() {
        // Stop Map Listeners
        State.map.off('click', this._boundClick);
        State.map.off('contextmenu', this._boundContext);
        
        // Cleanup Layers
        if (this.currentDrawLayer) State.map.removeLayer(this.currentDrawLayer);
        this.currentDrawLayer = null;
        
        // Reset UI
        State.map.getContainer().style.cursor = '';
        const btnDone = document.getElementById('btn-finish-draw');
        const btnCancel = document.getElementById('btn-cancel-draw');
        if (btnDone) btnDone.style.display = 'none';
        if (btnCancel) btnCancel.style.display = 'none';
        
        // Reset State
        this.isDrawing = false;
        this.setEditMode(false);
        if (App.showToast) App.showToast("Drawing cancelled.");
    },

    selectAll() { this.autoNumber(); },
    deselectAll() {
        this.sequence = [];
        this.renderRoute();
    },

    save() { this.saveRoute(); },
    async saveRoute(forceDownload = false) {
        if (this.sequence.length === 0) return;

        let defaultName;
        if (this.editingRouteIdx !== null && this.editingRouteIdx !== undefined && this.editingRouteName) {
            defaultName = this.editingRouteName;
        } else {
            let shortMC = 'Unnamed';
            const firstSid = this.sequence[0].id;
            const cleanFirstSid = String(firstSid).replace(/\.0$/, '').trim();
            const firstRow = window.SID_MAP ? window.SID_MAP.get(cleanFirstSid) : null;
            if (firstRow && firstRow[12]) {
                const match = String(firstRow[12]).match(/(MC|UC)[- ]?(\d+)/i);
                shortMC = match ? `${match[1].toUpperCase()}-${match[2]}` : String(firstRow[12]).split(' ')[0].replace(/[\/\\]/g, '-');
            }
            let routeNum = 1;
            if (State.savedRoutes && State.savedRoutes.length > 0) {
                const prefix = `${shortMC}_Route_`;
                const existingForMC = State.savedRoutes.filter(r => r && r.name && r.name.startsWith(prefix));
                routeNum = existingForMC.length + 1;
            }
            defaultName = `${shortMC}_Route_${routeNum}`;
        }

        const isEditing = this.editingRouteIdx !== null && this.editingRouteIdx !== undefined;
        const promptMsg = isEditing ? `Update route name (or keep same):` : `Enter a name for this route:`;
        const finalName = prompt(promptMsg, defaultName);
        if (finalName === null || finalName.trim() === "") {
            if (App.showToast) App.showToast("Save cancelled.");
            return;
        }

        const routeObj = {
            name: finalName.trim(),
            sequence: this.sequence.map((p, i) => ({ surveyId: p.id, lat: p.lat, lng: p.lng, name: p.name })),
            polygon: this.activePolygon ? this.activePolygon.getLatLngs()[0].map(ll => [ll.lat, ll.lng]) : null,
            timestamp: new Date().toLocaleString()
        };

        let savedToServer = false;

        if (!forceDownload) {
            try {
                const payload = {
                    route_name: routeObj.name,
                    route_data: routeObj,
                    created_by: window.USER ? window.USER.email : 'anonymous'
                };

                let result;
                if (isEditing && this.editingRouteId) {
                    result = await window._supabase
                        .from('saved_routes')
                        .update(payload)
                        .eq('id', this.editingRouteId);
                } else {
                    result = await window._supabase
                        .from('saved_routes')
                        .insert([payload]);
                }

                if (result.error) throw result.error;

                if (App.showToast) App.showToast(isEditing ? "Route updated in Cloud." : "Route saved to Cloud.");
                savedToServer = true;
                this.editingRouteIdx = null;
                this.editingRouteName = null;
                this.editingRouteId = null;
                this.loadRoutes();
            } catch (e) {
                console.warn("Cloud sync failed, fallback to local:", e);
            }
        }

        if (forceDownload || !savedToServer) {
            const blob = new Blob([JSON.stringify(routeObj, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${routeObj.name}.json`;
            a.click();
            if (App.showToast && forceDownload) App.showToast("Route saved to disk.");
        }
        this.renderSavedList();
    },

    updateSpecificRouteItem(sid) {
        if (this.isBatchMode) {
            this.renderRoute();
            return;
        }

        // 1. Update Marker on Map
        const m = this._markerMap ? this._markerMap[sid] : null;
        if (m) {
            const idx = this.sequence.findIndex(p => String(p.id) === String(sid));
            m.setIcon(L.divIcon({
                className: idx === -1 ? 'route-marker-pool-dot' : 'route-marker-square',
                html: idx === -1 ? '' : (idx + 1)
            }));
            // Update click handler to either add or remove depending on new state
            m.off('click');
            m.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                App._markerHit = true;
                const sidStr = String(sid).replace(/\.0$/, '').trim();
                const currentIdx = this.sequence.findIndex(p => String(p.id) === sidStr);
                if (currentIdx === -1) this.addToSequence(sidStr);
                else this.removeFromSequence(sidStr);

                const isMapReady = window.SID_MAP instanceof Map;
                const row = isMapReady ? window.SID_MAP.get(sidStr) : null;
                const seqEntry = currentIdx !== -1 ? this.sequence[currentIdx] : null;
                const lat = row ? parseFloat(row[1]) : (seqEntry ? seqEntry.lat : null);
                const lng = row ? parseFloat(row[2]) : (seqEntry ? seqEntry.lng : null);
                this.highlightMarker(sidStr, lat, lng);
                this.highlightListItem(sidStr);
            });
        }

        // 2. Update Polylines over route
        if (this.routeLayer) {
            this.routeLayer.clearLayers();
            if (this.activePolygon && this.activePolygon._latlngs) {
                const polyCoords = this.activePolygon.getLatLngs()[0];
                L.polygon(polyCoords, { color: '#94a3b8', fillOpacity: 0.08, weight: 1.5, dashArray: '5,5', interactive: false }).addTo(this.routeLayer);
            }
            if (this.sequence && this.sequence.length > 1) {
                const pts = this.sequence.map(p => [p.lat, p.lng]);
                L.polyline(pts, { color: '#3b82f6', weight: 4, opacity: 0.8 }).addTo(this.routeLayer);
            }
        }

        // 3. Update DOM List Card
        const list = document.getElementById('route-list');
        if (list) {
            const card = list.querySelector(`[data-sid="${sid}"]`);
            if (card) {
                const sidStr = String(sid).replace(/\.0$/, '').trim();
                const seqIdx = this.sequence.findIndex(p => String(p.id) === sidStr);
                const isStart = seqIdx === 0;
                const isEnd = seqIdx !== -1 && seqIdx === this.sequence.length - 1;

                const isMapReady = window.SID_MAP instanceof Map;
                const row = isMapReady ? window.SID_MAP.get(sidStr) : null;
                const seqEntry = seqIdx !== -1 ? this.sequence[seqIdx] : null;
                const name = row ? decodePII(row[4]) : (seqEntry ? seqEntry.name : '');
                let area = row ? (row[12] || 'Area').replace(/Municipal Committee/gi, 'MC').replace(/Union Council/gi, 'UC') : '';
                card.innerHTML = `
                        <div class="v6-badge" style="background:${isStart ? '#10b981' : isEnd ? '#ef4444' : ''}; padding:0; overflow:hidden; width:26px; height:24px;">
                            <input type="number" min="1" max="${this.sequence.length + 1}" value="${seqIdx === -1 ? '' : seqIdx + 1}" placeholder="-"
                                   style="width:100%; height:100%; border:none; background:transparent; color:${(isStart || isEnd) ? 'white' : 'var(--primary)'}; text-align:center; font-size:10px; font-weight:800; outline:none; padding:0;"
                                   onchange="SpatialRouter.updateSequenceManual('${sid}', this.value)"
                                   onclick="event.stopPropagation()">
                        </div>
                        <div class="v6-card-body">
                            <div class="v6-card-title">#${sid}</div>
                            <div class="v6-card-sub">${area || name || ''} | ${seqIdx === -1 ? 'Pool' : (isStart ? 'Start' : isEnd ? 'End' : 'Sequenced')}</div>
                        </div>
                        <button onclick="event.stopPropagation(); SpatialRouter.${seqIdx === -1 ? 'addToSequence' : 'removeFromSequence'}('${sid}')" class="v6-action-btn" style="color:${seqIdx === -1 ? '#10b981' : '#ef4444'}">
                            <span class="material-icons-round" style="font-size:18px;">${seqIdx === -1 ? 'library_add' : 'remove_circle'}</span>
                        </button>
                    `;
            }
        }
        this.updateStats();
    },

    removeFromSequence(sid) {
        if (this.isLocked) { if (App.showToast) App.showToast("Sequence is locked."); return; }
        const sidStr = String(sid).replace(/\.0$/, '').trim();
        this.sequence = this.sequence.filter(p => String(p.id) !== sidStr);
        this.updateSpecificRouteItem(sidStr);
    },

    addToSequence(sid) {
        if (this.isLocked) { if (App.showToast) App.showToast("Sequence is locked."); return; }
        const sidStr = String(sid).replace(/\.0$/, '').trim();
        if (this.sequence.findIndex(p => String(p.id) === sidStr) !== -1) return;
        const isMapReady = window.SID_MAP instanceof Map;
        const row = isMapReady ? window.SID_MAP.get(sidStr) : null;
        if (row) {
            this.sequence.push({ id: sidStr, lat: parseFloat(row[1]), lng: parseFloat(row[2]), name: decodePII(row[4]) });
            
            // CRITICAL: Ensure present in capturedIDs pool
            if (!this.capturedIDs.includes(sidStr)) {
                this.capturedIDs.push(sidStr);
                this.renderRoute(); // Force list card generation and refresh
            } else {
                this.updateSpecificRouteItem(sidStr); // Fast update
            }
        }
    },
    init() {
        console.log("SpatialRouter.init starting...");
        this.backgroundLayers = [];
        this.drawnPolygons = [];
        this.isEditing = false;

        if ((!State.savedRoutes || State.savedRoutes.length === 0) && window.RAW_ROUTES) {
            State.savedRoutes = window.RAW_ROUTES;
        }
        if (!State.savedRoutes) State.savedRoutes = [];

        this.renderSavedList();
        this.renderRouteManager();
        this.activeTab = 'manager';
        this.activeDisplayRoutes = []; // Array of route names currently on map
        this.setEditMode(false);

        // Fix: Catch potential errors in loadRoutes to prevent init crash
        this.loadRoutes(null, true).catch(err => console.warn("Initial loadRoutes failed:", err));

        setInterval(() => this.checkServerHealth(), 120000);

        // Bind dummy handlers placeholders (Will be properly assigned during startDrawing)
        this.onClick = () => { };
        this.onContext = () => { };

        // Setup Draw Control logic
        if (State.map && L.Control.Draw) {
            const drawControl = new L.Control.Draw({
                draw: {
                    polygon: { shapeOptions: { color: '#3b82f6', weight: 2 } },
                    polyline: false, circle: false, rectangle: false, marker: false, circlemarker: false
                },
                edit: false
            });
            State.map.addControl(drawControl);
            State.map.on(L.Draw.Event.CREATED, (e) => {
                if (e.layerType === 'polygon') {
                    const layer = e.layer;
                    if (!this.drawnPolygons) this.drawnPolygons = [];
                    this.drawnPolygons.push(layer);
                    State.map.addLayer(layer);

                    // Style active polygon layer
                    layer.setStyle({
                        color: '#3b82f6',
                        fillOpacity: 0.1,
                        weight: 3
                    });

                    const latlngs = layer.getLatLngs()[0];
                    const polyPts = latlngs.map(p => ({ lat: p.lat, lng: p.lng }));

                    // Exit batch mode
                    this.isBatchMode = false;
                    this.batchRouteSequences = [];
                    this.batchRoutePolygons = [];
                    this.activeDisplayRoutes = [];

                    // Save state of previous active polygon
                    if (this.activePolygon) {
                        this.saveStateToPolygon(this.activePolygon);
                        this.activePolygon.setStyle({ color: '#94a3b8', weight: 1.5 });
                    }

                    // Reset capturedIDs before harvesting so we don't carry over old markers
                    this.capturedIDs = [];
                    const ids = this.harvest(polyPts);
                    if (ids.length > 0 && App.showToast) App.showToast(`Found ${ids.length} items.`);

                    // Initialize state for the new polygon
                    layer._routeState = {
                        sequence: [],
                        capturedIDs: ids,
                        startId: null,
                        endId: null
                    };

                    // Set active session variables
                    this.activePolygon = layer;
                    this.capturedIDs = ids;
                    this.sequence = [];
                    this.startId = null;
                    this.endId = null;

                    this.renderRoute();
                    this.switchTab('editor');

                    // Bind click event to activate the polygon when clicked
                    layer.on('click', (ev) => {
                        L.DomEvent.stopPropagation(ev);
                        if (this.activePolygon === layer) return;

                        if (this.activePolygon) {
                            this.saveStateToPolygon(this.activePolygon);
                            this.activePolygon.setStyle({ color: '#94a3b8', weight: 1.5 });
                        }

                        this.activePolygon = layer;
                        layer.setStyle({ color: '#3b82f6', weight: 3 });
                        this.restoreStateFromPolygon(layer);
                    });
                }
            });
        }
        console.log('SpatialRouter.init complete.');
    }
};

window.SpatialRouter = SpatialRouter;