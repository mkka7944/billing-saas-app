// === 09_local_cam.js ===
// LocalCam

const LocalCam = {
        async handleCapture(input, surveyId) {
            if (input.files && input.files[0]) {
                const file = input.files[0];
                const timestamp = Math.floor(Date.now() / 1000);
                
                try {
                    // Use DriveSync's compressor for consistency (WebP < 300KB)
                    const compressedFile = await DriveSync.compressImage(file);
                    
                    // Create Filename
                    const filename = `${surveyId}_img_${timestamp}.webp`;
                    
                    // Create Blob URL from compressed file
                    const blobUrl = URL.createObjectURL(compressedFile);
                    
                    // Trigger Download
                    const link = document.createElement('a');
                    link.href = blobUrl;
                    link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    // Cleanup - Increased timeout to 5s for mobile reliability
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
                    
                    if(window.App && App.showToast) App.showToast("Image Saved: " + filename);
                    else alert("Image Saved: " + filename);
                    
                } catch (e) {
                    console.error("Compression failed", e);
                    alert("Error saving image: " + e.message);
                }
                
                // Reset input
                input.value = '';
            }
        }
    };