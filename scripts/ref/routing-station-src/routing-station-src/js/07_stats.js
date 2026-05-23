// === 07_stats.js ===
// Stats modal

const Stats = {
    open() {
        const dataByName = {};
        State.filtered.forEach(r => {
            const name = r[6];
            if (!dataByName[name]) dataByName[name] = [];
            dataByName[name].push(r);
        });

        // Sort staff by count
        const sorted = Object.entries(dataByName).sort((a, b) => b[1].length - a[1].length);

        // Dynamic Heading
        const dists = App.getSelected('f-dist').join(', ') || 'All';
        const tehsils = App.getSelected('f-tehsil').join(', ') || 'All';
        document.getElementById('stats-title').innerHTML = `Leaderboard <span class="stats-subtext" style="font-size:0.75em; color:#64748b; font-weight:500; margin-left:12px;">${dists} (${tehsils}) &bull; Total: ${State.filtered.length}</span>`;

        let html = `
                <style>
                    .stats-table-container table { width:100%; border-collapse:collapse; font-size:13px; min-width:300px; }
                    .stats-table-container th { padding:10px 8px; position:sticky; top:0; background:#f8fafc; z-index:10; border-bottom: 2px solid #cbd5e1; font-weight:700; color:#334155; }
                    .stats-table-container td { padding:10px 8px; border-bottom: 1px solid #e2e8f0; vertical-align:middle; }
                    .stats-table-container th, .stats-table-container td { border-right: 1px solid #cbd5e1; }
                    .stats-table-container th:last-child, .stats-table-container td:last-child { border-right: none; }
                    
                    .trophy { margin-left:2px; font-size:14px; }
                    .staff-name { font-weight:700; font-size:13px; color:#1e293b; }
                    .count-badge { padding:3px 8px; border-radius:12px; background:#eff6ff; color:#2563eb; font-weight:700; font-size:12px; display:inline-block; border: 1px solid #bfdbfe; }
                    
                    #stats-title { font-size: 20px !important; }

                    @media (max-width: 500px) {
                        .hide-mobile { display: none !important; }
                        .stats-table-container th, .stats-table-container td { padding: 8px 4px; border-right-width: 0.5px; }
                        .stats-table-container table { font-size: 10px; }
                        .staff-name { font-size: 10px; }
                        .trophy { display: none !important; }
                        .count-badge { font-size: 9px; padding: 1px 4px; }
                        #stats-title { font-size: 14px !important; }
                        .stats-subtext { display: block; margin-left: 0 !important; margin-top: 4px; font-size: 10px; }
                    }
                </style>
                <table style="width:100%; border-collapse:collapse;">
                <thead style="background:#f8fafc; position:sticky; top:0; z-index:10;">
                    <tr>
                        <th style="text-align:center; width: 30px;">#</th>
                        <th style="text-align:left;">Staff</th>
                        <th style="text-align:center;">Total Survey</th>
                        <th style="text-align:center;" class="hide-mobile">Stopped</th>
                        <th style="text-align:center;" class="hide-mobile">Late</th>
                        <th style="text-align:center;">First / Last</th>
                        <th style="text-align:center;">Status</th>
                    </tr>
                </thead>
                <tbody>`;

        const formatTime12h = (time24) => {
            if (!time24) return '';
            const parts = time24.split(':');
            if (parts.length < 2) return time24;
            let h = parseInt(parts[0], 10);
            const m = parts[1];
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12;
            h = h ? h : 12;
            return `${h}:${m} ${ampm}`;
        };

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        sorted.forEach(([name, records], i) => {
            const sortedRecs = records.slice().sort((a, b) => a[8].localeCompare(b[8]));
            const firstRaw = sortedRecs[0][8];
            const lastRaw = sortedRecs[sortedRecs.length - 1][8];
            const firstFormat = formatTime12h(firstRaw);
            const lastFormat = formatTime12h(lastRaw);

            let stopped = 0, late = 0;

            for (let j = 1; j < sortedRecs.length; j++) {
                const t1 = sortedRecs[j - 1][8];
                const t2 = sortedRecs[j][8];

                const d1 = new Date(`2000-01-01T${t1}`);
                const d2 = new Date(`2000-01-01T${t2}`);
                const diff = (d2 - d1) / 60000;

                if (diff > 60) stopped++;
                else if (diff > 30) late++;
            }

            // Check active status vs current real time
            const lastScanDate = new Date(`${todayStr}T${lastRaw}`);
            const minsSinceLastScan = (now - lastScanDate) / 60000;

            let statusMsg = '<span class="status-msg status-ok">Working</span>';
            if (minsSinceLastScan > 45 || isNaN(minsSinceLastScan)) {
                statusMsg = '<span class="status-msg" style="background:#f1f5f9; color:#64748b;">Finished</span>';
            }

            if (stopped > 0) {
                statusMsg += `<div style="font-size:9px; color:#ef4444; margin-top:2px;">${stopped} Stopped</div>`;
            }

            let trophy = "";
            if (i === 0) trophy = `<span class="trophy gold">🏆</span>`;
            else if (i === 1) trophy = `<span class="trophy silver">🥈</span>`;
            else if (i < 5) trophy = `<span class="trophy bronze">🥉</span>`;

            const countClass = records.length > 100 ? 'count-high' : '';
            const idleClass = stopped > 0 ? 'idle-danger' : (late > 0 ? 'idle-warn' : '');

            html += `<tr class="rank-row" style="${i === 0 ? 'height: 60px;' : ''}">
                    <td style="text-align:center; font-weight:bold; color:#64748b; white-space:nowrap;">
                        ${i + 1} ${trophy}
                    </td>
                    <td>
                        <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                            <span class="staff-name">${name}</span>
                        </div>
                    </td>
                    <td style="text-align:center;">
                        <span class="count-badge ${countClass}">${records.length}</span>
                    </td>
                    <td style="text-align:center;" class="hide-mobile ${stopped > 0 ? 'idle-danger' : ''}">${stopped}</td>
                    <td style="text-align:center;" class="hide-mobile ${late > 0 ? 'idle-warn' : ''}">${late}</td>
                    <td style="text-align:center; font-size:11px; color:#475569; white-space:nowrap;">
                        <b>${firstFormat}</b><br><span>${lastFormat}</span>
                    </td>
                    <td style="text-align:center; display:flex; flex-direction:column; align-items:center;">${statusMsg}</td>
                </tr>`;
        });

        html += `</tbody></table>`;
        document.getElementById('stats-body').innerHTML = html;
        document.getElementById('modal-stats').style.display = 'flex';
    },

    exportSummary() {
        const dataByName = {};
        State.filtered.forEach(r => {
            const name = r[6];
            if (!dataByName[name]) dataByName[name] = [];
            dataByName[name].push(r);
        });

        const sorted = Object.entries(dataByName).sort((a, b) => b[1].length - a[1].length);
        const rows = [["#", "Staff Name", "Total Surveys", "Stopped (>60m)", "Late (30-60m)", "First Scan", "Last Scan"]];

        sorted.forEach(([name, records], i) => {
            const sortedRecs = records.slice().sort((a, b) => a[8].localeCompare(b[8]));
            const first = sortedRecs[0][8];
            const last = sortedRecs[sortedRecs.length - 1][8];
            let stopped = 0, late = 0;

            for (let j = 1; j < sortedRecs.length; j++) {
                const diff = (new Date(`2000-01-01T${sortedRecs[j][8]}`) - new Date(`2000-01-01T${sortedRecs[j-1][8]}`)) / 60000;
                if (diff > 60) stopped++;
                else if (diff > 30) late++;
            }
            rows.push([i + 1, name, records.length, stopped, late, first, last]);
        });

        this._downloadCSV(rows, `Leaderboard_Summary_${new Date().toISOString().split('T')[0]}.csv`);
    },

    exportDetailed() {
        const headers = ["#", "Surveyor", "Survey ID", "Tehsil", "MC/UC", "Category", "Consumer Name", "Address", "Date", "Time", "Status"];
        const rows = [headers];

        const dataByName = {};
        State.filtered.forEach(r => {
            const name = r[6];
            if (!dataByName[name]) dataByName[name] = [];
            dataByName[name].push(r);
        });

        const sortedNames = Object.keys(dataByName).sort();
        let globalIdx = 1;

        sortedNames.forEach(name => {
            const records = dataByName[name].sort((a, b) => a[8].localeCompare(b[8]));
            records.forEach(r => {
                rows.push([
                    globalIdx++, 
                    name, 
                    r[0], 
                    r[11], 
                    r[12], 
                    r[3] === 1 ? 'Commercial' : 'Domestic',
                    typeof decodePII !== 'undefined' ? decodePII(r[4]) : r[4],
                    typeof decodePII !== 'undefined' ? decodePII(r[5]) : r[5],
                    r[7], 
                    r[8], 
                    r[16]
                ]);
            });
        });

        this._downloadCSV(rows, `Leaderboard_Detailed_${new Date().toISOString().split('T')[0]}.csv`);
    },

    _downloadCSV(rows, filename) {
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

    close() { document.getElementById('modal-stats').style.display = 'none'; }
};