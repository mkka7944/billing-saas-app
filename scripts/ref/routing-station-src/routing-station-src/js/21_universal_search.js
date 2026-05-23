// === 21_universal_search.js ===
// Universal Search

const UniversalSearch = {
        _timeout: null,
        _initDone: false,
        _tehsils: [],
        _mcucs: [],
        _surveyors: [],
        
        init(force = false) {
            if(this._initDone && !force) return;
            if(typeof RAW_DATA === 'undefined' || !RAW_DATA.length) return;
            
            this._tehsils = [...new Set(RAW_DATA.map(r => r[11]))].filter(x => x).sort();
            this._mcucs = [...new Set(RAW_DATA.map(r => r[12]))].filter(x => x).sort();
            this._surveyors = [...new Set(RAW_DATA.map(r => r[6]))].filter(x => x).sort();
            
            this.renderCustomSelects();
            this._initDone = true;
        },
        renderCustomSelects() {
            PremiumSelect.init('search-tehsil', this._tehsils, 'All Tehsils', (v) => this.onTehsilChange(v));
            PremiumSelect.init('search-mcuc', this._mcucs, 'All Areas', () => this.performSearch(document.getElementById('universal-search-input').value));
            PremiumSelect.init('search-surveyor', this._surveyors, 'All Surveyors', () => this.performSearch(document.getElementById('universal-search-input').value));
        },
        onTehsilChange(tehsil) {
            if (tehsil === 'all') {
                PremiumSelect.init('search-mcuc', this._mcucs, 'All Areas', () => this.performSearch(document.getElementById('universal-search-input').value));
            } else {
                const filteredMCs = [...new Set(RAW_DATA.filter(r => r[11] === tehsil).map(r => r[12]))].sort();
                PremiumSelect.init('search-mcuc', filteredMCs, `Areas in ${tehsil}`, () => this.performSearch(document.getElementById('universal-search-input').value));
            }
            this.performSearch(document.getElementById('universal-search-input').value);
        },
        open() {
            // First: hide any open marker card + pager before showing search
            App.hideCardsOnMapClick();
            
            const modal = document.getElementById('modal-search');
            modal.style.display = 'flex';
            const input = document.getElementById('universal-search-input');
            if(!this._initDone) this.init();
            input.value = '';
            input.focus();
            this.renderResults([]);
        },
        close() {
            document.getElementById('modal-search').style.display = 'none';
        },
        handleInput(val) {
            if(this._timeout) clearTimeout(this._timeout);
            this._timeout = setTimeout(() => this.performSearch(val), 200);
        },
        performSearch(query) {
            const q = query.trim().toLowerCase();
            const tehsilSub = PremiumSelect.getValue('search-tehsil');
            const mcucSub = PremiumSelect.getValue('search-mcuc');
            const surveyorSub = PremiumSelect.getValue('search-surveyor');

            if(!q && tehsilSub === 'all' && mcucSub === 'all' && surveyorSub === 'all') {
                this.renderResults([]);
                return;
            }
            
            const selectedCats = Array.from(document.querySelectorAll('.search-cat:checked')).map(cb => cb.getAttribute('data-field'));
            const isGlobal = selectedCats.length === 0;

            const dataSource = State.searchLocalOnly ? State.filtered : RAW_DATA;

            // PERFORMANCE: Use PRE-CALCULATED _search string for massive speedup
            const results = [];
            for (let i = 0; i < dataSource.length; i++) {
                const r = dataSource[i];
                
                // Region filters in the modal are additional constraints
                if (tehsilSub !== 'all' && r[11] !== tehsilSub) continue;
                if (mcucSub !== 'all' && r[12] !== mcucSub) continue;
                if (surveyorSub !== 'all' && r[6] !== surveyorSub) continue;

                if (q) {
                    if (isGlobal) {
                        if (!r._search.includes(q)) continue;
                    } else {
                        let match = false;
                        if (selectedCats.includes('id') && String(r[0]).toLowerCase().includes(q)) match = true;
                        if (!match && selectedCats.includes('psid') && String(r[15]).toLowerCase().includes(q)) match = true;
                        if (!match && selectedCats.includes('name') && String(r[4]).toLowerCase().includes(q)) match = true;
                        if (!match && selectedCats.includes('addr') && String(r[5]).toLowerCase().includes(q)) match = true;
                        if (!match && selectedCats.includes('surveyor') && String(r[6]).toLowerCase().includes(q)) match = true;
                        if (!match && selectedCats.includes('mcuc') && String(r[12]).toLowerCase().includes(q)) match = true;
                        if (!match) continue;
                    }
                }
                
                results.push(r);
                if (results.length >= 100) break; // DOM safety limit
            }

            this.renderResults(results);
        },
        renderResults(results) {
            const container = document.getElementById('search-results-list');
            document.getElementById('search-count').innerText = `${results.length} RECORDS FOUND`;
            
            if(results.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center; padding:40px; color:#94a3b8;">
                        <span class="material-icons-round" style="font-size:48px; opacity:0.3; margin-bottom:8px;">search_off</span>
                        <div>No matching records found.</div>
                    </div>
                `;
                return;
            }

            container.innerHTML = results.map(r => `
                <div class="search-item" onclick="UniversalSearch.jump('${r[0]}', 'list')">
                    <div class="search-item-main" style="flex:1; min-width:0;">
                        <div class="search-item-title">#${r[0]} | ${decodePII(r[4])}</div>
                        <div class="search-item-sub">${decodePII(r[15])} | ${decodePII(r[5])}</div>
                        <span class="search-item-meta">${r[11]} - ${r[12]}</span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px; align-items:flex-end; flex-shrink:0;">
                         <div style="display:flex; gap:6px;">
                            <button class="float-btn" onclick="event.stopPropagation(); UniversalSearch.jump('${r[0]}', 'map')" title="Marker" style="width:75px; height:32px; border-radius:10px; background:#eff6ff; color:#2563eb; border:1.5px solid #dbeafe; display:flex; gap:6px; font-size:10px; font-weight:800; align-items:center; justify-content:center;">
                                <span class="material-icons-round" style="font-size:16px;">place</span> MARKER
                            </button>
                            <button class="float-btn" onclick="event.stopPropagation(); UniversalSearch.jump('${r[0]}', 'list')" title="List" style="width:65px; height:32px; border-radius:10px; background:#f0fdf4; color:#16a34a; border:1.5px solid #dcfce7; display:flex; gap:6px; font-size:10px; font-weight:800; align-items:center; justify-content:center;">
                                <span class="material-icons-round" style="font-size:16px;">list_alt</span> LIST
                            </button>
                         </div>
                         <div class="search-badge">${r[6]}</div>
                    </div>
                </div>
            `).join('');
        },
        jump(id, mode) {
            this.close();
            // Synchronize context
            const idx = State.filtered.findIndex(r => r[0].toString() === id.toString());
            if (idx !== -1) {
                State.currentIdx = idx;
                if(window.MapNavigator) MapNavigator.updateUI();
            }

            if (mode === 'map') {
                App._markerHit = true; // Keep toolbar collapsed when going to map
                ListView.showOnMap(id);
            } else {
                ListView.jumpFromMap(id);
            }
        }
    };



    // Expose Globals explicitly for inline event handlers and external access (Moved to bottom)