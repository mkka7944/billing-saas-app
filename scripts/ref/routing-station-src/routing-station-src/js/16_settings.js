// === 16_settings.js ===
// Settings

const Settings = {
    isFetchingGlobal: false,
    open() {
        try {
            if (typeof LayerManager !== 'undefined') {
                LayerManager.initPendingState();
                LayerManager.renderSettingsUI();
            }
        } catch (e) { console.error("LayerManager error:", e); }
        document.getElementById('modal-settings').style.display = 'flex';
    },

    updateStats() {
        if (typeof RAW_DATA === 'undefined') return;
        const total = RAW_DATA.length;
        // Type 1 = Commercial, Others = Domestic
        const comm = RAW_DATA.filter(r => r[3] === 1).length;
        const dom = total - comm;

        const elTotal = document.getElementById('set-total-surveys');
        const elDom = document.getElementById('set-total-domestic');
        const elComm = document.getElementById('set-total-commercial');

        if (elTotal) elTotal.innerText = total.toLocaleString();
        if (elDom) elDom.innerText = dom.toLocaleString();
        if (elComm) elComm.innerText = comm.toLocaleString();
    },

    close() {
        document.getElementById('modal-settings').style.display = 'none';
    },

    setMarkerLimit(limit) {
        State.markerLimit = limit;
        LayerManager.renderSettingsUI();
        App.render();
    },

    async fetchGlobalVerifications(forceRefresh = false) {
        if (this.isFetchingGlobal) return;
        if (!window._supabase || !window.ACTIVE_BILLING_MONTH) return;
        
        this.isFetchingGlobal = true;

        const cacheKey = `v_cache_${window.ACTIVE_BILLING_MONTH}`;
        
        // 1. Initial Load: Check LocalStorage for existing pins
        if (!window.ALL_VERIFIED_DATA || window.ALL_VERIFIED_DATA.length === 0) {
            const stored = localStorage.getItem(cacheKey);
            if (stored) {
                try {
                    window.ALL_VERIFIED_DATA = JSON.parse(stored);
                    console.log(`[Sync] Restored ${window.ALL_VERIFIED_DATA.length} pins from local cache.`);
                } catch(e) { window.ALL_VERIFIED_DATA = []; }
            }
        }

        // 2. EGRESS GUARD: Check if we need to hit the server
        const now = Date.now();
        const cacheAge = now - (window.__VERIFIED_CACHE_TIME || 0);
        if (!forceRefresh && window.ALL_VERIFIED_DATA?.length > 0 && cacheAge < 300000) {
            console.log("[Settings] Recent cache valid.");
            return;
        }

        const refreshBtn = document.getElementById('btn-refresh-verified');
        if (forceRefresh && refreshBtn) {
            const icon = refreshBtn.querySelector('.material-icons-round');
            if (icon) icon.classList.add('spinning');
        }

        try {
            // 3. DELTA SYNC: Find latest timestamp in local data
            let latestTime = "2000-01-01T00:00:00Z";
            if (window.ALL_VERIFIED_DATA && window.ALL_VERIFIED_DATA.length > 0) {
                const times = window.ALL_VERIFIED_DATA.map(v => v.verified_at).filter(Boolean);
                if (times.length > 0) latestTime = times.sort().reverse()[0];
            }

            console.log(`[Sync] Delta sync starting. Fetching records where verified_at > ${latestTime}`);

            let newRecords = [];
            let hasMore = true;
            let from = 0;
            let step = 1000;

            while (hasMore) {
                const { data, error } = await window._supabase
                    .from('verified_houses')
                    .select('*')
                    .eq('billing_month', window.ACTIVE_BILLING_MONTH)
                    .gt('verified_at', latestTime)
                    .range(from, from + step - 1);

                if (error) throw error;
                if (data && data.length > 0) {
                    newRecords = newRecords.concat(data);
                    from += step;
                }
                if (!data || data.length < step) hasMore = false;
            }

            if (newRecords.length > 0) {
                // Merge new records with existing ones (avoid duplicates)
                const existingSIDs = new Set((window.ALL_VERIFIED_DATA || []).map(v => String(v.survey_id)));
                const uniqueNew = newRecords.filter(v => !existingSIDs.has(String(v.survey_id)));
                window.ALL_VERIFIED_DATA = (window.ALL_VERIFIED_DATA || []).concat(uniqueNew);
                // Update existing records that were modified
                newRecords.forEach(newRec => {
                    const idx = window.ALL_VERIFIED_DATA.findIndex(v => String(v.survey_id) === String(newRec.survey_id));
                    if (idx >= 0) {
                        window.ALL_VERIFIED_DATA[idx] = { ...window.ALL_VERIFIED_DATA[idx], ...newRec };
                    }
                });
                
                // Persist to LocalStorage
                localStorage.setItem(cacheKey, JSON.stringify(window.ALL_VERIFIED_DATA));
                console.log(`[Sync] Success! Added ${uniqueNew.length} new records.`);
            } else {
                console.log("[Sync] Already up to date.");
            }

            window.__VERIFIED_CACHE_TIME = Date.now();
            if (window.SpatialRouter && SpatialRouter.verifiedSIDs) SpatialRouter.verifiedSIDs.clear();
            if (typeof LayerManager !== 'undefined') LayerManager.renderSettingsUI();
            if (window.VerifiedLayer && typeof VerifiedLayer.updateList === 'function') VerifiedLayer.updateList();
            if (window.App && typeof App.render === 'function') App.render();

        } catch (e) {
            console.error("Delta Sync Failure:", e);
        } finally {
            this.isFetchingGlobal = false;
            if (refreshBtn) {
                const icon = refreshBtn.querySelector('.material-icons-round');
                if (icon) icon.classList.remove('spinning');
            }
        }
    },

    renderVerificationStats() {
        if (typeof RAW_DATA === 'undefined') return '<div style="padding:20px; text-align:center; color:#94a3b8;">Base data loading...</div>';

        if (!window.ALL_VERIFIED_DATA || window.ALL_VERIFIED_DATA.length === 0) {
            return `
                    <div style="padding:60px 20px; text-align:center; color:#64748b;">
                        <span class="material-icons-round" style="font-size:48px; display:block; margin-bottom:16px; color:#cbd5e1;">cloud_sync</span>
                        <div style="font-weight:700;">No Local Records Found</div>
                        <div style="font-size:12px; margin-top:8px; opacity:0.7; margin-bottom:24px;">Synchronize with the cloud to see verification stats.</div>
                        <button onclick="Settings.fetchGlobalVerifications(true)" 
                            style="background:var(--primary); color:white; border:none; padding:12px 24px; border-radius:12px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:8px; box-shadow:0 4px 12px rgba(37,99,235,0.2);">
                            <span class="material-icons-round">sync</span>
                            ${this.isFetchingGlobal ? 'Syncing...' : 'Start Synchronization'}
                        </button>
                    </div>`;
        }

        // FILTERING LOGIC
        let filteredData = window.ALL_VERIFIED_DATA || [];

        // Pre-calculate SID to Location mapping for O(1) lookups
        const sidToLoc = {};
        if (typeof RAW_DATA !== 'undefined') {
            RAW_DATA.forEach(r => {
                sidToLoc[String(r[0])] = { dist: String(r[10]), city: String(r[11]), mc: String(r[12]) };
            });
        }

        // 1. Filter by Date (if set)
        if (State.verifSelectedDate) {
            filteredData = filteredData.filter(v => v.verified_at && String(v.verified_at).startsWith(State.verifSelectedDate));
        }
        // 2. Filter by Verifier (if set)
        if (State.verifSelectedVerifier) {
            filteredData = filteredData.filter(v => v.verified_by === State.verifSelectedVerifier);
        }

        // 3. Filter by Area (Requires merging with RAW_DATA to know location)
        if (State.verifSelectedDistrict || State.verifSelectedCity || State.verifSelectedArea) {
            filteredData = filteredData.filter(v => {
                const loc = sidToLoc[String(v.survey_id)];
                if (!loc) return false;

                if (State.verifSelectedDistrict && loc.dist !== State.verifSelectedDistrict) return false;
                if (State.verifSelectedCity && loc.city !== State.verifSelectedCity) return false;
                if (State.verifSelectedArea && loc.mc !== State.verifSelectedArea) return false;

                return true;
            });
        }

        const verifiedSet = new Set((window.ALL_VERIFIED_DATA || []).map(v => String(v.survey_id)));
        const totalVerified = verifiedSet.size;

        // SORTING LOGIC
        const sortBy = State.verifSortBy || 'date';
        const sortDir = State.verifSortDir || 'desc';

        filteredData.sort((a, b) => {
            let valA, valB;
            if (sortBy === 'date') {
                valA = new Date(a.verified_at).getTime() || 0;
                valB = new Date(b.verified_at).getTime() || 0;
            } else {
                valA = (a.verified_by || '').toLowerCase();
                valB = (b.verified_by || '').toLowerCase();
            }

            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        // Header Reduction: Single Row Compact Info + Refresh
        let headerHtml = `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:#f8fafc; border-radius:12px; margin-bottom:16px; border:1px solid #e2e8f0;">
                    <button onclick="LayerManager.switchTab('📊 Stats')" style="border:none; background:none; color:#64748b; cursor:pointer; display:flex; align-items:center; gap:4px;">
                        <span class="material-icons-round" style="font-size:18px;">arrow_back</span>
                        <span style="font-size:11px; font-weight:800;">EXIT</span>
                    </button>
                    <div style="display:flex; gap:16px; align-items:center;">
                        <div style="text-align:right;">
                            <div style="font-size:9px; font-weight:800; color:#94a3b8; text-transform:uppercase;">TOTAL VERIFIED</div>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <div style="font-size:18px; font-weight:900; color:var(--primary); line-height:1;">${totalVerified.toLocaleString()}</div>
                                <button onclick="Settings.fetchGlobalVerifications(true)" style="background:none; border:none; cursor:pointer; color:var(--primary); padding:0; display:flex;" title="Force Refresh from Server">
                                    <span class="material-icons-round" style="font-size:16px;">sync</span>
                                </button>
                            </div>
                        </div>
                        <div style="width:1px; height:24px; background:#e2e8f0;"></div>
                        <div style="text-align:right;">
                            <div style="font-size:9px; font-weight:800; color:#94a3b8; text-transform:uppercase;">CYCLE</div>
                            <div style="font-size:14px; font-weight:800; color:#1e293b; line-height:1;">${window.ACTIVE_BILLING_MONTH || 'N/A'}</div>
                        </div>
                    </div>
                </div>
            `;

        // Advanced Filtering Controls (Date, District, City, MC/UC)
        const districts = Object.keys(HIERARCHY || {}).sort();
        const cities = (State.verifSelectedDistrict && HIERARCHY && HIERARCHY[State.verifSelectedDistrict])
            ? Object.keys(HIERARCHY[State.verifSelectedDistrict]).sort() : [];
        const mcs = (State.verifSelectedDistrict && State.verifSelectedCity && HIERARCHY && HIERARCHY[State.verifSelectedDistrict] && HIERARCHY[State.verifSelectedDistrict][State.verifSelectedCity])
            ? Object.keys(HIERARCHY[State.verifSelectedDistrict][State.verifSelectedCity]).sort() : [];

        let filtersHtml = `
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:16px; background:#f1f5f9; padding:12px; border-radius:12px;">
                    <div style="grid-column: 1 / -1;">
                        <label style="font-size:9px; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:4px; display:block;">Select Date</label>
                        <input type="date" value="${State.verifSelectedDate || ''}" onchange="State.verifSelectedDate = this.value; LayerManager.renderSettingsUI();" 
                            style="width:100%; padding:8px; border-radius:8px; border:1px solid #cbd5e1; font-size:12px; outline:none; font-family:inherit; color:#1e293b;">
                    </div>
                    <div>
                        <label style="font-size:9px; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:4px; display:block;">District</label>
                        <select onchange="State.verifSelectedDistrict = this.value; State.verifSelectedCity = ''; State.verifSelectedArea = ''; LayerManager.renderSettingsUI();" 
                            style="width:100%; padding:8px; border-radius:8px; border:1px solid #cbd5e1; font-size:12px; outline:none; font-family:inherit; color:#1e293b;">
                            <option value="">All Districts</option>
                            ${districts.map(d => `<option value="${d}" ${State.verifSelectedDistrict === d ? 'selected' : ''}>${d}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:9px; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:4px; display:block;">City / Division</label>
                        <select onchange="State.verifSelectedCity = this.value; State.verifSelectedArea = ''; LayerManager.renderSettingsUI();" ${!State.verifSelectedDistrict ? 'disabled' : ''}
                            style="width:100%; padding:8px; border-radius:8px; border:1px solid #cbd5e1; font-size:12px; outline:none; font-family:inherit; color:#1e293b; opacity: ${!State.verifSelectedDistrict ? '0.5' : '1'};">
                            <option value="">All Cities</option>
                            ${cities.map(c => `<option value="${c}" ${State.verifSelectedCity === c ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>
                    </div>
                    <div style="grid-column: 1 / -1;">
                        <label style="font-size:9px; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:4px; display:block;">Focus Area (MC/UC)</label>
                        <select onchange="State.verifSelectedArea = this.value; LayerManager.renderSettingsUI();" ${!State.verifSelectedCity ? 'disabled' : ''}
                            style="width:100%; padding:8px; border-radius:8px; border:1px solid #cbd5e1; font-size:12px; outline:none; font-family:inherit; color:#1e293b; opacity: ${!State.verifSelectedCity ? '0.5' : '1'};">
                            <option value="">All Areas</option>
                            ${mcs.map(m => `<option value="${m}" ${State.verifSelectedArea === m ? 'selected' : ''}>${m}</option>`).join('')}
                        </select>
                    </div>
                </div>
            `;

        // HISTOGRAM LOGIC (Grouping by Area)
        const stackBy = State.verifSelectedCity ? 'mc' : 'city';
        const dailyData = {};

        filteredData.forEach(v => {
            const date = new Date(v.verified_at);
            if (isNaN(date.getTime())) return;
            const dateKey = date.toISOString().split('T')[0];

            if (!dailyData[dateKey]) dailyData[dateKey] = { total: 0, areas: {} };
            dailyData[dateKey].total++;

            const loc = sidToLoc[String(v.survey_id)] || { city: 'Unknown', mc: 'Unknown' };
            const areaKey = (stackBy === 'mc' ? loc.mc : loc.city) || 'Unknown';
            dailyData[dateKey].areas[areaKey] = (dailyData[dateKey].areas[areaKey] || 0) + 1;
        });

        const sortedDays = Object.keys(dailyData).sort().slice(-7);
        const maxDaily = Math.max(...Object.values(dailyData).map(d => d.total), 1);

        let histHtml = `
                <div class="hist-container">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                        <div>
                            <h4 style="font-size:10px; font-weight:800; color:#1e293b; text-transform:uppercase; letter-spacing:0.5px; margin:0;">Daily Delivery Pulse</h4>
                            <div style="font-size:9px; color:#64748b; margin-top:2px; font-weight:600;">Total per day (Breakdown by ${stackBy === 'mc' ? 'MC/UC' : 'City'})</div>
                            ${State.verifSelectedVerifier ? `<div style="font-size:9px; color:var(--primary); font-weight:700; margin-top:2px;">Filtered: ${State.verifSelectedVerifier}</div>` : ''}
                        </div>
                        <span style="font-size:9px; color:#64748b; font-weight:700;">${State.verifSelectedDate ? 'Selected Date' : 'Last 7 Days'}</span>
                    </div>
                    <div class="hist-bars">
            `;

        if (sortedDays.length === 0) {
            histHtml += `<div style="width:100%; text-align:center; font-size:11px; color:#94a3b8; padding:20px 0;">No data for current filters.</div>`;
        } else {
            const dayColors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'];
            sortedDays.forEach((day, idx) => {
                const dayData = dailyData[day];
                const height = Math.round((dayData.total / maxDaily) * 100);

                // Format date as "Mar-04"
                const dateObj = new Date(day);
                const dayLabel = dateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).replace(' ', '-');

                const barColor = dayColors[idx % dayColors.length];

                let breakdownStr = Object.entries(dayData.areas)
                    .sort((a, b) => b[1] - a[1])
                    .map(([area, count]) => `${area}: ${count}`)
                    .join('&#10;'); // Line break for title

                histHtml += `
                        <div class="hist-bar-wrapper">
                            <div class="hist-bar" style="height:${height}%; background:${barColor};" data-val="${dayData.total}" title="${breakdownStr}"></div>
                            <div class="hist-label" style="text-align:center;">${dayLabel}</div>
                        </div>
                    `;
            });
        }
        histHtml += `</div></div>`;

        // VIEW TOGGLE (List vs Database)
        const isDbView = State.verificationViewMode === 'database';
        let toggleHtml = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin: 20px 0 12px 0;">
                    <h4 style="font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin:0;">Audit Tools</h4>
                    <div style="display:flex; background:#f1f5f9; border-radius:6px; padding:2px;">
                        <button onclick="State.verificationViewMode = 'list'; LayerManager.renderSettingsUI();" 
                            style="padding:4px 10px; border:none; border-radius:4px; font-size:10px; font-weight:800; cursor:pointer; 
                            background:${State.verificationViewMode === 'list' ? 'white' : 'transparent'}; 
                            color:${State.verificationViewMode === 'list' ? '#1e293b' : '#64748b'};
                            box-shadow:${State.verificationViewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'};">Verifiers</button>
                        <button onclick="State.verificationViewMode = 'database'; LayerManager.renderSettingsUI();" 
                            style="padding:4px 10px; border:none; border-radius:4px; font-size:10px; font-weight:800; cursor:pointer; 
                            background:${State.verificationViewMode === 'database' ? 'white' : 'transparent'}; 
                            color:${State.verificationViewMode === 'database' ? '#1e293b' : '#64748b'};
                            box-shadow:${State.verificationViewMode === 'database' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'};">Database</button>
                    </div>
                </div>
            `;

        let listContentHtml = '';

        if (State.verificationViewMode === 'list') {
            // Performance by User (Using Unfiltered Data to allow selection, but showing total count relative to other filters)
            const userStats = {};
            (window.ALL_VERIFIED_DATA || []).forEach(v => {
                // Pre-filter by date if necessary so user totals match the selected date.
                if (State.verifSelectedDate && (!v.verified_at || !String(v.verified_at).startsWith(State.verifSelectedDate))) return;

                const user = v.verified_by || 'Unknown';
                userStats[user] = (userStats[user] || 0) + 1;
            });

            const userRows = Object.entries(userStats).sort((a, b) => b[1] - a[1]).map(([user, count]) => {
                const isSelected = State.verifSelectedVerifier === user;
                return `
                    <tr class="verifier-row ${isSelected ? 'selected' : ''}" 
                        onclick="State.verifSelectedVerifier = '${isSelected ? '' : user}'; LayerManager.renderSettingsUI();">
                        <td style="padding:12px 8px; font-size:11px; font-weight:600; color:#64748b; font-family:monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;">
                            ${user}
                        </td>
                        <td style="padding:12px 8px; text-align:right; font-weight:800; color:#16a34a; font-size:13px;">
                            ${count.toLocaleString()}
                        </td>
                    </tr>
                    `;
            }).join('');

            listContentHtml = `
                    <div style="background:white; border:1px solid #f1f5f9; border-radius:12px; padding:4px 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                        <table style="width:100%; border-collapse:collapse;">
                            <thead>
                                <tr style="border-bottom:1px solid #f1f5f9;">
                                    <th style="text-align:left; padding:12px 8px; font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px;">Verifier Email <span style="font-weight:400; font-size:9px; text-transform:none;">(Click to filter)</span></th>
                                    <th style="text-align:right; padding:12px 8px; font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px;">Count</th>
                                </tr>
                            </thead>
                            <tbody>${userRows || '<tr><td colspan="2" style="padding:20px; text-align:center; color:#94a3b8;">No records found</td></tr>'}</tbody>
                        </table>
                    </div>
                `;
        } else {
            // Database View (Table with Sort/Edit/Delete)
            const dateArrow = sortBy === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : '';
            const emailArrow = sortBy === 'email' ? (sortDir === 'asc' ? '↑' : '↓') : '';

            const tableRows = filteredData.map(v => {
                const dateObj = v.verified_at ? new Date(v.verified_at) : null;
                const isValidDate = dateObj && !isNaN(dateObj.getTime());
                const dateStr = isValidDate
                    ? dateObj.toLocaleDateString('en-GB') + ' ' + dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                    : '<span style="color:#ef4444;">No Date</span>';
                const email = v.verified_by || 'Unknown';
                const sid = v.survey_id;

                return `
                        <tr style="border-bottom:1px solid #f8fafc; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                            <td style="padding:10px 8px;">
                                <div style="font-size:11px; font-weight:800; color:#1e293b;">${sid}</div>
                                <div style="font-size:9px; color:#94a3b8; font-family:monospace;">${dateStr}</div>
                            </td>
                            <td style="padding:10px 8px;">
                                <div style="font-size:10px; font-weight:600; color:#64748b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;" title="${email}">
                                    ${email.split('@')[0]}
                                </div>
                            </td>
                            <td style="padding:10px 8px; text-align:right;">
                                <div style="display:flex; gap:8px; justify-content:flex-end;">
                                    <button onclick="Settings.editVerification('${sid}')" style="background:#f0f7ff; color:#2563eb; border:none; border-radius:6px; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="Edit Position">
                                        <span class="material-icons-round" style="font-size:16px;">edit</span>
                                    </button>
                                    <button onclick="Settings.deleteVerification('${sid}')" style="background:#fef2f2; color:#ef4444; border:none; border-radius:6px; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="Delete Record">
                                        <span class="material-icons-round" style="font-size:16px;">delete</span>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
            }).join('');

            listContentHtml = `
                    <div style="background:white; border:1px solid #f1f5f9; border-radius:12px; overflow:hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                        <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
                            <thead>
                                <tr style="background:#f8fafc; border-bottom:1px solid #f1f5f9;">
                                    <th onclick="Settings.toggleSort('date')" style="text-align:left; padding:10px 8px; font-size:9px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; cursor:pointer; width:45%;">
                                        House / Date ${dateArrow}
                                    </th>
                                    <th onclick="Settings.toggleSort('email')" style="text-align:left; padding:10px 8px; font-size:9px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; cursor:pointer; width:35%;">
                                        Verifier ${emailArrow}
                                    </th>
                                    <th style="text-align:right; padding:10px 8px; font-size:9px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; width:20%;">
                                        Tools
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRows || '<tr><td colspan="3" style="padding:40px; text-align:center; color:#94a3b8; font-size:12px;">No records match filters</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                `;
        }


        return `
                <div style="padding:4px;">
                    ${headerHtml}
                    ${filtersHtml}
                    ${histHtml}
                    ${toggleHtml}
                    ${listContentHtml}
                </div>`;
    },
    incrementMarkerLimit(amount) {
        State.markerLimit = Math.max(5000, State.markerLimit + amount);
        LayerManager.renderSettingsUI();
        App.render();
    },

    async updateBillingMonth() {
        const input = document.getElementById('input-billing-month');
        const btn = document.getElementById('btn-save-billing');
        if (!input || !btn) return;

        const newMonth = input.value.trim();
        if (!newMonth) return App.showToast("Please enter a valid month label.");
        // REMOVED: Blocking check for same month to allow re-saving if record was deleted in cloud
        // if (newMonth === window.ACTIVE_BILLING_MONTH) return App.showToast("Month is already set to " + newMonth);

        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round spinning">refresh</span> Saving...';

        try {
            // Use upsert to handle both insert and update cases
            const { error } = await window._supabase
                .from('app_settings')
                .upsert({
                    key: 'active_billing_month',
                    value: newMonth,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;

            window.ACTIVE_BILLING_MONTH = newMonth;
            if (typeof LayerManager !== 'undefined') {
                LayerManager.showToast("Billing cycle updated to " + newMonth + " ✨");
                LayerManager.renderSettingsUI();
            }

            if (window.ListView) {
                ListView.render();
            }

            // Immediately synchronize VerifiedLayer with the newly targeted billing month
            this.fetchGlobalVerifications(true);
        } catch (e) {
            console.error("Failed to update billing month:", e);
            const errorMsg = e.message || "Cloud rejected";
            if (typeof LayerManager !== 'undefined') LayerManager.showToast("Error: " + errorMsg);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons-round">cloud_done</span> Save to Cloud';
        }
    },

    async deleteVerification(sid) {
        if (!confirm(`Permanently delete verification for Survey ID: ${sid}?`)) return;

        try {
            const { error } = await window._supabase
                .from('verified_houses')
                .delete()
                .eq('survey_id', sid)
                .eq('billing_month', window.ACTIVE_BILLING_MONTH);

            if (error) throw error;

            // CRITICAL: Update local cache manually since Delta Sync doesn't detect deletions
            if (window.ALL_VERIFIED_DATA) {
                window.ALL_VERIFIED_DATA = window.ALL_VERIFIED_DATA.filter(v => String(v.survey_id) !== String(sid));
                const cacheKey = `v_cache_${window.ACTIVE_BILLING_MONTH}`;
                localStorage.setItem(cacheKey, JSON.stringify(window.ALL_VERIFIED_DATA));
            }

            if (window.SpatialRouter && SpatialRouter.verifiedSIDs) {
                SpatialRouter.verifiedSIDs.clear();
            }

            // UI Updates
            if (typeof LayerManager !== 'undefined') LayerManager.renderSettingsUI();
            if (window.App) App.render();
            if (window.VerifiedLayer) VerifiedLayer.updateList();
            if (window.ListView) ListView.render();

            App.showToast("Record deleted successfully. ✅");
        } catch (e) {
            console.error("Delete failed:", e);
            App.showToast("Error deleting record: " + e.message);
        }
    },

    editVerification(sid) {
        this.close();
        const sidStr = String(sid);
        const record = window.SID_MAP ? window.SID_MAP.get(sidStr) : null;

        if (record && window.SpatialRouter) {
            // Center and show card
            SpatialRouter.highlightMarker(sidStr, record[1], record[2], false);

            // Pulse to let UI settle, then start pinning
            setTimeout(() => {
                SpatialRouter.startManualPin(sidStr);
                App.showToast("Correcting position for " + sidStr);
            }, 600);
        } else {
            App.showToast("House data not found.");
        }
    },

    toggleSort(field) {
        if (State.verifSortBy === field) {
            State.verifSortDir = State.verifSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            State.verifSortBy = field;
            State.verifSortDir = 'desc';
        }
        LayerManager.renderSettingsUI();
    },

    exportHouseSequences() {
        if (!window.ALL_VERIFIED_DATA || window.ALL_VERIFIED_DATA.length === 0) {
            return App.showToast("No data to export.");
        }

        console.log(`[Export] Generating robust sequence report for ${window.ALL_VERIFIED_DATA.length} records...`);

        // 1. Map data to enriched objects
        const sidToRow = new Map();
        if (window.RAW_DATA) window.RAW_DATA.forEach(r => sidToRow.set(String(r[0]), r));

        const reportData = window.ALL_VERIFIED_DATA.map(v => {
            const row = sidToRow.get(String(v.survey_id)) || [];
            return {
                sid: v.survey_id || '-',
                name: decodePII(row[4] || 'Unknown'),
                bill_id: decodePII(row[15] || '-'),
                district: row[10] || '-',
                city: row[11] || '-',
                area: row[12] || '-',
                category: row[3] === 1 ? 'Commercial' : 'Domestic',
                status: row[16] || 'Unpaid',
                amount: row[20] || '0',
                street: v.street_no || 'C',
                side: v.is_right ? 'Right' : 'Left',
                sequence: v.sequence_no || 0,
                is_delivered: v.is_delivered ? 'YES' : 'NO',
                verified_by: v.verified_by || 'Unknown',
                verified_at: v.verified_at || '-'
            };
        });

        // 2. Sort by Area -> Street -> Sequence
        reportData.sort((a, b) => {
            if (a.area !== b.area) return a.area.localeCompare(b.area);
            if (a.street !== b.street) return a.street.localeCompare(b.street, undefined, { numeric: true });
            return a.sequence - b.sequence;
        });

        // 3. Robust CSV Generation Helper
        const escapeCSV = (val) => {
            if (val === null || val === undefined) return '""';
            const str = String(val).replace(/"/g, '""'); // Escape inner quotes
            return `"${str}"`;
        };

        const headers = [
            "SurveyID", "Name", "Bill_ID", "District", "City", "Area", 
            "Category", "Status", "Amount", "Street", "Side", 
            "Sequence", "Is_Delivered", "Verified_By", "Verified_At"
        ];

        const csvRows = [headers.map(h => escapeCSV(h)).join(",")];

        reportData.forEach(d => {
            const row = [
                d.sid, d.name, d.bill_id, d.district, d.city, d.area,
                d.category, d.status, d.amount, d.street, d.side,
                d.sequence, d.is_delivered, d.verified_by, d.verified_at
            ];
            csvRows.push(row.map(val => escapeCSV(val)).join(","));
        });

        // 4. Trigger Download
        const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `House_Intelligence_${window.ACTIVE_BILLING_MONTH}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        App.showToast("Detailed CSV Exported ✅");
    }
};

// Alias App.showToast to LayerManager.showToast if missing
if (typeof App !== 'undefined' && !App.showToast) {
    App.showToast = function (msg) {
        if (typeof LayerManager !== 'undefined') LayerManager.showToast(msg);
        else console.log("Toast:", msg);
    };
}

// Keyboard support for List View
window.addEventListener('keydown', e => {
    if (!document.getElementById('list-view-stage').classList.contains('active')) return;
    // Block List View navigation if Gallery is active
    if (document.getElementById('gallery').classList.contains('active')) return;

    if (e.key === 'ArrowRight') ListView.next();
    if (e.key === 'ArrowLeft') ListView.prev();
});

// Touch support for List View
let touchStartX = 0;
let touchStartY = 0;
document.getElementById('lv-content').addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

document.getElementById('lv-content').addEventListener('touchend', e => {
    const deltaX = touchStartX - e.changedTouches[0].screenX;
    const deltaY = touchStartY - e.changedTouches[0].screenY;

    // Threshold check (increase to 100px) and Axis check (ensure horizontal dominance)
    if (Math.abs(deltaX) > 100 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        deltaX > 0 ? ListView.next() : ListView.prev();
    }
}, { passive: true });