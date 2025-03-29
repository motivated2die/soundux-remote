// Global state management
const state = {
    currentlyPlaying: new Map(), // Map soundId -> playingId
    tabs: [],
    currentTab: null, // Can be tabId (string) or 'favorites' (string)
    settings: {}, // Loaded by persistence module directly now
    apiBaseUrl: '', // Determined on init
    longPressTimer: null,
    longPressTarget: null,
    lastLongPressTime: 0,
};

// DOM Elements
const serverStatusEl = document.getElementById('server-status-text');
const statusIndicatorEl = document.getElementById('status-indicator');
const stopAllButton = document.getElementById('stop-all');
const tabsContainerEl = document.getElementById('tabs-container');
const soundsContainerEl = document.getElementById('sounds-container');
const topBarEl = document.getElementById('top-bar');
const playIndicatorEl = document.getElementById('play-indicator');
const appSettingsButton = document.getElementById('app-settings-button');
const appSettingsModalOverlay = document.getElementById('app-settings-modal-overlay');
const closeAppSettingsButton = document.getElementById('close-app-settings-button');
const exportSettingsButton = document.getElementById('export-settings-button');
const importSettingsButton = document.getElementById('import-settings-button');
const importFileInput = document.getElementById('import-file-input');
// Reset Buttons
const resetCurrentPageVisualsButton = document.getElementById('reset-current-page-visuals');
const resetCurrentPageLayoutButton = document.getElementById('reset-current-page-layout');
const resetAllSettingsButton = document.getElementById('reset-all-settings');

// --- Top Bar Progress & Indicator Updates ---
function updateTopBarProgress(percentage) {
    if (topBarEl) {
        const clampedPercentage = Math.max(0, Math.min(100, percentage));
        topBarEl.style.setProperty('--progress-percentage', `${clampedPercentage}%`);
    }
}

function updatePlayIndicator(isPlaying) {
    if (playIndicatorEl) {
        playIndicatorEl.classList.toggle('hidden', !isPlaying);
    }
}

// Initialize the application
function init() {
    state.apiBaseUrl = window.location.origin;
    console.log("API Base URL:", state.apiBaseUrl);
    // Load settings using the persistence module
    state.settings = persistence.load();
    console.log("Initial settings loaded:", state.settings);
    checkServerStatus(); // This will now call loadTabs, which depends on state.settings
    setupEventListeners();
}

// --- API Helper ---
async function apiFetch(endpoint, options = {}) {
    const url = `${state.apiBaseUrl}${endpoint}`;
    try {
        const response = await fetch(url, { credentials: 'include', ...options });
        if (!response.ok) {
            if (response.status === 401) {
                 console.warn("API request unauthorized. Redirecting to login.");
                 // Avoid infinite loop if login page itself fails auth check
                 if (window.location.pathname !== '/login.html') {
                    window.location.href = '/login.html';
                 }
                 throw new Error('Unauthorized');
            }
            try {
                 const errorData = await response.json();
                 throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            } catch (parseError) {
                 throw new Error(`HTTP error! status: ${response.status}`);
            }
        }
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return await response.json();
        } else {
            // If expecting JSON but didn't get it, treat as error for robustness
            if (options.headers && options.headers['Accept'] === 'application/json') {
                 console.error(`API Fetch Error: Expected JSON but received ${contentType} for ${endpoint}`);
                 throw new Error("Unexpected response format from server.");
            }
            return response; // Return raw response otherwise
        }
    } catch (error) {
        console.error(`API Fetch Error for ${endpoint}:`, error);
        if (serverStatusEl) serverStatusEl.textContent = 'Connection Error';
        if (statusIndicatorEl) statusIndicatorEl.className = 'status-dot error';
        throw error; // Re-throw to be handled by caller
    }
}

// --- Server Status & Initial Load ---
async function checkServerStatus() {
    try {
        await apiFetch('/api/status');
        if (serverStatusEl) serverStatusEl.textContent = 'Connected';
        if (statusIndicatorEl) statusIndicatorEl.className = 'status-dot connected';
        updateTopBarProgress(0);
        updatePlayIndicator(false);

        await loadTabs(); // Load tabs and activate the first/last active one

        // Check state.currentTab *after* loadTabs potentially sets it
        if (state.currentTab !== null && typeof state.currentTab !== 'undefined') {
            checkForPlayingSounds(); // Check for sounds playing on load
        } else {
            console.warn("No current tab set after loadTabs, skipping initial checkForPlayingSounds.");
            if (tabsContainerEl && tabsContainerEl.children.length === 0) {
                 tabsContainerEl.innerHTML = '<p class="error-text">No tabs found.</p>';
            }
             if(soundsContainerEl) soundsContainerEl.innerHTML = '<p class="no-sounds">Select a tab.</p>'; // Clear sounds area if no tab
        }
        // Signal app is ready AFTER potentially setting currentTab and loading initial sounds (or determining no tab)
        document.dispatchEvent(new CustomEvent('appReady'));

    } catch (error) {
        console.error("Failed initial server status check or tab load sequence.");
        if (tabsContainerEl) tabsContainerEl.innerHTML = '<p class="error-text">Failed to connect.</p>';
        if (soundsContainerEl) soundsContainerEl.innerHTML = '<p class="error-text">Failed to connect.</p>';
        updateTopBarProgress(0);
        updatePlayIndicator(false);
        // Signal ready even on error so modules don't wait forever
        document.dispatchEvent(new CustomEvent('appReady'));
    }
}


// --- Event Listeners ---
function setupEventListeners() {
    if (stopAllButton) stopAllButton.addEventListener('click', stopAllSounds);
    else console.error("Stop All button not found");

    if (appSettingsButton) appSettingsButton.addEventListener('click', openAppSettingsModal);
    else console.error("App Settings button not found");

    if (appSettingsModalOverlay) {
        appSettingsModalOverlay.addEventListener('click', (e) => {
             if (e.target === appSettingsModalOverlay) closeAppSettingsModal();
        });
    } else console.error("App Settings modal overlay not found");

    if (closeAppSettingsButton) closeAppSettingsButton.addEventListener('click', closeAppSettingsModal);
    else console.error("Close App Settings button not found");

    if (exportSettingsButton) exportSettingsButton.addEventListener('click', persistence.exportSettings);
    else console.error("Export Settings button not found");

    if (importSettingsButton) importSettingsButton.addEventListener('click', () => importFileInput?.click());
    else console.error("Import Settings button not found");

    if (importFileInput) importFileInput.addEventListener('change', handleImportFile);
    else console.error("Import File input not found");

    const fullscreenToggle = document.getElementById('auto-fullscreen-toggle');
    if (fullscreenToggle && window.fullscreenManager) {
        // Listener is set up within fullscreen.js
    } else if (!fullscreenToggle) { console.error("Fullscreen toggle not found"); }
      else { console.error("Fullscreen Manager not found"); }

    if (soundsContainerEl) {
        soundsContainerEl.addEventListener('click', (e) => {
            const card = e.target.closest('.sound-card');
            if (!card) return;
            const soundId = parseInt(card.dataset.soundId);
            if (isNaN(soundId)) return;

            const timeSinceLongPress = Date.now() - (state.lastLongPressTime || 0);
            // Increase tolerance slightly for long press end vs click start
            if (timeSinceLongPress < 350) {
                // console.log("Click ignored shortly after long press end.");
                return;
            }

            if (editMode.isActive()) {
                // Open settings only if edit mode is active AND soundSettings module exists
                if (window.soundSettings && typeof window.soundSettings.open === 'function') {
                    window.soundSettings.open(soundId);
                } else {
                    console.error("Sound settings module not available or open function missing.");
                }
            } else {
                // Play sound only if edit mode is NOT active
                playSound(soundId);
            }
        });
    } else { console.error("Sounds container element not found"); }

     document.addEventListener('settingsChanged', () => {
         // console.log("Global settings changed event received.");
         // Might trigger UI updates if needed, e.g., reload sounds if volumes changed globally
     });

     // Setup long press listeners for reset buttons
     setupLongPressResetButtons();
}

// --- Long Press Reset Button Logic (Keep existing code from previous step) ---
const longPressState = {
    timer: null,
    interval: null,
    startTime: 0,
    target: null,
    duration: 1000, // Default duration
    isPressing: false,
    isConfirming: false,
    hasMoved: false,
    startPos: { x: 0, y: 0 }
};

function setupLongPressResetButtons() {
    const buttons = [
        resetCurrentPageVisualsButton,
        resetCurrentPageLayoutButton,
        resetAllSettingsButton
    ];

    buttons.forEach(button => {
        if (!button) {
            console.warn("A reset button was not found.");
            return;
        }

        const duration = parseInt(button.dataset.longPressDuration) || 1000;

        button.style.setProperty('--long-press-duration', `${duration}ms`);

        // Touch Events
        button.addEventListener('touchstart', (e) => handleLongPressStart(e, button, duration), { passive: true });
        button.addEventListener('touchmove', handleLongPressMove, { passive: true });
        button.addEventListener('touchend', handleLongPressEnd);
        button.addEventListener('touchcancel', handleLongPressEnd); // Handle cancellation

        // Mouse Events (Fallback)
        button.addEventListener('mousedown', (e) => handleLongPressStart(e, button, duration));
        button.addEventListener('mousemove', handleLongPressMove);
        button.addEventListener('mouseup', handleLongPressEnd);
        button.addEventListener('mouseleave', handleLongPressEnd); // Cancel if mouse leaves button

        // Click Event (for confirmation)
        button.addEventListener('click', () => handleLongPressClick(button));
    });
}

function handleLongPressStart(e, button, duration) {
    if (longPressState.isPressing || longPressState.isConfirming) return;

    longPressState.isPressing = true;
    longPressState.target = button;
    longPressState.duration = duration;
    longPressState.startTime = Date.now();
    longPressState.hasMoved = false;

    const touch = e.touches ? e.touches[0] : e;
    longPressState.startPos = { x: touch.clientX, y: touch.clientY };

    resetButtonState(button); // Reset visual state immediately
    button.classList.add('pressing'); // Add class to trigger animation

    longPressState.timer = setTimeout(() => {
        if (longPressState.isPressing && !longPressState.hasMoved && longPressState.target === button) {
            enterConfirmingState(button);
        } else {
             // If timer finishes but conditions aren't met (e.g., moved), ensure reset
             cancelLongPress();
        }
    }, longPressState.duration);
}

function handleLongPressMove(e) {
    if (!longPressState.isPressing || longPressState.hasMoved) return;

    const touch = e.touches ? e.touches[0] : e;
    const deltaX = Math.abs(touch.clientX - longPressState.startPos.x);
    const deltaY = Math.abs(touch.clientY - longPressState.startPos.y);

    if (deltaX > 10 || deltaY > 10) { // Movement threshold
        longPressState.hasMoved = true;
        console.log("Long press cancelled due to movement.");
        cancelLongPress();
    }
}

function handleLongPressEnd() {
    if (!longPressState.isPressing) return;

    // Clear the confirmation timer regardless
    clearTimeout(longPressState.timer);
    longPressState.timer = null;

    // If we weren't confirming and haven't moved, it was a short tap or cancelled press
    if (!longPressState.isConfirming && !longPressState.hasMoved) {
        resetButtonState(longPressState.target);
    }
     // If confirming state was reached, it stays until clicked

    longPressState.isPressing = false;
    // Keep target for potential click confirmation
}


function handleLongPressClick(button) {
    if (longPressState.isConfirming && longPressState.target === button) {
        console.log(`Confirmed action for: ${button.id}`);
        executeResetAction(button.id);
        // Reset state *after* action potentially finishes
        resetButtonState(button);
        longPressState.isConfirming = false;
        longPressState.target = null;
    } else {
         // If clicked without confirming, ensure state is reset
         if (longPressState.target === button) { // Only reset if this was the target
            cancelLongPress(); // Clears timers and resets visual if needed
         }
    }
}

function enterConfirmingState(button) {
    if (!button || !longPressState.isPressing) return; // Ensure still pressing
    console.log(`Entering confirming state for: ${button.id}`);
    clearTimeout(longPressState.timer); // Ensure timer is stopped
    longPressState.timer = null;
    longPressState.isConfirming = true;
    longPressState.isPressing = false; // No longer actively pressing
    button.classList.remove('pressing');
    button.classList.add('confirming');
    button.textContent = 'Tap again to confirm'; // Change text
    if (navigator.vibrate) navigator.vibrate(50); // Haptic feedback
}

function resetButtonState(button) {
    if (!button) return;
    button.classList.remove('confirming', 'pressing');
    // Restore original text based on ID
    switch (button.id) {
        case 'reset-current-page-visuals': button.textContent = 'Long press to reset current page visuals'; break;
        case 'reset-current-page-layout': button.textContent = 'Long press to reset current page layout'; break;
        case 'reset-all-settings': button.textContent = 'Long press to reset ALL settings'; break;
    }
}

function cancelLongPress() {
    clearTimeout(longPressState.timer);
    longPressState.timer = null;
    if (longPressState.target && !longPressState.isConfirming) {
        resetButtonState(longPressState.target);
    }
    longPressState.isPressing = false;
    // Don't reset target if confirming
}

// --- Reset Action Execution (Keep existing code from previous step) ---
async function executeResetAction(buttonId) {
    const currentTabId = state.currentTab;
    if (!currentTabId && buttonId !== 'reset-all-settings') {
        console.error("Cannot perform page-specific reset: No current tab ID.");
        alert("Error: Could not determine the current tab.");
        return;
    }

    try {
        switch (buttonId) {
            case 'reset-current-page-visuals':
                console.log(`Resetting visuals for tab: ${currentTabId}`);
                await resetCurrentPageVisuals(currentTabId);
                break;
            case 'reset-current-page-layout':
                console.log(`Resetting layout for tab: ${currentTabId}`);
                await resetCurrentPageLayout(currentTabId);
                break;
            case 'reset-all-settings':
                console.log("Resetting ALL settings.");
                await resetAllSettings();
                break;
            default:
                console.warn(`Unknown reset action: ${buttonId}`);
        }
    } catch (error) {
        console.error(`Error during reset action (${buttonId}):`, error);
        alert(`An error occurred while resetting: ${error.message}`);
    }
}

async function resetCurrentPageVisuals(tabId) {
    const soundsOnPage = Array.from(soundsContainerEl?.querySelectorAll('.sound-card[data-sound-path]') || []);
    if (soundsOnPage.length === 0) {
        console.log("No sounds found on the current page to reset visuals for.");
        return;
    }

    console.log(`Found ${soundsOnPage.length} sounds on page ${tabId} to reset visuals.`);
    let settingsChanged = false;
    soundsOnPage.forEach(card => {
        const soundPath = card.dataset.soundPath;
        if (soundPath) {
            const currentSettings = persistence.getSoundSettings(soundPath);
            // Use clear functions which handle removing keys
            if (currentSettings.color && currentSettings.color !== 'default') {
                 persistence.clearSoundColor(soundPath);
                 settingsChanged = true;
            }
            if (currentSettings.emoji) {
                 persistence.clearSoundEmoji(soundPath);
                 settingsChanged = true;
            }
            // If we also want to reset volume on visual reset:
            // if (currentSettings.hasCustomVolume) {
            //     persistence.removeSoundSetting(soundPath, 'localVolume');
            //     persistence.removeSoundSetting(soundPath, 'remoteVolume');
            //     persistence.removeSoundSetting(soundPath, 'hasCustomVolume');
            //     settingsChanged = true;
            // }
        }
    });

    if (settingsChanged) {
        console.log("Visual settings were changed, reloading sounds.");
        reloadSoundsForCurrentTab(); // Call the global reload function
    }
}

async function resetCurrentPageLayout(tabId) {
    const currentLayout = persistence.getCurrentLayoutMode(tabId);
    if (!currentLayout) {
        console.error("Could not determine current layout mode for reset.");
        return; // Or default to a specific layout?
    }
    console.log(`Clearing layout order for tab ${tabId}, layout ${currentLayout}`);
    const orderExisted = persistence.getLayoutOrder(tabId, currentLayout) !== null;
    persistence.clearLayoutOrder(tabId, currentLayout);

    if (orderExisted) {
        console.log("Layout order existed and was cleared, reloading sounds.");
        reloadSoundsForCurrentTab(); // Call the global reload function
    }
}

async function resetAllSettings() {
    persistence.resetAllSettings();
    state.settings = persistence.load(); // Reload settings into global state

    // Update UI elements tied to settings
    if (window.fullscreenManager && typeof state.settings.autoFullscreenEnabled !== 'undefined') {
        const fsToggle = document.getElementById('auto-fullscreen-toggle');
        if (fsToggle) fsToggle.checked = state.settings.autoFullscreenEnabled;
        fullscreenManager.setEnabled(state.settings.autoFullscreenEnabled);
    }

    // Reload tabs and sounds completely
    console.log("Reloading tabs after resetting all settings.");
    await loadTabs(); // This implicitly reloads sounds for the newly determined active tab

    // Close the settings modal after resetting all
    console.log("Closing settings modal after reset all.");
    closeAppSettingsModal();
}


// --- App Settings Modal (Keep existing code from previous step) ---
function openAppSettingsModal() {
    if (window.fullscreenManager) {
        const toggle = document.getElementById('auto-fullscreen-toggle');
        if (toggle && state.settings && typeof state.settings.autoFullscreenEnabled !== 'undefined') {
             toggle.checked = state.settings.autoFullscreenEnabled;
        } else if (toggle) {
             toggle.checked = false; // Default if setting missing
        }
    }
    // Reset confirmation states when modal opens
    [resetCurrentPageVisualsButton, resetCurrentPageLayoutButton, resetAllSettingsButton].forEach(btn => {
        if(btn) resetButtonState(btn);
    });
    longPressState.isConfirming = false;
    longPressState.target = null;
    clearTimeout(longPressState.timer); // Clear any stray timers

    appSettingsModalOverlay?.classList.remove('hidden');
}

function closeAppSettingsModal() {
    appSettingsModalOverlay?.classList.add('hidden');
     // Also ensure confirmation state is reset if modal closed while confirming
     if (longPressState.isConfirming && longPressState.target) {
         resetButtonState(longPressState.target);
     }
     longPressState.isConfirming = false;
     longPressState.target = null;
     clearTimeout(longPressState.timer);
}

async function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        await persistence.importSettings(file);
        alert('Settings imported successfully! Reloading sounds...');
        state.settings = persistence.load(); // Reload in-memory state

        // Update UI from imported settings
        if (window.fullscreenManager && typeof state.settings.autoFullscreenEnabled !== 'undefined') {
             const fsToggle = document.getElementById('auto-fullscreen-toggle');
             if(fsToggle) fsToggle.checked = state.settings.autoFullscreenEnabled;
             fullscreenManager.setEnabled(state.settings.autoFullscreenEnabled);
        }

        // Reload sounds for the *currently selected* tab to apply new layouts/visuals
        reloadSoundsForCurrentTab();
        closeAppSettingsModal(); // Close modal after successful import

    } catch (error) {
        console.error('Import failed:', error);
        alert(`Failed to import settings: ${error.message}`);
    } finally {
        if (event.target) event.target.value = null; // Reset file input
    }
}

// --- Tabs ---
async function loadTabs() {
    if (!tabsContainerEl) {
         console.error("Tabs container not found, cannot load tabs.");
         state.currentTab = null; // Ensure state reflects no tab selected
         return;
    }
    try {
        const tabsFromApi = await apiFetch('/api/tabs');
        state.tabs = tabsFromApi; // Update global state
        tabsContainerEl.innerHTML = ''; // Clear existing tabs

        // Always add Favorites tab first
        const favTabElement = createTabElement('Favorites', 'favorites', 'favorite');
        tabsContainerEl.appendChild(favTabElement);

        // Add tabs from API
        tabsFromApi.forEach(tab => {
            const tabElement = createTabElement(tab.name, String(tab.id)); // Ensure ID is string
            tabsContainerEl.appendChild(tabElement);
        });

        // Determine which tab to activate
        // Use persisted lastTabId, default to 'favorites' if not set or invalid
        let persistedTabId = String(state.settings.lastTabId || 'favorites'); // Ensure string

        // Verify the persisted tab ID still exists (either 'favorites' or in the API tabs)
        const isValidPersistedId = persistedTabId === 'favorites' || tabsFromApi.some(t => String(t.id) === persistedTabId);

        const targetTabId = isValidPersistedId ? persistedTabId : 'favorites'; // Fallback to favorites

        const tabToActivate = tabsContainerEl.querySelector(`[data-tab-id="${targetTabId}"]`);

        if (tabToActivate) {
            // setActiveTab will handle setting state.currentTab and loading sounds
            await setActiveTab(tabToActivate, targetTabId);
        } else if (tabsContainerEl.children.length > 0) {
            // Fallback: activate the first tab (which should be Favorites) if target wasn't found
            console.warn(`Target tab ID "${targetTabId}" not found, activating first tab.`);
            const firstTab = tabsContainerEl.children[0];
            await setActiveTab(firstTab, firstTab.dataset.tabId);
        } else {
            console.warn("No tabs found or available to activate.");
            state.currentTab = null;
            if(soundsContainerEl) soundsContainerEl.innerHTML = '<p class="no-sounds">No tabs available.</p>';
        }

    } catch (error) {
        console.error('Error loading tabs:', error);
        if (tabsContainerEl) tabsContainerEl.innerHTML = '<p class="error-text">Failed to load tabs.</p>';
        state.currentTab = null; // Reset state on error
        if(soundsContainerEl) soundsContainerEl.innerHTML = '<p class="error-text">Failed to load tabs.</p>';
    }
}

function createTabElement(name, id, iconName = null) {
    const tabElement = document.createElement('button');
    tabElement.className = 'tab';
    tabElement.dataset.tabId = String(id); // Ensure ID is stored as string

    if (iconName) {
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined';
        icon.textContent = iconName;
         if (String(id) === 'favorites') {
             icon.style.fontVariationSettings = "'FILL' 1";
             icon.style.color = 'var(--text-secondary)';
         }
        tabElement.appendChild(icon);
        tabElement.setAttribute('aria-label', name || 'Favorites');
    }

    // Add text label (even for icon tabs, could be visually hidden if needed)
    const textSpan = document.createElement('span');
    textSpan.textContent = name || (String(id) === 'favorites' ? 'Favorites' : `Tab ${id}`);
    tabElement.appendChild(textSpan);


    tabElement.addEventListener('click', () => {
        // Pass the string ID
        setActiveTab(tabElement, String(id));
    });
    return tabElement;
}

async function setActiveTab(tabElement, tabId) {
    const currentTabStr = state.currentTab; // Already a string or null
    const newTabIdStr = String(tabId); // Ensure incoming ID is string

    if (!soundsContainerEl) {
         console.error("Cannot set active tab: Sounds container not found.");
         return;
    }

    // Only proceed if the tab is actually changing
    if (currentTabStr === newTabIdStr) {
         // console.log(`Tab ${newTabIdStr} is already active.`);
         return;
    }

    console.log(`Activating tab: ${newTabIdStr}`);

    // Update UI
    tabsContainerEl.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    if (tabElement) {
        tabElement.classList.add('active');
         // Scroll into view after activation
         setTimeout(() => {
             tabElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
         }, 50);
    }


    // Update global state and persistence
    state.currentTab = newTabIdStr;
    state.settings.lastTabId = newTabIdStr;
    persistence.save(state.settings); // Save the last active tab

    // Notify other modules about the change *before* loading sounds
    document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tabId: newTabIdStr } }));

    // Load sounds for the new tab
    await loadSounds(newTabIdStr);
}

// --- Sounds ---
async function loadSounds(tabId) {
     if (!soundsContainerEl) {
          console.error("Cannot load sounds: Sounds container not found.");
          return;
     }
    if (tabId === null || typeof tabId === 'undefined') {
        console.warn("loadSounds called with invalid tabId:", tabId);
        soundsContainerEl.innerHTML = '<p class="no-sounds">Select a tab.</p>';
        return;
    }
     soundsContainerEl.innerHTML = '<p class="loading-sounds">Loading...</p>';
     console.log(`Loading sounds for tab: ${tabId}`);

    try {
        // 1. Determine API endpoint
        const endpoint = (tabId === 'favorites') ? '/api/favorites' : `/api/tabs/${tabId}/sounds`;
        const soundsFromApi = await apiFetch(endpoint);

        // 2. Get current layout mode for this tab
        const currentLayout = persistence.getCurrentLayoutMode(tabId); // e.g., 'grid-3'
        console.log(`Current layout for tab ${tabId}: ${currentLayout}`);

        // 3. Get persisted order for this specific layout
        const persistedOrderPaths = persistence.getLayoutOrder(tabId, currentLayout); // Array of sound paths or null
        console.log(`Persisted order for tab ${tabId}, layout ${currentLayout}:`, persistedOrderPaths);

        let soundsToDisplay = [];

        if (Array.isArray(persistedOrderPaths) && persistedOrderPaths.length > 0) {
            // 4a. Apply persisted order
            const soundsApiPathMap = new Map(soundsFromApi.map(sound => [sound.path, sound]));
            const orderedSounds = [];
            const soundsNotFoundInApi = []; // Track paths in order but not in API result

            persistedOrderPaths.forEach(path => {
                if (soundsApiPathMap.has(path)) {
                    orderedSounds.push(soundsApiPathMap.get(path));
                    soundsApiPathMap.delete(path); // Remove from map so we know what's left
                } else {
                     soundsNotFoundInApi.push(path); // Keep track of missing sounds
                }
            });

             if (soundsNotFoundInApi.length > 0) {
                 console.warn(`Sounds in persisted order but not found in API for tab ${tabId}, layout ${currentLayout}:`, soundsNotFoundInApi);
                 // Optionally clean up the persisted order here if desired
                 // const validOrder = orderedSounds.map(s => s.path);
                 // persistence.setLayoutOrder(tabId, currentLayout, validOrder);
             }

            // Append any new sounds from the API that weren't in the persisted order
            const newSounds = Array.from(soundsApiPathMap.values());
            if (newSounds.length > 0) {
                console.log(`Found ${newSounds.length} new sound(s) not in persisted order for tab ${tabId}, layout ${currentLayout}. Appending.`);
            }

            soundsToDisplay = [...orderedSounds, ...newSounds];
            console.log(`Applied persisted order. Final count: ${soundsToDisplay.length}`);

        } else {
            // 4b. No persisted order, use API order
            soundsToDisplay = soundsFromApi;
            console.log(`No persisted order found for tab ${tabId}, layout ${currentLayout}. Using API order. Count: ${soundsToDisplay.length}`);
        }

        // 5. Display the sounds
        displaySounds(soundsToDisplay);

    } catch (error) {
        console.error(`Error loading sounds for tab ${tabId}:`, error);
        if (soundsContainerEl) soundsContainerEl.innerHTML = `<p class="error-text">Failed to load sounds for this tab.</p>`;
    }
}

function reloadSoundsForCurrentTab() {
    if (state.currentTab !== null && typeof state.currentTab !== 'undefined') {
        console.log(`Reloading sounds requested for current tab: ${state.currentTab}`);
        loadSounds(state.currentTab);
    } else {
        console.warn("Cannot reload sounds: No current tab is set.");
        if(soundsContainerEl) soundsContainerEl.innerHTML = '<p class="no-sounds">Select a tab.</p>';
    }
}

function displaySounds(sounds) {
    if (!soundsContainerEl) return;
    soundsContainerEl.innerHTML = ''; // Clear previous sounds or loading message
    if (!sounds || sounds.length === 0) {
         const message = state.currentTab === 'favorites' ? "No favorites added yet." : "No sounds found in this tab.";
         soundsContainerEl.innerHTML = `<p class="no-sounds">${message}</p>`;
        return;
    }

    // Create a document fragment for efficiency
    const fragment = document.createDocumentFragment();
    sounds.forEach(sound => {
        // Basic validation of sound object
        if (!sound || typeof sound.id === 'undefined' || !sound.path || !sound.name) {
             console.warn("Skipping invalid sound data during display:", sound);
             return; // Skip this invalid sound
        }
        const soundElement = createSoundCardElement(sound);
        if (soundElement) {
             fragment.appendChild(soundElement);
        } else {
             console.warn("Failed to create sound card element for:", sound);
        }
    });

    // Append the fragment to the container
    soundsContainerEl.appendChild(fragment);
    console.log(`Displayed ${sounds.length} sounds.`);
}

function createSoundCardElement(sound) {
    const soundElement = document.createElement('div');
    soundElement.className = 'sound-card fade-in';
    soundElement.dataset.soundId = sound.id;
    soundElement.dataset.soundPath = sound.path; // Crucial for persistence

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'sound-content-wrapper';

    const textElement = document.createElement('span');
    textElement.className = 'sound-text';
    textElement.textContent = sound.name;

    contentWrapper.appendChild(textElement);
    soundElement.appendChild(contentWrapper);

    // Initial application of visual settings (color, emoji, indicators)
    // Make sure persistence data is loaded *before* this might be called
    updateSoundCardDisplay(sound.id, soundElement);

    // Check if this sound is currently playing and apply visual state
    if (state.currentlyPlaying.has(sound.id)) {
        soundElement.classList.add('playing');
        // Get progress info if available in the tracking map
        const playingInstance = soundProgress.activeSounds.get(state.currentlyPlaying.get(sound.id));
        if (playingInstance && playingInstance.lengthInMs > 0) {
            const percentage = (playingInstance.readInMs / playingInstance.lengthInMs) * 100;
            // Apply gradient background only if not in list view
            if (!soundsContainerEl?.classList.contains('layout-list')) {
                const baseColor = soundElement.style.getPropertyValue('--sound-base-color') || 'var(--v-surface-dark)';
                soundElement.style.background = `linear-gradient(to right, var(--v-primary-darken1) ${percentage}%, ${baseColor} ${percentage}%)`;
            }
        }
    }

    return soundElement;
}

function updateSoundCardDisplay(soundId, cardElement = null) {
    const card = cardElement || soundsContainerEl?.querySelector(`.sound-card[data-sound-id="${soundId}"]`);
    if (!card) {
        // console.warn(`Cannot update display: Card element not found for soundId ${soundId}.`);
        return;
    }

    const soundPath = card.dataset.soundPath;
    if (!soundPath) {
        console.warn(`Cannot update display for soundId ${soundId}: missing soundPath dataset.`);
        return;
    }

    // Ensure state.settings is initialized before accessing persistence
    if (!state.settings) {
         console.error("Cannot update display: Global state.settings not initialized.");
         return;
    }
    const soundSettings = persistence.getSoundSettings(soundPath); // Uses state.settings internally now

    const contentWrapper = card.querySelector('.sound-content-wrapper');
    const textElement = card.querySelector('.sound-text');

    // --- Indicators ---
    let indicators = card.querySelector('.sound-indicators');
    if (!indicators) {
        indicators = document.createElement('div');
        indicators.className = 'sound-indicators';
        // Insert after content wrapper or append as fallback
        if (contentWrapper) card.insertBefore(indicators, contentWrapper.nextSibling);
        else card.appendChild(indicators);
    }
    indicators.innerHTML = ''; // Clear existing indicators

    // Favorite Indicator
    const isFavorite = soundSettings.favorite === true; // Explicitly check for true
    card.dataset.favorite = isFavorite ? 'true' : 'false'; // Set dataset attribute
    if (isFavorite) {
        const favIcon = document.createElement('span');
        favIcon.className = 'indicator-icon material-symbols-outlined favorite-indicator';
        favIcon.textContent = 'favorite';
        indicators.appendChild(favIcon);
    }

    // Custom Volume Indicator
    const hasCustomVolume = soundSettings.hasCustomVolume === true; // Explicitly check for true
     card.dataset.customVolume = hasCustomVolume ? 'true' : 'false'; // Set dataset attribute
    if (hasCustomVolume) {
        const volIcon = document.createElement('span');
        volIcon.className = 'indicator-icon material-symbols-outlined volume-indicator';
        volIcon.textContent = 'volume_up';
        indicators.appendChild(volIcon);
    }

    // Remove indicator container if empty
    if (indicators.children.length === 0 && card.contains(indicators)) {
        card.removeChild(indicators);
    }

    // --- Apply Color ---
    let baseColor = 'var(--v-surface-dark)'; // Default background
    // Remove any existing color classes first
    card.classList.forEach(className => {
        if (className.startsWith('sound-color-')) card.classList.remove(className);
    });
    // Apply new color class if set and not default
    if (soundSettings.color && soundSettings.color !== 'default') {
        const colorClass = `sound-color-${soundSettings.color}`;
        card.classList.add(colorClass);
        baseColor = `var(--sound-color-${soundSettings.color}-bg)`; // Get the corresponding background variable
    }
    card.style.setProperty('--sound-base-color', baseColor); // Set CSS variable for gradient use

    // --- Apply Emoji ---
    card.style.removeProperty('--sound-emoji'); // Remove potential grid emoji style
    // Remove existing list emoji span if present
    const existingEmojiSpan = contentWrapper?.querySelector('.sound-emoji-list');
    if (existingEmojiSpan) contentWrapper.removeChild(existingEmojiSpan);

    if (soundSettings.emoji && textElement && contentWrapper) {
        const currentLayoutClass = soundsContainerEl?.classList.contains('layout-list') ? 'layout-list' : 'layout-grid'; // Simplified check

        if (currentLayoutClass === 'layout-list') {
            // Add emoji span before the text in list view
            const emojiSpan = document.createElement('span');
            emojiSpan.className = 'sound-emoji-list';
            emojiSpan.textContent = soundSettings.emoji;
            contentWrapper.insertBefore(emojiSpan, textElement);
        } else {
            // Apply emoji as background pseudo-element in grid view
            card.style.setProperty('--sound-emoji', `"${soundSettings.emoji}"`);
        }
    }

    // --- Background Reset ---
    // If the card isn't currently playing, ensure its background reflects the base color
    if (!card.classList.contains('playing')) {
        card.style.background = ''; // Clear any potential gradient
        // Apply the determined base color if it's not the default surface color
        if (baseColor !== 'var(--v-surface-dark)') {
            card.style.backgroundColor = baseColor;
        } else {
            card.style.backgroundColor = ''; // Use default CSS background
        }
    } else {
         // If it IS playing, re-apply the gradient with the current base color
         // This ensures the non-progress part matches the card color
         const playingInstance = soundProgress.activeSounds.get(state.currentlyPlaying.get(soundId));
         const percentage = (playingInstance && playingInstance.lengthInMs > 0)
                           ? (playingInstance.readInMs / playingInstance.lengthInMs) * 100
                           : 0;
         if (!soundsContainerEl?.classList.contains('layout-list')) { // Only for grid layouts
              card.style.background = `linear-gradient(to right, var(--v-primary-darken1) ${percentage}%, ${baseColor} ${percentage}%)`;
         } else {
              card.style.background = ''; // Ensure list items don't have gradient
         }
    }
}

// --- Playback Control ---
async function playSound(soundId) {
    if (editMode.isActive()) return; // Don't play in edit mode

    try {
        if (!soundsContainerEl) throw new Error("Sounds container not found.");

        const data = await apiFetch(`/api/sounds/${soundId}/play`, { method: 'POST' });
        if (data.success && typeof data.playingId !== 'undefined') {
            console.log(`Sound ${soundId} playback started with playingId ${data.playingId}`);
            // Store mapping: soundId -> playingId
            state.currentlyPlaying.set(soundId, data.playingId);

            // Store details for progress tracking
            const newSoundData = {
                id: data.playingId, // This is the *instance* ID
                soundId: soundId,   // This is the *sound definition* ID
                lengthInMs: data.lengthInMs || 0,
                readInMs: 0, // Start progress at 0
                name: data.name || 'Sound', // Get name if available from response
                paused: false,
                repeat: false, // Assume repeat is off initially
            };
            soundProgress.activeSounds.set(data.playingId, newSoundData);

            updatePlayingStateVisuals(); // Update 'playing' class on cards
            handleSoundPlayedVisuals(newSoundData); // Update global UI (play icon)
            startProgressPolling(); // Start or ensure polling is active
        } else {
            console.error(`Failed to play sound ${soundId}:`, data.error || 'Unknown server error');
            state.currentlyPlaying.delete(soundId); // Ensure cleanup if play failed
            updatePlayingStateVisuals();
        }
    } catch (error) {
        console.error(`Error initiating playback for sound ${soundId}:`, error);
        state.currentlyPlaying.delete(soundId); // Ensure cleanup on fetch error
        updatePlayingStateVisuals();
        // Potentially show user feedback here
    }
}

async function stopAllSounds() {
    console.log("Stopping all sounds via API...");
    try {
        await apiFetch('/api/sounds/stop', { method: 'POST' });
        // Clear local tracking immediately for responsiveness
        state.currentlyPlaying.clear();
        soundProgress.activeSounds.clear();
        updatePlayingStateVisuals(); // Remove 'playing' class
        stopProgressPolling(); // Stop polling
        handleAllSoundsFinishedVisuals(); // Reset global UI
        console.log("All sounds stopped.");
    } catch (error) {
        console.error('Error stopping sounds:', error);
        // Even on error, try to clear local state for UI consistency
        state.currentlyPlaying.clear();
        soundProgress.activeSounds.clear();
        updatePlayingStateVisuals();
        stopProgressPolling();
        handleAllSoundsFinishedVisuals();
    }
}

// --- Progress Polling (Major Revision) ---
const soundProgress = {
    polling: false,
    interval: null,
    activeSounds: new Map(), // Key: playingId, Value: { id, soundId, name, lengthInMs, readInMs, paused, repeat }
    pollFrequency: 250, // ms
    errorCount: 0,
    maxErrors: 5,
};

function startProgressPolling() {
    if (soundProgress.polling) return; // Already polling
    console.log("Starting progress polling.");
    soundProgress.polling = true;
    soundProgress.errorCount = 0; // Reset error count
    if (soundProgress.interval) clearInterval(soundProgress.interval); // Clear any old interval
    fetchSoundProgress(); // Poll immediately
    soundProgress.interval = setInterval(fetchSoundProgress, soundProgress.pollFrequency);
}

function stopProgressPolling(reason = "No active sounds") {
    if (!soundProgress.polling) return; // Already stopped
    console.log(`Stopping progress polling. Reason: ${reason}`);
    soundProgress.polling = false;
    if (soundProgress.interval) {
        clearInterval(soundProgress.interval);
        soundProgress.interval = null;
    }
     // Optionally reset global UI elements when stopping explicitly
     handleAllSoundsFinishedVisuals();
}

async function fetchSoundProgress() {
    // 1. Check if polling should continue
    if (!soundProgress.polling) return; // Stopped externally
    if (soundProgress.activeSounds.size === 0) {
        stopProgressPolling("No active sounds remaining");
        return;
    }

    try {
        const playingSoundsData = await apiFetch('/api/sounds/progress');
        soundProgress.errorCount = 0; // Reset error count on successful fetch

        const currentPlayingIdsFromServer = new Set(playingSoundsData.map(s => s.id));
        let maxProgressPercentage = 0;
        let isAnySoundPlayingUnpaused = false;

        // 2. Update tracked sounds based on API response
        playingSoundsData.forEach(soundUpdate => {
            // Basic validation
            if (typeof soundUpdate.id === 'undefined' || typeof soundUpdate.soundId === 'undefined') {
                console.warn("Received progress update with missing ID:", soundUpdate);
                return;
            }

            let existingSound = soundProgress.activeSounds.get(soundUpdate.id);

            // Add if new, or update if existing
            if (!existingSound) {
                 console.warn(`Progress update for untracked playingId ${soundUpdate.id} (Sound ${soundUpdate.soundId}). Adding to tracking.`);
                 existingSound = { id: soundUpdate.id, soundId: soundUpdate.soundId, name: '?', lengthInMs: 0, readInMs: 0, paused: true, repeat: false };
                 soundProgress.activeSounds.set(soundUpdate.id, existingSound);
                 // Add to main playing map if missing
                 if (!state.currentlyPlaying.has(existingSound.soundId)) {
                      state.currentlyPlaying.set(existingSound.soundId, existingSound.id);
                 }
            }

            // Update properties, providing defaults
            existingSound.readInMs = soundUpdate.readInMs ?? existingSound.readInMs;
            existingSound.paused = soundUpdate.paused ?? existingSound.paused;
            existingSound.repeat = soundUpdate.repeat ?? existingSound.repeat;
            existingSound.name = soundUpdate.name ?? existingSound.name;
            // Only update length if the new value is valid
            if (typeof soundUpdate.lengthInMs === 'number' && soundUpdate.lengthInMs > 0) {
                existingSound.lengthInMs = soundUpdate.lengthInMs;
            }

            // Calculate progress and update UI
            const isPaused = existingSound.paused;
            const lengthMs = existingSound.lengthInMs;
            const readMs = existingSound.readInMs;
            let percentage = 0;

            if (!isPaused && lengthMs > 0) {
                isAnySoundPlayingUnpaused = true; // At least one sound is actively playing
                percentage = Math.min(100, Math.max(0, (readMs / lengthMs) * 100));
                maxProgressPercentage = Math.max(maxProgressPercentage, percentage);

                // Update Individual Card Background (Only Grid View)
                if (soundsContainerEl && !soundsContainerEl.classList.contains('layout-list')) {
                    const soundCard = soundsContainerEl.querySelector(`.sound-card[data-sound-id="${existingSound.soundId}"]`);
                    if (soundCard) {
                        const baseColor = soundCard.style.getPropertyValue('--sound-base-color') || 'var(--v-surface-dark)';
                        soundCard.style.background = `linear-gradient(to right, var(--v-primary-darken1) ${percentage}%, ${baseColor} ${percentage}%)`;
                         // Ensure 'playing' class is present if actively progressing
                         if (!soundCard.classList.contains('playing')) {
                              soundCard.classList.add('playing');
                         }
                    }
                }
            } else {
                 // If paused or length is zero, ensure background is reset
                 if (soundsContainerEl && !soundsContainerEl.classList.contains('layout-list')) {
                     const soundCard = soundsContainerEl.querySelector(`.sound-card[data-sound-id="${existingSound.soundId}"]`);
                     if (soundCard && soundCard.classList.contains('playing')) { // Only reset if it thinks it's playing
                          soundCard.style.background = '';
                          updateSoundCardDisplay(existingSound.soundId, soundCard); // Reapply base style
                     }
                 }
            }
        });

        // 3. Handle sounds that finished (in tracked map but not in API response)
        const finishedSoundPlayingIds = [];
        soundProgress.activeSounds.forEach((soundData, playingId) => {
            if (!currentPlayingIdsFromServer.has(playingId)) {
                finishedSoundPlayingIds.push(playingId);
            }
        });

        finishedSoundPlayingIds.forEach(playingId => {
            const soundData = soundProgress.activeSounds.get(playingId);
            if (soundData) {
                console.log(`Sound instance ${playingId} (Sound ${soundData.soundId}) finished.`);
                state.currentlyPlaying.delete(soundData.soundId); // Remove from main map
                soundProgress.activeSounds.delete(playingId); // Remove from tracking map
                handleSoundFinishVisuals(soundData); // Reset individual card visuals
            }
        });

        // 4. Update Global UI based on overall state
        updateTopBarProgress(maxProgressPercentage);
        updatePlayIndicator(isAnySoundPlayingUnpaused);

        // 5. Final Check: Stop polling if nothing is left *after* cleanup
        if (soundProgress.activeSounds.size === 0) {
            stopProgressPolling("No active sounds after update");
        }

    } catch (error) {
        console.error('Error fetching sound progress:', error);
        soundProgress.errorCount++;
        if (soundProgress.errorCount >= soundProgress.maxErrors) {
             stopProgressPolling(`Max errors (${soundProgress.maxErrors}) reached`);
             // Clear local state as it's likely out of sync
             state.currentlyPlaying.clear();
             soundProgress.activeSounds.clear();
             updatePlayingStateVisuals(); // Reset all cards
             handleAllSoundsFinishedVisuals(); // Reset global UI
             // Optionally notify user about connection issue
             if(serverStatusEl) serverStatusEl.textContent = 'Sync Error';
             if(statusIndicatorEl) statusIndicatorEl.className = 'status-dot error';
        }
    }
}


// --- Visual Updates for Playback & Progress ---

function handleSoundPlayedVisuals(soundData) {
    // Only update the global indicator; individual card handled by polling
    updatePlayIndicator(true);
}

function handleSoundFinishVisuals(soundData) {
    // Reset individual card background/style
    if (soundsContainerEl) {
        const soundCard = soundsContainerEl.querySelector(`.sound-card[data-sound-id="${soundData.soundId}"]`);
        if (soundCard) {
            soundCard.classList.remove('playing'); // Explicitly remove class
            soundCard.style.background = ''; // Reset background gradient
            updateSoundCardDisplay(soundData.soundId, soundCard); // Re-apply base styles (color, emoji etc.)
        }
    }
    // Global bar/icon reset is handled by handleAllSoundsFinishedVisuals or the next poll cycle
}

function handleAllSoundsFinishedVisuals() {
    // console.log("Handling all sounds finished visuals"); // Debug
    updateTopBarProgress(0); // Reset top bar gradient
    updatePlayIndicator(false); // Hide play icon

    // Reset all potentially playing sound card backgrounds and classes
    if (soundsContainerEl) {
        soundsContainerEl.querySelectorAll('.sound-card.playing').forEach(card => {
             card.classList.remove('playing');
             card.style.background = ''; // Clear background style
             const soundId = parseInt(card.dataset.soundId);
             if (!isNaN(soundId)) {
                 updateSoundCardDisplay(soundId, card); // Re-apply base styles
             }
        });
    }
}

function updatePlayingStateVisuals() {
     // This function ensures the 'playing' class is correct based on state.currentlyPlaying
     // It's less critical now that polling handles background updates, but good for initial state
     if (!soundsContainerEl) return;
    soundsContainerEl.querySelectorAll('.sound-card').forEach(card => {
        const soundId = parseInt(card.dataset.soundId);
        if (isNaN(soundId)) return;

        const isPlaying = state.currentlyPlaying.has(soundId);
        card.classList.toggle('playing', isPlaying);

        // If it's marked as not playing, ensure background is reset
        if (!isPlaying && card.style.background !== '') {
             card.style.background = '';
             updateSoundCardDisplay(soundId, card); // Re-apply base visuals
        }
    });
}

// Initial check for sounds already playing (called during init)
async function checkForPlayingSounds() {
    console.log("Checking for initially playing sounds...");
    // Start polling - the first fetch will sync the state
    startProgressPolling();
}

// Make functions globally accessible if needed by other modules
window.app = {
    reloadSoundsForCurrentTab: reloadSoundsForCurrentTab,
    updateSoundCardDisplay: updateSoundCardDisplay,
    // Expose reset functions if needed externally (optional)
    // resetCurrentPageVisuals: resetCurrentPageVisuals,
    // resetCurrentPageLayout: resetCurrentPageLayout,
    // resetAllSettings: resetAllSettings
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', init);