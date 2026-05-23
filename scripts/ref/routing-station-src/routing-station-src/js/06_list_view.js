// === 06_list_view.js ===
// === 06_list_view.js ===
// ListView

const ListView = {
    pendingSyncSIDs: new Set(),
    render() {
        if (State.currentIdx >= State.filtered.length && State.filtered.length > 0) {
            State.currentIdx = 0;
        }
        const r = State.filtered[State.currentIdx];
        if (!r) {
            document.getElementById('lv-content').innerHTML = `
                    <div style="text-align:center; padding:100px 20px; color:#94a3b8;">
                        <span class="material-icons-round" style="font-size:64px; opacity:0.2; display:block; margin-bottom:16px;">search_off</span>
                        <div style="font-weight:700; font-size:18px;">No Records Found</div>
                        <div style="font-size:14px; margin-top:8px;">Try adjusting your filters or use Global Search.</div>
                        <button onclick="UniversalSearch.open()" style="margin-top:24px; background:var(--primary); color:white; border:none; padding:12px 24px; border-radius:12px; font-weight:700; cursor:pointer;">Open Global Search</button>
                    </div>
                `;
            return;
        }

        // 1. Initialize Search Bar if not present
        const searchContainer = document.getElementById('lv-search-container');
        if (searchContainer && !searchContainer.innerHTML) {
            searchContainer.innerHTML = `
                    <div style="background:white; border-radius:15px; display:flex; align-items:center; padding:5px 15px; box-shadow:0 4px 15px rgba(0,0,0,0.08); border:1px solid #e2e8f0; gap:10px;">
                        <span class="material-icons-round" style="color:var(--primary); font-size:22px;">search</span>
                        <input type="text" id="lv-search-id" placeholder="Go to ID or Search..." 
                            style="flex:1; border:none; padding:10px 0; outline:none; font-weight:700; color:var(--text); font-size:14px;"
                            onkeydown="if(event.key==='Enter') ListView.jumpToID(this.value)"
                            oninput="ListView.toggleClearBtn(this.value)">
                        <button id="lv-search-clear" onclick="ListView.clearSearch()" style="display:none; background:none; border:none; color:#94a3b8; cursor:pointer;" title="Clear Search">
                            <span class="material-icons-round" style="font-size:20px;">cancel</span>
                        </button>
                        <button onclick="UniversalSearch.open()" style="background:none; border:none; color:#64748b; cursor:pointer; display:flex; align-items:center;" title="Global Search">
                            <span class="material-icons-round" style="font-size:22px;">travel_explore</span>
                        </button>
                    </div>
                `;
        }

        // Show clear button if input has value
        setTimeout(() => {
            const input = document.getElementById('lv-search-id');
            if (input) ListView.toggleClearBtn(input.value);
        }, 50);

        // 2. Clear Label if coming back from restore
        // Removed redundant label reset to prevent overwriting sidebar filters

        const el = document.getElementById('lv-content');

        document.getElementById('lv-idx').innerText = State.currentIdx + 1;
        document.getElementById('lv-total').innerText = State.filtered.length;

        // Integrity: Clear pending sync files when switching records
        DriveSync.files = [];

        // Surveyors are now unified in the sidebar
        // No need to clear search container here

        if (!r) {
            el.innerHTML = `
                    <div class="card-header" style="display:flex; justify-content:center; align-items:center; height:200px;">
                        <div class="card-title" style="color:#64748b">No records match the current filters.</div>
                    </div>`;
            return;
        }

        // Contextual Naming
        const dists = App.getSelected('f-dist');
        const tehsils = App.getSelected('f-tehsil');
        let displayName = decodePII(r[4]);
        if (tehsils.length > 1 || dists.length > 1) {
            displayName += ` (${r[11]})`;
        }

        const paidCount = State.filtered.filter(rec => rec[16].toLowerCase() === 'paid').length;
        const payStatus = r[16].toLowerCase().replace(' ', '-');
        let totalPayable = r[20] ? r[20].toString().trim() : '0';
        if (totalPayable.toLowerCase() === 'nan' || !totalPayable) totalPayable = '0';

        // SMT Refinement: Short MC/UC Name logic
        const mcFull = r[12] || '';
        const mcMatch = mcFull.match(/(MC|UC)[- ]?(\d+)/i);
        const shortMC = mcMatch ? `${mcMatch[1].toUpperCase()}-${mcMatch[2]}` : mcFull.split(' ')[0];
        const surveyor = r[6] || 'Unknown';
        const dateTime = `${r[7] || ''} ${r[8] || ''}`.trim() || 'No Date';

        // SMART BATCHING: If we don't have this house in cache, sync it and its nearest neighbors
        const sidStr = String(r[0]);
        if (window.ALL_VERIFIED_DATA && !window.ALL_VERIFIED_DATA.find(v => String(v.survey_id) === sidStr)) {
            if (!this.pendingSyncSIDs.has(sidStr)) {
                const batchSize = 15;
                const start = Math.max(0, State.currentIdx - 2);
                const end = Math.min(State.filtered.length, start + batchSize);
                const batchSIDs = State.filtered.slice(start, end).map(item => item[0]);
                this.batchSyncRoute(batchSIDs);
            }
        }

        // Priority: pendingHouseIntel (user's current edits) > unsavedChanges (after pin) > ALL_VERIFIED_DATA (saved)
        const pending = State.pendingHouseIntel ? State.pendingHouseIntel[sidStr] : null;
        const p = pending || State.unsavedChanges[sidStr] || null;
        const v = window.ALL_VERIFIED_DATA ? window.ALL_VERIFIED_DATA.find(i => String(i.survey_id) === sidStr) : null;
        const staging = p; // For backward compatibility
        const isLocked = staging ? staging.isLocked !== false : true;

        const isLeft = v ? v.is_right === false : false;
        const isRight = v ? v.is_right === true : false;
        const isDeliv = v ? v.is_delivered === true : false;

        // Verified context string (Street, Seq, Side)
        let verifiedInfoHtml = '';
        const activeIntel = p || v;
        const hasPending = !!staging; // Defined solely by presence in unified state
        
        if (activeIntel) {
            const sideStr = activeIntel.is_right === true ? 'Right' : (activeIntel.is_right === false ? 'Left' : '-');
            verifiedInfoHtml = `
                <div style="margin-top:4px; display:flex; align-items:center; gap:6px; font-size:10px; font-weight:800; color:#10b981; background:#f0fdf4; padding:2px 8px; border-radius:6px; border:1px solid #dcfce7; width:fit-content;">
                    <span class="material-icons-round" style="font-size:12px;">verified</span>
                    ${activeIntel.street_no || 'C'} • Seq ${activeIntel.sequence_no || 0} • ${sideStr}
                    ${activeIntel.is_delivered ? ' • <span style="color:#059669">Delivered</span>' : ''}
                </div>
            `;
        }

        el.innerHTML = `
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; padding: 10px 0 8px 0;">
                    <div style="display:flex; gap:6px; flex:1; flex-shrink:0; flex-wrap:wrap;">
                        <button type="button" onclick="event.stopPropagation(); ListView.showOnMap('${r[0]}')" title="Show on Map" style="background:#f8fafc; color:var(--primary); border:1px solid #e2e8f0; border-radius:10px; width:34px; height:34px; flex-shrink:0; display:flex; align-items:center; justify-content:center; cursor:pointer; pointer-events:auto !important; position:relative; z-index:10;">
                            <span class="material-icons-round" style="font-size:18px;">my_location</span>
                        </button>
                        <div style="position:relative;">
                            <button type="button" onclick="ListView.toggleSortDropdown()" title="Sort Records" class="lv-sort-btn">
                                <span class="material-icons-round" style="font-size:18px;">sort</span>
                            </button>
                            <div id="lv-sort-dropdown" class="lv-sort-dropdown" style="display:none;">
                                <div onclick="ListView.sort('id-desc'); ListView.toggleSortDropdown(false)" class="lv-sort-item">Newest first (ID)</div>
                                <div onclick="ListView.sort('id-asc'); ListView.toggleSortDropdown(false)" class="lv-sort-item">Oldest first (ID)</div>
                                <div onclick="ListView.sort('drive-desc'); ListView.toggleSortDropdown(false)" class="lv-sort-item">Synced Recently</div>
                                <div onclick="ListView.sort('status-paid'); ListView.toggleSortDropdown(false)" class="lv-sort-item">Paid First</div>
                            </div>
                        </div>
                        <button type="button" id="btn-intel-${r[0]}" 
                                 onclick="event.stopPropagation(); ListView.toggleActionPanel('${r[0]}')" 
                                 style="flex:1; min-width:0; background:#f59e0b; color:white; border:none; border-radius:10px; height:34px; display:flex; align-items:center; justify-content:center; gap:4px; cursor:pointer; font-weight:800; font-size:10px; box-shadow:0 2px 5px rgba(245, 158, 11, 0.3); transition: all 0.2s; pointer-events:auto !important; position:relative; z-index:1000;">
                            <span class="material-icons-round" style="font-size:16px;">edit_note</span>
                            <span>House Intel</span>
                        </button>
                        <button type="button" id="btn-manual-pin-${r[0]}" 
                                 onclick="event.stopPropagation(); if(window.SpatialRouter) SpatialRouter.startManualPin('${r[0]}', false)" 
                                 style="background:${(staging && staging.isManualPinned) ? '#8b5cf6' : '#e0e7ff'}; color:${(staging && staging.isManualPinned) ? 'white' : '#4338ca'}; border:none; border-radius:10px; width:34px; height:34px; flex-shrink:0; display:flex; align-items:center; justify-content:center; cursor:pointer; font-weight:800; font-size:10px; pointer-events:auto !important; position:relative; z-index:1000;"
                                title="View Pin">
                            <span class="material-icons-round" style="font-size:18px;">${(staging && staging.isManualPinned) ? 'location_on' : 'add_location_alt'}</span>
                        </button>
                        <button type="button" id="btn-delivery-${r[0]}" title="Mark Delivered" disabled 
                                style="background:#fef3c7; color:#d97706; border:none; border-radius:10px; width:34px; height:34px; flex-shrink:0; display:flex; align-items:center; justify-content:center; cursor:default; opacity:0.6;">
                            <span class="material-icons-round" style="font-size:18px;">local_shipping</span>
                        </button>
                    </div>
                    <div id="verifier-info-${r[0]}" style="display:none; align-items:center; gap:4px; font-weight:800; font-size:10px; color:#64748b; margin-top:6px; padding:0 4px; white-space:normal; overflow-wrap:break-word;"></div>
                </div>

                <div style="background:#fff; border:1px solid #f1f5f9; border-radius:12px; padding:12px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                    <!-- Consolidated Metadata Line with Highlight -->
                    <div style="display:flex; align-items:center; gap:8px; font-weight:800; font-size:10px; color:#64748b; margin-bottom:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px 10px;">
                        <span style="font-weight:900; font-size:13px; color:var(--text); letter-spacing:-0.4px;">#${r[0]}</span>
                        <span>&bull;</span>
                        <span style="color:var(--primary);">${surveyor}</span>
                        <span>&bull;</span>
                        <span style="font-size:9px;">${dateTime}</span>
                        ${hasPending ? `<span style="background:#ef4444; color:white; font-size:8px; padding:2px 8px; border-radius:4px; font-weight:900; margin-left:8px; letter-spacing:0.5px;">⚠️ SAVE REQUIRED</span>` : ''}
                        <span class="pill ${payStatus}" style="font-size:8px; padding:1px 8px; font-weight:800; margin-left:auto;">${r[16]}</span>
                    </div>

                    <!-- Main Record Info -->
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                            <div style="font-weight:850; font-size:15px; color:#1e293b; line-height:1.2; flex:1; min-width:0;">${decodePII(r[4])}</div>
                            <div style="font-weight:900; font-size:15px; color:#ef4444; white-space:nowrap;">Rs. ${totalPayable}</div>
                        </div>
                        
                        <!-- Physical Address -->
                        <div style="font-size:11px; color:#64748b; font-weight:600; line-height:1.4;">${decodePII(r[5]) || 'No physical address found'}</div>

                        ${verifiedInfoHtml}
                        
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:4px;">
                            <div onclick="BillVerifier.open('${r[15]}')" style="display:flex; align-items:center; gap:4px; font-weight:800; font-size:10px; color:#2563eb; background:#eff6ff; padding:2px 8px; border-radius:6px; cursor:pointer;">
                                <span class="material-icons-round" style="font-size:12px;">receipt_long</span>
                                ${decodePII(r[15])}
                            </div>
                            <div style="font-size:10px; color:#475569; font-weight:700; display:flex; align-items:center; gap:4px;">
                                <span class="material-icons-round" style="font-size:12px;">${r[3] === 1 ? 'business' : 'home'}</span>
                                ${r[3] === 1 ? 'Commercial' : 'Domestic'} | ${r[14] || 'N/A'} | <b style="color:var(--primary);">${shortMC}</b>
                            </div>
                        </div>

                    </div>
                </div>

                <!-- Integrated Action Panel (Overlay Removed for Interactivity) -->
                <div id="action-panel-${r[0]}" style="display:${p ? 'block' : 'none'}; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px; margin-top:10px; box-shadow:inset 0 2px 4px rgba(0,0,0,0.02);">

                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <div style="display:flex; gap:8px; align-items:center;">
                            <div style="flex:1;">
                                <label style="display:block; font-size:9px; font-weight:800; color:#94a3b8; margin-bottom:4px; text-transform:uppercase;">Street No</label>
                                <select id="intel-street-${r[0]}" onchange="ListView.validateIntelInput('${r[0]}')" ${isLocked ? 'disabled' : ''} style="width:100%; height:36px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-weight:700; font-size:12px; padding:0 8px; outline:none; opacity:${isLocked ? 0.6 : 1}; cursor:${isLocked ? 'not-allowed' : 'pointer'};">
                                    <option value="C">Commercial (C)</option>
                                    ${Array.from({length: 50}, (_, i) => {
                                        const val = `G${i+1}`;
                                        const isSelected = (p && p.street_no !== undefined ? p.street_no === val : (v ? v.street_no === val : r[11] === val));
                                        return `<option value="${val}" ${isSelected ? 'selected' : ''}>${val}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                            <div style="flex:0.8;">
                                <label style="display:block; font-size:9px; font-weight:800; color:#94a3b8; margin-bottom:4px; text-transform:uppercase;">Sequence #</label>
                                <input type="number" id="intel-seq-${r[0]}" oninput="ListView.validateIntelInput('${r[0]}')" ${isLocked ? 'disabled' : ''} 
                                       value="${(() => {
                                            const val = (p && p.sequence_no !== undefined) ? p.sequence_no : (v && v.sequence_no !== undefined ? v.sequence_no : (r[13] || ''));
                                            return (!val || isNaN(val)) ? '' : val;
                                       })()}" 
                                       placeholder="0" style="width:100%; height:36px; border-radius:8px; border:1px solid #cbd5e1; background:white; font-weight:700; font-size:12px; padding:0 8px; outline:none; opacity:${isLocked ? 0.6 : 1}; cursor:${isLocked ? 'not-allowed' : 'text'};">
                            </div>
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center; background:white; padding:8px; border-radius:10px; border:1px solid #e2e8f0;">
                            <div style="display:flex; gap:12px;">
                                <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                                    <input type="checkbox" id="intel-side-l-${r[0]}" ${((p && p.is_right !== undefined ? p.is_right === false : isLeft) ? 'checked' : '')} ${isLocked ? 'disabled' : ''} onchange="document.getElementById('intel-side-r-${r[0]}').checked = !this.checked; ListView.validateIntelInput('${r[0]}')" style="accent-color:var(--primary); width:16px; height:16px; opacity:${isLocked ? 0.6 : 1}; cursor:${isLocked ? 'not-allowed' : 'pointer'};">
                                    <span style="font-size:11px; font-weight:800; color:#475569;">Left</span>
                                </label>
                                <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                                    <input type="checkbox" id="intel-side-r-${r[0]}" ${((p && p.is_right !== undefined ? p.is_right === true : isRight) ? 'checked' : '')} ${isLocked ? 'disabled' : ''} onchange="document.getElementById('intel-side-l-${r[0]}').checked = !this.checked; ListView.validateIntelInput('${r[0]}')" style="accent-color:var(--primary); width:16px; height:16px; opacity:${isLocked ? 0.6 : 1}; cursor:${isLocked ? 'not-allowed' : 'pointer'};">
                                    <span style="font-size:11px; font-weight:800; color:#475569;">Right</span>
                                </label>
                            </div>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; background:#f0fdf4; padding:4px 8px; border-radius:6px; border:1px solid #dcfce7;">
                                <input type="checkbox" id="intel-delivered-${r[0]}" ${((p && p.is_delivered !== undefined ? p.is_delivered : isDeliv) ? 'checked' : '')} ${isLocked ? 'disabled' : ''} 
                                       onchange="ListView.syncDeliveryState('${r[0]}')"
                                       style="accent-color:#16a34a; width:16px; height:16px; opacity:${isLocked ? 0.6 : 1}; cursor:${isLocked ? 'not-allowed' : 'pointer'};">
                                <span style="font-size:11px; font-weight:800; color:#16a34a;">Mark Delivered</span>
                            </label>
                        </div>

                        <div style="display:flex; gap:4px; width:100%;">
                             <button type="button" id="btn-edit-intel-${r[0]}" onclick="ListView.confirmEdit('${r[0]}')" ${!isLocked ? 'disabled' : ''}
                                     style="flex:1; background:${isLocked ? '#f1f5f9' : '#e2e8f0'}; color:${isLocked ? '#475569' : '#94a3b8'}; border:2px solid ${isLocked ? '#e2e8f0' : '#cbd5e1'}; border-radius:8px; height:36px; display:flex; align-items:center; justify-content:center; gap:4px; cursor:${isLocked ? 'pointer' : 'not-allowed'}; font-weight:800; font-size:10px; opacity:${isLocked ? 1 : 0.6};">
                                 <span class="material-icons-round" style="font-size:14px;">${isLocked ? 'lock' : 'lock_open'}</span> Edit
                             </button>

                             <button type="button" onclick="event.stopPropagation(); SpatialRouter.startManualPin('${r[0]}')" ${isLocked ? 'disabled' : ''}
                                     style="flex:1; background:${(staging && staging.isManualPinned) ? '#e0e7ff' : 'white'}; color:#2563eb; border:2px solid #dbeafe; border-radius:8px; height:36px; display:flex; align-items:center; justify-content:center; gap:4px; cursor:${isLocked ? 'not-allowed' : 'pointer'}; font-weight:800; font-size:10px; opacity:${isLocked ? 0.6 : 1}; pointer-events:auto !important; position:relative; z-index:1000;">
                                 <span class="material-icons-round" style="font-size:14px;">${(staging && staging.isManualPinned) ? 'edit_location' : 'add_location_alt'}</span> Pin
                             </button>

                            <button type="button" id="btn-discard-intel-${r[0]}" onclick="ListView.discardIntel('${r[0]}')" ${isLocked ? 'disabled' : ''}
                                    style="flex:1; background:#fef2f2; color:#ef4444; border:2px solid #fecaca; border-radius:8px; height:36px; display:flex; align-items:center; justify-content:center; gap:4px; cursor:${isLocked ? 'not-allowed' : 'pointer'}; font-weight:800; font-size:10px; opacity:${isLocked ? 0.6 : 1}; pointer-events:auto !important; position:relative; z-index:1000;">
                                <span class="material-icons-round" style="font-size:14px;">close</span> Discard
                            </button>

                            <button type="button" id="btn-save-intel-${r[0]}" onclick="ListView.saveIntel('${r[0]}')" disabled
                                    style="flex:1; background:#94a3b8; color:white; border:none; border-radius:8px; height:36px; display:flex; align-items:center; justify-content:center; gap:4px; cursor:not-allowed; font-weight:900; font-size:10px; box-shadow:0 4px 6px rgba(16, 185, 129, 0.2); opacity:0.5; transition: all 0.2s;">
                                <span class="material-icons-round" style="font-size:14px;">cloud_upload</span> Save
                            </button>
                            </div>
                        </div>
                    </div>
</div>

                
                <style>
                    .responsive-gallery {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 10px;
                        margin-top: 10px;
                    }
                    .gallery-item {
                        width: 100%;
                        aspect-ratio: 1 / 1;
                        object-fit: cover;
                        border-radius: 8px;
                        cursor: pointer;
                    }
                    @media (max-width: 600px) {
                        .responsive-gallery {
                            grid-template-columns: repeat(2, 1fr);
                        }
                    }
                </style>
                <div class="card-gallery responsive-gallery" id="gal-${r[0].toString().replace(/[^a-z0-9]/gi, '_')}">
                    ${r[9].map(url => `<img src="${url}" class="gallery-item" onclick="Gallery.open('${url}', '${r[0]}')">`).join('')}
                    <div id="synced-gallery-${r[0].toString().replace(/[^a-z0-9]/gi, '_')}" style="display:contents;"></div>
                </div>

                <div class="sync-station" style="margin-top:8px;">
                    <div class="sync-station-header" style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">
                        <div style="display:flex; align-items:center; gap:6px; flex:1; min-width:0;">
                            <span class="material-icons-round" style="font-size:16px; color:#4285f4; flex-shrink:0;">account_circle</span>
                            <select id="drive-email" style="border:none; background:transparent; font-weight:850; font-size:11px; color:#1e293b; padding:0; cursor:pointer; outline:none; width:100%;"></select>
                        </div>
                        <div class="sync-status-badge" id="drive-status-${r[0].toString().replace(/[^a-z0-9]/gi, '_')}" style="margin:0; font-size:9px; font-weight:800; padding:2px 6px;">
                            ${State.syncedData[String(r[0]).replace(/\.0$/, '').trim()] ? `<span class="material-icons-round" style="font-size:12px; vertical-align:middle;">sync</span> ${State.syncedData[String(r[0]).replace(/\.0$/, '').trim()]} Synced` : 'No Images Synced'}
                        </div>
                    </div>

                    <div id="drive-preview" class="sync-preview-strip" style="margin-bottom:4px;"></div>

                    <input type="file" id="drive-input-camera" accept="image/*" capture="environment" multiple style="display:none" onchange="DriveSync.handleFiles(this.files)">
                    <input type="file" id="drive-input-gallery" accept="image/*" multiple style="display:none" onchange="DriveSync.handleFiles(this.files)">
                    <input type="file" id="local-cam-input" accept="image/*" capture="environment" style="display:none" onchange="LocalCam.handleCapture(this, '${r[0]}')">
                    
                    <div id="offline-warning-${r[0].toString().replace(/[^a-z0-9]/gi, '_')}" style="margin-bottom:8px;"></div>
                    
                    <div class="sync-action-grid" style="grid-template-columns: repeat(2, 1fr);">
                        <button onclick="document.getElementById('drive-input-camera').click()" class="sync-action-btn camera" style="background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color:white; border:3px solid #b45309; box-shadow:0 4px 12px rgba(180,83,9,0.3); font-weight:900; font-size:13px;">
                            <span class="material-icons-round" style="font-size:20px;">photo_camera</span> Direct Cloud
                        </button>
                        <button onclick="document.getElementById('local-cam-input').click()" class="sync-action-btn" style="background:#e0e7ff; color:#4338ca; border:1px solid #c7d2fe; font-weight:700;">
                            <span class="material-icons-round" style="font-size:16px;">camera_enhance</span> Save to Phone
                        </button>
                    </div>
                </div>
            `;

        // Post-render init for DriveSync (Email & Metadata)
        setTimeout(() => {
            DriveSync.init();
            DriveSync.fetchMetadata(r[0]);
            ListView.checkDeliveryStatus(r[0]);
            ListView.checkVerificationStatus(r[0]);
            ListView.trackOriginalValues(r[0]);
        }, 100);
    },

    async checkVerificationStatus(sid) {
        const sidStr = String(sid);
        const cacheKey = `${sidStr}_${ACTIVE_BILLING_MONTH}`;
        
        // 1. Check local session cache 
        let cachedInfo = window.SpatialRouter ? SpatialRouter.verifiedSIDs.get(cacheKey) : null;

        // 2. Check Global Sync Data
        if (!cachedInfo && window.ALL_VERIFIED_DATA) {
            const found = window.ALL_VERIFIED_DATA.find(v => String(v.survey_id) === sidStr);
            if (found) {
                cachedInfo = { verified_by: found.verified_by };
                if (window.SpatialRouter) SpatialRouter.verifiedSIDs.set(cacheKey, cachedInfo);
            }
        }

        if (cachedInfo) {
            const verifierInfo = document.getElementById(`verifier-info-${sid}`);
            if (verifierInfo) {
                verifierInfo.style.display = 'flex';
                verifierInfo.innerHTML = `<span class="material-icons-round" style="font-size:14px; color:#16a34a;">verified</span> <span style="color:#16a34a;">Verified by: ${cachedInfo.verified_by || 'Field Staff'}</span>`;
            }

            // Sync Delivery UI if record says it is delivered
            const houseRecord = window.ALL_VERIFIED_DATA.find(v => String(v.survey_id) === sidStr);
            if (houseRecord && houseRecord.is_delivered) {
                this.updateDeliveryUI(sid, 'delivered');
            }
            return;
        }

        // NO FALLBACK QUERIES HERE - Managed by batchSyncRoute
    },

    async checkDeliveryStatus(sid) {
        const btn = document.getElementById(`btn-delivery-${sid}`);
        if (!btn) return;

        const sidStr = String(sid);
        
        // DEPEGGED: Always prefer House-centric confirmed data from verified_houses
        if (window.ALL_VERIFIED_DATA) {
            const found = window.ALL_VERIFIED_DATA.find(v => String(v.survey_id) === sidStr);
            if (found && found.is_delivered) {
                this.updateDeliveryUI(sid, 'delivered');
                return;
            }
        }

        // Default state if not confirmed as delivered 
        btn.innerHTML = `<span class="material-icons-round" style="font-size:18px;">local_shipping</span>`;
        btn.style.opacity = '0.6';
    },

    async batchSyncRoute(sids) {
        if (!window._supabase || !sids || sids.length === 0) return;
        
        // Filter out SIDs already in cache OR currently pending
        const missingSIDs = sids.map(id => String(id)).filter(id => {
            const inCache = window.ALL_VERIFIED_DATA && window.ALL_VERIFIED_DATA.find(v => String(v.survey_id) === id);
            const isPending = this.pendingSyncSIDs.has(id);
            return !inCache && !isPending;
        });

        if (missingSIDs.length === 0) return;

        // Mark as pending
        missingSIDs.forEach(id => this.pendingSyncSIDs.add(id));

        try {
            console.log(`[BatchSync] Fetching status for ${missingSIDs.length} houses...`);
            const { data, error } = await window._supabase
                .from('verified_houses')
                .select('survey_id, verified_by, verified_at, latitude, longitude, street_no, sequence_no, is_right, is_delivered')
                .eq('billing_month', window.ACTIVE_BILLING_MONTH)
                .in('survey_id', missingSIDs);

            if (error) throw error;
            
            if (data && data.length > 0) {
                if (!window.ALL_VERIFIED_DATA) window.ALL_VERIFIED_DATA = [];
                
                // Merge without duplicates
                const existingSIDs = new Set(window.ALL_VERIFIED_DATA.map(v => String(v.survey_id)));
                data.forEach(item => {
                    if (!existingSIDs.has(String(item.survey_id))) {
                        window.ALL_VERIFIED_DATA.push(item);
                    }
                });
                
                // Refresh currently visible card indicators
                data.forEach(record => {
                    const sid = String(record.survey_id);
                    this.refreshCommittedUI(sid);
                });
            }
        } catch (e) {
            console.error("[BatchSync] Error:", e);
        }
    },

    async markDelivered(sid, options = {}) {
        // Redirection: use the unified House Intelligence panel logic
        // Only kept for legacy compatibility during migration
        if (window.ListView) ListView.toggleActionPanel(sid, true);
    },

    updateDeliveryUI(sid, status) {
        const btn = document.getElementById(`btn-delivery-${sid}`);
        if (!btn) return;

        if (status === 'delivered') {
            btn.style.background = '#dcfce7';
            btn.style.color = '#15803d';
            btn.style.border = 'none';
            btn.title = "Delivered";
            btn.innerHTML = `<span class="material-icons-round" style="font-size:18px;">local_shipping</span>`;
            btn.disabled = true;
            btn.style.opacity = '1';
        } else {
            btn.style.background = '#fef3c7';
            btn.style.color = '#d97706';
            btn.style.border = 'none';
            btn.title = "Mark Delivered";
            btn.innerHTML = `<span class="material-icons-round" style="font-size:18px;">local_shipping</span>`;
            btn.disabled = true;
            btn.style.opacity = '0.6';
        }
    },

    next() { if (State.currentIdx < State.filtered.length - 1) { State.currentIdx++; this.render(); } },
    prev() { if (State.currentIdx > 0) { State.currentIdx--; this.render(); } },

    jumpFromMap(id) {
        ViewSwitcher.toList(false);

        setTimeout(() => {
            this.jumpToID(id);
            const idx = State.filtered.findIndex(r => r[0].toString() === id.toString());
            if (idx !== -1) {
                State.currentIdx = idx;
                if (window.MapNavigator) MapNavigator.updateUI();
            }
        }, 150);
    },


    showOnMap(id, isolate = false) {
        const sidStr = String(id).trim();
        const record = window.SID_MAP ? window.SID_MAP.get(sidStr) : null;
        if (!record) return;

        if (isolate) {
            State.history.push({
                filtered: [...State.filtered],
                idx: State.currentIdx,
                label: document.getElementById('stat-label').innerText
            });
            State.filtered = [record];
            State.currentIdx = 0;
            App.render();
            const statLabel = document.getElementById('stat-label');
            if (statLabel) {
                statLabel.innerHTML = `Isolated Mode <a href="javascript:void(0)" onclick="ViewSwitcher.back()" style="color:var(--primary); margin-left:8px; text-decoration:underline;">[Return]</a>`;
            }
        } else {
            const searchId = id.toString().trim();
            const idx = State.filtered.findIndex(r => r[0].toString().trim() === searchId);
            if (idx !== -1) {
                State.currentIdx = idx;
                if (window.MapNavigator) MapNavigator.updateUI();
            }
        }

        ViewSwitcher.toMap();

        // SMT Animation Logic: Prevent Jitter
        const currentZoom = State.map.getZoom();
        const center = State.map.getCenter();
        const target = L.latLng(record[1], record[2]);
        const dist = center.distanceTo(target);

        // Cancel any pending marker interaction
        if (this._showTimeout) clearTimeout(this._showTimeout);

        if (dist < 150 && currentZoom >= 18) {
            State.map.panTo(target, { animate: true, duration: 0.4 });
        } else {
            // Snappier flyTo with balanced easing
            State.map.flyTo(target, 19, {
                duration: 0.8,
                easeLinearity: 0.25,
                noMoveStart: true
            });
        }

        this._showTimeout = setTimeout(() => {
            if (window.SpatialRouter) {
                SpatialRouter.showMarkerCard(id);
            }
            if (window.MapNavigator) MapNavigator.show();
        }, 500);
    },

    restoreView() {
        ViewSwitcher.back();
    },

    toggleSortDropdown(forceState = null) {
        const dd = document.getElementById('lv-sort-dropdown');
        if (!dd) return;
        
        if (forceState !== null) {
            dd.style.display = forceState ? 'block' : 'none';
        } else {
            const isHidden = dd.style.display === 'none';
            dd.style.display = isHidden ? 'block' : 'none';
        }
    },

    sort(criteria) {
        if (criteria === 'id-desc') State.filtered.sort((a, b) => b[0] - a[0]);
        else if (criteria === 'id-asc') State.filtered.sort((a, b) => a[0] - b[0]);
        else if (criteria === 'status-paid') {
            State.filtered.sort((a, b) => {
                const sA = a[16].toLowerCase(), sB = b[16].toLowerCase();
                if (sA === 'paid' && sB !== 'paid') return -1;
                if (sA !== 'paid' && sB === 'paid') return 1;
                return 0;
            });
        } else if (criteria === 'status-unpaid') {
            State.filtered.sort((a, b) => {
                const sA = a[16].toLowerCase(), sB = b[16].toLowerCase();
                if (sA === 'unpaid' && sB !== 'unpaid') return -1;
                if (sA !== 'unpaid' && sB === 'unpaid') return 1;
                return 0;
            });
        } else if (criteria === 'status-not-billed') {
            State.filtered.sort((a, b) => {
                const statusA = a[16].toLowerCase();
                const statusB = b[16].toLowerCase();
                if (statusA === 'not billed' && statusB !== 'not billed') return -1;
                if (statusA !== 'not billed' && statusB === 'not billed') return 1;
                return 0;
            });
        } else if (criteria === 'drive-desc') {
            State.filtered.sort((a, b) => {
                const sidA = String(a[0]).replace(/\.0$/, '').trim();
                const sidB = String(b[0]).replace(/\.0$/, '').trim();
                const tA = State.syncedData[sidA] ? new Date(State.syncedData[sidA]).getTime() : 0;
                const tB = State.syncedData[sidB] ? new Date(State.syncedData[sidB]).getTime() : 0;
                return tB - tA;
            });

        }
        State.currentIdx = 0;
        this.render();
        document.getElementById('lv-sort-dropdown').style.display = 'none';
    },

    jumpToID(id) {
        if (!id) return;
        const searchId = id.toString().trim().toLowerCase();

        // Check current list first (match either Survey ID or PSID)
        const idx = State.filtered.findIndex(r => 
            r[0].toString().trim().toLowerCase() === searchId || 
            (r[15] && r[15].toString().trim().toLowerCase() === searchId)
        );

        // Always push context before a search jump (even if in same list)
        // MEMORY OPTIMIZATION: Do not copy the filtered array if it's large (e.g. 65k records).
        // Instead, ViewSwitcher.back will handle 'null' by falling back to State.masterFiltered.
        State.history.push({
            filtered: (State.filtered.length > 500) ? null : [...State.filtered],
            idx: State.currentIdx,
            label: document.getElementById('stat-label').innerText
        });

        if (idx !== -1) {
            State.currentIdx = idx;
            this.render();
            const statLabel = document.getElementById('stat-label');
            if (statLabel) statLabel.innerHTML = `Linked Match <a href="javascript:void(0)" onclick="ViewSwitcher.back()" style="color:var(--primary); margin-left:8px; text-decoration:underline; font-size:10px;">[RETURN]</a>`;
        } else {
            const sidStr = searchId.toString().trim();
            const record = window.SID_MAP ? window.SID_MAP.get(sidStr) : null;
            if (record) {
                State.filtered = [record];
                State.currentIdx = 0;
                this.render();
                const statLabel = document.getElementById('stat-label');
                if (statLabel) statLabel.innerHTML = `Search Result <a href="javascript:void(0)" onclick="ViewSwitcher.back()" style="color:var(--primary); margin-left:8px; text-decoration:underline; font-size:10px;">[RETURN]</a>`;
            } else {
                if (window.App && App.showToast) App.showToast("Record not found");
                // Pop history if search failed so we don't store a "failed jump" state
                State.history.pop();
            }
        }
        this.toggleClearBtn(searchId);
    },

    triggerManualPin(sid) {
        // Ensure action panel is open so user sees the "Reposition" or "Manual Pin" state
        const panel = document.getElementById(`action-panel-${sid}`);
        if (panel && panel.style.display === 'none') {
            this.toggleActionPanel(sid, true);
        }
        
        if (window.SpatialRouter && typeof SpatialRouter.startManualPin === 'function') {
            SpatialRouter.startManualPin(sid);
        } else {
            console.error("SpatialRouter.startManualPin not found");
        }
    },

    toggleActionPanel(sid, forceState = null) {
        const panel = document.getElementById(`action-panel-${sid}`);
        if (!panel) return;
        const btn = document.getElementById(`btn-intel-${sid}`);
        
        const isOpening = forceState !== null ? forceState : (panel.style.display === 'none');
        panel.style.display = isOpening ? 'block' : 'none';
        
        if (btn) {
            btn.style.background = isOpening ? '#1e293b' : '#f59e0b';
            const icon = btn.querySelector('.material-icons-round');
            if (icon) icon.innerText = isOpening ? 'expand_less' : 'edit_note';
        }

        if (isOpening) {
            this.validateIntelInput(sid);
        }
    },
    
    validateIntelInput(sid) {
        const street = document.getElementById(`intel-street-${sid}`)?.value;
        const seqInput = document.getElementById(`intel-seq-${sid}`);
        const seqStr = seqInput?.value;
        const btn = document.getElementById(`btn-save-intel-${sid}`);
        const discardBtn = document.getElementById(`btn-discard-intel-${sid}`);
        if (!btn) return;

        const seq = (seqStr !== "" && !isNaN(parseInt(seqStr))) ? parseInt(seqStr) : -1;
        const isSeqValid = seqStr !== "" && seq > 0;
        const isStreetValid = !!street && street !== "";

        if (isSeqValid && isStreetValid && this.hasIntelChanged(sid)) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.style.background = '#10b981'; 
        } else {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.style.background = '#94a3b8';
        }

        if (discardBtn) {
            discardBtn.disabled = !this.hasIntelChanged(sid);
            discardBtn.style.opacity = this.hasIntelChanged(sid) ? '1' : '0.5';
            discardBtn.style.cursor = this.hasIntelChanged(sid) ? 'pointer' : 'not-allowed';
        }
    },

    _originalIntelValues: {},

    trackOriginalValues(sid) {
        const streetEl = document.getElementById(`intel-street-${sid}`);
        const seqEl = document.getElementById(`intel-seq-${sid}`);
        const sideREl = document.getElementById(`intel-side-r-${sid}`);
        const sideLEl = document.getElementById(`intel-side-l-${sid}`);
        const delivEl = document.getElementById(`intel-delivered-${sid}`);

        this._originalIntelValues[sid] = {
            street: streetEl ? streetEl.value : null,
            sequence: seqEl ? seqEl.value : '',
            is_right: sideREl ? sideREl.checked : false,
            is_left: sideLEl ? sideLEl.checked : false,
            is_delivered: delivEl ? delivEl.checked : false
        };
    },

    hasIntelChanged(sid) {
        const orig = this._originalIntelValues[sid];
        if (!orig) return false;

        const streetEl = document.getElementById(`intel-street-${sid}`);
        const seqEl = document.getElementById(`intel-seq-${sid}`);
        const sideREl = document.getElementById(`intel-side-r-${sid}`);
        const sideLEl = document.getElementById(`intel-side-l-${sid}`);
        const delivEl = document.getElementById(`intel-delivered-${sid}`);

        const current = {
            street: streetEl ? streetEl.value : null,
            sequence: seqEl ? seqEl.value : '',
            is_right: sideREl ? sideREl.checked : false,
            is_left: sideLEl ? sideLEl.checked : false,
            is_delivered: delivEl ? delivEl.checked : false
        };

        const hasUnsavedPin = !!(State.unsavedChanges && State.unsavedChanges[sid] && State.unsavedChanges[sid].isManualPinned);

        return (
            hasUnsavedPin ||
            orig.street !== current.street ||
            orig.sequence !== current.sequence ||
            orig.is_right !== current.is_right ||
            orig.is_left !== current.is_left ||
            orig.is_delivered !== current.is_delivered
        );
    },

    discardIntel(sid) {
        const sidStr = String(sid);
        
        if (confirm('Discard all pending changes for this house?')) {
            if (State.pendingHouseIntel) delete State.pendingHouseIntel[sidStr];
            
            if (!State.unsavedChanges) State.unsavedChanges = {};
            State.unsavedChanges[sidStr] = { isLocked: true };

            this.render();
            this.toggleActionPanel(sidStr, true);

            if (App.showToast) App.showToast('Changes discarded');
        }
    },

    async saveIntel(sid) {
        console.log("[ListView.saveIntel] Starting for sid:", sid);
        
        if (!window.SpatialRouter) {
            console.error("[ListView.saveIntel] SpatialRouter not found!");
            return;
        }

        const street = document.getElementById(`intel-street-${sid}`)?.value;
        const seqInput = document.getElementById(`intel-seq-${sid}`)?.value;
        const seq = parseInt(seqInput || 0);
        
        console.log("[ListView.saveIntel] Input values - street:", street, "seqInput:", seqInput, "seq:", seq);
        
        if (!street || !seqInput || seq <= 0) {
            console.error("[ListView.saveIntel] Validation failed - street:", street, "seq:", seq);
            return App.showToast ? App.showToast("Please enter Street No and a valid Sequence #") : alert("Please enter Street No and a valid Sequence #");
        }
        
        const isRight = document.getElementById(`intel-side-r-${sid}`)?.checked;
        const isDelivered = document.getElementById(`intel-delivered-${sid}`)?.checked;

        const options = {
            street_no: street,
            sequence_no: seq,
            is_right: isRight,
            is_delivered: isDelivered
        };
        console.log("[ListView.saveIntel] Options prepared:", options);

        const btn = document.getElementById(`btn-save-intel-${sid}`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="material-icons-round spinning">hourglass_top</span> Saving...';
        }

        console.log("[ListView.saveIntel] Calling SpatialRouter.saveHouseIntelligence...");
        const success = await SpatialRouter.saveHouseIntelligence(sid, options);
        console.log("[ListView.saveIntel] saveHouseIntelligence returned:", success);
        
        if (success) {
            console.log("[ListView.saveIntel] Save successful, cleaning up...");
            const sidStr = String(sid);
            if (State.pendingHouseIntel) delete State.pendingHouseIntel[sidStr];
            if (State.unsavedChanges) delete State.unsavedChanges[sidStr];
            this.toggleActionPanel(sidStr, false);
            this.checkVerificationStatus(sid);
            this.render();
        } else {
            console.error("[ListView.saveIntel] Save failed!");
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span class="material-icons-round">cloud_upload</span> Try Again';
                this.validateIntelInput(sid);
            }
        }
    },

    toggleClearBtn(val) {
        const btn = document.getElementById('lv-search-clear');
        if (!btn) return;
        btn.style.display = (val || (State.history && State.history.length > 0)) ? 'block' : 'none';
    },

    clearSearch() {
        const input = document.getElementById('lv-search-id');
        if (input) input.value = '';
        this.toggleClearBtn('');
        if (State.history && State.history.length > 0) {
            ViewSwitcher.back();
        }
    },

    refreshCommittedUI(sid) {
        this.checkVerificationStatus(sid);
        this.checkDeliveryStatus(sid);
    },

    syncDeliveryState(sid) {
        const delivEl = document.getElementById(`intel-delivered-${sid}`);
        if (!delivEl) return;
        
        if (!State.unsavedChanges[sid]) State.unsavedChanges[sid] = {};
        State.unsavedChanges[sid].is_delivered = delivEl.checked;
        
        if (window.SpatialRouter) {
            SpatialRouter.refreshToolbar(sid);
        }
    },

    confirmEdit(sid) {
        const isConfirmed = window.confirm("Are you sure you want to edit this record's House Intel? Any saved changes will alter the permanent database.");
        if (isConfirmed) {
            this.unlockIntel(sid);
        }
    },

    unlockIntel(sid) {
        if (!State.unsavedChanges[sid]) State.unsavedChanges[sid] = {};
        State.unsavedChanges[sid].isLocked = false;
        this.render(); 
        this.toggleActionPanel(sid, true);
    }
};

// Global click listener to close sort dropdown when clicking outside
document.addEventListener('mousedown', (e) => {
    const dd = document.getElementById('lv-sort-dropdown');
    const btn = document.querySelector('.lv-sort-btn');
    if (dd && dd.style.display === 'block') {
        if (!dd.contains(e.target) && (!btn || !btn.contains(e.target))) {
            ListView.toggleSortDropdown(false);
        }
    }
});

window.ListView = ListView;
