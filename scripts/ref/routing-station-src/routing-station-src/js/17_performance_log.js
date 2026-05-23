// === 17_performance_log.js ===
// Performance Log

const PerformanceLog = {
    customStartDate: null,
    customEndDate: null,
    rules: {
        target: 100,
        pm: 30,
        idle: 3,
        idleGap: 30
    },
    filters: {
        dist: '',
        tehsil: '',
        mc: ''
    },

    updateDate(val, type) {
        if (type === 'start') this.customStartDate = val;
        if (type === 'end') this.customEndDate = val;
        this.open();
    },

    updateRule(key, val) {
        this.rules[key] = parseInt(val) || 0;
        this.open();
    },

    updateFilter(key, val) {
        this.filters[key] = val;
        // Reset sub-filters if parent changes
        if (key === 'dist') { this.filters.tehsil = ''; this.filters.mc = ''; }
        if (key === 'tehsil') { this.filters.mc = ''; }
        this.open();
    },
        
    open() {
        // 1. Setup Dates
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        if (!this.customStartDate) {
            const firstOfDoc = RAW_DATA.length > 0 ? RAW_DATA[0][7] : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            this.customStartDate = firstOfDoc;
        }
        if (!this.customEndDate) this.customEndDate = todayStr;

        // Update inputs
        const startInput = document.getElementById('att-start-date');
        if (startInput) startInput.value = this.customStartDate;
        const endInput = document.getElementById('att-end-date');
        if (endInput) endInput.value = this.customEndDate;

        // Update Rule inputs
        if (document.getElementById('rule-target')) document.getElementById('rule-target').value = this.rules.target;
        if (document.getElementById('rule-pm')) document.getElementById('rule-pm').value = this.rules.pm;
        if (document.getElementById('rule-idle')) document.getElementById('rule-idle').value = this.rules.idle;

        // 2. Populate and Sync Geo Filters
        this._syncGeoFilters();

        const startStr = this.customStartDate;
        const endStr = this.customEndDate;
            
            // 3. Aggregate Data by Staff -> Date
            const staffData = {};
            
        RAW_DATA.forEach(r => {
            const staff = r[6], d = r[7];
            if (d < startStr || d > endStr) return;

            // Geographic Filters
            if (this.filters.dist && r[10] !== this.filters.dist) return;
            if (this.filters.tehsil && r[11] !== this.filters.tehsil) return;
            if (this.filters.mc && r[12] !== this.filters.mc) return;
                
                if(!staffData[staff]) staffData[staff] = {};
                if(!staffData[staff][d]) staffData[staff][d] = [];
                staffData[staff][d].push(r);
            });

            // 3. Process Monthly Stats per Staff
            const summary = [];
            
            Object.keys(staffData).forEach(name => {
                const dates = Object.keys(staffData[name]).sort();
                let daysActive = dates.length;
                let targetMet = 0;
                let pmMet = 0;
                let workflowMet = 0;
                let absents = 0;
                
                dates.forEach(d => {
                    const recs = staffData[name][d].sort((a, b) => a[8].localeCompare(b[8]));
                    const total = recs.length;

                    const pmCount = recs.filter(r => r[8] >= "14:00:00" && r[8] <= "16:55:00").length;

                    let idleCount = 0;
                    const winStart = "10:00:00", winEnd = "16:55:00";
                    for (let i = 1; i < recs.length; i++) {
                        const t1 = recs[i - 1][8], t2 = recs[i][8];
                        if (t1 < winStart || t1 > winEnd) continue;

                        const d1 = new Date(`2000-01-01T${t1}`), d2 = new Date(`2000-01-01T${t2}`);
                        let diff = (d2 - d1) / 60000;

                        const lS = new Date(`2000-01-01T13:00:00`), lE = new Date(`2000-01-01T14:00:00`);
                        const oS = new Date(Math.max(d1, lS)), oE = new Date(Math.min(d2, lE));
                        if (oE > oS) diff -= (oE - oS) / 60000;

                        if (diff > this.rules.idleGap) idleCount++;
                    }

                    const ruleTarget = total >= this.rules.target;
                    const rulePM = pmCount >= this.rules.pm;
                    const ruleIdle = idleCount <= this.rules.idle;

                    if (ruleTarget) targetMet++;
                    if (rulePM) pmMet++;
                    if (ruleIdle) workflowMet++;

                    if (!ruleTarget && !rulePM && !ruleIdle) absents++;
                });
                
                summary.push({ name, daysActive, targetMet, pmMet, workflowMet, absents });
            });
            
            // Sort by Absents (desc) then Name
            summary.sort((a,b) => b.absents - a.absents || a.name.localeCompare(b.name));

            // 4. Render HTML
        if (document.getElementById('log-subtitle')) {
            document.getElementById('log-subtitle').innerText = `${startStr} to ${endStr}`;
        }

        let html = `
            <style>
                .perf-table th { font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; }
                .perf-table td { font-size: 13px; color: #334155; }
                .rule-guide { background:#fefce8; border:1px solid #fef08a; padding:12px 16px; border-radius:12px; margin: 0 16px 16px 16px; display:flex; gap:20px; align-items:center; }
                .rule-item { display:flex; align-items:center; gap:8px; font-size:11px; font-weight:700; color:#854d0e; }
                .rule-dot { width:6px; height:6px; background:#eab308; border-radius:50%; }
                @media (max-width: 600px) {
                    .hide-perf-mobile { display: none !important; }
                    .perf-table th, .perf-table td { padding: 8px 6px !important; font-size: 10px !important; }
                    .abs-text { font-size: 12px !important; }
                    .rule-guide { flex-direction:column; align-items:flex-start; gap:6px; margin: 10px; padding:10px; }
                    .perf-modal-header { flex-direction: row !important; align-items: center !important; justify-content: space-between !important; padding: 8px 10px !important; gap: 4px !important; flex-wrap: wrap !important; }
                    .perf-header-title { order: 1 !important; flex: 1 1 auto !important; max-width: calc(100% - 40px) !important; }
                    .perf-close-btn { order: 2 !important; flex: 0 0 34px !important; background: #fee2e2 !important; color: #ef4444 !important; border-radius: 50% !important; width: 34px !important; height: 34px !important; display: flex !important; align-items: center !important; justify-content: center !important; margin: 0 !important; }
                    .perf-controls { order: 3 !important; flex: 1 0 100% !important; justify-content: center !important; gap: 4px !important; margin-top: 6px !important; }
                    .date-range-box { width: 100% !important; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0 4px !important; display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 0 !important; box-sizing: border-box !important; }
                    .date-range-box input { width: 44% !important; font-size: 11px !important; padding: 6px 0 !important; border: none !important; background: transparent !important; color: #1e293b !important; font-weight: 800 !important; }
                    .date-range-box span { font-size: 10px !important; white-space: nowrap !important; color: #94a3b8 !important; }
                    .date-range-box div { width: 1px !important; height: 16px !important; background: #e2e8f0 !important; margin: 0 2px !important; }
                }
            </style>
            
            <div class="rule-guide">
                <div class="rule-item"><div class="rule-dot"></div> Target: Scan >= ${this.rules.target} total surveys.</div>
                <div class="rule-item"><div class="rule-dot"></div> PM Rule: Scan >= ${this.rules.pm} between 02:00 PM - 04:55 PM.</div>
                <div class="rule-item"><div class="rule-dot"></div> Workflow: Have <= ${this.rules.idle} idle gaps (>30m).</div>
                <div style="font-size:10px; color:#a16207; margin-left:auto; font-weight:600;">* Absence = Fails all 3 rules.</div>
            </div>

            <table class="perf-table" style="width:100%; border-collapse:collapse;">
            <thead style="background:#f8fafc; position:sticky; top:0; z-index:20; border-bottom: 2px solid #e2e8f0;">
                <tr>
                    <th style="padding:16px; text-align:left;">Staff Name</th>
                    <th style="padding:16px; text-align:center;">Days</th>
                    <th style="padding:16px; text-align:center;" class="hide-perf-mobile">Target (${this.rules.target})</th>
                    <th style="padding:16px; text-align:center;" class="hide-perf-mobile">PM (>=${this.rules.pm})</th>
                    <th style="padding:16px; text-align:center;" class="hide-perf-mobile">Idle (<=${this.rules.idle})</th>
                    <th style="padding:16px; text-align:center;">Absents</th>
                </tr>
            </thead>
            <tbody>`;

        summary.forEach(r => {
            const absDisplay = r.absents > 0
                ? `<span class="abs-text" style="color:#ef4444; font-weight:800; font-size:14px;">-${r.absents}</span>`
                : '<span style="color:#cbd5e1">-</span>';

            html += `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding:14px 16px; font-weight:700;">${r.name}</td>
                    <td style="padding:14px 16px; text-align:center; font-weight:600; color:#64748b;">${r.daysActive}</td>
                    <td style="padding:14px 16px; text-align:center;" class="hide-perf-mobile">
                        <span style="color:${r.targetMet === r.daysActive ? '#6366f1' : 'inherit'}">${r.targetMet}</span>
                    </td>
                    <td style="padding:14px 16px; text-align:center;" class="hide-perf-mobile">
                        <span style="color:${r.pmMet === r.daysActive ? '#6366f1' : 'inherit'}">${r.pmMet}</span>
                    </td>
                    <td style="padding:14px 16px; text-align:center;" class="hide-perf-mobile">
                        <span style="color:${r.workflowMet === r.daysActive ? '#6366f1' : 'inherit'}">${r.workflowMet}</span>
                    </td>
                    <td style="padding:14px 16px; text-align:center;">${absDisplay}</td>
                </tr>`;
        });

        html += `</tbody></table>`;
        document.getElementById('log-body').innerHTML = html;
        document.getElementById('modal-log').style.display = 'flex';
        this.cacheSummary = summary;
    },

    exportCSV() {
        if (!this.cacheSummary) return;
        let headerRow = ["Staff Name", "Days Active", `Target Met (>=${this.rules.target})`, `PM Met (>=${this.rules.pm})`, `Workflow Met (Idle<=${this.rules.idle})`, "Total Absents"];
        if (this.filters.dist || this.filters.tehsil || this.filters.mc) {
            headerRow.push("Filter Applied: " + [this.filters.dist, this.filters.tehsil, this.filters.mc].filter(Boolean).join(" > "));
        }
        const rows = [headerRow];
        
        this.cacheSummary.forEach(r => {
            rows.push([r.name, r.daysActive, r.targetMet, r.pmMet, r.workflowMet, r.absents]);
        });
        
        const filename = `Performance_Summary_${this.customStartDate}_to_${this.customEndDate}.csv`;
        const csvContent = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    _syncGeoFilters() {
        const dists = new Set(), tehsils = new Set(), mcs = new Set();
        RAW_DATA.forEach(r => {
            if (r[10]) dists.add(r[10]);
            if (this.filters.dist && r[10] === this.filters.dist) {
                if (r[11]) tehsils.add(r[11]);
                if (this.filters.tehsil && r[11] === this.filters.tehsil) {
                    if (r[12]) mcs.add(r[12]);
                }
            }
        });

        this._fillSelect('perf-filter-dist', Array.from(dists).sort(), this.filters.dist, 'All Districts');
        this._fillSelect('perf-filter-tehsil', Array.from(tehsils).sort(), this.filters.tehsil, 'All Tehsils');
        this._fillSelect('perf-filter-mc', Array.from(mcs).sort(), this.filters.mc, 'All MC/UCs');
    },

    _fillSelect(id, list, current, defaultText) {
        const el = document.getElementById(id);
        if (!el) return;
        let h = `<option value="">${defaultText}</option>`;
        list.forEach(v => { h += `<option value="${v}" ${v === current ? 'selected' : ''}>${v}</option>`; });
        el.innerHTML = h;
    },

    toggleRules() {
        const panel = document.getElementById('perf-rules-panel');
        if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    },

    close() { document.getElementById('modal-log').style.display = 'none'; }
};