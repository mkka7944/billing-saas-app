// === 15_info_card.js ===
// InfoCard

const InfoCard = {
        init() {
            if(typeof RAW_DATA === 'undefined') return;
            
            // 1. Calculate Stats
            const total = RAW_DATA.length;
            const byTehsil = {};
            
            RAW_DATA.forEach(r => {
                const tehsil = r[11]; // Tehsil Name
                const type = r[3];    // 1=Com, 0=Dom
                
                if(!byTehsil[tehsil]) byTehsil[tehsil] = { t:0, d:0, c:0 };
                byTehsil[tehsil].t++;
                if(type === 1) byTehsil[tehsil].c++;
                else byTehsil[tehsil].d++;
            });
            
            // 2. Build HTML
            const isMin = document.getElementById('info-card').classList.contains('minimized');
            const toggleIcon = isMin ? 'expand_more' : 'expand_less';
            const headerStyle = isMin 
                ? 'display:flex; justify-content:space-between; align-items:center;' 
                : 'padding-bottom:12px; border-bottom:1px solid #f1f5f9; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;';

            let html = `
                <div style="${headerStyle}">
                    <div>
                        <div style="font-size:10px; color:#64748b; font-weight:800; letter-spacing:1px; text-transform:uppercase; margin-bottom:4px;">${isMin ? '' : 'Total Surveys'}</div>
                        <div style="font-size:24px; font-weight:800; color:var(--primary); line-height:1;">${total.toLocaleString()}</div>
                    </div>
                    <button onclick="InfoCard.toggle()" style="background:none; border:none; cursor:pointer; color:#94a3b8; padding:4px;">
                        <span class="material-icons-round">${toggleIcon}</span>
                    </button>
                </div>
                <div id="info-content" style="flex:1; overflow-y:auto; padding-right:4px; display:${isMin ? 'none' : 'block'}">
            `;
            
            // Sort Tehsils by count
            const sorted = Object.entries(byTehsil).sort((a,b) => b[1].t - a[1].t);
            
            sorted.forEach(([name, data]) => {
                html += `
                    <div class="info-stat-row">
                        <div class="info-label">${name}</div>
                        <div class="info-val">
                           <span class="pill dom" title="Domestic">Dom: ${data.d}</span>
                           <span class="pill com" title="Commercial">Com: ${data.c}</span>
                           <span style="min-width:30px; text-align:right;">${data.t}</span>
                        </div>
                    </div>
                `;
            });
            
            html += `</div>`;
            document.getElementById('info-card').innerHTML = html;
        },
        
        toggle() {
            const card = document.getElementById('info-card');
            card.classList.toggle('minimized');
            this.init(); // Re-render to update icon/content
        }
    };