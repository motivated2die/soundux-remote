// Global state management
const state = {
    currentlyPlaying: new Map(), // Map soundId -> playingId
    tabs: [],
    currentTab: null, // Can be tabId or 'favorites'
    settings: persistence.load(), // Load settings on init
    apiBaseUrl: '', // Determined on init
    longPressTimer: null,
    longPressTarget: null,
    lastLongPressTime: 0, // Timestamp of the last long press end event
};

// DOM Elements
const serverStatusEl = document.getElementById('server-status-text'); // Target the text span specifically
const statusIndicatorEl = document.getElementById('status-indicator');
const stopAllButton = document.getElementById('stop-all');
const tabsContainerEl = document.getElementById('tabs-container');
const soundsContainerEl = document.getElementById('sounds-container');
const progressContainerEl = document.getElementById('sound-progress-container');
const progressBarEl = document.getElementById('sound-progress-bar');
const appSettingsButton = document.getElementById('app-settings-button');
const appSettingsModalOverlay = document.getElementById('app-settings-modal-overlay');
const closeAppSettingsButton = document.getElementById('close-app-settings-button');
const exportSettingsButton = document.getElementById('export-settings-button');
const importSettingsButton = document.getElementById('import-settings-button');
const importFileInput = document.getElementById('import-file-input');


// --- Progress Bar Function ---
// Define globally within the app scope or make part of the 'app' object
function updateProgressBar(percentage) {
    const progressBar = progressBarEl; // Use the already selected element
    if (progressBar) {
        // Clamp percentage between 0 and 100
        const clampedPercentage = Math.max(0, Math.min(100, percentage));
        progressBar.style.width = `${clampedPercentage}%`;
    } else {
        // console.warn("Progress bar element not found in updateProgressBar");
    }
}


// Initialize the application
function init() {
    state.apiBaseUrl = window.location.origin;
    console.log("API Base URL:", state.apiBaseUrl);
    checkServerStatus(); // This handles initial load sequence
    setupEventListeners();
}


// --- API Helper ---
async function apiFetch(endpoint, options = {}) {
    const url = `${state.apiBaseUrl}${endpoint}`;
    try {
        const response = await fetch(url, {
             credentials: 'include',
            ...options
        });
        if (!response.ok) {
            if (response.status === 401) {
                 console.warn("API request unauthorized. Redirecting to login.");
                 window.location.href = '/login.html';
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
            console.log("Received non-JSON response for", endpoint);
            return response;
        }
    } catch (error) {
        console.error('API Fetch Error:', error);
        if (serverStatusEl) serverStatusEl.textContent = 'Connection Error';
        if (statusIndicatorEl) statusIndicatorEl.className = 'status-dot error';
        throw error;
    }
}


// --- Server Status & Initial Load ---
async function checkServerStatus() {
    try {
        await apiFetch('/api/status');
        if (serverStatusEl) serverStatusEl.textContent = 'Connected';
        if (statusIndicatorEl) statusIndicatorEl.className = 'status-dot connected';

        initSoundProgressBar(); // Initialize progress bar state HERE

        // Wait for tabs to load and the first tab to be activated
        await loadTabs();

        // Now state.currentTab should be set if tabs loaded correctly
        if (state.currentTab !== null && typeof state.currentTab !== 'undefined') {
            checkForPlayingSounds(); // Check playing sounds after we know the current tab
        } else {
            console.warn("No current tab set after loadTabs, skipping initial checkForPlayingSounds.");
            // Display a message if no tabs were loaded
             if (tabsContainerEl && tabsContainerEl.children.length === 0) {
                 tabsContainerEl.innerHTML = '<p class="error-text">No tabs found.</p>';
             }
        }
    } catch (error) {
        // Error is logged by apiFetch, UI updated there
        console.error("Failed initial server status check or tab load sequence.");
         if (tabsContainerEl) tabsContainerEl.innerHTML = '<p class="error-text">Failed to connect.</p>';
         if (soundsContainerEl) soundsContainerEl.innerHTML = ''; // Clear sounds area
    }
}


// --- Event Listeners ---
function setupEventListeners() {
    if (stopAllButton) stopAllButton.addEventListener('click', stopAllSounds);
    else console.error("Stop All button not found");

    // App Settings Modal Listeners
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

    // Listener for fullscreen toggle changes from the modal
    const fullscreenToggle = document.getElementById('auto-fullscreen-toggle');
    if (fullscreenToggle && window.fullscreenManager) {
        // Initial state is set in fullscreen.js init
    } else if (!fullscreenToggle) { console.error("Fullscreen toggle not found"); }
      else { console.error("Fullscreen Manager not found"); }

    // --- Sound Card Interactions ---
    if (soundsContainerEl) {
        soundsContainerEl.addEventListener('click', (e) => {
            const card = e.target.closest('.sound-card');
            if (!card) return;
            const soundId = parseInt(card.dataset.soundId);

            const timeSinceLongPress = Date.now() - (state.lastLongPressTime || 0);
            if (timeSinceLongPress < 300) {
                console.log("Click ignored shortly after potential long press/touch end");
                return;
            }

            if (editMode.isActive()) {
                if (window.soundSettings && typeof window.soundSettings.open === 'function') {
                    window.soundSettings.open(soundId);
                } else { console.error("Sound settings module not available."); }
            } else {
                playSound(soundId);
            }
        });
    } else { console.error("Sounds container element not found"); }

     // --- Global listener for events ---
     document.addEventListener('settingsChanged', () => {
         console.log("Global settings changed event received.");
     });
}

// --- App Settings Modal ---
function openAppSettingsModal() {
    // Ensure fullscreen toggle reflects current setting when opening
    if (window.fullscreenManager) {
        const toggle = document.getElementById('auto-fullscreen-toggle');
        if (toggle) toggle.checked = window.fullscreenManager.isEnabled();
    }
    appSettingsModalOverlay?.classList.remove('hidden');
}

function closeAppSettingsModal() {
    appSettingsModalOverlay?.classList.add('hidden');
}

async function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        await persistence.importSettings(file);
        alert('Settings imported successfully! Reloading sounds...');
        state.settings = persistence.load(); // Reload settings into state

        // Update fullscreen state from imported settings
        if (window.fullscreenManager && typeof state.settings.autoFullscreenEnabled !== 'undefined') {
             // Need a way to update fullscreenManager's internal state and UI
             const fsToggle = document.getElementById('auto-fullscreen-toggle');
             if(fsToggle) fsToggle.checked = state.settings.autoFullscreenEnabled;
             // TODO: Add a method to fullscreenManager to set the 'isEnabled' state externally
             // fullscreenManager.setEnabled(state.settings.autoFullscreenEnabled);
        }

        reloadSoundsForCurrentTab(); // Refresh UI
        closeAppSettingsModal();
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
         state.currentTab = null;
         return; // Exit if container missing
    }
    try {
        console.log("Loading tabs...");
        const tabs = await apiFetch('/api/tabs');
        console.log("Tabs fetched:", tabs);
        state.tabs = tabs;
        tabsContainerEl.innerHTML = ''; // Clear only if successful

        const favTab = createTabElement('Favorites', 'favorites', 'favorite');
        tabsContainerEl.appendChild(favTab);

        tabs.forEach(tab => {
            const tabElement = createTabElement(tab.name, tab.id);
            tabsContainerEl.appendChild(tabElement);
        });

        const persistedTabId = state.settings.lastTabId || 'favorites';
        let tabToActivate = tabsContainerEl.querySelector(`[data-tab-id="${persistedTabId}"]`) || tabsContainerEl.children[0];

        if (tabToActivate) {
            const tabId = tabToActivate.dataset.tabId;
            console.log(`Activating initial tab: ${tabId}`);
            // setActiveTab will call loadSounds
            await setActiveTab(tabToActivate, tabId);
        } else {
            console.warn("No tabs found or available to activate.");
            state.currentTab = null;
            if(soundsContainerEl) soundsContainerEl.innerHTML = '<p class="no-sounds">No tabs available.</p>'; // Show message
        }

    } catch (error) {
        console.error('Error loading tabs:', error);
        if (tabsContainerEl) tabsContainerEl.innerHTML = '<p class="error-text">Failed to load tabs.</p>';
        state.currentTab = null; // Ensure state reflects error
    }
}

// Create tab element (minor refinement for safety)
function createTabElement(name, id, iconName = null) {
    const tabElement = document.createElement('button');
    tabElement.className = 'tab';
    tabElement.dataset.tabId = id; // Use string ID consistently

    if (iconName) {
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined';
        icon.textContent = iconName;
         if (id === 'favorites') {
             icon.style.fontVariationSettings = "'FILL' 1";
             icon.style.color = 'var(--text-secondary)';
         }
        tabElement.appendChild(icon);
        tabElement.setAttribute('aria-label', name || 'Favorites');
    } else {
        tabElement.textContent = name || `Tab ${id}`; // Fallback name
    }

    tabElement.addEventListener('click', () => {
        // Ensure setActiveTab is called with element and ID
        setActiveTab(tabElement, String(id)); // Ensure ID is string for consistency
    });
    return tabElement;
}


async function setActiveTab(tabElement, tabId) {
    // Ensure tabId is treated as string for consistency ('favorites' vs numeric IDs)
    const currentTabStr = state.currentTab !== null ? String(state.currentTab) : null;
    const newTabIdStr = String(tabId);

    // Check if sounds container exists
    if (!soundsContainerEl) {
         console.error("Cannot set active tab: Sounds container not found.");
         return;
    }

    // Avoid reload if already active and sounds container has content (implies loaded)
    if (currentTabStr === newTabIdStr && soundsContainerEl.children.length > 0 && !soundsContainerEl.querySelector('.loading-sounds')) {
         console.log(`Tab ${tabId} is already active.`);
         document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tabId: newTabIdStr } }));
         return;
    }

    console.log(`Setting active tab to: ${newTabIdStr}`);
    tabsContainerEl.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    if (tabElement) tabElement.classList.add('active'); // Check element exists

    state.currentTab = newTabIdStr; // Store as string
    state.settings.lastTabId = newTabIdStr; // Persist as string
    persistence.save(state.settings);

    // Dispatch event *before* loading sounds
    document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tabId: newTabIdStr } }));

    // Load sounds for the new tab
    await loadSounds(newTabIdStr); // Pass string ID
}


// --- Sounds ---
async function loadSounds(tabId) {
     // Ensure sounds container exists
     if (!soundsContainerEl) {
          console.error("Cannot load sounds: Sounds container not found.");
          return;
     }
    // Ensure tabId is valid before proceeding
    if (tabId === null || typeof tabId === 'undefined') {
        console.warn("loadSounds called with invalid tabId:", tabId);
        soundsContainerEl.innerHTML = '<p class="no-sounds">Select a tab.</p>';
        return;
    }
     // Clear existing sounds immediately for visual feedback
     soundsContainerEl.innerHTML = '<p class="loading-sounds">Loading...</p>';

    try {
        const endpoint = (String(tabId) === 'favorites') ? '/api/favorites' : `/api/tabs/${tabId}/sounds`;
        let sounds = await apiFetch(endpoint);

        const currentLayout = persistence.getCurrentLayoutMode(tabId);
        console.log(`loadSounds: Applying layout '${currentLayout}' for tab '${tabId}'`);
        const customOrder = persistence.getLayoutOrder(tabId, currentLayout);

        if (customOrder && Array.isArray(customOrder)) {
            sounds.sort((a, b) => {
                const indexA = customOrder.indexOf(a.path);
                const indexB = customOrder.indexOf(b.path);
                if (indexA === -1 && indexB === -1) return 0;
                if (indexA === -1) return 1;
                if (indexB === -1) return -1;
                return indexA - indexB;
            });
             console.log(`Applied custom order for tab ${tabId}, layout ${currentLayout}`);
        } else {
             console.log(`No custom order found for tab ${tabId}, layout ${currentLayout}. Using default order.`);
        }

        displaySounds(sounds); // Display the (potentially sorted) sounds

    } catch (error) {
        console.error(`Error loading sounds for tab ${tabId}:`, error);
        if (soundsContainerEl) soundsContainerEl.innerHTML = '<p class="error-text">Failed to load sounds.</p>';
    }
}

// Function to reload sounds for the currently active tab
function reloadSoundsForCurrentTab() {
    if (state.currentTab !== null && typeof state.currentTab !== 'undefined') {
        console.log(`Reloading sounds for current tab: ${state.currentTab}`);
        loadSounds(state.currentTab);
    } else {
        console.warn("Cannot reload sounds: No current tab is set.");
    }
}


function displaySounds(sounds) {
    if (!soundsContainerEl) return; // Safety check
    soundsContainerEl.innerHTML = ''; // Clear previous sounds/loading message
    if (!sounds || sounds.length === 0) {
         soundsContainerEl.innerHTML = '<p class="no-sounds">No sounds in this tab.</p>';
        return;
    }

    sounds.forEach(sound => {
        // Basic check for essential sound properties
        if (!sound || typeof sound.id === 'undefined' || !sound.path || !sound.name) {
             console.warn("Skipping invalid sound data:", sound);
             return;
        }
        const soundElement = createSoundCardElement(sound);
        if (soundElement) soundsContainerEl.appendChild(soundElement);
    });
}


function createSoundCardElement(sound) {
    const soundElement = document.createElement('div');
    soundElement.className = 'sound-card fade-in';
    soundElement.dataset.soundId = sound.id;
    soundElement.dataset.soundPath = sound.path;

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'sound-content-wrapper';

    const textElement = document.createElement('span');
    textElement.className = 'sound-text';
    textElement.textContent = sound.name;

    contentWrapper.appendChild(textElement);
    soundElement.appendChild(contentWrapper);

    // Apply persisted settings (color, emoji, indicators)
    updateSoundCardDisplay(sound.id, soundElement); // Pass element to avoid re-querying

    // Check playing state
    if (state.currentlyPlaying.has(sound.id)) {
        soundElement.classList.add('playing');
    }

    // Indicators container will be added by updateSoundCardDisplay if needed

    return soundElement;
}


function updateSoundCardDisplay(soundId, cardElement = null) {
    const card = cardElement || soundsContainerEl?.querySelector(`.sound-card[data-sound-id="${soundId}"]`);
    if (!card) return;

    const soundPath = card.dataset.soundPath;
    if (!soundPath) { console.warn(`Cannot update display for soundId ${soundId}: missing soundPath.`); return; }

    const soundSettings = persistence.getSoundSettings(soundPath);
    const contentWrapper = card.querySelector('.sound-content-wrapper');
    const textElement = card.querySelector('.sound-text');

    // Ensure indicators container exists or create it
    let indicators = card.querySelector('.sound-indicators');
    if (!indicators) {
        indicators = document.createElement('div');
        indicators.className = 'sound-indicators';
        // Insert indicators *after* contentWrapper to avoid layout shifts affecting emoji pseudo-element
        if (contentWrapper) card.insertBefore(indicators, contentWrapper.nextSibling);
        else card.appendChild(indicators); // Fallback if wrapper not found
    }
    indicators.innerHTML = ''; // Clear existing indicators

    // --- Apply Color ---
    let baseColor = 'var(--v-surface-dark)'; // Default base
    card.classList.forEach(className => {
        if (className.startsWith('sound-color-')) card.classList.remove(className);
    });
    if (soundSettings.color && soundSettings.color !== 'default') {
        const colorClass = `sound-color-${soundSettings.color}`;
        card.classList.add(colorClass);
        // Update base color variable for progress gradient
        baseColor = `var(--sound-color-${soundSettings.color}-bg)`; // Use the CSS variable name
    }
    card.style.setProperty('--sound-base-color', baseColor); // Set CSS variable

    // --- Apply Emoji ---
    card.style.removeProperty('--sound-emoji'); // Clear pseudo-element variable
    const existingEmojiSpan = contentWrapper?.querySelector('.sound-emoji-list');
    if (existingEmojiSpan) contentWrapper.removeChild(existingEmojiSpan);

    if (soundSettings.emoji && textElement && contentWrapper) { // Ensure elements exist
        const currentLayout = soundsContainerEl?.className.match(/layout-([a-z0-9\-]+)/)?.[0];
        if (currentLayout && currentLayout.includes('list')) {
            const emojiSpan = document.createElement('span');
            emojiSpan.className = 'sound-emoji-list';
            emojiSpan.textContent = soundSettings.emoji;
            contentWrapper.insertBefore(emojiSpan, textElement); // Prepend in list view
        } else {
            card.style.setProperty('--sound-emoji', `"${soundSettings.emoji}"`); // Set variable for grid view pseudo-element
        }
    }

    // --- Update Indicators ---
    // Recalculate based on potentially updated persistence state
    const currentPersistedSettings = persistence.getSoundSettings(soundPath); // Get latest
    const isFavorite = currentPersistedSettings.favorite ?? false; // Default to false if not set
    const hasCustomVolume = currentPersistedSettings.hasCustomVolume ?? false; // Use the flag saved by persistence

    if (isFavorite) {
        card.dataset.favorite = 'true';
        const favIcon = document.createElement('span');
        favIcon.className = 'indicator-icon material-symbols-outlined favorite-indicator';
        favIcon.textContent = 'favorite';
        indicators.appendChild(favIcon);
    } else {
         card.dataset.favorite = 'false';
    }

    if (hasCustomVolume) {
         card.dataset.customVolume = 'true';
        const volIcon = document.createElement('span');
        volIcon.className = 'indicator-icon material-symbols-outlined volume-indicator';
        volIcon.textContent = 'volume_up';
        indicators.appendChild(volIcon);
    } else {
         card.dataset.customVolume = 'false';
    }

     if (indicators.children.length === 0 && card.contains(indicators)) { // Remove if empty AND part of card
         card.removeChild(indicators);
     }
}


// --- Playback Control ---
async function playSound(soundId) {
    if (editMode.isActive()) return;

    console.log(`Attempting to play sound: ${soundId}`);
    try {
        // Ensure sounds container exists for UI updates
        if (!soundsContainerEl) throw new Error("Sounds container not found.");

        const data = await apiFetch(`/api/sounds/${soundId}/play`, { method: 'POST' });
        if (data.success && data.playingId) {
            console.log(`Sound ${soundId} started playing with instance ID: ${data.playingId}`);
            state.currentlyPlaying.set(soundId, data.playingId);

            const newSoundData = {
                id: data.playingId, soundId: soundId,
                lengthInMs: data.lengthInMs || 0, // Default length to 0 if missing
                readInMs: 0, name: data.name || 'Sound',
                paused: false, repeat: false
            };
            soundProgress.activeSounds.set(data.playingId, newSoundData);

            updatePlayingStateVisuals();
            handleSoundPlayedVisuals(newSoundData);
            startProgressPolling();
        } else {
            console.error(`Failed to play sound ${soundId}:`, data.error || 'Unknown server error');
            state.currentlyPlaying.delete(soundId);
            updatePlayingStateVisuals();
        }
    } catch (error) {
        console.error(`Error playing sound ${soundId}:`, error);
        state.currentlyPlaying.delete(soundId); // Clean up state on error
        updatePlayingStateVisuals();
    }
}

async function stopAllSounds() {
    console.log("Stopping all sounds...");
    try {
        await apiFetch('/api/sounds/stop', { method: 'POST' });
        state.currentlyPlaying.clear();
        soundProgress.activeSounds.clear();
        updatePlayingStateVisuals();
        stopProgressPolling();
        handleAllSoundsFinishedVisuals();
    } catch (error) {
        console.error('Error stopping sounds:', error);
    }
}

// --- Progress Polling ---
const soundProgress = {
    polling: false,
    interval: null,
    activeSounds: new Map(),
};

function startProgressPolling() {
    if (soundProgress.polling) return;
    console.log("Starting progress polling.");
    soundProgress.polling = true;
    if (soundProgress.interval) clearInterval(soundProgress.interval);
    fetchSoundProgress(); // Poll immediately
    soundProgress.interval = setInterval(fetchSoundProgress, 250);
}

function stopProgressPolling() {
    if (!soundProgress.polling) return;
    console.log("Stopping progress polling.");
    soundProgress.polling = false;
    if (soundProgress.interval) {
        clearInterval(soundProgress.interval);
        soundProgress.interval = null;
    }
}

async function fetchSoundProgress() {
    if (soundProgress.activeSounds.size === 0 && soundProgress.polling) {
        // console.log("No active sounds tracked, stopping polling.");
        stopProgressPolling();
        handleAllSoundsFinishedVisuals();
        return;
    }
    // If polling stopped but this was already in flight, just exit
    if (!soundProgress.polling && soundProgress.activeSounds.size === 0) return;


    try {
        const playingSoundsData = await apiFetch('/api/sounds/progress');
        const currentPlayingIdsFromServer = new Set(playingSoundsData.map(s => s.id));

        playingSoundsData.forEach(soundUpdate => {
            const existingSound = soundProgress.activeSounds.get(soundUpdate.id);
            // Ensure essential data exists in the update
            if (typeof soundUpdate.id === 'undefined' || typeof soundUpdate.soundId === 'undefined') {
                console.warn("Received progress update with missing ID:", soundUpdate);
                return;
            }

            if (existingSound) {
                existingSound.readInMs = soundUpdate.readInMs ?? existingSound.readInMs; // Use existing if missing
                existingSound.paused = soundUpdate.paused ?? existingSound.paused;
                existingSound.repeat = soundUpdate.repeat ?? existingSound.repeat;
                 // Update length only if provided and seems valid
                 if (typeof soundUpdate.lengthInMs === 'number' && soundUpdate.lengthInMs > 0) {
                      existingSound.lengthInMs = soundUpdate.lengthInMs;
                 }
                handleSoundProgressVisuals(existingSound);
            } else {
                console.warn(`Received progress for untracked playingId ${soundUpdate.id}. Adding.`);
                 const newSoundData = {
                     id: soundUpdate.id, soundId: soundUpdate.soundId,
                     lengthInMs: soundUpdate.lengthInMs || 0, readInMs: soundUpdate.readInMs || 0,
                     name: soundUpdate.name || 'Sound', paused: soundUpdate.paused || false,
                     repeat: soundUpdate.repeat || false,
                 };
                 soundProgress.activeSounds.set(soundUpdate.id, newSoundData);
                 state.currentlyPlaying.set(newSoundData.soundId, newSoundData.id);
                 updatePlayingStateVisuals();
                 handleSoundProgressVisuals(newSoundData);
            }
        });

        const finishedSoundPlayingIds = [];
        soundProgress.activeSounds.forEach((soundData, playingId) => {
            if (!currentPlayingIdsFromServer.has(playingId)) {
                finishedSoundPlayingIds.push(playingId);
            }
        });

        finishedSoundPlayingIds.forEach(playingId => {
            const soundData = soundProgress.activeSounds.get(playingId);
            if (soundData) {
                 console.log(`Sound instance ${playingId} (Sound ID: ${soundData.soundId}) finished.`);
                state.currentlyPlaying.delete(soundData.soundId);
                soundProgress.activeSounds.delete(playingId);
                handleSoundFinishVisuals(soundData);
            }
        });

        if (soundProgress.activeSounds.size === 0) {
            // console.log("Polling: All sounds finished or none were playing.");
            stopProgressPolling();
            handleAllSoundsFinishedVisuals();
        } else if (!soundProgress.polling) {
             // If polling was stopped externally but sounds are still active, restart it
            console.log("Polling: Restarting polling as sounds are still active.");
            startProgressPolling();
        }

         updatePlayingStateVisuals(); // Refresh playing styles

    } catch (error) {
        console.error('Error fetching sound progress:', error);
        stopProgressPolling();
        state.currentlyPlaying.clear();
        soundProgress.activeSounds.clear();
        updatePlayingStateVisuals();
        handleAllSoundsFinishedVisuals();
    }
}

// --- Visual Updates for Playback & Progress ---

function initSoundProgressBar() {
    if (progressContainerEl) progressContainerEl.classList.add('inactive');
    updateProgressBar(0); // Ensure it starts at 0 width
}

function handleSoundPlayedVisuals(soundData) {
    if (progressContainerEl) {
        progressContainerEl.classList.remove('inactive');
        progressContainerEl.classList.add('active');
        // console.log("Progress bar activated"); // Reduce console noise
    }
    // Reset progress for the sound being tracked (if it's the latest)
    let latestSoundPlayingId = Array.from(soundProgress.activeSounds.keys()).pop();
    if (soundData.id === latestSoundPlayingId || soundProgress.activeSounds.size === 1) {
        updateProgressBar(0);
    }
}

function handleSoundProgressVisuals(soundData) {
    if (!soundData || typeof soundData.readInMs === 'undefined' || typeof soundData.lengthInMs === 'undefined' || soundData.lengthInMs <= 0) {
        // Don't update progress if length is invalid
        return;
    }
    const percentage = (soundData.readInMs / soundData.lengthInMs) * 100;

    // Global Progress Bar (track latest sound)
    let latestSoundPlayingId = Array.from(soundProgress.activeSounds.keys()).pop();
    if (latestSoundPlayingId !== null && soundData.id === latestSoundPlayingId) {
        updateProgressBar(percentage);
        if (progressContainerEl && progressContainerEl.classList.contains('inactive')) {
            progressContainerEl.classList.remove('inactive');
            progressContainerEl.classList.add('active');
        }
    }

    // Individual Sound Card Visuals
    if (!soundsContainerEl) return; // Safety check
    const soundCard = soundsContainerEl.querySelector(`.sound-card[data-sound-id="${soundData.soundId}"]`);
    if (soundCard) {
        if (!soundsContainerEl.classList.contains('layout-list')) {
            const baseColor = soundCard.style.getPropertyValue('--sound-base-color') || 'var(--v-surface-dark)';
            soundCard.style.background = `linear-gradient(to right, var(--v-primary-darken1) ${percentage}%, ${baseColor} ${percentage}%)`;
        } else {
             soundCard.style.background = '';
        }
    }
}


function handleSoundFinishVisuals(soundData) {
    if (!soundsContainerEl) return;
    const soundCard = soundsContainerEl.querySelector(`.sound-card[data-sound-id="${soundData.soundId}"]`);
    if (soundCard) {
        soundCard.style.background = ''; // Reset background gradient
        updateSoundCardDisplay(soundData.soundId, soundCard); // Re-apply base styles
    }
    // Global bar reset is handled by handleAllSoundsFinishedVisuals when map becomes empty
}

function handleAllSoundsFinishedVisuals() {
    // console.log("handleAllSoundsFinishedVisuals called"); // Reduce noise
    if (progressContainerEl) {
        if (progressContainerEl.classList.contains('active')) { // Check if active before trying to deactivate
             progressContainerEl.classList.remove('active');
             progressContainerEl.classList.add('inactive');
             setTimeout(() => updateProgressBar(0), 500); // Reset width after transition
             // console.log("Progress bar deactivated");
        } else {
            updateProgressBar(0); // Ensure width is 0 if already inactive
        }
    }

    if (!soundsContainerEl) return;
    soundsContainerEl.querySelectorAll('.sound-card').forEach(card => {
         card.style.background = '';
         const soundId = parseInt(card.dataset.soundId);
         if (!isNaN(soundId)) updateSoundCardDisplay(soundId, card);
    });

     updatePlayingStateVisuals(); // Ensure all 'playing' classes removed
}


function updatePlayingStateVisuals() {
     if (!soundsContainerEl) return;
    soundsContainerEl.querySelectorAll('.sound-card').forEach(card => {
        const soundId = parseInt(card.dataset.soundId);
        if (isNaN(soundId)) return; // Skip if soundId is invalid

        const isPlaying = state.currentlyPlaying.has(soundId);
        card.classList.toggle('playing', isPlaying);

        if (!isPlaying) {
             // Only reset background if it might have a progress gradient
             if (!soundsContainerEl.classList.contains('layout-list')) {
                  card.style.background = '';
             }
             // Always re-apply base styles when stopping
             updateSoundCardDisplay(soundId, card);
        }
    });
}

// Initial check for sounds already playing
async function checkForPlayingSounds() {
    console.log("Checking for initially playing sounds...");
    // Ensure polling starts and potentially stops if no sounds are found initially
    startProgressPolling();
}


// Make reload function globally accessible
window.app = {
    reloadSoundsForCurrentTab: reloadSoundsForCurrentTab,
    updateSoundCardDisplay: updateSoundCardDisplay
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', init);