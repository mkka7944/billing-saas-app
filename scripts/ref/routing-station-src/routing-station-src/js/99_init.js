// === 99_init.js ===
// Final initialization and global exposure

// Expose Globals explicitly for inline event handlers and external access
window.State = State;
window.Auth = Auth;
window.handleCredentialResponse = handleCredentialResponse;
window.App = App;
window.Sidebar = Sidebar;
window.InfoCard = InfoCard;
window.Settings = Settings;
window.Gallery = Gallery;
window.DriveSync = DriveSync;
window.LayerManager = LayerManager || {};
window.ViewSwitcher = ViewSwitcher;
window.ListView = ListView;
window.PerformanceLog = PerformanceLog;
window.BillVerifier = BillVerifier;
window.PaidBills = PaidBills;
window.UniversalSearch = UniversalSearch;
window.Stats = Stats;
window.SpatialRouter = SpatialRouter;
window.MapNavigator = MapNavigator;
window.MapRotation = MapRotation;
window.UIInteractions = UIInteractions;

// Global Key Handlers
document.addEventListener('keydown', (e) => {
    // CMD+K or CTRL+K for Universal Search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        UniversalSearch.open();
    }

    if (e.key === 'Escape') {
        if (typeof UniversalSearch !== 'undefined') UniversalSearch.close();
        if (typeof PaidBills !== 'undefined') PaidBills.close();
        if (typeof BillVerifier !== 'undefined') BillVerifier.close();
        if (typeof Gallery !== 'undefined') Gallery.close();
    }

    // [ for Previous, ] for Next (Survey ID iteration)
    if (e.key === '[') {
        e.preventDefault();
        if (typeof MapNavigator !== 'undefined') MapNavigator.move(-1);
    } else if (e.key === ']') {
        e.preventDefault();
        if (typeof MapNavigator !== 'undefined') MapNavigator.move(1);
    }
});

// Main Initialization
window.onload = () => {
    // If DEV_MODE is active, loadData() already called App.init()
    if (!window.APP_INITIALIZED && window.APP_DATA_LOADED && window.App) {
        window.App.init();
        if (typeof Auth !== 'undefined') Auth.updateUI();
    }

    // Ensure SpatialRouter is initialized last
    if (window.SpatialRouter && typeof SpatialRouter.init === 'function') {
        if (!window.SpatialRouter.initialized) SpatialRouter.init();
    }

    // Initialize Overlay Interactions
    const overlay = document.getElementById('routing-station-overlay');
    const handle = document.getElementById('routing-drag-handle');
    const resize = document.getElementById('routing-resize-handle');

    // FORCE HIDE: Ensure routing overlay is hidden on initial load - do this FIRST before anything else
    if (overlay) {
        overlay.style.display = 'none';
        overlay.classList.remove('active');
        console.log('[INIT] Routing overlay forced to hidden');
    }

    if (overlay && handle && window.UIInteractions && typeof UIInteractions.setupDraggable === 'function') {
        UIInteractions.setupDraggable(overlay, handle);
    }
    if (overlay && resize && window.UIInteractions && typeof UIInteractions.setupResizable === 'function') {
        UIInteractions.setupResizable(overlay, resize);
    }

    // Prevent Accidental Exit
    window.addEventListener('beforeunload', (e) => {
        e.preventDefault();
        e.returnValue = ''; // Standard requirement for modern browsers
    });

    // Handle Mobile Back Button (Push a dummy state to history)
    window.history.pushState({ page: 1 }, "", "");
    window.onpopstate = function (event) {
        if (confirm("Exit App? Unsaved progress (like selected filters) will be lost.")) {
            window.history.back();
        } else {
            window.history.pushState({ page: 1 }, "", "");
        }
    };
};
