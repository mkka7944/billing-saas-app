// === 05_view_switcher.js ===
// ViewSwitcher

const ViewSwitcher = {
        toList(resetIdx = false) {
            try {
                if(window.SpatialRouter && window.SpatialRouter.closeMarkerCard) {
                    SpatialRouter.closeMarkerCard();
                }
                
                // Ensure list view is refreshed with potentially new filters
                if(window.SpatialRouter && SpatialRouter._sidebarDisplayIdx !== null) {
                    SpatialRouter.renderDisplayLayer(); // This will sync State.filtered
                }

                document.getElementById('main-stage').classList.add('hide-map-ui');
                document.getElementById('list-view-stage').classList.add('active');
                const stage = document.getElementById('paid-dashboard-stage');
                if(stage) stage.style.display = 'none';
                
                // If we didn't come from dashboard, it's a map origin
                if(State.originView !== 'dashboard') State.originView = 'map';

                if(resetIdx) State.currentIdx = 0;
                ListView.render();
                document.getElementById('map').style.visibility = 'hidden';
                
                setTimeout(() => {
                    if(State.map) State.map.invalidateSize();
                }, 50);
            } catch(e) { console.error("ViewSwitcher.toList failed:", e); }
        },
        toMap() {
            document.getElementById('main-stage').classList.remove('hide-map-ui');
            document.getElementById('list-view-stage').classList.remove('active');
            document.getElementById('paid-dashboard-stage').style.display = 'none';
            document.getElementById('map').style.visibility = 'visible';
            State.originView = 'map'; 
            
            // Immediate resize for responsive layout
            if(State.map) State.map.invalidateSize();

            // Delayed resize to ensure transitions are finished
            setTimeout(() => {
                if(State.map) State.map.invalidateSize();
            }, 350);
        },
        toDashboard() {
            document.getElementById('main-stage').classList.add('hide-map-ui');
            document.getElementById('paid-dashboard-stage').style.display = 'flex';
            document.getElementById('list-view-stage').classList.remove('active');
            document.getElementById('map').style.visibility = 'hidden';
            State.originView = 'dashboard';
            
            // Only auto-close sidebar on mobile
            if(window.innerWidth <= 768) Sidebar.close();
        },
        exit() {
            // Aggressive exit: Clear history and go home
            State.history = []; // Wipe history
            this.back(); // Use back logic which now defaults to map/dashboard
        },
        back() {
            // Priority 1: Check History Stack (Multi-level back)
            if (State.history && State.history.length > 0) {
                const prev = State.history.pop();
                // FALLBACK: If filtered is null (optimized), restore from masterFiltered
                State.filtered = prev.filtered || [...State.masterFiltered];
                State.currentIdx = prev.idx;
                
                // Clear search box on back
                const input = document.getElementById('lv-search-id');
                if(input) {
                    input.value = '';
                    ListView.toggleClearBtn ? ListView.toggleClearBtn('') : (document.getElementById('lv-search-clear').style.display = 'none');
                }

                // Restore Label
                const statLabel = document.getElementById('stat-label');
                if(statLabel && prev.label) statLabel.innerHTML = prev.label;
                else if(statLabel && State.history.length === 0) statLabel.innerText = "Live Survey Data";

                App.render(); 
                if(window.MapNavigator) MapNavigator.updateUI();
                return;
            }

            // Priority 2: Origin Fallback
            if(State.originView === 'dashboard') {
                this.toDashboard();
            } else {
                this.toMap();
            }
        }
    };