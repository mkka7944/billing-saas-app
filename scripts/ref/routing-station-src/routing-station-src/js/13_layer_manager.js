// === 13_layer_manager.js ===
// Layer manager

const LayerManager = {
    activeLayers: [],
    pendingSelections: new Set(),
    activeTab: null,

    _getFeatureColor(feature, palette) {
        // Robust hashing using ID or Name
        const idStr = (feature.properties.fid || feature.properties.name || 'Unnamed').toString();
        let hash = 0;
        for (let i = 0; i < idStr.length; i++) {
            hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
        }
        return palette[Math.abs(hash) % palette.length];
    },

    load(keysToLoad) {
        this.clear();
        const palette = [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
            '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
            '#14b8a6', '#6366f1'
        ];

        keysToLoad.forEach((key, index) => {
            const [city, layerName] = key.split('|');
            if (GEO_LAYERS[city] && GEO_LAYERS[city][layerName]) {
                const layerColor = palette[index % palette.length];
                const lowerLayer = layerName.toLowerCase();
                const isWardLayer = lowerLayer.includes('urban_ward') || lowerLayer.includes('urban_uc');
                const isCantonment = lowerLayer.includes('cantonment');

                const layer = L.geoJSON(GEO_LAYERS[city][layerName], {
                    layerKey: key,
                    interactive: true,
                    pane: 'kmlPane',
                    style: (feature) => {
                        let color = layerColor;
                        let weight = 0.8;
                        let dashArray = '5, 5';

                        if (isCantonment) {
                            color = '#ef4444'; // Permanent Red for Cantonment
                            weight = 1.5;
                            dashArray = null;
                        } else if (isWardLayer && feature.properties) {
                            color = this._getFeatureColor(feature, palette);
                        }

                        // Solid borders for MC layers
                        if (layerName.match(/MC\s?\d+/i)) {
                            weight = 1.5;
                            dashArray = null;
                        }

                        return {
                            color: color, weight: weight, opacity: 0.6, dashArray: dashArray,
                            fillColor: color, fillOpacity: 0.08
                        };
                    },
                    onEachFeature: (feature, layer) => {
                        if (State.showTooltips) {
                            const isMc = layerName.match(/MC\s?\d+/i);
                            let content = '';

                            if (isMc) {
                                content = `<div style="font-family:Inter, sans-serif; padding:2px 4px; font-size:12px; font-weight:700; color:#1e293b;">${layerName}</div>`;
                            } else {
                                const customMeta = (window.KML_META && window.KML_META[layerName]) ? window.KML_META[layerName] : '';
                                content = `
                                        <div style="font-family:Inter, sans-serif; padding:4px;">
                                            <div style="font-size:10px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px;">Boundary Layer</div>
                                            <div style="font-size:13px; font-weight:700; color:#1e293b;">${layerName}</div>
                                            ${customMeta ? `<div style="margin-top:6px; padding-top:6px; border-top:1px solid #f1f5f9; font-size:11px; color:#2563eb; font-weight:600;">${customMeta}</div>` : ''}
                                            <div style="font-size:10px; color:#94a3b8; margin-top:4px;">${feature.properties.name || 'Zone Feature'}</div>
                                        </div>
                                     `;
                            }
                            layer.bindTooltip(content, { sticky: true, opacity: 0.9 });
                        }
                    }
                }).addTo(State.map);
                this.activeLayers.push(layer);
            }
        });
    },

    clear() {
        this.activeLayers.forEach(l => State.map.removeLayer(l));
        this.activeLayers = [];
    },

    initPendingState() {
        this.pendingSelections = new Set();
        this.activeLayers.forEach(l => {
            if (l.options.layerKey) this.pendingSelections.add(l.options.layerKey);
        });
    },

    showToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'toast-msg';
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => { toast.classList.add('show'); }, 10);
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
    },

    switchTab(city) {
        this.activeTab = city;
        this.renderSettingsUI();
    },

    toggleSelection(key) {
        if (this.pendingSelections.has(key)) {
            this.pendingSelections.delete(key);
        } else {
            this.pendingSelections.add(key);
        }
        this.renderSettingsUI();
    },

    toggleAll(city, shouldSelect) {
        let cityName = city;
        let mcOnly = this.activeTab === '🏢 SARGODHA MC';

        const layers = GEO_LAYERS[cityName] || {};
        Object.keys(layers).forEach(layerName => {
            const isMc = layerName.match(/MC\s?\d+/i);
            if (mcOnly && !isMc) return;
            if (!mcOnly && cityName === 'SARGODHA' && isMc) return;

            const key = `${cityName}|${layerName}`;
            if (shouldSelect) this.pendingSelections.add(key);
            else this.pendingSelections.delete(key);
        });
        this.renderSettingsUI();
    },

    toggleTooltips() {
        State.showTooltips = !State.showTooltips;

        // Immediate Update on Map
        this.activeLayers.forEach(layer => {
            if (layer.feature) {
                if (State.showTooltips) {
                    const layerName = layer.options.layerKey ? layer.options.layerKey.split('|')[1] : null;
                    if (layerName) {
                        const customMeta = (window.KML_META && window.KML_META[layerName]) ? window.KML_META[layerName] : '';
                        const content = `
                                <div style="font-family:Inter, sans-serif; padding:4px;">
                                    <div style="font-size:10px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px;">Boundary</div>
                                    <div style="font-size:13px; font-weight:700; color:#1e293b;">${layerName}</div>
                                    ${customMeta ? `<div style="margin-top:6px; padding-top:6px; border-top:1px solid #f1f5f9; font-size:11px; color:#2563eb; font-weight:600;">${customMeta}</div>` : ''}
                                </div>
                             `;
                        App.bindCustomTooltip(layer, content);
                        if (layer.getTooltip()) layer.getTooltip().options.sticky = true;
                    }
                } else {
                    layer.unbindTooltip();
                }
            }
        });

        this.renderSettingsUI();
        this.showToast(`Tooltips ${State.showTooltips ? 'Enabled' : 'Disabled'}`);
    },

    applySettings() {
        // Convert Set to Array and Load
        const keys = Array.from(this.pendingSelections);
        this.load(keys);

        // Close Settings Modal
        document.getElementById('modal-settings').style.display = 'none';
        this.renderSettingsUI();
        this.showToast(`Active Layers: ${keys.length}`);
    },

    async showStaffSyncDetails(email) {
        const id = email.replace(/[^a-z0-9]/gi, '_');
        const container = document.getElementById(`details-${id}`);
        if (!container) return;

        // Toggle
        if (container.style.display === 'block') {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = `<div style="text-align:center; padding:20px;"><span class="material-icons-round spinning" style="font-size:18px; color:var(--primary);">sync</span></div>`;

        const logs = await DriveSync.fetchDetailedLogs(email);
        if (!logs || logs.length === 0) {
            container.innerHTML = `<div style="padding:10px; color:#94a3b8; font-size:11px;">No individual records found.</div>`;
            return;
        }

        // Group by Survey ID
        const groups = {};
        logs.forEach(l => {
            if (!groups[l.survey_id]) groups[l.survey_id] = { files: [], email: l.email, timestamp: l.synced_at };
            groups[l.survey_id].files.push(l.file_id);
        });

        let html = `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 12px 12px; padding:12px; animation: slideDown 0.2s ease;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <div style="font-size:10px; font-weight:800; color:#64748b; text-transform:uppercase;">ID Breakdown (Text Only)</div>
                    <button onclick="LayerManager.deleteSelectedSyncs('${id}')" id="btn-del-${id}" style="background:#fee2e2; color:#ef4444; border:none; padding:4px 10px; border-radius:6px; font-size:10px; font-weight:800; cursor:pointer; display:flex; align-items:center; gap:4px;">
                        <span class="material-icons-round" style="font-size:14px;">delete_sweep</span> PRUNE LOGS
                    </button>
                </div>
                <div style="display:flex; flex-direction:column; gap:6px;">
        `;

        Object.entries(groups).forEach(([sid, g]) => {
            const files = g.files;
            html += `
                <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:10px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" class="sync-chk-${id}" data-files="${files.join(',')}" style="width:16px; height:16px; accent-color:var(--primary);">
                        <div>
                            <div style="font-weight:800; color:#1e293b; font-size:12px;">ID: ${sid || 'Unknown'}</div>
                            <div style="font-size:9px; color:#94a3b8; font-weight:700;">${files.length} Logged Record${files.length > 1 ? 's' : ''}</div>
                        </div>
                    </div>
                    <div style="font-size:9px; color:#cbd5e1; font-weight:800; text-align:right;">
                        ${new Date(g.timestamp).toLocaleDateString()}
                    </div>
                </div>
            `;
        });

        html += `</div></div>`;
        container.innerHTML = html;
    },

    async pruneAllForEmail(email) {
        if (!confirm(`This will verify and prune ALL ${email}'s sync logs. Proceed?`)) return;
        
        const logs = await DriveSync.fetchDetailedLogs(email);
        if (!logs || logs.length === 0) return alert("No logs found to prune.");
        
        const fileIds = logs.map(l => l.file_id);
        const safeId = email.replace(/[^a-z0-9]/gi, '_');
        const btn = document.getElementById(`btn-prune-${safeId}`);
        const originalHtml = btn ? btn.innerHTML : '';
        
        if (btn) {
            btn.disabled = true;
            btn.style.width = '120px'; // Expand to fit text
        }

        const chunkSize = 10;
        let successCount = 0;

        for (let i = 0; i < fileIds.length; i += chunkSize) {
            const chunk = fileIds.slice(i, i + chunkSize);
            if (btn) btn.innerHTML = `<span style="font-size:10px; font-weight:800;">${i} of ${fileIds.length}</span>`;
            
            const success = await DriveSync.deleteBatch(chunk, true); // true = skip individual confirms
            if (success) successCount += chunk.length;
        }

        if (btn) {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            btn.style.width = '';
        }

        State.cachedSyncLogs = null;
        this.renderSettingsUI();
    },

    async deleteSelectedSyncs(id) {
        const checks = document.querySelectorAll(`.sync-chk-${id}:checked`);
        if (checks.length === 0) { alert("Select at least one ID to delete."); return; }

        let allFileIds = [];
        checks.forEach(c => {
            const files = c.getAttribute('data-files').split(',');
            allFileIds = allFileIds.concat(files);
        });

        const btn = document.getElementById(`btn-del-${id}`);
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round spinning" style="font-size:14px;">sync</span> DELETING...';

        const success = await DriveSync.deleteBatch(allFileIds);
        if (success) {
            this.renderSettingsUI(); // Refresh the whole thing
        } else {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    },

    clearCity() {
        const city = this.activeTab;
        for (let key of this.pendingSelections) {
            if (key.startsWith(city + '|')) {
                this.pendingSelections.delete(key);
            }
        }
        this.renderSettingsUI();
    },

    // Natural Sort Helper
    naturalSort(a, b) {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    },

    renderSettingsUI() {
        const container = document.getElementById('settings-layers-container');
        if (!container) return;

        // Save scroll position
        const scrollEl = container.querySelector('.settings-scroll-area');
        const lastScroll = scrollEl ? scrollEl.scrollTop : 0;

        const hasLayers = typeof window.GEO_LAYERS !== 'undefined' && window.GEO_LAYERS !== null;
        if (!hasLayers) {
            container.innerHTML = '<div style="padding:40px; text-align:center; color:#64748b;">Loading map layers... please wait.</div>';
            return;
        }

        // Calculate Counts for Sidebar
        const areaCounts = {};
        if (typeof RAW_DATA !== 'undefined') {
            RAW_DATA.forEach(r => {
                const area = r[12] || 'Unknown';
                areaCounts[area] = (areaCounts[area] || 0) + 1;
            });
        }

        // Base Fixed Tabs
        let tabs = ['📊 Stats', '📍 Marker Limit'];

        // Add Billing Tab for Admins
        if (window.USER && window.USER.role === 'admin') {
            tabs.push('⚙️ App Config');
            tabs.push('📈 Pin Management');
            tabs.push('📊 Sync Monitor');
        }

        // Natural Sort for Dynamic Tabs (Cities/Layers)
        let dynamicTabs = Object.keys(window.GEO_LAYERS).sort(this.naturalSort);

        // Special handling for Sargodha MC tab placement
        const sargodhaIndex = dynamicTabs.indexOf('SARGODHA');
        if (sargodhaIndex > -1) {
            dynamicTabs.splice(sargodhaIndex, 1);
            tabs.push('🏢 SARGODHA MC');
            tabs.push('SARGODHA');
        }
        tabs = tabs.concat(dynamicTabs);

        if (!this.activeTab) this.activeTab = '📊 Stats';

        let tabsHtml = `<div class="settings-tabs-row">`;
        tabs.forEach(tab => {
            const isActive = this.activeTab === tab;
            tabsHtml += `
                    <button onclick="LayerManager.switchTab('${tab}')" class="settings-tab-btn ${isActive ? 'active' : ''}">
                        ${tab}
                    </button>`;
        });
        tabsHtml += `</div>`;

        let contentHtml = '<div class="settings-scroll-area" style="flex:1; overflow-y:auto; padding:16px; padding-bottom:80px;">';

        if (this.activeTab === '📊 Stats') {
            contentHtml += `
                    <div style="background:#eff6ff; border-radius:16px; padding:20px; border:1px solid #dbeafe; box-shadow: 0 4px 12px rgba(37,99,235,0.05);">
                         <h4 style="margin:0 0 16px 0; color:#1e40af; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:1px;">Data Coverage Overview</h4>
                         <div style="grid-template-columns:1fr 1fr; display:grid; gap:12px;">
                             <div style="background:white; padding:16px; border-radius:12px; text-align:center; grid-column:span 2; border:1px solid #dbeafe;">
                                 <div style="font-size:10px; color:#64748b; font-weight:800; letter-spacing:1px;">TOTAL SURVEYS</div>
                                 <div id="set-total-surveys" style="font-size:28px; font-weight:900; color:#1e293b; margin-top:4px;">0</div>
                             </div>
                             <div style="background:white; padding:12px; border-radius:12px; text-align:center; border:1px solid #dcfce7;">
                                 <div style="font-size:9px; color:#16a34a; font-weight:800; letter-spacing:0.5px;">DOMESTIC</div>
                                 <div id="set-total-domestic" style="font-size:20px; font-weight:900; color:#16a34a;">0</div>
                             </div>
                             <div style="background:white; padding:12px; border-radius:12px; text-align:center; border:1px solid #fef3c7;">
                                 <div style="font-size:9px; color:#d97706; font-weight:800; letter-spacing:0.5px;">COMMERCIAL</div>
                                 <div id="set-total-commercial" style="font-size:20px; font-weight:900; color:#d97706;">0</div>
                             </div>
                         </div>
                    </div>
                    
                    <div style="margin-top:20px; background:white; border-radius:16px; border:1px solid #f1f5f9; padding:4px;">
                        <button onclick="LayerManager.toggleTooltips()" class="secondary-btn" style="width:100%; margin:0; justify-content:space-between; padding:16px; border:none; border-radius:12px;">
                            <div style="display:flex; align-items:center; gap:12px;">
                                <div style="width:36px; height:36px; border-radius:10px; background:${State.showTooltips ? '#f0fdf4' : '#f8fafc'}; color:${State.showTooltips ? '#16a34a' : '#64748b'}; display:flex; align-items:center; justify-content:center;">
                                    <span class="material-icons-round">${State.showTooltips ? 'comment' : 'comments_disabled'}</span>
                                </div>
                                <div style="text-align:left;">
                                    <div style="font-size:12px; font-weight:800; color:#1e293b;">Layer Tooltips</div>
                                    <div style="font-size:10px; color:#94a3b8; font-weight:600;">Show names on map hover/tap</div>
                                </div>
                            </div>
                            <div class="toggle-switch ${State.showTooltips ? 'active' : ''}"></div>
                        </button>
                    </div>

                    <div style="margin-top:16px; padding:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; font-size:11px; color:#64748b; line-height:1.6; font-weight:600;">
                        This dashboard provides real-time statistics of the survey database. Use the 📍 <b>Marker Limit</b> tab if you need to adjust performance for large datasets.
                    </div>`;
            setTimeout(() => typeof Settings !== 'undefined' && Settings.updateStats(), 50);
        }
        else if (this.activeTab === '📍 Marker Limit') {
            const limit = State.markerLimit >= 999999 ? 'No Limit' : State.markerLimit.toLocaleString();
            contentHtml += `
                    <div style="padding:4px;">
                        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:20px; background: #fff; padding:16px; border-radius:16px; border:1px solid #f1f5f9;">
                            <div>
                                <label style="font-weight:800; font-size:11px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; display:block; margin-bottom:4px;">Current Map Limit</label>
                                <span style="font-weight:900; font-size:28px; color:var(--primary);">${limit === 'No Limit' ? '∞' : limit}</span>
                            </div>
                            <span class="material-icons-round" style="font-size:40px; color:#dbeafe;">speed</span>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px;">
                            <button onclick="Settings.setMarkerLimit(5000)" class="secondary-btn" style="margin:0; justify-content:center;">5,000</button>
                            <button onclick="Settings.setMarkerLimit(10000)" class="secondary-btn" style="margin:0; justify-content:center;">10,000</button>
                            <button onclick="Settings.setMarkerLimit(20000)" class="secondary-btn" style="margin:0; justify-content:center;">20,000</button>
                            <button onclick="Settings.setMarkerLimit(50000)" class="secondary-btn" style="margin:0; justify-content:center;">50,000</button>
                            <button onclick="Settings.setMarkerLimit(999999)" class="secondary-btn" style="margin:0; justify-content:center; grid-column: span 2; background:#f0f7ff; border-color:#dbeafe; color:#2563eb;">Show All Records</button>
                        </div>
                    </div>`;
        }
        else if (this.activeTab === '⚙️ App Config') {
            contentHtml += `
                    <div style="padding:4px;">
                        <div style="background:#fff; border:1px solid #f1f5f9; border-radius:16px; padding:20px;">
                            <label style="font-weight:800; font-size:11px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; display:block; margin-bottom:8px;">Active Billing Month</label>
                            <input type="text" id="input-billing-month" value="${window.ACTIVE_BILLING_MONTH}" placeholder="e.g. feb2026" 
                                style="width:100%; padding:14px; border-radius:12px; border:1px solid #e2e8f0; font-size:16px; font-weight:700; margin-bottom:16px; outline:none;">
                            <button onclick="Settings.updateBillingMonth()" class="secondary-btn" style="width:100%; margin:0; justify-content:center; background:#2563eb; color:white; border:none; padding:15px; border-radius:12px; font-weight:800;">
                                <span class="material-icons-round">cloud_done</span> Save to Cloud
                            </button>
                        </div>
                        <div style="margin-top:20px; padding:20px; background:#fff1f2; border:1px solid #fecaca; border-radius:16px;">
                            <h4 style="margin:0 0 8px 0; color:#991b1b; font-size:11px; font-weight:800; text-transform:uppercase;">Advanced Database Maintenance</h4>
                            <button id="btn-normalize-db" onclick="LayerManager.normalizeDatabase()" class="secondary-btn" style="width:100%; margin:0; justify-content:center; background:#ef4444; color:white; border:none; padding:12px; border-radius:10px; font-weight:800;">
                                <span class="material-icons-round">biotech</span> Normalize Historical IDs
                            </button>
                        </div>
                    </div>`;
        }
        else if (this.activeTab === '📈 Pin Management') {
            contentHtml += Settings.renderVerificationStats();
            contentHtml += `
                <div style="padding:16px;">
                    <button onclick="Settings.exportHouseSequences()" class="secondary-btn" style="width:100%; margin:0; justify-content:center; background:#2563eb; color:white; border:none; padding:14px; border-radius:12px; font-weight:800;">
                        <span class="material-icons-round">file_download</span> Master Export (Intelligence CSV)
                    </button>
                </div>
            `;
        }
        else if (this.activeTab === '📊 Sync Monitor') {
            contentHtml += `<div id="sync-monitor-content" style="padding:4px;">
                <div style="text-align:center; padding:40px; color:#64748b;">
                    <span class="material-icons-round spinning" style="font-size:32px; color:var(--primary); margin-bottom:12px;">sync</span>
                    <div style="font-weight:700;">Fetching live sync logs...</div>
                </div>
            </div>`;
            
            setTimeout(async () => {
                const el = document.getElementById('sync-monitor-content');
                if (!el || !window._supabase) return;
                const days = localStorage.getItem('sync_filter_days') || '7';
                if (State.cachedSyncLogs && State.cachedSyncLogs._days === days) {
                    this._renderSyncMonitorFromData(State.cachedSyncLogs);
                    return;
                }
                try {
                    // 1. Fetch Absolute Total (Unfiltered) for the header
                    const { count: absoluteTotal } = await window._supabase
                        .from('staff_sync_logs')
                        .select('*', { count: 'exact', head: true });
                    
                    State.totalDriveImages = absoluteTotal || 0;

                    // 2. Fetch Filtered Logs for the list
                    let allLogs = [];
                    let from = 0;
                    const step = 1000;
                    let hasMore = true;
                    const cutoff = (days !== '0') ? (() => {
                        const d = new Date();
                        d.setDate(d.getDate() - parseInt(days));
                        return d.toISOString();
                    })() : null;

                    while (hasMore && allLogs.length < 100000) {
                        let query = window._supabase.from('staff_sync_logs').select('email, survey_id, file_id, synced_at');
                        if (cutoff) query = query.gte('synced_at', cutoff);
                        
                        const { data, error: fetchError } = await query
                            .order('synced_at', { ascending: false })
                            .range(from, from + step - 1);

                        if (fetchError) throw fetchError;
                        if (!data || data.length === 0) {
                            hasMore = false;
                        } else {
                            allLogs = allLogs.concat(data);
                            if (data.length < step) hasMore = false;
                            else from += step;
                        }
                    }
                    
                    State.cachedSyncLogs = allLogs;
                    State.cachedSyncLogs._days = days;
                    this._renderSyncMonitorFromData(State.cachedSyncLogs);
                } catch (e) {
                    el.innerHTML = `<div style="padding:40px; text-align:center; color:#ef4444; font-weight:800;">Failed to load data.</div>`;
                }
            }, 50);
        }
        else {
            let cityName = this.activeTab;
            let isMcTab = cityName === '🏢 SARGODHA MC';
            if (isMcTab) cityName = 'SARGODHA';
            const allCityLayers = window.GEO_LAYERS[cityName] || {};
            let filteredKeys = Object.keys(allCityLayers);
            if (isMcTab) filteredKeys = filteredKeys.filter(k => k.match(/MC\s?\d+/i));
            else if (cityName === 'SARGODHA') filteredKeys = filteredKeys.filter(k => !k.match(/MC\s?\d+/i));
            const sortedLayers = filteredKeys.sort(this.naturalSort);

            if (sortedLayers.length === 0) {
                contentHtml += '<div style="padding:60px 20px; text-align:center; color:#94a3b8;">No matching layers.</div>';
            } else {
                const allSelected = sortedLayers.every(layerName => this.pendingSelections.has(`${cityName}|${layerName}`));
                contentHtml += `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                            <div style="font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase;">${this.activeTab} LAYERS</div>
                            <button onclick="LayerManager.toggleAll('${cityName}', ${!allSelected})" style="background:#f0f7ff; color:#2563eb; border:none; padding:6px 14px; border-radius:8px; font-size:10px; font-weight:800;">
                                ${allSelected ? 'UNSELECT ALL' : 'SELECT ALL'}
                            </button>
                        </div>
                        <div class="kml-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">`;
                sortedLayers.forEach(layerName => {
                    const key = `${cityName}|${layerName}`;
                    const isChecked = this.pendingSelections.has(key);
                    const count = areaCounts[layerName] || 0;
                    contentHtml += `
                            <div class="multi-option ${isChecked ? 'selected' : ''}" onclick="LayerManager.toggleSelection('${key}')" 
                                 style="padding:12px; border:1px solid ${isChecked ? '#bfdbfe' : '#f1f5f9'}; border-radius:12px; 
                                 display:flex; align-items:center; gap:10px; cursor:pointer; background:${isChecked ? '#eff6ff' : 'white'};">
                                <div style="width:20px; height:20px; border:1.5px solid ${isChecked ? '#2563eb' : '#cbd5e1'}; border-radius:6px; 
                                            display:flex; align-items:center; justify-content:center; background:${isChecked ? '#2563eb' : 'transparent'};">
                                    ${isChecked ? '<span class="material-icons-round" style="font-size:14px; color:white;">check</span>' : ''}
                                </div>
                                <span style="font-size:11px; font-weight:700;">
                                     ${count > 0 ? `<span style="opacity:0.6; font-size:9px; margin-right:4px;">(${count})</span>` : ''}${layerName}
                                </span>
                            </div>`;
                });
                contentHtml += `</div>`;
            }
        }

        contentHtml += '</div>';

        const showApply = !['📊 Stats', '📍 Marker Limit', '📈 Pin Management', '📊 Sync Monitor'].includes(this.activeTab);
        contentHtml += `
                <div class="settings-footer" style="position: sticky; bottom: 0; padding: 12px 16px; background: white; border-top: 1px solid #e2e8f0; display: flex; gap: 10px; border-radius: 0 0 16px 16px; z-index: 10;">
                    ${showApply ? `
                        <button onclick="Settings.close()" class="secondary-btn" style="flex:1;">Cancel</button>
                        <button onclick="LayerManager.applySettings()" class="secondary-btn" style="flex:1.5; background:var(--primary); color:white; border:none;">Apply Changes</button>
                    ` : `
                        <button onclick="Settings.close()" class="secondary-btn" style="width:100%;">Close Settings</button>
                    `}
                </div>
            `;

        container.innerHTML = tabsHtml + contentHtml;
        if (scrollEl) container.querySelector('.settings-scroll-area').scrollTop = lastScroll;
    },

    _renderSyncMonitorFromData(allLogs) {
        const el = document.getElementById('sync-monitor-content');
        if (!el) return;

        const totalCount = State.totalDriveImages || allLogs.length;
        const days = localStorage.getItem('sync_filter_days') || '7';

        const stats = {};
        const dailyPerformance = {};
        const today = new Date().toISOString().split('T')[0];

        allLogs.forEach(log => {
            if (!stats[log.email]) stats[log.email] = { total: 0, today: 0, last: log.synced_at };
            stats[log.email].total += 1;
            
            // SUPER-ROBUST DATE PARSING
            let dateKey = 'Unknown';
            try {
                if (log.synced_at) {
                    const s = String(log.synced_at);
                    // Extract YYYY-MM-DD using regex to be format-agnostic
                    const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
                    dateKey = match ? match[1] : 'Unknown';
                }
            } catch(e) { dateKey = 'Unknown'; }

            if (!dailyPerformance[dateKey]) dailyPerformance[dateKey] = 0;
            dailyPerformance[dateKey] += 1;
            if (log.synced_at && log.synced_at.startsWith(today)) stats[log.email].today += 1;
            if (new Date(log.synced_at) > new Date(stats[log.email].last)) stats[log.email].last = log.synced_at;
        });

        const last7Days = Object.entries(dailyPerformance).sort((a,b) => b[0].localeCompare(a[0])).slice(0, 7);

        let tableHtml = `
            <div style="margin-bottom:20px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <div>
                        <div style="font-size:10px; font-weight:800; color:#64748b; text-transform:uppercase;">Network Sync Total</div>
                        <div style="font-size:32px; font-weight:800; color:#1e293b; margin:10px 0;">
                            ${totalCount.toLocaleString()} <span style="font-size:14px; color:#64748b; font-weight:400;">Total / ${allLogs.length.toLocaleString()} Loaded</span>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <select onchange="localStorage.setItem('sync_filter_days', this.value); LayerManager.renderSettingsUI()" style="border-radius:12px; padding:8px; font-size:11px; font-weight:800;">
                            <option value="1" ${days === '1' ? 'selected' : ''}>Today</option>
                            <option value="7" ${days === '7' ? 'selected' : ''}>Last 7 Days</option>
                            <option value="30" ${days === '30' ? 'selected' : ''}>Last 30 Days</option>
                            <option value="0" ${days === '0' ? 'selected' : ''}>All Time</option>
                        </select>
                        <button onclick="DriveSync.clearOfflineQueue()" style="background:#fff; border:1px solid #e2e8f0; color:#64748b; padding:8px 12px; border-radius:10px; display:flex; align-items:center; gap:6px; cursor:pointer;" title="Clear Local Phone Queue">
                             <span class="material-icons-round" style="font-size:18px;">cloud_off</span>
                             <span style="font-size:10px; font-weight:800;">CLEAR QUEUE</span>
                        </button>
                        <button onclick="State.cachedSyncLogs=null; LayerManager.renderSettingsUI()" style="padding:8px 14px; font-size:11px; font-weight:800; border:1px solid #e2e8f0; border-radius:10px; background:white; cursor:pointer;">
                            <span class="material-icons-round" style="font-size:16px;">refresh</span>
                        </button>
                    </div>
                </div>
                <div style="background:white; border:1px solid #f1f5f9; border-radius:12px; padding:12px; max-height: 200px; overflow-y: auto;">
                    <div style="font-size:9px; font-weight:800; color:#94a3b8; text-transform:uppercase; margin-bottom:10px;">Daily Sync Activity (Last 30 Days)</div>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        ${Object.entries(dailyPerformance)
                            .sort((a,b) => b[0].localeCompare(a[0]))
                            .slice(0, 30)
                            .map(([date, count]) => `
                                <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; border-bottom:1px solid #f8fafc; padding-bottom:4px;">
                                    <div style="color:#64748b; font-weight:600;">${new Date(date).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</div>
                                    <div style="font-weight:800; color:var(--primary);">${count.toLocaleString()}</div>
                                </div>
                            `).join('')}
                    </div>
                </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;" id="sync-monitor-list">
        `;

        const blacklist = ['migrated@system.local', 'migrated@staff.local', 'unknown@staff.local'];
        Object.entries(stats)
            .filter(([email]) => !blacklist.includes(email.toLowerCase()))
            .sort((a,b) => b[1].total - a[1].total)
            .forEach(([email, s]) => {
            const date = new Date(s.last).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            const safeId = email.replace(/[^a-z0-9]/gi, '_');
            tableHtml += `
                <div class="sync-staff-row" onclick="LayerManager.showStaffSyncDetails('${email}')" style="background:white; border:1px solid #f1f5f9; border-radius:12px; padding:12px 16px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <div style="flex:1;">
                        <div style="font-weight:800; color:#1e293b; font-size:13px;">${email}</div>
                        <div style="font-size:10px; color:#94a3b8; font-weight:700;">Last: ${date}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="text-align:right;">
                            <div style="font-size:16px; font-weight:900; color:#10b981;">${s.today} <span style="color:#94a3b8; font-size:12px;">/ ${s.total.toLocaleString()}</span></div>
                        </div>
                        <button id="btn-prune-${safeId}" onclick="event.stopPropagation(); LayerManager.pruneAllForEmail('${email}')" 
                                style="background:#fef2f2; border:1px solid #fee2e2; color:#ef4444; padding:6px; border-radius:8px; display:flex; align-items:center; justify-content:center;"
                                title="Prune all stale logs for this email">
                            <span class="material-icons-round" style="font-size:18px;">delete_sweep</span>
                        </button>
                    </div>
                </div>
                <div id="details-${safeId}" style="display:none; margin-bottom:12px;"></div>
            `;
        });
        tableHtml += `</div>`;
        el.innerHTML = tableHtml;
    },

    async normalizeDatabase() {
        if (!confirm("This will scan the sync logs and convert any IDs like '123.0' into '123'. Proceed?")) return;
        if (!window._supabase) return;
        const btn = document.getElementById('btn-normalize-db');
        btn.disabled = true;
        try {
            let processed = 0;
            let from = 0;
            const step = 1000;
            while (true) {
                const { data, error } = await window._supabase.from('staff_sync_logs').select('id, survey_id').or('survey_id.ilike.%.0,survey_id.ilike.% %').range(from, from + step - 1);
                if (error || !data || data.length === 0) break;
                for (const row of data) {
                    const clean = row.survey_id.replace(/\.0$/, '').trim();
                    if (clean !== row.survey_id) {
                        await window._supabase.from('staff_sync_logs').update({ survey_id: clean }).eq('id', row.id);
                        processed++;
                    }
                }
                if (data.length < step) break;
                from += step;
            }
            alert(`Normalized ${processed} records.`);
            this.renderSettingsUI();
        } finally {
            btn.disabled = false;
        }
    },

    renderSidebarKML() {
        const container = document.getElementById('sidebar-kml-container');
        if (!container) return;

        if (typeof GEO_LAYERS === 'undefined') {
            container.innerHTML = '<div style="padding:10px; text-align:center; color:#94a3b8; font-size:11px;">Initializing map data...</div>';
            return;
        }

        let html = '';
        const cities = Object.keys(GEO_LAYERS).filter(c => c.toUpperCase() === 'SARGODHA');
        
        cities.forEach(city => {
            const layers = Object.keys(GEO_LAYERS[city]).filter(l => l.toUpperCase().includes('MC'));
            if (layers.length === 0) return;

            html += `<div style="font-size:9px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px; margin-top:8px; padding-left:4px;">${city}</div>`;
            
            layers.forEach(layerName => {
                const key = `${city}|${layerName}`;
                const isActive = this.pendingSelections.has(key);
                
                html += `
                    <div class="multi-option ${isActive ? 'selected' : ''}" 
                         onclick="LayerManager.toggleSidebarLayer('${key}')"
                         style="margin:0; padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; display:flex; align-items:center; gap:10px; cursor:pointer;">
                        <input type="checkbox" ${isActive ? 'checked' : ''} style="pointer-events:none;">
                        <span style="font-size:12px; font-weight:700; color:#334155;">${layerName}</span>
                    </div>
                `;
            });
        });

        if (!html) {
            html = '<div style="padding:10px; text-align:center; color:#94a3b8; font-size:11px;">No boundary layers found.</div>';
        }
        
        container.innerHTML = html;
    },

    toggleSidebarLayer(key) {
        if (this.pendingSelections.has(key)) {
            this.pendingSelections.delete(key);
        } else {
            this.pendingSelections.add(key);
        }
        
        // Immediate Apply for Sidebar interactions
        const keys = Array.from(this.pendingSelections);
        this.load(keys);
        
        this.renderSidebarKML();
        
        // Sync with Settings UI if currently open
        const settingsModal = document.getElementById('modal-settings');
        if (settingsModal && settingsModal.style.display === 'block') {
            this.renderSettingsUI();
        }
    }
};

// Attach Gallery Events
const galVp = document.getElementById('gal-vp');
if (galVp) {
    galVp.addEventListener('mousedown', e => Gallery.onStart(e));
    galVp.addEventListener('mousemove', e => Gallery.onMove(e));
    galVp.addEventListener('touchstart', e => Gallery.onStart(e), { passive: false });
    galVp.addEventListener('touchmove', e => Gallery.onMove(e), { passive: false });
    galVp.addEventListener('wheel', e => Gallery.onWheel(e), { passive: false });
    galVp.addEventListener('click', e => Gallery.clickNav(e));
    galVp.addEventListener('dblclick', () => Gallery.reset());
}
window.addEventListener('mouseup', (e) => Gallery.onEnd(e));
window.addEventListener('touchend', (e) => Gallery.onEnd(e));
window.addEventListener('mouseleave', (e) => Gallery.onEnd(e));