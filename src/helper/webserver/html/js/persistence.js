// --- ENTIRE FILE REPLACE ---
const persistence = (() => {
    const STORAGE_KEY = 'sounduxRemoteSettings_v2'; // Increment version if structure changes significantly
    const CURRENT_VERSION = 2; // Match the key

    // Default settings structure - V2 includes autoFullscreen
    const getDefaultSettings = () => ({
        version: CURRENT_VERSION,
        soundSettings: {}, // Key: sound.path, Value: { color, emoji, favorite, hasCustomVolume, localVolume, remoteVolume }
        tabLayouts: {},    // Key: tabId|'favorites', Value: { currentLayoutMode: 'grid-3'|'grid-2'|'list' }
        layoutOrders: {},  // Key: `${tabId}-${layoutMode}`, Value: [...soundPaths]
        lastTabId: 'favorites', // Default to favorites tab
        autoFullscreenEnabled: true // Added default for V2
    });

    // Load settings from localStorage
    const loadSettings = () => {
        try {
            const storedSettings = localStorage.getItem(STORAGE_KEY);
            if (storedSettings) {
                let settings = JSON.parse(storedSettings);
                // Basic validation and potential migration
                if (typeof settings === 'object' && settings !== null && settings.version === CURRENT_VERSION) {
                    // Ensure nested objects exist (important for robustness)
                    settings.soundSettings = settings.soundSettings || {};
                    settings.tabLayouts = settings.tabLayouts || {};
                    settings.layoutOrders = settings.layoutOrders || {};
                    settings.lastTabId = settings.lastTabId || 'favorites'; // Ensure default if missing
                    // Ensure autoFullscreen exists, default to true if upgrading from older structure
                    if (typeof settings.autoFullscreenEnabled === 'undefined') {
                        settings.autoFullscreenEnabled = true;
                    }
                    console.log('Loaded settings from localStorage (v' + CURRENT_VERSION + '):', settings);
                    return settings;
                } else {
                    console.warn('Stored settings version mismatch or invalid format. Using defaults. Stored:', settings);
                    // Optionally handle migration here if settings.version is older
                    // For now, just reset to defaults
                    return getDefaultSettings();
                }
            }
        } catch (error) {
            console.error('Error loading settings from localStorage:', error);
        }
        console.log('No valid settings found in localStorage. Using defaults.');
        return getDefaultSettings();
    };

    // Save settings to localStorage
    const saveSettings = (settingsObject) => {
        try {
             // Ensure the object being saved is valid and has the correct version
             if (!settingsObject || typeof settingsObject !== 'object') {
                 console.error("Attempted to save invalid settings object:", settingsObject);
                 // Fallback: Load current state, modify, then save? Or just return?
                 // For safety, let's just not save if the input is bad.
                 return;
             }
             settingsObject.version = CURRENT_VERSION; // Ensure version is current

            const settingsString = JSON.stringify(settingsObject);
            localStorage.setItem(STORAGE_KEY, settingsString);
             // console.log('Saved settings to localStorage (v' + CURRENT_VERSION + '):', settingsObject); // DEBUG
        } catch (error) {
            console.error('Error saving settings to localStorage:', error);
        }
    };

    // --- Internal Helper ---
    // Ensure nested structure exists before accessing/setting deep properties
    const ensurePath = (obj, pathArray) => {
        let current = obj;
        for (const key of pathArray) {
            if (typeof current[key] === 'undefined' || current[key] === null) {
                current[key] = {}; // Create nested object if it doesn't exist
            }
            current = current[key];
        }
        return current;
    };

    // --- Getters ---

    // Gets ALL settings for a specific sound path
    const getSoundSettings = (soundPath) => {
         // Ensure state.settings is loaded and soundSettings exists
         const settings = state.settings?.soundSettings || {};
         // Return a copy to prevent direct modification? For now, return direct reference or default.
         return settings[soundPath] || {}; // Return empty object if not found
    };

    // Gets the layout mode ('grid-3', 'grid-2', 'list') for a tab
    const getCurrentLayoutMode = (tabId) => {
         const settings = state.settings?.tabLayouts || {};
         // Default to 'grid-3' if not set for the specific tab
         return settings[tabId]?.currentLayoutMode || 'grid-3';
    };

    // Gets the specific order array for a tab and layout mode
    const getLayoutOrder = (tabId, layoutMode) => {
         const key = `${tabId}-${layoutMode}`;
         const orders = state.settings?.layoutOrders || {};
         // Return the array or null if not set
         return orders[key] || null;
    };

     // --- Setters (operate on global state.settings and save) ---

     const setSoundSetting = (soundPath, key, value) => {
         if (!state.settings) { console.error("Cannot set sound setting: state.settings not loaded."); return; }
         ensurePath(state.settings, ['soundSettings', soundPath]); // Ensure sound path exists
         state.settings.soundSettings[soundPath][key] = value;
         saveSettings(state.settings); // Save after modification
     };

     const removeSoundSetting = (soundPath, key) => {
         if (!state.settings || !state.settings.soundSettings || !state.settings.soundSettings[soundPath]) {
            // console.warn(`Cannot remove setting '${key}': Sound path '${soundPath}' not found.`); // Less noisy
            return; // Nothing to remove
         }
         delete state.settings.soundSettings[soundPath][key];
         // Clean up empty sound objects if desired
         if (Object.keys(state.settings.soundSettings[soundPath]).length === 0) {
             delete state.settings.soundSettings[soundPath];
              // console.log(`Cleaned up empty settings object for sound path: ${soundPath}`); // DEBUG
         }
         saveSettings(state.settings);
     };

     // --- Specific Sound Setting Setters ---
     const setSoundColor = (soundPath, color) => {
         if (color === 'default') {
             removeSoundSetting(soundPath, 'color');
         } else {
             setSoundSetting(soundPath, 'color', color);
         }
     };

     const setSoundEmoji = (soundPath, emoji) => {
         if (emoji) {
             setSoundSetting(soundPath, 'emoji', emoji);
         } else {
             removeSoundSetting(soundPath, 'emoji'); // Remove key if emoji is falsy
         }
     };

     const setSoundFavorite = (soundPath, isFavorite) => {
          setSoundSetting(soundPath, 'favorite', !!isFavorite); // Ensure boolean
     };

     const setSoundCustomVolume = (soundPath, hasCustom, localVol = null, remoteVol = null) => {
          if (hasCustom) {
               setSoundSetting(soundPath, 'hasCustomVolume', true);
               if (localVol !== null) setSoundSetting(soundPath, 'localVolume', localVol); else removeSoundSetting(soundPath, 'localVolume');
               if (remoteVol !== null) setSoundSetting(soundPath, 'remoteVolume', remoteVol); else removeSoundSetting(soundPath, 'remoteVolume');
          } else {
               // Remove all volume related keys if resetting
               removeSoundSetting(soundPath, 'hasCustomVolume');
               removeSoundSetting(soundPath, 'localVolume');
               removeSoundSetting(soundPath, 'remoteVolume');
          }
     };

     // --- Layout Setters ---

     const setCurrentLayoutMode = (tabId, layoutMode) => {
         if (!state.settings) { console.error("Cannot set layout mode: state.settings not loaded."); return; }
         ensurePath(state.settings, ['tabLayouts', tabId]); // Ensure tab entry exists
         state.settings.tabLayouts[tabId].currentLayoutMode = layoutMode;
         saveSettings(state.settings);
     };

     const setLayoutOrder = (tabId, layoutMode, orderArray) => {
         if (!state.settings) { console.error("Cannot set layout order: state.settings not loaded."); return; }
         if (!Array.isArray(orderArray)) { console.error("setLayoutOrder requires an array."); return; }
         const key = `${tabId}-${layoutMode}`;
         ensurePath(state.settings, ['layoutOrders']); // Ensure layoutOrders object exists
         state.settings.layoutOrders[key] = orderArray;
         saveSettings(state.settings);
     };

     // --- Clearing/Reset Functions ---

     const clearLayoutOrder = (tabId, layoutMode) => {
          const key = `${tabId}-${layoutMode}`;
          if (state.settings?.layoutOrders && state.settings.layoutOrders[key]) {
              delete state.settings.layoutOrders[key];
              saveSettings(state.settings);
              console.log(`Cleared layout order for key: ${key}`);
          } else {
              console.log(`No layout order found to clear for key: ${key}`);
          }
      };

     const clearSoundEmoji = (soundPath) => { removeSoundSetting(soundPath, 'emoji'); };
     const clearSoundColor = (soundPath) => { removeSoundSetting(soundPath, 'color'); };


    // --- Export / Import ---

    const exportSettings = () => {
        try {
             // Use the current in-memory state for export
            const settingsToExport = { ...state.settings }; // Create a shallow copy
            settingsToExport.version = CURRENT_VERSION; // Ensure version is correct

            const settingsString = JSON.stringify(settingsToExport, null, 2); // Pretty print
            const blob = new Blob([settingsString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const date = new Date().toISOString().slice(0, 10);
            // Use the correct storage key in the filename for clarity
            a.download = `soundux-remote-settings-v${CURRENT_VERSION}-${date}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log('Settings exported successfully.');
        } catch (error) {
            console.error('Error exporting settings:', error);
            alert('Failed to export settings.');
        }
    };

    const importSettings = (file) => {
        return new Promise((resolve, reject) => {
            if (!file) return reject(new Error('No file selected.'));
            if (file.type !== 'application/json') return reject(new Error('Invalid file type. Please select a JSON file.'));

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importedSettings = JSON.parse(event.target.result);

                    // Basic Validation
                    if (typeof importedSettings !== 'object' || importedSettings === null) {
                         throw new Error('Imported file is not a valid JSON object.');
                    }

                    // --- VERSION CHECK & MIGRATION (Basic Example) ---
                    const importedVersion = importedSettings.version;
                    if (typeof importedVersion !== 'number') {
                         console.warn("Imported settings missing version number. Attempting to load anyway.");
                         // Potentially try to infer structure or reject
                    } else if (importedVersion < CURRENT_VERSION) {
                         console.warn(`Imported settings are an older version (v${importedVersion}). Current is v${CURRENT_VERSION}. Attempting basic migration.`);
                         // ** Add Migration Logic Here if needed **
                         // Example: Rename old keys, add default values for new keys
                         if (typeof importedSettings.autoFullscreenEnabled === 'undefined') {
                             importedSettings.autoFullscreenEnabled = true; // Add default for new v2 setting
                             console.log("Added default 'autoFullscreenEnabled' during import migration.");
                         }
                         // Ensure all base structures exist after potential migration
                         importedSettings.soundSettings = importedSettings.soundSettings || {};
                         importedSettings.tabLayouts = importedSettings.tabLayouts || {};
                         importedSettings.layoutOrders = importedSettings.layoutOrders || {};
                         importedSettings.lastTabId = importedSettings.lastTabId || 'favorites';

                    } else if (importedVersion > CURRENT_VERSION) {
                         // Reject importing newer versions than the app supports
                         throw new Error(`Imported settings version (v${importedVersion}) is newer than supported (v${CURRENT_VERSION}). Please update the app.`);
                    }

                    // Update version number before saving
                    importedSettings.version = CURRENT_VERSION;

                    // Overwrite existing settings in localStorage and in-memory state
                    saveSettings(importedSettings);
                    state.settings = importedSettings; // Update global state directly

                    console.log('Settings imported successfully.');
                    document.dispatchEvent(new CustomEvent('settingsImported')); // Notify other modules
                    resolve(); // Indicate success
                } catch (error) {
                    console.error('Error importing settings:', error);
                    reject(error); // Pass the error
                }
            };
            reader.onerror = (error) => {
                console.error('Error reading file:', error);
                reject(new Error('Failed to read the selected file.'));
            };
            reader.readAsText(file);
        });
    };


    // --- Reset ---
    const resetAllSettings = () => {
        try {
            localStorage.removeItem(STORAGE_KEY);
            console.log(`All settings cleared from localStorage (Key: ${STORAGE_KEY}).`);
            // Load default settings into the global state immediately
            state.settings = getDefaultSettings();
            console.log("Reset state.settings to defaults.");
            // Notify relevant modules AFTER resetting state
            document.dispatchEvent(new CustomEvent('settingsReset'));
        } catch (error) {
            console.error('Error clearing settings from localStorage:', error);
        }
    };


    // Public interface
    return {
        load: loadSettings, // Loads initial settings into state during app init
        save: (settingsObj = state.settings) => saveSettings(settingsObj), // Saves the provided object (defaults to current state)

        // Getters (read from state.settings)
        getSoundSettings,
        getCurrentLayoutMode,
        getLayoutOrder,

        // Setters (modify state.settings and call saveSettings)
        setSoundColor,
        setSoundEmoji,
        setSoundFavorite,
        setSoundCustomVolume,
        setCurrentLayoutMode,
        setLayoutOrder,

        // Clearers (modify state.settings and call saveSettings)
        clearLayoutOrder,
        clearSoundEmoji,
        clearSoundColor,

        // Import/Export
        exportSettings,
        importSettings,

        // Reset
        resetAllSettings
    };
})();