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
    };

    const saveSetting = () => {
        // Save to persistence
        if (typeof persistence !== 'undefined') {
            const settings = persistence.load();
            settings[SETTING_KEY] = isEnabled;
            persistence.save(settings);
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
        if (!isEnabled || document.fullscreenElement) return;
        // console.log('Requesting fullscreen...'); // Less verbose
        const elem = document.documentElement;
        try {
            if (elem.requestFullscreen) { elem.requestFullscreen({ navigationUI: "hide" }).catch(err => console.warn(`FS Req Error: ${err.message}`)); }
            else if (elem.webkitRequestFullscreen) { elem.webkitRequestFullscreen(); }
            else if (elem.msRequestFullscreen) { elem.msRequestFullscreen(); }

        } catch(err) {
            console.warn("Error requesting fullscreen:", err);
        }
    };

    const handleInteraction = (event) => {
        if (event.target.closest('#app-settings-modal') || event.target.closest('#sound-settings-card')) { return; }
        requestFullscreen();
    };


    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') { setTimeout(requestFullscreen, 300); }
    };

    const setEnabled = (enabledStatus) => {
        isEnabled = !!enabledStatus; // Ensure boolean
        saveSetting();
        updateToggleUI();
    };


    // --- Define the public interface ---
    const publicInterface = {
        // init should only be called once DOM is ready
        init: () => {
            loadSetting(); // Load setting state first
            updateToggleUI(); // Update UI based on loaded state

            const toggleButton = document.getElementById('auto-fullscreen-toggle');
            if (toggleButton) {
                toggleButton.addEventListener('change', toggleSetting);
            } else { console.error("Auto Fullscreen toggle button not found."); }

            document.addEventListener('pointerdown', handleInteraction, { capture: true, passive: true });
            document.addEventListener('visibilitychange', handleVisibilityChange);
            console.log("Fullscreen Manager Initialized (Listeners Attached)");
        },
        setEnabled, // Expose setEnabled
        isEnabled: () => isEnabled
    };


    // ---> Assign to window object <---
    window.fullscreenManager = publicInterface; // Make it globally accessible
    console.log("window.fullscreenManager assigned."); // Log assignment


    return publicInterface; // Return it as well (good practice)

})();

// Initialize after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check if manager exists before calling init (it should)
    if (window.fullscreenManager) {
        window.fullscreenManager.init();
    } else {
        console.error("DOMContentLoaded fired, but window.fullscreenManager was not found!");
    }
});