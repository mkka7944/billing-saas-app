// === 02_state.js ===
// State object

const State = {
    savedRoutes: % saved_routes %,
    hideStandardTooltips: false,
    filtered: [],
    masterFiltered: [], // Tracks sidebar filters independently of active route narrowing
    availableSurveyors: [],
    surveyorFilter: [],
    markers: L.layerGroup(),
    currentIdx: 0,
    map: null,
    markerLimit: 999999,
    payColorMode: false,
    syncedData: {}, // { surveyId: latestTimestamp }
    driveOnlyFilter: false,
    originView: 'map', // Track origin for navigation (map, dashboard)
    quickFilters: { domestic: true, commercial: true },
    lastHighlightedSurveyor: null,
    history: [], // [{ filtered, idx, label }] for back navigation
    searchLocalOnly: false, // Toggle for searching within current filters
    showTooltips: false, // User Preference for boundary layers
    isMapPagerActive: false, // UI GUARD: Prevents map interactions from hiding pager
    nearbyPopupSelectedId: null,
    kmlPane: null,

    // Pinning Mode HUD Tracking
    isPinning: false,
    pinningSID: null,
    pinningOrigin: null,
    pinningViewSid: null, // Track SID for view mode return
    pinningRefMarker: null, // Reference marker at portal position
    manualPinMarker: null, // Marker at manually pinned position
    unsavedChanges: {}, // { sid: { lat, lng, street_no, sequence_no, is_right, is_delivered, isLocked } }
    pendingHouseIntel: {}, // { sid: { street_no, sequence_no, is_right, is_delivered } }
    
    // Battery Optimization: Dynamic marker limit based on device and selection
    getEffectiveMarkerLimit() {
        const isDesktop = window.innerWidth > 768;
        if (isDesktop) return this.markerLimit;

        // Mobile: Check if MC/UC is selected
        try {
            const mcs = App.getSelectedMCUC ? App.getSelectedMCUC() : [];
            if (mcs.length > 0) return Math.min(this.markerLimit, 5000); // Enforce safe cap even for areas
        } catch (e) { /* App not ready */ }

        return 1200; // Safe cap for "All Areas" on mobile
    },

    // State Persistence: Prevent view reset on mobile reloads
    save() {
        // Feature disabled for performance: do not remember last filter
    },

    load() {
        // Feature disabled for performance: do not remember last filter
        return null;
    }
};

window.KML_META = % kml_metadata %;
window.DATA_VERSION = "% data_version %";
window.DATA_CHUNKS_COUNT = % data_chunks_count %;
window.ALL_VERIFIED_DATA = []; // Initialized as empty to prevent crashes before fetch
window.__VERIFIED_CACHE_TIME = 0; // EGRESS GUARD: Track when verifications were last fetched