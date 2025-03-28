// --- NEW FILE START ---
const persistence = (() => {
    const STORAGE_KEY = 'sounduxRemoteSettings';
    const CURRENT_VERSION = 1;

    // Default settings structure
    const getDefaultSettings = () => ({
        version: CURRENT_VERSION,
        soundSettings: {}, // Key: sound.path, Value: { color: '...', emoji: '...' }
        tabLayouts: {},    // Key: tabId or 'favorites', Value: { layoutMode: { order: [...paths], currentLayoutMode: '...' } }
    });

    // Load settings from localStorage
    const loadSettings = () => {
        try {
            const storedSettings = localStorage.getItem(STORAGE_KEY);
            if (storedSettings) {
                let settings = JSON.parse(storedSettings);
                // Basic validation and potential migration
                if (typeof settings === 'object' && settings !== null && settings.version === CURRENT_VERSION) {
                    // Ensure nested objects exist
                    settings.soundSettings = settings.soundSettings || {};
                    settings.tabLayouts = settings.tabLayouts || {};
                    console.log('Loaded settings from localStorage:', settings);
                    return settings;
                } else {
                    console.warn('Stored settings version mismatch or invalid format. Using defaults.');
                     // Optionally handle migration here if settings.version is older
                }
            }
        } catch (error) {
            console.error('Error loading settings from localStorage:', error);
        }
        console.log('No valid settings found in localStorage. Using defaults.');
        return getDefaultSettings();
    };

    // Save settings to localStorage
    const saveSettings = (settings) => {
        try {
            if (!settings || typeof settings !== 'object') {
                 console.error("Attempted to save invalid settings:", settings);
                 return;
            }
            settings.version = CURRENT_VERSION; // Ensure version is up-to-date
            const settingsString = JSON.stringify(settings);
            localStorage.setItem(STORAGE_KEY, settingsString);
            // console.log('Saved settings to localStorage:', settings); // DEBUG
        } catch (error) {
            console.error('Error saving settings to localStorage:', error);
        }
    };

    // --- Getters ---

    const getSoundSettings = (soundPath) => {
        const settings = state.settings.soundSettings || {};
        return settings[soundPath] || {}; // Return empty object if not found
    };

    const getTabLayoutSettings = (tabId) => {
        const settings = state.settings.tabLayouts || {};
        return settings[tabId] || {}; // Return empty object if not found
    };

    const getCurrentLayoutMode = (tabId) => {
        const tabSettings = getTabLayoutSettings(tabId);
        // Default to 'grid-3' if not set
        return tabSettings.currentLayoutMode || 'grid-3';
    };

    const getLayoutOrder = (tabId, layoutMode) => {
        const tabSettings = getTabLayoutSettings(tabId);
        return tabSettings[layoutMode]?.order || null; // Return null if no custom order
    };

     // --- Setters ---

     const setSoundSetting = (soundPath, key, value) => {
         state.settings.soundSettings = state.settings.soundSettings || {};
         state.settings.soundSettings[soundPath] = state.settings.soundSettings[soundPath] || {};
         state.settings.soundSettings[soundPath][key] = value;
         saveSettings(state.settings);
     };

     const removeSoundSetting = (soundPath, key) => {
         if (state.settings.soundSettings && state.settings.soundSettings[soundPath]) {
             delete state.settings.soundSettings[soundPath][key];
             // Clean up empty sound objects
             if (Object.keys(state.settings.soundSettings[soundPath]).length === 0) {
                 delete state.settings.soundSettings[soundPath];
             }
             saveSettings(state.settings);
         }
     };

     const clearSoundEmoji = (soundPath) => {
         removeSoundSetting(soundPath, 'emoji');
     };

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
             removeSoundSetting(soundPath, 'emoji');
         }
     };

     const setCurrentLayoutMode = (tabId, layoutMode) => {
         state.settings.tabLayouts = state.settings.tabLayouts || {};
         state.settings.tabLayouts[tabId] = state.settings.tabLayouts[tabId] || {};
         state.settings.tabLayouts[tabId].currentLayoutMode = layoutMode;
         saveSettings(state.settings);
     };

     const setLayoutOrder = (tabId, layoutMode, orderArray) => {
         state.settings.tabLayouts = state.settings.tabLayouts || {};
         state.settings.tabLayouts[tabId] = state.settings.tabLayouts[tabId] || {};
         state.settings.tabLayouts[tabId][layoutMode] = state.settings.tabLayouts[tabId][layoutMode] || {};
         state.settings.tabLayouts[tabId][layoutMode].order = orderArray;
         saveSettings(state.settings);
     };


    // --- Export / Import ---

    const exportSettings = () => {
        try {
            const settingsToExport = loadSettings(); // Load fresh copy
            const settingsString = JSON.stringify(settingsToExport, null, 2); // Pretty print
            const blob = new Blob([settingsString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const date = new Date().toISOString().slice(0, 10);
            a.download = `soundux-remote-settings-${date}.json`;
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
            if (!file) {
                return reject(new Error('No file selected.'));
            }
            if (file.type !== 'application/json') {
                 return reject(new Error('Invalid file type. Please select a JSON file.'));
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importedSettings = JSON.parse(event.target.result);

                    // --- Basic Validation ---
                    if (typeof importedSettings !== 'object' || importedSettings === null ||
                        !importedSettings.hasOwnProperty('sounduxRemoteSettings') ||
                        typeof importedSettings.sounduxRemoteSettings !== 'object' ||
                        !importedSettings.sounduxRemoteSettings.hasOwnProperty('version')) {
                        throw new Error('Invalid settings file format.');
                    }

                    const dataToSave = importedSettings.sounduxRemoteSettings;

                    // You could add more specific validation here (e.g., check version)
                    if (dataToSave.version !== CURRENT_VERSION) {
                        console.warn(`Imported settings version (${dataToSave.version}) differs from current (${CURRENT_VERSION}). Proceeding anyway.`);
                        // Potentially add migration logic here in the future
                    }

                    // Overwrite existing settings
                    saveSettings(dataToSave);
                    state.settings = dataToSave; // Update in-memory state

                    console.log('Settings imported successfully.');
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

    // Public interface
    return {
        load: loadSettings,
        save: saveSettings,
        getSoundSettings,
        getTabLayoutSettings,
        getCurrentLayoutMode,
        getLayoutOrder,
        setSoundColor,
        setSoundEmoji,
        clearSoundEmoji,
        setCurrentLayoutMode,
        setLayoutOrder,
        exportSettings,
        importSettings
    };
})();