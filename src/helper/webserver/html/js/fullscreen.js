const fullscreenManager = (() => {
    const SETTING_KEY = 'autoFullscreenEnabled';
    let isEnabled = true; // Internal state, initially default

    // --- NEW: Reads from global state ---
    const loadSettingFromGlobalState = () => {
        // Ensure global state and persistence module are available
        if (typeof state !== 'undefined' && state.settings && typeof persistence !== 'undefined') {
             // Get the value from the already loaded global state object
             // Default to true if the key is missing in the loaded settings
             isEnabled = state.settings[SETTING_KEY] !== false;
             console.log(`Fullscreen Manager: Loaded setting from global state: ${isEnabled}`);
        } else {
             console.warn("Fullscreen Manager: Global state.settings not available during loadSettingFromGlobalState. Using default (true). This might indicate an init order issue.");
             // Fallback to checking localStorage directly IF persistence exists
             if (typeof persistence !== 'undefined') {
                 try {
                     const settings = persistence.load(); // Last resort load
                     isEnabled = settings[SETTING_KEY] !== false;
                      console.log(`Fullscreen Manager: Fallback load from persistence: ${isEnabled}`);
                 } catch (e) {
                      console.error("Fullscreen Manager: Error during fallback load:", e);
                      isEnabled = true; // Default on error
                 }
             } else {
                 isEnabled = true; // Default if persistence isn't even there
             }
        }
    };

    // --- NEW: Saves the entire global state ---
    const saveGlobalSettings = () => {
        // Save the entire global state object via persistence module
        if (typeof state !== 'undefined' && state.settings && typeof persistence !== 'undefined') {
            // Modify the global state object FIRST
            state.settings[SETTING_KEY] = isEnabled;
            // Then save the whole object
            persistence.save(state.settings);
             // console.log('Fullscreen Manager: Saved updated global settings via persistence.'); // Less verbose logging
        } else {
             console.error("Fullscreen Manager: Cannot save setting - global state or persistence module not found.");
        }
    };

    const updateToggleUI = () => {
        const toggle = document.getElementById('auto-fullscreen-toggle');
        if (toggle) {
            // Ensure the UI reflects the internal state, regardless of potential load issues
            toggle.checked = isEnabled;
        }
    };

    const toggleSetting = () => {
        isEnabled = !isEnabled; // Update internal state
        saveGlobalSettings(); // Save the change to the global state & localStorage
        updateToggleUI(); // Update UI
        console.log(`Fullscreen Manager: Toggled autoFullscreen to ${isEnabled}`);
    };

    const setEnabled = (enabledStatus) => {
        const newIsEnabled = !!enabledStatus; // Ensure boolean
        if (isEnabled !== newIsEnabled) { // Only update if changed
             isEnabled = newIsEnabled;
             saveGlobalSettings();
             updateToggleUI();
             console.log(`Fullscreen Manager: Set autoFullscreen externally to ${isEnabled}`);
        }
    };

    // --- Keep requestFullscreen, handleInteraction, handleVisibilityChange as they were ---
    const requestFullscreen = () => {
        if (!isEnabled || document.fullscreenElement) return;
        // console.log('Requesting fullscreen...');
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
        // Ignore clicks within modals
        if (event.target.closest('#app-settings-modal') || event.target.closest('#sound-settings-overlay')) {
             return;
        }
        requestFullscreen();
    };

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
             // Request fullscreen shortly after returning to visibility
             setTimeout(requestFullscreen, 300);
        }
    };
    // --- End kept functions ---

    // --- MODIFIED Init Function ---
    const init = () => {
         // 1. Load setting from global state (assumes app.js has loaded it)
         loadSettingFromGlobalState();
         // 2. Update the UI toggle to match the loaded state
         updateToggleUI();

         // 3. Attach listener to the toggle button
         const toggleButton = document.getElementById('auto-fullscreen-toggle');
         if (toggleButton) {
             toggleButton.removeEventListener('change', toggleSetting); // Remove previous listener if any
             toggleButton.addEventListener('change', toggleSetting);
         } else {
             console.error("Fullscreen Manager: Auto Fullscreen toggle button not found during init.");
         }

         // 4. Attach interaction and visibility listeners
         // Remove potentially existing listeners before adding new ones
         document.removeEventListener('pointerdown', handleInteraction, { capture: true });
         document.removeEventListener('visibilitychange', handleVisibilityChange);
         // Add the listeners
         document.addEventListener('pointerdown', handleInteraction, { capture: true, passive: true });
         document.addEventListener('visibilitychange', handleVisibilityChange);

         console.log("Fullscreen Manager Initialized (State loaded, Listeners Attached)");
    };
    // --- End MODIFIED Init Function ---

    const publicInterface = {
        init, // Expose init
        setEnabled, // Expose setEnabled
        isEnabled: () => isEnabled // Expose isEnabled getter
    };

    window.fullscreenManager = publicInterface;
    // console.log("window.fullscreenManager assigned."); // Less verbose

    return publicInterface;

})();


// --- MODIFIED Initialization Trigger ---
// Defer initialization until the main app signals readiness
document.addEventListener('appReady', () => {
    console.log("Fullscreen Manager: Received appReady event.");
    if (window.fullscreenManager) {
        window.fullscreenManager.init();
    } else {
        console.error("Fullscreen Manager: appReady fired, but window.fullscreenManager was not found!");
    }
});
