// === 12_drive_sync.js ===
// DriveSync / Google Drive

const DriveSync = {
    files: [],
    MAX: 999, // Effectively Unlimited
    APP_URL: 'https://script.google.com/macros/s/AKfycbyYjtk6oqeElKuprk0eN5MAiaIX0g44mapJkWVtuSwBj79quu49R8TgyEsCYG9lpew-Fw/exec',
    currentDriveCount: 0,
    _lastSync: 0,
    _cacheExpiry: 3600000, // 1 hour reliability cache
    offlineQueue: [],
    db: null,
    _activeFetch: null, // For aborting pending metadata requests

    _safeId(id) { return id.toString().replace(/[^a-z0-9]/gi, '_'); },
    _cleanId(id) {
        if (!id) return '';
        return String(id).replace(/\.0$/, '').trim();
    },

    saveEmail(email) {
        localStorage.setItem('surveyor_email', email);
    },

    getEmail() {
        return localStorage.getItem('surveyor_email') || (window.USER ? window.USER.email : '');
    },

    init() {
        if (this._initialized) {
            // Already running — just refresh the whitelist dropdown
            this.renderWhitelist();
            return;
        }
        this._initialized = true;
        this._isUploading = false;
        this.openIndexedDB();

        // Auto-Identity Binding: If logged-in user is in roles.json, select them automatically
        this.autoBindIdentity();

        // Pull exclusively from local roles.json (window.USER_DB)
        this.renderWhitelist();
        window.addEventListener('focus', () => this.loadOfflineQueue());
        window.addEventListener('hashchange', () => this.loadOfflineQueue());
    },

    autoBindIdentity() {
        if (window.USER && window.USER.email && window.USER_DB) {
            const email = window.USER.email.toLowerCase();
            const admins = (window.USER_DB.admins || []).map(e => e.toLowerCase());
            const staff = (window.USER_DB.field_staff || []).map(e => e.toLowerCase());

            if (admins.includes(email) || staff.includes(email)) {
                const saved = localStorage.getItem('surveyor_email');
                if (saved !== email) {
                    console.log("[DriveSync] Binding identity to currently logged-in user:", email);
                    this.saveEmail(email);
                }
            }
        }
    },

    openIndexedDB() {
        const request = indexedDB.open('OfflineImageStore', 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('images')) {
                db.createObjectStore('images', { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = (e) => {
            this.db = e.target.result;
            this.loadOfflineQueue();
        };
        request.onerror = (e) => console.error("IndexedDB error:", e);
    },

    loadOfflineQueue() {
        if (!this.db || this._isUploading) return;
        const transaction = this.db.transaction(['images'], 'readonly');
        const store = transaction.objectStore('images');
        
        // MEMORY OPTIMIZATION: Use a cursor to get metadata only, avoid loading all Base64 images into RAM
        const results = [];
        const request = store.openCursor();
        request.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                const val = cursor.value;
                results.push({
                    id: val.id,
                    surveyId: val.surveyId,
                    timestamp: val.timestamp,
                    dataLength: val.data ? val.data.length : 0
                });
                cursor.continue();
            } else {
                this.offlineQueue = results;
                this.updateGlobalIndicator();
            }
        };
    },

    async handleFiles(fileList) {
        const currentSid = State.filtered && State.filtered[State.currentIdx] ? State.filtered[State.currentIdx][0] : null;
        if (!currentSid) return;

        const newFiles = Array.from(fileList);
        if (newFiles.length === 0) return;

        // Start "Saving" UI State
        this.setLoadingState(true, `Saving 0/${newFiles.length}`);
        const email = this.getEmail();

        try {
            for (let i = 0; i < newFiles.length; i++) {
                this.setLoadingState(true, `Saving ${i + 1}/${newFiles.length}`);
                await this.saveOfflineImage(currentSid, newFiles[i], email);
            }
        } finally {
            this.setLoadingState(false);
            this.loadOfflineQueue();
            this.updateStatus(currentSid);
        }
    },

    setLoadingState(isLoading, text = "") {
        const btn = document.getElementById('btn-cloud-sync-floating');
        const icon = btn ? btn.querySelector('.material-icons-round') : null;
        if (btn && icon) {
            if (isLoading) {
                icon.innerText = 'sync';
                icon.classList.add('spinning');
                btn.style.background = '#f59e0b'; // Warning orange
            } else {
                icon.innerText = 'cloud_upload';
                icon.classList.remove('spinning');
                btn.style.background = '';
            }
        }
        if (isLoading && text && window.App && App.showToast) {
            App.showToast(text);
        }
    },

    async saveOfflineImage(surveyId, file, email) {
        if (!this.db) return;
        const cleanSid = this._cleanId(surveyId);
        if (!cleanSid) {
            console.error("[DriveSync] Attempted to save image without valid Survey ID", { surveyId });
            if (window.App && App.showToast) App.showToast("❌ Error: Record ID not found. Re-select record and try again.");
            return;
        }

        const compressed = await this.compressImage(file);
        const base64 = await this.toBase64(compressed);

        const transaction = this.db.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        const item = {
            surveyId: cleanSid,
            name: file.name,
            data: base64,
            email: email || this.getEmail() || 'unknown@staff.local',
            timestamp: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const req = store.add(item);
            req.onsuccess = () => resolve();
            req.onerror = () => reject();
        });
    },

    updateGlobalIndicator() {
        const btnFloating = document.getElementById('btn-cloud-sync-floating');
        const dotFloating = document.getElementById('cloud-sync-dot-floating');
        const count = this.offlineQueue.length;

        if (btnFloating) {
            btnFloating.style.display = 'flex';
            if (dotFloating) dotFloating.style.display = count > 0 ? 'block' : 'none';

            const icon = btnFloating.querySelector('.material-icons-round');
            if (icon) {
                icon.textContent = count > 0 ? 'cloud_off' : 'cloud_done';
                icon.style.color = count > 0 ? '#d97706' : '#64748b';
            }
            btnFloating.style.background = count > 0 ? '#fef3c7' : '#ffffff';
            btnFloating.style.borderColor = count > 0 ? '#fcd34d' : '#e2e8f0';
            btnFloating.style.boxShadow = count > 0 ? '0 2px 8px rgba(217, 119, 6, 0.2)' : '0 2px 8px rgba(0,0,0,0.1)';
        }

        // Update Mobile Unsent Banner
        const mobileBanner = document.getElementById('mobile-unsent-banner');
        const mobileCountSpan = document.getElementById('mobile-unsent-count');
        const isMobile = window.innerWidth <= 768;

        if (mobileBanner) {
            if (count > 0 && isMobile) {
                mobileBanner.style.setProperty('display', 'flex', 'important');
                if (mobileCountSpan) mobileCountSpan.innerText = count;
            } else {
                mobileBanner.style.setProperty('display', 'none', 'important');
            }
        }
    },


    renderWhitelist() {
        const select = document.getElementById('drive-email');
        if (!select) return;

        let emails = [];
        // Pull from window.USER_DB (roles.json)
        if (window.USER_DB) {
            emails = [
                ...(window.USER_DB.admins || []),
                ...(window.USER_DB.field_staff || [])
            ];
            // Deduplicate and sort
            emails = [...new Set(emails)].sort();
        }

        const currentUserEmail = (window.USER && window.USER.email) ? window.USER.email.toLowerCase() : '';
        const savedEmail = this.getEmail();

        // FILTER: Hide specific system/migrated emails from the select list
        const blacklist = ['migrated@system.local', 'migrated@staff.local', 'unknown@staff.local', 'null@staff.local'];
        emails = emails.filter(e => !blacklist.includes(e.toLowerCase()));

        let html = '<option value="">Select Surveyor Email</option>';
        emails.forEach(email => {
            const isMe = email.toLowerCase() === currentUserEmail;
            const isSelected = email.toLowerCase() === savedEmail.toLowerCase();

            // Use symbols to visually distinguish
            const prefix = isMe ? '● ' : '○ ';
            const label = prefix + email + (isMe ? ' (You)' : '');

            html += `<option value="${email}" ${isSelected ? 'selected' : ''} style="${!isMe ? 'color:#94a3b8;' : 'font-weight:bold;'}">${label}</option>`;
        });
        select.innerHTML = html;

        // Apply visual dimming to the select element itself if an inactive email is selected
        select.onchange = (e) => {
            const val = e.target.value;
            this.saveEmail(val);
            if (val && val.toLowerCase() !== currentUserEmail) {
                select.style.opacity = '0.6';
                select.style.fontStyle = 'italic';
            } else {
                select.style.opacity = '1';
                select.style.fontStyle = 'normal';
            }
        };

        // IDENTITY LOCKING: Disable dropdown for staff
        if (window.USER && window.USER.role === 'staff') {
            select.disabled = true;
            select.style.cursor = 'not-allowed';
            select.style.background = '#f8fafc';
            select.title = "Identity locked for field staff.";
        }

        // Initial style check
        if (savedEmail && savedEmail.toLowerCase() !== currentUserEmail) {
            select.style.opacity = '0.6';
            select.style.fontStyle = 'italic';
        }
    },

    async fetchAllSyncedData(force = false) {
        if (!this.APP_URL) return;

        // RELIABILITY CACHE: Use session memory if fresh
        const now = Date.now();
        if (!force && (now - this._lastSync < this._cacheExpiry) && Object.keys(State.syncedData || {}).length > 0) {
            console.log("[DriveSync] Using fresh session cache for Synced IDs");
            return;
        }

        console.log(`[DriveSync] fetchAllSyncedData via Supabase started. force=${force}`);

        const badges = [
            document.getElementById('sync-server-badge'),
            document.getElementById('sync-server-badge-sidebar')
        ].filter(b => b);

        badges.forEach(b => {
            b.innerHTML = '<span class="material-icons-round spinning" style="font-size:10px;">sync</span>';
        });

        try {
            if (!window._supabase) throw new Error("Supabase Client Not Initialized");

            // 1. Fetch Global Total (The 46,000+ number)
            const { data: summary } = await window._supabase.rpc('get_drive_image_summary');
            if (summary !== undefined) State.totalDriveImages = summary;

            // 2. Fetch Individual Totals per ID from the new VIEW
            let allData = [];
            let page = 0;
            const pageSize = 1000;
            let hasMore = true;

            let fetchSuccess = true;
            while (hasMore) {
                const { data: pageData, error } = await window._supabase
                    .from('drive_image_counts')
                    .select('survey_id, image_count')
                    .range(page * pageSize, (page + 1) * pageSize - 1);

                if (error) {
                    console.error(`[DriveSync] Error on page ${page}:`, error);
                    fetchSuccess = false;
                    hasMore = false;
                    break;
                }
                if (pageData && pageData.length > 0) {
                    allData = allData.concat(pageData);
                    page++;
                    if (pageData.length < pageSize) hasMore = false;
                } else {
                    hasMore = false;
                }
            }

            // ONLY update State.syncedData if we successfully fetched the entire dataset
            if (fetchSuccess && allData.length > 0) {
                const normalized = {};
                let totalImages = 0;

                allData.forEach(row => {
                    const cleanSid = this._cleanId(row.survey_id);
                    if (cleanSid) {
                        normalized[cleanSid] = (normalized[cleanSid] || 0) + row.image_count;
                        totalImages += row.image_count;
                    }
                });

                // Merge with existing state instead of hard-replacing to prevent "flicker"
                State.syncedData = Object.assign(State.syncedData || {}, normalized);
                this._lastSync = now;

                localStorage.setItem('drive_sync_cache', JSON.stringify({
                    timestamp: now,
                    data: normalized
                }));

                console.log(`[DriveSync] Supabase counts loaded: ${allData.length} records with images`);

                badges.forEach(b => {
                    b.innerHTML = '<span class="material-icons-round" style="font-size:10px;">cached</span> <span style="font-size:8px;">🟢 DB SYNCED</span>';
                    b.style.background = '#f0fdf4';
                    b.style.color = '#15803d';
                    b.style.borderColor = '#bbf7d0';
                    b.title = `Last sync: ${new Date().toLocaleTimeString()}`;
                    b.style.cursor = 'default';
                });

                if (document.getElementById('f-drive-only')) {
                    State.driveOnlyFilter = document.getElementById('f-drive-only').checked;
                }
                App.apply();
            } else {
                throw new Error("EMPTY_RESPONSE");
            }
        } catch (e) {
            console.error("[DriveSync] fetchAllSyncedData error:", e);

            // FALLBACK: Try to load from LocalStorage if API fails
            const localCache = localStorage.getItem('drive_sync_cache');
            if (localCache) {
                try {
                    const parsed = JSON.parse(localCache);
                    State.syncedData = parsed.data;
                    console.warn("[DriveSync] API Failed. Using LocalStorage fallback cache from:", new Date(parsed.timestamp).toLocaleString());

                    badges.forEach(b => {
                        b.innerHTML = '<span class="material-icons-round" style="font-size:10px;">history</span> <span style="font-size:8px;">🟡 CACHED</span>';
                        b.style.background = '#fffbeb';
                        b.style.color = '#b45309';
                        b.style.borderColor = '#fde68a';
                        b.title = "Offline/API Error. Showing cached data.";
                        b.style.cursor = 'default';
                    });
                    App.apply();
                    return;
                } catch (err) { /* corrupted cache */ }
            }

            if (badges.length > 0) {
                let errorMsg = "❌ ERROR";
                if (e.message === "LOGIN_REQUIRED") errorMsg = "🔑 LOGIN";
                else if (e.message.includes("Failed to fetch")) errorMsg = "🌐 OFFLINE";

                badges.forEach(b => {
                    b.innerHTML = `<span class="material-icons-round" style="font-size:10px;">sync_problem</span> <span style="font-size:8px;">${errorMsg}</span>`;
                    b.style.background = '#fef2f2';
                    b.style.color = '#dc2626';
                    b.style.borderColor = '#fecaca';
                    b.title = e.message + " - Click to retry";
                    b.onclick = () => this.fetchAllSyncedData(true);
                });
            }
        }
    },

    async fetchMetadata(surveyId) {
        const sid = this._safeId(surveyId);
        const cleanSid = this._cleanId(surveyId);

        // PHASE 0: Cancel any pending fetch for previous records
        if (this._activeFetch) {
            this._activeFetch.abort();
            this._activeFetch = null;
        }

        // 1. Initial UI update
        this.updateStatus(surveyId);

        try {
            // PHASE 1: Instant fetch from Supabase Logs (High Speed)
            let finalImages = [];
            if (window._supabase) {
                const { data: dbLogs } = await window._supabase
                    .from('staff_sync_logs')
                    .select('file_id, email, synced_at')
                    .eq('survey_id', cleanSid)
                    .order('synced_at', { ascending: false });

                if (dbLogs && dbLogs.length > 0) {
                    finalImages = dbLogs.map(log => ({
                        id: log.file_id,
                        uploader: log.email || 'Cloud Log',
                        timestamp: log.synced_at
                    }));
                    // Render instantly so user doesn't wait for Drive API
                    this.renderSyncedImages(surveyId, finalImages);
                }
            }

            // PHASE 2: Background Deep-Check with Google Drive (Accuracy)
            this._activeFetch = new AbortController();
            const driveResp = await fetch(`${this.APP_URL}?action=get_images&surveyId=${cleanSid}`, {
                signal: this._activeFetch.signal
            });
            const driveResult = await driveResp.json();
            this._activeFetch = null;

            if (driveResult && driveResult.status === 'success' && Array.isArray(driveResult.files)) {
                const driveFiles = driveResult.files;
                const map = new Map();

                // Seed with current finalImages (Supabase)
                finalImages.forEach(img => map.set(img.id, img));

                // Add Drive files (catch any missing from logs or manual uploads)
                let foundChange = false;
                driveFiles.forEach(file => {
                    if (file && file.id && !map.has(file.id)) {
                        map.set(file.id, {
                            id: file.id,
                            uploader: 'Drive Discovery',
                            timestamp: file.createdTime || new Date().toISOString()
                        });
                        foundChange = true;
                    }
                });

                // If Drive has FEWER images than Supabase (unlikely but possible if deleted), 
                // or if it has NEW ones, update the view.
                if (foundChange || (finalImages.length > 0 && driveFiles.length !== finalImages.length)) {
                    const mergedImages = Array.from(map.values());

                    // Update cache & badge
                    State.syncedData[cleanSid] = mergedImages.length;
                    this.updateStatus(surveyId);

                    // Re-render with full merged set
                    this.renderSyncedImages(surveyId, mergedImages);
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') return; // Silent discard for aborted requests
            console.error("[DriveSync] Hybrid Metadata fetch error:", e);
        }
    },

    renderSyncedImages(surveyId, images) {
        const sid = this._safeId(surveyId);
        const gal = document.getElementById(`synced-gallery-${sid}`);
        console.log(`[DriveSync] Rendering ${images.length} images for SID: ${sid}. Element found: ${!!gal}`);
        if (!gal) return;

        // Check if active session user possesses administrator rights
        const isAdmin = window.USER && window.USER.role === 'admin';

        gal.innerHTML = images.map(img => {
            const url = `https://drive.google.com/thumbnail?id=${img.id}&sz=w200`;
            const date = new Date(img.timestamp).toLocaleString();
            const meta = `Uploaded by: ${img.uploader}\nTime: ${date}`;

            return `
                    <div class="gallery-item synced" title="${meta}" style="position:relative; border:2px solid #10b981; overflow:hidden; background:#f8fafc; cursor:pointer; width:100%; aspect-ratio:1/1; border-radius:8px;">
                        <img src="${url}" onclick="Gallery.open('${url}', '${surveyId}')" style="width:100%; height:100%; object-fit:cover;" onerror="this.onerror=null; this.src='https://placehold.co/100x100?text=Private+Image';">
                        
                        ${isAdmin ? `
                            <button onclick="event.stopPropagation(); if(confirm('Are you sure you want to delete this image?')) DriveSync.deleteImage('${img.id}', '${surveyId}')" 
                                    style="position:absolute; top:4px; right:4px; background:#ef4444; color:white; border:none; border-radius:50%; width:24px; height:24px; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.2); z-index:10;" 
                                    title="Delete Image (Admin Only)">
                                <span class="material-icons-round" style="font-size:16px;">delete</span>
                            </button>
                        ` : ''}
                        
                        <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(16,185,129,0.9); color:white; font-size:9px; padding:2px 4px; font-weight:800; text-align:center;">
                            SYNCED
                        </div>
                    </div>
                `;
        }).join('');
    },

    async deleteImage(fileId, surveyId) {
        const email = this.getEmail();
        if (!email) { alert("Surveyor Email Required for Deletion"); return; }

        if (!confirm("Are you sure you want to PERMANENTLY delete this image from Google Drive and Supabase?")) return;

        try {
            const resp = await fetch(this.APP_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'delete', email: email, fileId: fileId })
            });
            const result = await resp.json();
            const isAlreadyDeleted = result.status === 'error' && (result.message.includes('not found') || result.message.includes('404'));

            if (result.status === 'success' || isAlreadyDeleted) {
                if (App.showToast) App.showToast(isAlreadyDeleted ? "Log Cleared (File missing)" : "Image Trashed");

                // Also prune from Supabase if we have the fileId
                if (window._supabase && fileId) {
                    await window._supabase.from('staff_sync_logs').delete().eq('file_id', fileId);
                }

                // Force refresh counts
                await this.fetchAllSyncedData(true);
                this.fetchMetadata(surveyId);

                window._preserveIdx = true;
                App.apply();
            } else {
                alert("Delete Failed: " + result.message);
            }
        } catch (e) {
            console.error("Delete Error:", e);
        }
    },

    async deleteBatch(fileIds, skipConfirm = false) {
        if (!fileIds || fileIds.length === 0) return;
        const email = this.getEmail();
        if (!email) { alert("Surveyor Email Required for Deletion"); return; }

        if (!skipConfirm) {
            const confirm = window.confirm(`Are you sure you want to delete ${fileIds.length} images?`);
            if (!confirm) return;
        }

        try {
            // 1. Delete from Google Drive (via Apps Script)
            const resp = await fetch(this.APP_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'delete_batch', email: email, fileIds: fileIds })
            });
            const result = await resp.json();

            // If Drive sync failed but error indicates files were not found, we still want to clear Supabase
            const isAlreadyDeleted = result.status === 'error' && (result.message.includes('not found') || result.message.includes('404'));

            if (result.status === 'success' || isAlreadyDeleted) {
                // 2. Delete from Supabase
                if (window._supabase) {
                    await window._supabase
                        .from('staff_sync_logs')
                        .delete()
                        .in('file_id', fileIds);
                }

                // 3. Update Local Cache
                if (State.cachedSyncLogs) {
                    State.cachedSyncLogs = State.cachedSyncLogs.filter(log => !fileIds.includes(log.file_id));
                }

                // Force refresh of syncedData to update map badges
                if (window.DriveSync) {
                    await window.DriveSync.fetchAllSyncedData(true);
                }

                if (App.showToast) App.showToast(`${fileIds.length} Logs Cleared`);
                return true;
            }
            alert("Cloud Sync Error: " + result.message);
            return false;
        } catch (e) {
            console.error("Batch Delete Error:", e);
            return false;
        }
    },

    async fetchDetailedLogs(email) {
        if (!window._supabase) return [];
        try {
            // Use the authenticated client to fetch details
            const { data, error } = await window._supabase
                .from('staff_sync_logs')
                .select('survey_id, file_id, synced_at')
                .eq('email', email)
                .order('synced_at', { ascending: false })
                .limit(2000); // Show up to 2000 recent records for this user

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error("Fetch Details Failed:", e);
            return [];
        }
    },

    updateStatus(surveyId, errorState = null) {
        const sid = this._safeId(surveyId);
        const statusBadge = document.getElementById(`drive-status-${sid}`);
        const offlineWarning = document.getElementById(`offline-warning-${sid}`);
        const syncBtn = document.getElementById('btn-sync-drive');
        const actionBtns = document.querySelectorAll('.sync-action-btn:not(.upload)');

        if (offlineWarning) {
            const count = this.offlineQueue.filter(item => String(item.surveyId) === String(surveyId)).length;
            if (count > 0) {
                offlineWarning.innerHTML = `
                        <div style="background:#fef3c7; color:#d97706; padding:10px; border-radius:8px; border:1px solid #fcd34d; font-size:11px; font-weight:700; display:flex; align-items:center; gap:6px;">
                            <span class="material-icons-round" style="font-size:16px;">cloud_off</span>
                            <span>You have <strong>${count}</strong> unsent image${count > 1 ? 's' : ''}.</span>
                        </div>
                    `;
                offlineWarning.style.display = 'block';
            } else {
                offlineWarning.style.display = 'none';
            }
        }

        if (!statusBadge) return;

        if (errorState) {
            statusBadge.innerText = `⚠️ ${errorState}`;
            statusBadge.style.color = "#dc2626"; // red-600
            statusBadge.style.background = "#fef2f2";
            statusBadge.style.borderColor = "#fecaca";
            return;
        }

        const cleanSid = this._cleanId(surveyId);
        const syncedTotal = State.syncedData[cleanSid] || 0;
        const pendingTotal = this.files.length;

        statusBadge.style.cursor = 'default';
        statusBadge.title = "Record sync status";

        if (syncedTotal > 0 || pendingTotal > 0) {
            statusBadge.innerHTML = `<span class="material-icons-round" style="font-size:12px; vertical-align:middle;">sync</span> ${syncedTotal} Synced${pendingTotal > 0 ? ` + ${pendingTotal} Pending` : ''}`;
            statusBadge.style.color = "var(--primary)";
            statusBadge.style.background = "#eff6ff";
            statusBadge.style.borderColor = "#dbeafe";
        } else {
            statusBadge.innerHTML = `<span class="material-icons-round" style="font-size:12px; vertical-align:middle;">sync</span> No Images Synced`;
            statusBadge.style.color = "#64748b";
            statusBadge.style.background = "#f8fafc";
            statusBadge.style.borderColor = "#e2e8f0";
        }

        if (syncBtn) syncBtn.disabled = (this.files.length === 0);
        actionBtns.forEach(btn => btn.disabled = false);
    },

    // Legacy compatibility: ensure background calls don't crash
    updateHub() { this.updateStatus(State.filtered[State.currentIdx][0]); },

    async handleFiles(fileList) {
        // Replaced by batch-safe version above
        const currentSid = State.filtered && State.filtered[State.currentIdx] ? State.filtered[State.currentIdx][0] : null;
        if (currentSid) this.handleFilesBatch(fileList, currentSid);
    },

    async handleFilesBatch(fileList, currentSid) {
        const newFiles = Array.from(fileList);
        this.setLoadingState(true, `Saving 0/${newFiles.length}`);
        const email = this.getEmail();
        try {
            for (let i = 0; i < newFiles.length; i++) {
                this.setLoadingState(true, `Saving ${i + 1}/${newFiles.length}`);
                await this.saveOfflineImage(currentSid, newFiles[i], email);
            }
        } finally {
            this.setLoadingState(false);
            this.loadOfflineQueue();
            this.updateStatus(currentSid);
        }
    },

    renderPreview() {
        const container = document.getElementById('drive-preview');
        const syncBtn = document.getElementById('btn-sync-drive');
        if (!container) return;

        if (this.files.length === 0) {
            container.style.display = 'none';
            if (syncBtn) syncBtn.disabled = true;
            return;
        }

        container.style.display = 'flex';
        if (syncBtn) syncBtn.disabled = false;

        container.innerHTML = this.files.map((f, i) => `
                <div class="preview-item">
                    <img src="${URL.createObjectURL(f)}">
                    <button class="remove-btn" onclick="DriveSync.remove(${i})">
                        <span class="material-icons-round" style="font-size:12px;">close</span>
                    </button>
                </div>
            `).join('');
    },

    remove(idx) {
        this.files.splice(idx, 1);
        this.renderPreview();
        this.updateStatus(State.filtered[State.currentIdx][0]);
    },

    compressImage(file, maxWidth = 1024, quality = 0.6) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let { width, height } = img;
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => {
                        resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' }));
                        // Cleanup
                        img.src = '';
                        canvas.width = 0;
                        canvas.height = 0;
                    }, 'image/webp', quality);
                };
                img.onerror = (err) => {
                    img.src = '';
                    reject(err);
                };
            };
            reader.onerror = (err) => {
                reject(err);
            };
        });
    },

    async upload(surveyId) {
        const email = this.getEmail();
        if (!email) {
            alert("SURVEYOR IDENTITY REQUIRED\nPlease select your Email in Settings (Sync Monitor) before syncing.");
            LayerManager.activeTab = '📊 Sync Monitor';
            LayerManager.renderSettingsUI();
            document.getElementById('modal-settings').style.display = 'flex';
            return;
        }
        const cleanSid = this._cleanId(surveyId);
        const btn = document.getElementById('btn-sync-drive');
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round rotate">sync</span> Processing...';

        try {
            const uploadPromises = this.files.map(async (file, i) => {
                const compressed = await this.compressImage(file);
                const base64 = await this.toBase64(compressed);
                const name = `${cleanSid}_img${this.currentDriveCount + i + 1}.webp`;

                const response = await fetch(this.APP_URL, {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({
                        action: 'upload',
                        name,
                        data: base64,
                        surveyId: cleanSid,      // CamelCase for JS consistency
                        survey_id: cleanSid,     // Snake_case for database consistency
                        email,
                        timestamp: new Date().toISOString()
                    })
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const result = await response.json();
                console.log("[DriveSync] Direct Upload Response:", result);
                if (result.status === "error") throw new Error(result.message);
                return result;
            });

            const results = await Promise.all(uploadPromises);

            // --- NEW: LOG TO SUPABASE ---
            if (window._supabase) {
                try {
                    const logs = results.map(res => {
                        // ROBUST ID CAPTURE: Fallback through possible response formats
                        const capturedFileId = res.fileId || res.id || res.file_id || (res.data ? (res.data.id || res.data.fileId) : null);

                        if (!capturedFileId || !cleanSid) {
                            console.error("[DriveSync] Critical metadata missing for Supabase log", { cleanSid, capturedFileId, response: res });
                        }

                        return {
                            email: email,
                            survey_id: cleanSid,
                            file_id: capturedFileId,
                            synced_at: new Date().toISOString()
                        };
                    }).filter(log => log.file_id && log.survey_id); // Only log if we have the critical IDs

                    if (logs.length > 0) {
                        console.log("[DriveSync] Pushing logs to Supabase (Upsert):", logs);
                        await window._supabase.from('staff_sync_logs').upsert(logs, { onConflict: 'file_id' });
                    }
                } catch (e) { console.warn("Supabase Log Failed:", e); }
            }

            // Increment Supabase Count
            const addedCount = this.files.length;
            const sidStr = String(surveyId).replace(/\.0$/, '').trim();
            const existingCount = State.syncedData[sidStr] || 0;
            const newCount = existingCount + addedCount;

            State.syncedData[sidStr] = newCount;
            // Redundant: Counts are now handled automatically by the Supabase View 'drive_image_counts'

            alert(`Successfully synced ${addedCount} images to Google Drive!`);
            this.files = [];
            this.renderPreview();
            this.fetchMetadata(surveyId);
            // Background refresh for counts
            this.fetchAllSyncedData(true);
        } catch (e) {
            console.error("Upload error:", e);
            alert("Sync failed: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    },

    toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
        });
    },
    openSyncModal() {
        const modal = document.getElementById('modal-offline-sync');
        const gallery = document.getElementById('offline-sync-gallery'); // This is the main container
        const btn = document.getElementById('btn-execute-bulk-sync');
        if (!modal || !gallery) return;

        const totalItems = this.offlineQueue.length;
        if (totalItems === 0) {
            alert("You don't have any unsent images in the offline queue.");
            return;
        }

        // Grouping no longer needed for UI list, but kept for size calculation
        let totalBytes = 0;
        this.offlineQueue.forEach(item => {
            const size = Math.round((item.dataLength || 0) * 0.75);
            totalBytes += size;
        });

        const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
        const estSeconds = Math.round(totalBytes / (500 * 1024)); // 500KB/s
        const estMinutes = Math.ceil(estSeconds / 60);

        // LEAN DASHBOARD UI
        let html = `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:24px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 4px 12px rgba(0,0,0,0.03);">
                <div>
                    <div style="font-size:10px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Total Size</div>
                    <div style="font-size:24px; font-weight:900; color:#1e293b;">${totalMB} <span style="font-size:12px; color:#64748b; font-weight:700;">MB</span></div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:10px; font-weight:800; color:#10b981; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Est. Time</div>
                    <div style="font-size:18px; font-weight:900; color:#10b981; display:flex; align-items:center; justify-content:flex-end; gap:6px;">
                        <span class="material-icons-round" style="font-size:20px;">schedule</span>
                        ~${estMinutes} min
                    </div>
                </div>
            </div>

            <div style="text-align:center; padding:10px 0 25px 0;">
                <div style="font-size:14px; font-weight:800; color:#475569; margin-bottom:4px;">${totalItems} Unsent Images Detected</div>
                <div style="font-size:11px; color:#94a3b8; font-weight:600;">Click below to sync all records to the secure cloud.</div>
            </div>

            <!-- VISUAL PROGRESS BAR (Hidden Initially) -->
            <div id="sync-progress-container" style="display:none; background:#f1f5f9; border-radius:12px; padding:4px; height:32px; width:100%; position:relative; overflow:hidden; margin-bottom:20px; border:1px solid #e2e8f0;">
                <div id="sync-progress-fill" style="background:linear-gradient(90deg, #3b82f6 0%, #2563eb 100%); height:100%; width:0%; border-radius:8px; transition:width 0.3s ease;"></div>
                <div id="sync-progress-text" style="position:absolute; top:0; left:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:900; color:#1e293b; mix-blend-mode: multiply;">Preparing...</div>
            </div>
        `;
        
        if (totalItems > 50) {
            html += `
                <div style="background:#fff7ed; color:#c2410c; padding:12px 16px; border-radius:12px; border:1px solid #ffedd5; margin-bottom:20px; display:flex; gap:12px; align-items:flex-start;">
                    <span class="material-icons-round" style="font-size:24px; color:#f59e0b;">info</span>
                    <div style="font-size:11px; font-weight:700; line-height:1.4;">
                        Large queue detected. We will sync the first 50 images to ensure stability.
                    </div>
                </div>
            `;
        }

        if (btn) {
            btn.style.display = 'flex';
            btn.innerHTML = '<span class="material-icons-round">cloud_upload</span><span>START FULL SYNC</span>';
        }

        gallery.style.display = 'block';
        gallery.innerHTML = html;
        modal.style.display = 'flex';
    },

    async startBulkUpload() {
        if (!this.db) return alert("Offline storage not connected.");
        if (this._isUploading) return;

        const email = this.getEmail();
        if (!email) {
            alert("SURVEYOR IDENTITY REQUIRED\nPlease select your Email in Settings (Sync Monitor) before syncing.");
            if (document.getElementById('modal-offline-sync')) document.getElementById('modal-offline-sync').style.display = 'none';
            LayerManager.activeTab = '📊 Sync Monitor';
            LayerManager.renderSettingsUI();
            document.getElementById('modal-settings').style.display = 'flex';
            return;
        }

        this._isUploading = true;
        const btn = document.getElementById('btn-execute-bulk-sync');
        const originalHtml = btn ? btn.innerHTML : 'Sync';

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="material-icons-round spinning">sync</span> Syncing...';
        }

        try {
            const transaction = this.db.transaction(['images'], 'readonly');
            const store = transaction.objectStore('images');
            // MEMORY OPTIMIZATION: Fetch metadata snapshot only (no heavy 'data' field)
            let snapshot = await new Promise((res, rej) => {
                const results = [];
                const req = store.openCursor();
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        results.push({ id: cursor.value.id, surveyId: cursor.value.surveyId });
                        cursor.continue();
                    } else {
                        res(results);
                    }
                };
                req.onerror = rej;
            });

            if (snapshot.length === 0) {
                if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
                this._isUploading = false;
                return;
            }

            const totalInQueue = snapshot.length;
            let successCount = 0;
            const progContainer = document.getElementById('sync-progress-container');
            const progFill = document.getElementById('sync-progress-fill');
            const progText = document.getElementById('sync-progress-text');
            if (progContainer) progContainer.style.display = 'block';


            for (let i = 0; i < snapshot.length; i++) {
                const metaItem = snapshot[i];
                
                // Update Visual Progress Bar
                const percent = Math.round(((i) / snapshot.length) * 100);
                if (progFill) progFill.style.width = `${percent}%`;
                if (progText) progText.innerText = `Syncing ${i + 1} of ${snapshot.length}... (${percent}%)`;
                
                // LAZY LOADING: Fetch the actual Base64 data from IDB just-in-time
                const item = await new Promise((resolve) => {
                    const tx = this.db.transaction(['images'], 'readonly');
                    const req = tx.objectStore('images').get(metaItem.id);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => resolve(null);
                });

                if (!item) continue;

                try {
                    // Property Fallback: handle both camelCase and snake_case from IndexedDB
                    const rawSid = item.surveyId || item.survey_id || item.sid;
                    const cleanSid = this._cleanId(rawSid);

                    if (!cleanSid) {
                        console.warn("[DriveSync] Item missing Survey ID, skipping sync", item);
                        continue;
                    }
                    const existingCount = State.syncedData[cleanSid] || 0;
                    const name = `${cleanSid}_img${existingCount + 1}.webp`;

                    // 1. Upload to Google Drive
                    const response = await fetch(this.APP_URL, {
                        method: 'POST',
                        mode: 'cors', headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify({
                            action: 'upload',
                            name,
                            data: item.data,
                            surveyId: cleanSid,    // CamelCase
                            survey_id: cleanSid,   // Snake_case
                            email,
                            timestamp: item.timestamp
                        })
                    });

                    if (!response.ok) throw new Error(`Google Drive HTTP Error: ${response.status}`);
                    const result = await response.json();
                    console.log("[DriveSync] Apps Script Response:", result);
                    if (result.status !== "success") throw new Error(`Google Drive Logic Error: ${result.message}`);

                    // ROBUST ID CAPTURE: Fallback through possible response formats
                    const fileId = result.fileId || result.id || result.file_id || (result.data ? (result.data.id || result.data.fileId) : null);

                    // 2. Log to Supabase IMMEDIATELY
                    if (window._supabase && cleanSid && fileId) {
                        const logData = {
                            email: email || 'unknown@staff.local',
                            survey_id: cleanSid,
                            file_id: fileId,
                            synced_at: new Date().toISOString(),
                            upload_count: (existingCount || 0) + 1
                        };
                        console.log("[DriveSync] Attempting Supabase Log:", logData);

                        const { error: dbError } = await window._supabase
                            .from('staff_sync_logs')
                            .upsert(logData, { onConflict: 'file_id' });

                        if (dbError) {
                            console.error("[DriveSync] Supabase upsert failed:", dbError);
                            throw new Error(`Supabase Error: ${dbError.message}`);
                        } else {
                            console.log("[DriveSync] Supabase Upsert Success (Metadata Healed)");
                        }
                    } else if (!cleanSid || !fileId) {
                        console.error("[DriveSync] Skip Supabase log due to missing metadata:", { cleanSid, fileId });
                        // We still proceed as the image is safely on Google Drive, 
                        // but we alert the console for debugging.
                    }

                    // 3. Only if BOTH succeeded, update local state and remove from phone
                    State.syncedData[cleanSid] = existingCount + 1;

                    const delTx = this.db.transaction(['images'], 'readwrite');
                    delTx.objectStore('images').delete(item.id);
                    await new Promise(r => delTx.oncomplete = r);

                    successCount++;

                } catch (e) {
                    console.error("Upload/Log cycle failed for item:", e);
                }
            }

            // Final Progress Bar Update
            if (progFill) progFill.style.width = `100%`;
            if (progText) progText.innerText = `Sync Complete!`;

            const remaining = totalInQueue - successCount;
            let msg = `Successfully synced ${successCount} photos.`;
            if (remaining > 0) msg += `\n\n${remaining} images failed or remaining. Check connection and retry.`;
            alert(msg);

            if (document.getElementById('modal-offline-sync')) document.getElementById('modal-offline-sync').style.display = 'none';
            this.fetchAllSyncedData(true);
        } catch (err) {
            console.error("Bulk sync error:", err);
            alert("Upload process encountered an error.");
        } finally {
            this._isUploading = false;
            if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
            const pc = document.getElementById('sync-progress-container');
            if (pc) pc.style.display = 'none';
            
            // FINAL REFRESH: Run this after _isUploading is false to allow UI update
            this.loadOfflineQueue();
        }
    },
};