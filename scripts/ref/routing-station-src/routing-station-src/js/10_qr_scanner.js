// === 10_qr_scanner.js ===
// QR Scanner

const QRScanner = {
    html5QrCode: null,
    availableCameras: [],
    currentCameraIndex: 0,
    currentFacingMode: "environment", // Track constraint mode
    
    async open() {
        document.getElementById('modal-qr').style.display = 'flex';
        
        if (typeof Html5Qrcode === 'undefined') {
            alert("QR Scanner Library failed to load. Please refresh.");
            return;
        }

        this.html5QrCode = new Html5Qrcode("qr-reader");
        this.currentFacingMode = "environment"; // Default to back camera
        
        // Get available cameras for telemetry / fallback if constraints fail
        try {
            this.availableCameras = await Html5Qrcode.getCameras();
            if (this.availableCameras && this.availableCameras.length > 0) {
                console.log("Available cameras:", this.availableCameras.map(c => c.label));
                
                // Keep index aligned to back camera if detected, as fallback
                const backIndex = this.availableCameras.findIndex(c => 
                    c.label.toLowerCase().includes('back') || 
                    c.label.toLowerCase().includes('rear') || 
                    c.label.toLowerCase().includes('environment')
                );
                if (backIndex !== -1) {
                    this.currentCameraIndex = backIndex;
                } else {
                    this.currentCameraIndex = 0;
                }
            }
        } catch(e) {
            console.warn("Could not get camera list", e);
            this.availableCameras = [];
            this.currentCameraIndex = 0;
        }
        
        // High Performance Config
        const config = { 
            fps: 20, // 20 FPS is more stable across mobile operating systems
            qrbox: (viewfinderWidth, viewfinderHeight) => {
                const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                const size = Math.floor(minEdge * 0.85); // 85% width
                return { width: size, height: size };
            },
            aspectRatio: 1.0,
            showZoomSliderIfSupported: true,
            useBarCodeDetectorIfSupported: true
        };
        
        // Attempt smart initialization with back constraint
        this.startWithConstraint({ facingMode: "environment" }, config);
    },
    
    startWithConstraint(constraint, config) {
        if (!this.html5QrCode) return;
        
        const launch = () => {
            this.html5QrCode.start(
                constraint, 
                config, 
                (decodedText) => this.onScanSuccess(decodedText),
                (errorMessage) => { /* ignore per-frame errors */ }
            ).catch(err => {
                console.warn("Constraint start failed, falling back to ID mapping", err);
                // If capability mapping fails, attempt strict hardware binding
                this.startCamera(this.currentCameraIndex, config);
            });
        };

        if (this.html5QrCode.isScanning) {
            this.html5QrCode.stop().then(() => {
                launch();
            }).catch(() => {
                launch();
            });
        } else {
            launch();
        }
    },
    
    startCamera(cameraIndex, config = null) {
        if (!this.html5QrCode) return;
        
        if (!config) {
            config = { 
                fps: 20,
                qrbox: (viewfinderWidth, viewfinderHeight) => {
                    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                    const size = Math.floor(minEdge * 0.85);
                    return { width: size, height: size };
                },
                aspectRatio: 1.0
            };
        }
        
        if (this.html5QrCode.isScanning) {
            this.html5QrCode.stop().then(() => {
                this.startCameraInternal(cameraIndex, config);
            }).catch(() => {
                this.startCameraInternal(cameraIndex, config);
            });
        } else {
            this.startCameraInternal(cameraIndex, config);
        }
    },
    
    startCameraInternal(cameraIndex, config) {
        const cameraId = this.availableCameras[cameraIndex]?.id || { facingMode: "environment" };
        
        this.html5QrCode.start(
            cameraId, 
            config, 
            (decodedText) => this.onScanSuccess(decodedText),
            (errorMessage) => { /* ignore per-frame errors */ }
        ).catch(err => {
            console.error("Camera start failed", err);
            if (this.availableCameras.length > cameraIndex + 1) {
                this.currentCameraIndex = cameraIndex + 1;
                this.startCamera(this.currentCameraIndex, config);
            } else {
                alert("Could not start camera: " + err);
                this.close();
            }
        });
    },
    
    switchCamera() {
        // Toggle between environment and user constraints rather than raw lenses
        this.currentFacingMode = (this.currentFacingMode === "environment") ? "user" : "environment";
        
        if (App.showToast) {
            App.showToast("Camera: " + (this.currentFacingMode === "environment" ? "Back" : "Front"));
        }
        
        const config = { 
            fps: 20,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
                const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                const size = Math.floor(minEdge * 0.85);
                return { width: size, height: size };
            },
            aspectRatio: 1.0,
            showZoomSliderIfSupported: true,
            useBarCodeDetectorIfSupported: true
        };
        
        this.startWithConstraint({ facingMode: this.currentFacingMode }, config);
    },
    
    onScanSuccess(decodedText) {
        console.log(`Scan matched: ${decodedText}`);
        this.close();
        
        let id = decodedText;
        
        if (decodedText.includes('sid=')) {
            try {
                const url = new URL(decodedText);
                id = url.searchParams.get('sid');
            } catch(e) {
                const match = decodedText.match(/sid=([^&]+)/);
                if (match) id = match[1];
            }
        }
        
        if (id) {
            ListView.jumpFromMap(id);
        } else {
            alert("Could not parse Survey ID from: " + decodedText);
        }
    },
    
    close() {
        if (this.html5QrCode && this.html5QrCode.isScanning) {
            this.html5QrCode.stop().then(() => {
                this.html5QrCode.clear();
                document.getElementById('modal-qr').style.display = 'none';
            }).catch(err => {
                document.getElementById('modal-qr').style.display = 'none';
            });
        } else {
            document.getElementById('modal-qr').style.display = 'none';
        }
    }
};