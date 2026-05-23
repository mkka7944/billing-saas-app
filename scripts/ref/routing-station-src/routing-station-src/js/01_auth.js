// === 01_auth.js ===
// Authentication & Initialization Logic

// Global Data Placeholders
window.RAW_DATA = [];
window.DATA_CHUNKS_COUNT = (typeof window.DATA_CHUNKS_COUNT === 'number') ? window.DATA_CHUNKS_COUNT : 10;
window.PAID_DATA = [];
window.HIERARCHY = {};
window.GEO_LAYERS = {};
window.ROLES = {};
window.USER = null;
window.ALL_VERIFIED_DATA = []; // Initialized as empty to prevent crashes before fetch

// Global Billing Tracker (Dynamic)
window.ACTIVE_BILLING_MONTH = 'loading...';
window.DATA_VERSION = window.DATA_VERSION || 'v1'; // Use injected version if present

async function fetchAppSettings() {
    try {
        const { data, error } = await window._supabase
            .from('app_settings')
            .select('key, value')
            .in('key', ['active_billing_month', 'data_version']);

        if (error) throw error;
        if (data) {
            const billing = data.find(d => d.key === 'active_billing_month');
            const version = data.find(d => d.key === 'data_version');
            
            if (billing) window.ACTIVE_BILLING_MONTH = billing.value;
            if (version) window.DATA_VERSION = version.value;
            
            console.log("App Settings:", { billing: window.ACTIVE_BILLING_MONTH, version: window.DATA_VERSION });
        } else {
            console.warn("active_billing_month not found in app_settings, falling back to default.");
            window.ACTIVE_BILLING_MONTH = 'feb2026'; // Fallback
        }
    } catch (e) {
        console.error("Failed to fetch app settings:", e);
        window.ACTIVE_BILLING_MONTH = 'feb2026'; // Emergency Fallback
    }
}

// Supabase Config
const SUPABASE_URL = "https://ipegpbgcektdtbnfvhvc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwZWdwYmdjZWt0ZHRibmZ2aHZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwOTYzNjMsImV4cCI6MjA4MDY3MjM2M30.FHe6qYLmqvvTjRbKQQqHWNpsDbCBCeT9hPMgnAyE2bE";
window._supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Simple JWT Decoder
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) { return null; }
}

// PII Decoder (v7.6) - Removed Base64 to fix Urdu encoding symbols
function decodePII(val) {
    if (!val || val === '-') return val;
    return val; // Directly return raw value handled by JSON.parse
}

async function handleCredentialResponse(response) {
    window.handleCredentialResponse = handleCredentialResponse;
    const payload = parseJwt(response.credential);
    if (!payload) return showError("Invalid login token.");

    const status = document.getElementById('auth-status');
    status.innerHTML = `<span style="color:#2563eb;">Verifying access for ${payload.email}...</span>`;

    try {
        // Fetch Roles Database
        const rolesRes = await fetch('roles.json');
        if (!rolesRes.ok) throw new Error("Could not load roles database.");
        const roles = await rolesRes.json();
        
        // Store for global use (e.g. Sync Monitor dropdown)
        window.USER_DB = roles;

        const isAuthorized = roles.admins.includes(payload.email) || roles.field_staff.includes(payload.email);
        if (!isAuthorized) throw new Error("Unauthorized User Email.");

        const role = roles.admins.includes(payload.email) ? 'admin' : 'staff';

        // Success!
        window.USER = {
            email: payload.email,
            role: role,
            name: payload.given_name || payload.name.split(' ')[0],
            picture: payload.picture
        };
        sessionStorage.setItem('auth_token', response.credential);

        document.getElementById('login-overlay').style.opacity = '0';
        setTimeout(() => document.getElementById('login-overlay').style.display = 'none', 500);

        await loadData();
        Auth.updateUI();

    } catch (e) {
        showError(e.message);
    }
}

function showError(msg) {
    const status = document.getElementById('auth-status');
    status.innerHTML = `<span style="color:#ef4444;">${msg}</span>`;
}

async function checkSession() {
    const token = sessionStorage.getItem('auth_token');
    if (token) {
        const payload = parseJwt(token);
        if (payload && payload.exp * 1000 > Date.now()) {
            handleCredentialResponse({ credential: token });
            return true;
        }
    }
    return false;
}

const Auth = {
    logout() {
        if (confirm("Are you sure you want to Logout?")) {
            // DEEP CLEANUP: Clear large data from memory
            window.RAW_DATA = [];
            window.SID_MAP = null;
            window.ALL_VERIFIED_DATA = [];
            
            sessionStorage.removeItem('auth_token');
            // Use replace instead of reload to prevent bfcache issues on mobile
            window.location.replace(window.location.pathname);
        }
    },
    toggle() {
        const badge = document.getElementById('user-session');
        if (badge) badge.classList.toggle('expanded');
    },
    updateUI() {
        if (!window.USER) return;
        const badge = document.getElementById('user-session');
        const nameEl = document.getElementById('sess-name');
        const roleEl = document.getElementById('sess-role');
        const picEl = document.getElementById('sess-pic');
        const fallbackEl = document.getElementById('sess-avatar-fallback');

        if (badge) {
            badge.style.display = 'flex';
            nameEl.innerText = window.USER.name;
            roleEl.innerText = window.USER.role;

            if (window.USER.picture) {
                picEl.src = window.USER.picture;
                picEl.style.display = 'block';
                fallbackEl.style.display = 'none';
            }
        }

        // Apply Role-Based Gating
        if (window.USER.role === 'staff') {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            // Hide routing overlay for non-admins - use visibility to not fight CSS class toggles
            const overlay = document.getElementById('routing-station-overlay');
            if (overlay) {
                overlay.style.visibility = 'hidden';
                overlay.style.pointerEvents = 'none';
                overlay.classList.remove('active');
            }
        } else {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
            // Admin: reset any staff restrictions; overlay visibility controlled by user action only
            const overlay = document.getElementById('routing-station-overlay');
            if (overlay) {
                overlay.style.visibility = '';
                overlay.style.pointerEvents = '';
            }
        }

        // Device Gating (Desktop Only)
        if (window.innerWidth <= 768) {
            document.querySelectorAll('.desc-only').forEach(el => el.style.display = 'none');
        }
        // NOTE: Do NOT auto-open routing panel here — let the user open it via the toolbar button
    }
};

async function loadData() {
    if (!window.USER) return; // Prevent premature loading

    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'initial-loader';
    loadingOverlay.style.cssText = 'position:fixed; inset:0; background:#fff; z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif;';
    loadingOverlay.innerHTML = '<div style="font-size:24px; font-weight:bold; margin-bottom:20px; color:#2563eb;">TMT Billing Dept App</div><div class="loader" style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #3498db; border-radius:50%; animation:spin 1s linear infinite;"></div><div id="loader-status" style="margin-top:20px; color:#64748b;">Assembling Spatial Data...</div><style>@keyframes spin {0% {transform: rotate(0deg);} 100% {transform: rotate(360deg);}}</style>';
    document.body.appendChild(loadingOverlay);

    const status = document.getElementById('loader-status');

    try {
        // Step 0: Fetch Dynamic Config
        status.innerText = 'Fetching System Config...';
        await fetchAppSettings();
        const fetchJSON = async (url, label) => {
            status.innerText = `Loading ${label}...`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to load ${label}`);
            return await res.json();
        };

        const vStr = `?v=${window.DATA_VERSION || Date.now()}`;
        const chunkCount = window.DATA_CHUNKS_COUNT || 1;
        const dataPromises = [];
        for (let i = 1; i <= chunkCount; i++) {
            dataPromises.push(fetchJSON(`data_part${i}.json${vStr}`, `Survey Records (Part ${i}/${chunkCount})`));
        }

        const [dataChunks, paidData, hierarchyData, geoLayers] = await Promise.all([
            Promise.all(dataPromises),
            fetchJSON(`paid_data.json${vStr}`, 'Payment Data'),
            fetchJSON(`hierarchy.json${vStr}`, 'Locations'),
            fetchJSON(`geo_layers.json${vStr}`, 'Map Layers')
        ]);

        const rawData = [].concat(...dataChunks);

        // NON-BLOCKING: Process records in background batches to prevent UI freeze
        status.innerText = 'Optimizing Search Engine...';
        window.SID_MAP = new Map();
        
        const total = rawData.length;
        const batchSize = 10000;
        let processed = 0;

        const processBatch = () => {
            return new Promise((resolve) => {
                const end = Math.min(processed + batchSize, total);
                for (let i = processed; i < end; i++) {
                    const r = rawData[i];
                    r[4] = decodePII(r[4]);
                    r[5] = decodePII(r[5]);
                    r[15] = decodePII(r[15]);
                    r._search = `${r[0]}|${r[15]}|${r[4]}|${r[5]}|${r[12]}|${r[6]}`.toLowerCase();
                    const cleanKey = String(r[0]).replace(/\.0$/, '').trim();
                    window.SID_MAP.set(cleanKey, r);
                }
                
                processed = end;
                const pct = Math.round((processed / total) * 100);
                status.innerText = `Optimizing Search Engine (${pct}%)...`;

                if (processed < total) {
                    // Small delay to allow browser to paint/refresh UI
                    setTimeout(() => resolve(processBatch()), 10);
                } else {
                    resolve(rawData);
                }
            });
        };

        window.RAW_DATA = await processBatch();

        window.PAID_DATA = paidData;
        window.HIERARCHY = hierarchyData;
        window.GEO_LAYERS = geoLayers;

        status.innerText = 'Starting Application...';
        setTimeout(() => {
            loadingOverlay.remove();
            window.APP_DATA_LOADED = true;
            if (window.App && window.App.init) {
                window.App.init();
                Auth.updateUI();
                
                // NEW: Auto-fetch global verifications for all roles (ensures staff see pins)
                if (window.Settings && Settings.fetchGlobalVerifications) {
                    Settings.fetchGlobalVerifications();
                }
            } else {
                console.log("Waiting for App logic to parse...");
            }
        }, 500);

    } catch (e) {
        console.error(e);
        status.innerText = `Error: ${e.message}`;
        status.style.color = '#ef4444';
        status.innerHTML += '<br><button onclick="location.reload()" style="margin-top:10px; padding:8px 16px;">Retry</button>';
    }
}

// Start Auth Check
window.addEventListener('DOMContentLoaded', async () => {
    if (!await checkSession()) {
        // Show Login
        const loginOverlay = document.getElementById('login-overlay');
        if (loginOverlay) loginOverlay.style.display = 'flex';
    }
});
