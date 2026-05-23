// === 24_map_rotation.js ===
// Map Rotation

const MapRotation = {
        angle: 0,
        locked: false,
        visible: false,
        toggle() {
            this.visible = !this.visible;
            const hud = document.getElementById('map-rotation-hud');
            if (hud) hud.style.display = this.visible ? 'flex' : 'none';
            const btn = document.getElementById('btn-rotate-map');
            if (btn) btn.classList.toggle('active', this.visible);
        },
        step(deg) {
            if (this.locked) { if (App.showToast) App.showToast('Rotation is locked.'); return; }
            this.angle = (this.angle + deg) % 360;
            this.apply();
        },
        reset() {
            if (this.locked) { if (App.showToast) App.showToast('Rotation is locked.'); return; }
            this.angle = 0;
            this.apply();
        },
        toggleLock() {
            this.locked = !this.locked;
            const btn = document.getElementById('btn-rotation-lock');
            if (btn) {
                btn.querySelector('span').innerText = this.locked ? 'lock' : 'lock_open';
                btn.style.color = this.locked ? '#f59e0b' : '#94a3b8';
            }
            if (App.showToast) App.showToast(this.locked ? 'Rotation locked.' : 'Rotation unlocked.');
        },
        apply() {
            const mapEl = document.getElementById('map');
            if (mapEl) {
                mapEl.style.transform = `rotate(${this.angle}deg)`;
                mapEl.style.transition = 'transform 0.3s ease';
            }
            const display = document.getElementById('rotation-angle-display');
            if (display) display.innerText = `${this.angle}°`;
        }
    };
    window.MapRotation = MapRotation;

    // Draggable / Resizable UI Helpers