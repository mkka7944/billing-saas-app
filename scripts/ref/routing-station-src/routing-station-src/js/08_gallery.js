// === 08_gallery.js ===
// Gallery / image viewer

const Gallery = {
    scale: 1, rot: 0,
    images: [], idx: 0,
    posX: 0, posY: 0,
    isDragging: false,
    startX: 0, startY: 0,

    open(src, surveyId) {
        if (!src || typeof src !== 'string' || !src.startsWith('http')) {
            return;
        }
        
        // State Reset: Clear previous rotation/zoom/position
        this.reset();

        const sidStr = String(surveyId);
        const safeId = sidStr.replace(/[^a-z0-9]/gi, '_');
        const galContainer = document.getElementById(`gal-${safeId}`);

        if (galContainer) {
            // Collect ALL images from the gallery container (original and synced)
            const allThumbs = Array.from(galContainer.querySelectorAll('img'));
            this.images = allThumbs.map(img => img.src);
        } else {
            // Fallback: Check RAW_DATA if container missing (common in Image Modal context)
            const record = (window.RAW_DATA || []).find(r => String(r[0]) === sidStr);
            this.images = (record && Array.isArray(record[9])) ? record[9] : [src];
        }

        this.idx = this.images.indexOf(src);
        if (this.idx === -1) this.idx = 0;

        this.updateImage();
        const modal = document.getElementById('gallery');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }

        // Add Keyboard listeners (Remove old first to prevent duplication)
        if (this._boundKeyHandler) {
            window.removeEventListener('keydown', this._boundKeyHandler);
        }
        this._boundKeyHandler = (e) => this.handleKeys(e);
        window.addEventListener('keydown', this._boundKeyHandler);
    },

    close() {
        const modal = document.getElementById('gallery');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
        if (this._boundKeyHandler) {
            window.removeEventListener('keydown', this._boundKeyHandler);
        }
        // Clear internal state to prevent "history" persistence
        this.images = [];
        this.idx = 0;
        
        // Return to Map view and re-show navigation controls
        if (window.MapNavigator) {
            MapNavigator.visible = true;
            MapNavigator.updateUI();
        }
    },

    handleKeys(e) {
        if (e.key === 'ArrowRight') this.next();
        if (e.key === 'ArrowLeft') this.prev();
        if (e.key === 'Escape') this.close();
        if (e.key === '+' || e.key === '=') this.zoomIn();
        if (e.key === '-' || e.key === '_') this.zoomOut();
        if (e.key.toLowerCase() === 'r') this.rotate();
    },

    next() { this.idx = (this.idx + 1) % this.images.length; this.updateImage(); },
    prev() { this.idx = (this.idx - 1 + this.images.length) % this.images.length; this.updateImage(); },

    updateImage() {
        const img = document.getElementById('gal-img');
        let src = this.images[this.idx];
        
        // UPGRADE: If this is a low-res Drive thumbnail, promote it to high-res for the gallery view
        if (src && src.includes('drive.google.com/thumbnail') && src.includes('sz=w200')) {
            src = src.replace('sz=w200', 'sz=w1000');
        }

        img.src = src;
        this.reset();
        const counter = document.getElementById('gal-counter');
        if (counter) counter.innerText = `${this.idx + 1} / ${this.images.length}`;
    },

    rotate() { this.rot = (this.rot + 90) % 360; this.updateTransform(); },
    zoomIn() { this.scale = Math.min(5, this.scale + 0.3); this.updateTransform(); },
    zoomOut() { this.scale = Math.max(0.5, this.scale - 0.3); this.updateTransform(); },
    reset() {
        this.scale = 1; this.rot = 0;
        this.posX = 0; this.posY = 0;
        this.updateTransform();
    },

    updateTransform() {
        const img = document.getElementById('gal-img');
        if (this.isDragging) img.classList.add('no-transition');
        else img.classList.remove('no-transition');

        img.style.transform = `translate(${this.posX}px, ${this.posY}px) rotate(${this.rot}deg) scale(${this.scale})`;

        // Standard cursor behavior
        if (this.scale > 1.05) {
            img.style.cursor = this.isDragging ? 'grabbing' : 'grab';
        } else {
            img.style.cursor = 'default';
        }
    },

    // Interaction state
    onStart(e) {
        if (!e || (e.target && e.target.closest && e.target.closest('.gal-controls'))) return;

        if (e.type === 'touchstart' && e.touches) {
            this.touchstartX = e.touches[0].clientX;
            this.touchstartY = e.touches[0].clientY;

            // For 2-finger panning / pinching
            if (e.touches.length === 2) {
                this._pinchStartDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                this._pinchStartScale = this.scale;
                this._pinchStartX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - this.posX;
                this._pinchStartY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - this.posY;
                this.isDragging = false;
            } else {
                // Start dragging for mobile (if zoomed)
                if (this.scale > 1.01) {
                    this.isDragging = true;
                    this.startX = e.touches[0].clientX - this.posX;
                    this.startY = e.touches[0].clientY - this.posY;
                }
            }
        } else {
            // Desktop Mouse Start
            if (this.scale > 1.01) {
                this.isDragging = true;
                this.startX = e.clientX - this.posX;
                this.startY = e.clientY - this.posY;
                this.updateTransform();
            }
        }
    },

    onMove(e) {
        // Early return if no valid active state or no event
        if (!e || (!this.isDragging && !this._pinchStartDist)) return;
        if (e.preventDefault) e.preventDefault();

        if (e.type === 'touchmove' && e.touches) {
            // Mobile Pinch and 2-Finger Pan
            if (e.touches.length === 2 && this._pinchStartDist) {
                const dist = Math.hypot(
                    e.touches[1].clientX - e.touches[0].clientX,
                    e.touches[1].clientY - e.touches[0].clientY
                );
                const zoomFactor = dist / this._pinchStartDist;
                this.scale = Math.min(5, Math.max(0.5, this._pinchStartScale * zoomFactor));

                if (this.scale > 1.01) {
                    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                    this.posX = midX - this._pinchStartX;
                    this.posY = midY - this._pinchStartY;
                }
                this.updateTransform();
            }
            // Mobile Single Touch Pan
            else if (this.isDragging && this.scale > 1.01) {
                this.posX = e.touches[0].clientX - this.startX;
                this.posY = e.touches[0].clientY - this.startY;
                this.updateTransform();
            }
        } else {
            // Desktop Mouse Move (Strict button check + drag state)
            if (this.isDragging && this.scale > 1.01 && (e.buttons & 1)) {
                this.posX = e.clientX - this.startX;
                this.posY = e.clientY - this.startY;
                this.updateTransform();
            } else if (this.isDragging) {
                // Safety: if mouse is up but listener missed it
                this.onEnd(e);
            }
        }
    },

    onEnd(e) {
        // Mobile Swipe Detection
        if (e && e.type === 'touchend' && this.scale <= 1.01 && this.touchstartX !== undefined && e.changedTouches) {
            const deltaX = e.changedTouches[0].clientX - this.touchstartX;
            const deltaY = e.changedTouches[0].clientY - this.touchstartY;

            if (Math.abs(deltaX) > 60 && Math.abs(deltaY) < 100) {
                if (deltaX < 0) this.next();
                else this.prev();
            }
        }

        this.isDragging = false;
        this._pinchStartDist = null;
        this.touchstartX = undefined;
        this.updateTransform(); // Refresh cursor state
    },

    onWheel(e) {
        e.preventDefault();
        const zoomSpeed = 0.2;
        const prevScale = this.scale;

        // Calculate new scale
        if (e.deltaY < 0) this.scale = Math.min(5, this.scale + zoomSpeed);
        else this.scale = Math.max(0.5, this.scale - zoomSpeed);

        // Zoom towards cursor (Standard Pro behavior)
        if (this.scale !== prevScale) {
            const rect = document.getElementById('gal-vp').getBoundingClientRect();
            const mouseX = e.clientX - (rect.left + rect.width / 2);
            const mouseY = e.clientY - (rect.top + rect.height / 2);

            const ratio = (this.scale / prevScale) - 1;
            this.posX -= (mouseX - this.posX) * ratio;
            this.posY -= (mouseY - this.posY) * ratio;
        }

        this.updateTransform();
    },

    clickNav(e) {
        // Only navigate if NOT dragging significantly and NOT clicking image when zoomed
        if (this.scale > 1.2 && e.target.tagName === 'IMG') return;
        if (e.target.closest('.gal-controls')) return;

        const width = document.getElementById('gal-vp').clientWidth;
        const rect = document.getElementById('gal-vp').getBoundingClientRect();
        const clickX = e.clientX - rect.left;

        // Threshold for navigation
        if (clickX > width * 0.7) this.next();
        else if (clickX < width * 0.3) this.prev();
    }
};