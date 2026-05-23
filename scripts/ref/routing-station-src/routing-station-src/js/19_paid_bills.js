// === 19_paid_bills.js ===
// Paid Bills

const PaidBills = {
        data: [],
        filtered: [],
        currentPage: 1,
        rowsPerPage: 10,
        activeType: 'all',
        idStatus: 'all',
        _fpStart: null,
        _fpEnd: null,

        setType(type) {
            this.activeType = (this.activeType === type) ? 'all' : type;
            this.currentPage = 1;
            this.render();
        },

        init() {
            const selector = document.getElementById('pb-city');
            const typeSelector = document.getElementById('pb-type');
            if(!selector) return;

            // 1. Clear and Populate selectors
            selector.innerHTML = '<option value="all">All Cities</option>';
            typeSelector.innerHTML = '<option value="all">All Categories</option>';

            const cities = new Set();
            const categories = new Set();
            PAID_DATA.forEach(r => {
                if(r[3] && r[3] !== '-') cities.add(r[3]);
                if(r[7] && r[7] !== '-') categories.add(r[7]);
            });
            Array.from(cities).sort().forEach(city => {
                const opt = document.createElement('option');
                opt.value = city; opt.innerText = city;
                selector.appendChild(opt);
            });
            Array.from(categories).sort().forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat; opt.innerText = cat;
                selector.appendChild(opt);
            });
            selector.value = 'all';
            typeSelector.value = 'all';

            // 2. Initialize Flatpickr
            const commonCfg = {
                dateFormat: "Y-m-d",
                onChange: () => this.render(),
                disableMobile: false
            };
            this._fpStart = flatpickr("#pb-date-start", commonCfg);
            this._fpEnd = flatpickr("#pb-date-end", commonCfg);
        },

        open() {
            if(!this._fpStart) this.init();
            
            if(!document.getElementById('pb-date-start').value) {
                const now = new Date();
                const today = now.toISOString().split('T')[0];
                this._fpStart.setDate(today);
                this._fpEnd.setDate(today);
            }

            this.currentPage = 1;
            this.render();
            ViewSwitcher.toDashboard();
        },

        render() {
            const start = document.getElementById('pb-date-start').value;
            const end = document.getElementById('pb-date-end').value;
            const city = document.getElementById('pb-city').value;
            const category = document.getElementById('pb-type').value;
            const idStatus = document.getElementById('pb-id-status')?.value || 'all';
            const tbody = document.getElementById('pb-table-body');
            
            // 1. Filter PAID_DATA
            this.filtered = PAID_DATA.filter(r => {
                const rSID = r[1];
                const rDate = r[11]; // Paid Date
                const rCity = r[3];
                const rCat = r[7];

                if (start && rDate < start) return false;
                if (end && rDate > end) return false;
                if (city !== 'all' && rCity !== city) return false;
                if (category !== 'all' && rCat !== category) return false;
                
                // ID Status Filter
                if (idStatus === 'deleted' && rSID !== 'Deleted ID') return false;
                if (idStatus === 'active' && rSID === 'Deleted ID') return false;

                // Type Quick Filters (Domestic / Commercial)
                if (this.activeType === 'domestic' && !rCat.toUpperCase().includes('DOMESTIC')) return false;
                if (this.activeType === 'commercial' && !rCat.toUpperCase().includes('COMMERCIAL')) return false;

                return true;
            });

            // 2. Filtered Stats (Reflect CURRENT results)
            let filteredAmount = 0;
            this.filtered.forEach(r => filteredAmount += parseFloat(r[12]) || 0);
            
            document.getElementById('pb-total-amount').innerText = `Rs. ${filteredAmount.toLocaleString()}`;
            document.getElementById('pb-total-count').innerText = this.filtered.length.toLocaleString();
            document.getElementById('pb-avg-amount').innerText = this.filtered.length ? `Rs. ${Math.round(filteredAmount/this.filtered.length).toLocaleString()}` : 'Rs. 0';

            // 3. Pagination Slicing
            const totalRecords = this.filtered.length;
            const totalPages = Math.ceil(totalRecords / this.rowsPerPage) || 1;
            if (this.currentPage > totalPages) this.currentPage = totalPages;
            if (this.currentPage < 1) this.currentPage = 1;

            const startIdx = (this.currentPage - 1) * this.rowsPerPage;
            const pageData = this.filtered.slice(startIdx, startIdx + parseInt(this.rowsPerPage));

            // 4. Render Table Rows
            if (pageData.length === 0) {
                tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:60px; color:#94a3b8;">
                    <span class="material-icons-round" style="font-size:48px; opacity:0.2; display:block; margin-bottom:10px;">search_off</span>
                    No records found for the selected criteria.
                    <br><small>Global Registry contains ${PAID_DATA.length} records.</small>
                </td></tr>`;
            } else {
                tbody.innerHTML = pageData.map(r => {
                    const sid = r[1];
                    const sidDisplay = sid === "Deleted ID" ? `<span class="paid-deleted-id">Deleted ID</span>` : `<span class="paid-id-link">#${sid}</span>`;
                    
                    return `
                        <tr onclick="PaidBills.jumpToRecord('${sid}')">
                            <td data-label="Sr#">${r[0]}</td>
                            <td data-label="Survey ID">${sidDisplay}</td>
                            <td data-label="PSID" style="font-family:monospace; font-weight:700; color:#475569;">${r[2]}</td>
                            <td data-label="City">${r[3]}</td>
                            <td data-label="Month">${r[4]}</td>
                            <td data-label="Office">${r[5]}</td>
                            <td data-label="Area">${r[6]}</td>
                            <td data-label="Category" style="font-size:11px; font-weight:700; color:#64748b;">${r[7]}</td>
                            <td data-label="Due Amount">Rs. ${parseFloat(r[8]).toLocaleString()}</td>
                            <td data-label="Fine">Rs. ${parseFloat(r[9]).toLocaleString()}</td>
                            <td data-label="Channel" style="font-size:11px; font-weight:700; color:#64748b;">${r[10]}</td>
                            <td data-label="Paid Date" style="font-weight:600;">${r[11]}</td>
                            <td data-label="Paid Amount" style="font-weight:800; color:#16a34a;">Rs. ${parseFloat(r[12]).toLocaleString()}</td>
                        </tr>
                    `;
                }).join('');
            }

            // 5. Update Footer
            const endIdx = Math.min(startIdx + parseInt(this.rowsPerPage), totalRecords);
            document.getElementById('pb-record-range').innerText = totalRecords ? `Showing ${startIdx + 1}-${endIdx} of ${totalRecords}` : 'Showing 0-0';
            document.getElementById('pb-page-info').innerText = `Page ${this.currentPage} of ${totalPages}`;
            document.getElementById('pb-prev').disabled = this.currentPage <= 1;
            document.getElementById('pb-next').disabled = this.currentPage >= totalPages;

            // 5.5 Update Button Visual States
            document.querySelectorAll('.dash-type-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-type') === this.activeType);
            });
            const allBtn = document.getElementById('pb-all-records-btn');
            if(allBtn) allBtn.classList.toggle('active', this.activeType === 'all');

            // 6. Sidebar Analytics (UC and Category breakdown)
            this.renderAnalyticPanels();
        },

        renderAnalyticPanels() {
            // 1. UC Breakdown (Area Distribution)
            const ucMap = {}; 
            let maxUcAmt = 1;
            this.filtered.forEach(r => {
                const uc = r[6] || 'Unassigned';
                if(!ucMap[uc]) ucMap[uc] = { amt: 0, count: 0 };
                ucMap[uc].amt += parseFloat(r[12]) || 0;
                ucMap[uc].count++;
                if(ucMap[uc].amt > maxUcAmt) maxUcAmt = ucMap[uc].amt;
            });

            const ucSorted = Object.entries(ucMap).sort((a,b) => b[1].amt - a[1].amt);
            const ucList = document.getElementById('pb-uc-summary');
            if(ucList) {
                ucList.innerHTML = ucSorted.map(([name, data], idx) => {
                    const pct = Math.round((data.amt / maxUcAmt) * 100);
                    return `
                        <div class="analytics-item-modern" style="margin-bottom: 12px; padding: 10px; border-radius: 10px; background: white; border: 1px solid #f1f5f9;">
                            <div style="display:flex; justify-content:space-between; margin-bottom: 6px;">
                                <span style="font-size: 11px; font-weight: 800; color: #1e293b;">${name}</span>
                                <span style="font-size: 10px; font-weight: 800; color: #6366f1;">Rs. ${Math.round(data.amt).toLocaleString()}</span>
                            </div>
                            <div style="height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; display: flex;">
                                <div style="width: ${pct}%; background: linear-gradient(90deg, #6366f1, #8b5cf6); height: 100%; border-radius: 3px;"></div>
                            </div>
                            <div style="font-size: 9px; color: #94a3b8; font-weight: 700; margin-top: 4px; display: flex; justify-content: space-between;">
                                <span>Recovery Rank: #${idx + 1}</span>
                                <span>${data.count} Bills</span>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            // 2. Category Breakdown
            const catMap = {};
            let maxCatAmt = 1;
            this.filtered.forEach(r => {
                const cat = r[7] || 'Other';
                if(!catMap[cat]) catMap[cat] = { amt: 0, count: 0 };
                catMap[cat].amt += parseFloat(r[12]) || 0;
                catMap[cat].count++;
                if(catMap[cat].amt > maxCatAmt) maxCatAmt = catMap[cat].amt;
            });

            const catSorted = Object.entries(catMap).sort((a,b) => b[1].amt - a[1].amt);
            const catList = document.getElementById('pb-category-summary');
            if(catList) {
                catList.innerHTML = catSorted.map(([name, data]) => {
                    const pct = Math.round((data.amt / maxCatAmt) * 100);
                    const isDomestic = name.toUpperCase().includes('DOMESTIC');
                    const barColor = isDomestic ? '#0ea5e9' : '#f59e0b';
                    return `
                        <div class="analytics-item-modern" style="margin-bottom: 10px; padding: 10px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
                                <span style="font-size: 10px; font-weight: 900; color: #475569; text-transform: uppercase;">${name}</span>
                                <span style="font-size: 10px; font-weight: 800; color: ${barColor};">Rs. ${Math.round(data.amt).toLocaleString()}</span>
                            </div>
                            <div style="height: 4px; background: white; border-radius: 2px; overflow: hidden;">
                                <div style="width: ${pct}%; background: ${barColor}; height: 100%;"></div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        },

        exportCSV() {
            if (!this.filtered.length) {
                App.showToast ? App.showToast("No data to export.") : alert("No data");
                return;
            }

            const headers = ["Sr#", "Survey ID", "PSID", "City", "Month", "Office", "Area", "Category", "Due Amount", "Fine", "Channel", "Paid Date", "Paid Amount"];
            let csvContent = headers.join(",") + "\n";

            this.filtered.forEach(r => {
                const row = r.slice(0, 13).map(cell => `"${(cell || "").toString().replace(/"/g, '""')}"`);
                csvContent += row.join(",") + "\n";
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const dateStr = new Date().toISOString().split('T')[0];
            link.setAttribute("href", URL.createObjectURL(blob));
            link.setAttribute("download", `Recovery_Report_${this.activeType}_${dateStr}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            App.showToast ? App.showToast("Recovery Report Exported! 📊") : null;
        },

        setRows(val) {
            this.rowsPerPage = parseInt(val);
            this.currentPage = 1;
            this.render();
        },

        changePage(delta) {
            this.currentPage += delta;
            this.render();
            document.querySelector('.paid-table-container').scrollTop = 0;
        },

        jumpToRecord(id) {
            if(id === "Deleted ID" || !id) {
                App.showToast ? App.showToast("Record not available.") : alert("Record missing");
                return;
            }
            // IMMEDIATE V7.3.5 FIX: FORCE HIDE STAGE
            const stage = document.getElementById('paid-dashboard-stage');
            if(stage) stage.style.display = 'none';
            
            State.originView = 'dashboard';
            ListView.jumpFromMap(id);
        },

        toggleSidebar() {
            const layout = document.getElementById('dash-layout');
            const sidebar = document.getElementById('dash-sidebar');
            layout.classList.toggle('sidebar-collapsed');
            sidebar.classList.toggle('active');
        },

        reset() {
            document.getElementById('pb-city').value = 'all';
            document.getElementById('pb-type').value = 'all';
            const statusEl = document.getElementById('pb-id-status');
            if(statusEl) statusEl.value = 'all';
            this.activeType = 'all';
            
            if(this._fpStart) this._fpStart.clear();
            if(this._fpEnd) this._fpEnd.clear();
            this.currentPage = 1;
            this.render();
        },

        close() { 
            ViewSwitcher.toMap();
            Sidebar.close();
        }
    };