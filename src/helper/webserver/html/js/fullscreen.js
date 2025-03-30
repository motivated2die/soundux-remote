const fullscreenManager = (() => {
    const SETTING_KEY = 'autoFullscreenEnabled';
    let isEnabled = true; // Default to true

    const loadSetting = () => {
        // Load from persistence, default to true if not found
        // Ensure persistence object is available
        if (typeof persistence !== 'undefined') {
            const settings = persistence.load();
            isEnabled = settings[SETTING_KEY] !== false; // Default true if undefined/true
        } else {
             console.warn("Persistence module not found, defaulting autoFullscreen to true.");
             isEnabled = true;
        }
        console.log(`Auto Fullscreen Initial State: ${isEnabled}`);
        updateToggleUI();
    };

    const saveSetting = () => {
        // Save to persistence
        if (typeof persistence !== 'undefined') {
            const settings = persistence.load();
            settings[SETTING_KEY] = isEnabled;
            persistence.save(settings);
            console.log(`Auto Fullscreen Setting Saved: ${isEnabled}`);
        } else {
             console.warn("Persistence module not found, cannot save autoFullscreen setting.");
        }
    };

    const updateToggleUI = () => {
        const toggle = document.getElementById('auto-fullscreen-toggle');
        if (toggle) {
            toggle.checked = isEnabled;
        }
    };

    const toggleSetting = () => {
        isEnabled = !isEnabled;
        saveSetting();
        updateToggleUI();
    };

    const requestFullscreen = () => {
        // Only request if enabled and not already fullscreen
        if (!isEnabled || document.fullscreenElement) return;

        console.log('Requesting fullscreen...');
        const elem = document.documentElement;
        try {
            if (elem.requestFullscreen) {
                // Standard
                elem.requestFullscreen({ navigationUI: "hide" }).catch(err => console.warn(`Fullscreen request failed: ${err.message}`));
            } else if (elem.webkitRequestFullscreen) {
                // Safari/Chrome (older?)
                elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
                // IE11
                elem.msRequestFullscreen();
            }
            // Note: Firefox uses elem.requestFullscreen() now. mozRequestFullScreen is deprecated.
        } catch(err) {
            console.warn("Error requesting fullscreen:", err);
        }
    };

    const handleInteraction = (event) => {
        // Avoid triggering on buttons within modals etc.
        if (event.target.closest('#app-settings-modal') || event.target.closest('#sound-settings-card')) {
            return;
        }
        requestFullscreen(); // Try entering fullscreen on interaction if enabled
    };

    const handleVisibilityChange = () => {
        // Try to re-enter fullscreen when tab becomes visible again
        if (document.visibilityState === 'visible') {
            // Use a small delay to avoid issues when quickly switching tabs
            setTimeout(requestFullscreen, 300);
        }
    };

    const init = () => {
        loadSetting();
        const toggleButton = document.getElementById('auto-fullscreen-toggle');
        if (toggleButton) {
            toggleButton.addEventListener('change', toggleSetting);
        } else { /* ... */ }
        document.addEventListener('pointerdown', handleInteraction, { capture: true, passive: true });
        document.addEventListener('visibilitychange', handleVisibilityChange);
        console.log("Fullscreen Manager Initialized"); // Keep log
    };

    const publicInterface = {
        init,
        setEnabled,
        isEnabled: () => isEnabled
    };

    // ---> Assign to window object <---
    window.fullscreenManager = publicInterface; // Make it globally accessible

    return publicInterface; // Return it as well (good practice)

})();

// Initialize after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', fullscreenManager.init);
