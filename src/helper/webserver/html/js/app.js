// --- ENTIRE FILE REPLACE ---
// Global state management
const state = {
    currentlyPlaying: new Map(), // Map soundId -> playingId
    tabs: [],
    currentTab: null, // Can be tabId or 'favorites'
    settings: persistence.load(), // Load settings on init
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
    checkServerStatus();
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
            return response; // Return raw response for non-JSON
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

        updateTopBarProgress(0);
        updatePlayIndicator(false);

        await loadTabs(); // Load tabs and activate the first/last active one

        if (state.currentTab !== null && typeof state.currentTab !== 'undefined') {
            checkForPlayingSounds();
            // --- NEW: Signal app is ready AFTER tabs loaded ---
            document.dispatchEvent(new CustomEvent('appReady'));
            // --- END NEW ---
        } else {
            console.warn("No current tab set after loadTabs, skipping initial checkForPlayingSounds.");
            if (tabsContainerEl && tabsContainerEl.children.length === 0) {
                 tabsContainerEl.innerHTML = '<p class="error-text">No tabs found.</p>';
            }
            // --- NEW: Also signal ready even if no tabs, so layout manager doesn't wait forever ---
            document.dispatchEvent(new CustomEvent('appReady'));
            // --- END NEW ---
        }
    } catch (error) {
        console.error("Failed initial server status check or tab load sequence.");
         if (tabsContainerEl) tabsContainerEl.innerHTML = '<p class="error-text">Failed to connect.</p>';
         if (soundsContainerEl) soundsContainerEl.innerHTML = '';
         updateTopBarProgress(0);
         updatePlayIndicator(false);
         // --- NEW: Signal ready on error too ---
         document.dispatchEvent(new CustomEvent('appReady'));
         // --- END NEW ---
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

            const timeSinceLongPress = Date.now() - (state.lastLongPressTime || 0);
            if (timeSinceLongPress < 300) {
                return; // Ignore click shortly after long press ends
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

     document.addEventListener('settingsChanged', () => {
         // console.log("Global settings changed event received.");
     });
}

// --- App Settings Modal ---
function openAppSettingsModal() {
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
        state.settings = persistence.load();

        if (window.fullscreenManager && typeof state.settings.autoFullscreenEnabled !== 'undefined') {
             const fsToggle = document.getElementById('auto-fullscreen-toggle');
             if(fsToggle) fsToggle.checked = state.settings.autoFullscreenEnabled;
             fullscreenManager.setEnabled(state.settings.autoFullscreenEnabled); // Use setEnabled
        }

        reloadSoundsForCurrentTab();
        closeAppSettingsModal();
    } catch (error) {
        console.error('Import failed:', error);
        alert(`Failed to import settings: ${error.message}`);
    } finally {
        if (event.target) event.target.value = null;
    }
}

// --- Tabs ---
async function loadTabs() {
    if (!tabsContainerEl) {
         console.error("Tabs container not found, cannot load tabs.");
         state.currentTab = null;
         return;
    }
    try {
        const tabs = await apiFetch('/api/tabs');
        state.tabs = tabs;
        tabsContainerEl.innerHTML = '';

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
            await setActiveTab(tabToActivate, tabId); // This will load sounds
        } else {
            console.warn("No tabs found or available to activate.");
            state.currentTab = null;
            if(soundsContainerEl) soundsContainerEl.innerHTML = '<p class="no-sounds">No tabs available.</p>';
        }

    } catch (error) {
        console.error('Error loading tabs:', error);
        if (tabsContainerEl) tabsContainerEl.innerHTML = '<p class="error-text">Failed to load tabs.</p>';
        state.currentTab = null;
    }
}

function createTabElement(name, id, iconName = null) {
    const tabElement = document.createElement('button');
    tabElement.className = 'tab';
    tabElement.dataset.tabId = id;

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
        tabElement.textContent = name || `Tab ${id}`;
    }

    tabElement.addEventListener('click', () => {
        setActiveTab(tabElement, String(id));
    });
    return tabElement;
}

async function setActiveTab(tabElement, tabId) {
    const currentTabStr = state.currentTab !== null ? String(state.currentTab) : null;
    const newTabIdStr = String(tabId);

    if (!soundsContainerEl) {
         console.error("Cannot set active tab: Sounds container not found.");
         return;
    }

    // Check if trying to set the same tab AND sounds are already loaded
    if (currentTabStr === newTabIdStr && soundsContainerEl.children.length > 0 && !soundsContainerEl.querySelector('.loading-sounds')) {
         document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tabId: newTabIdStr } }));
         return; // Already active and loaded
    }

    tabsContainerEl.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    if (tabElement) tabElement.classList.add('active');

    state.currentTab = newTabIdStr;
    state.settings.lastTabId = newTabIdStr;
    persistence.save(state.settings);

    document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tabId: newTabIdStr } }));
    await loadSounds(newTabIdStr); // Load sounds for the new tab
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

    try {
        const endpoint = (String(tabId) === 'favorites') ? '/api/favorites' : `/api/tabs/${tabId}/sounds`;
        let sounds = await apiFetch(endpoint);

        const currentLayout = persistence.getCurrentLayoutMode(tabId);
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
        }

        displaySounds(sounds);

    } catch (error) {
        console.error(`Error loading sounds for tab ${tabId}:`, error);
        if (soundsContainerEl) soundsContainerEl.innerHTML = '<p class="error-text">Failed to load sounds.</p>';
    }
}

function reloadSoundsForCurrentTab() {
    if (state.currentTab !== null && typeof state.currentTab !== 'undefined') {
        console.log(`Reloading sounds for current tab: ${state.currentTab}`);
        loadSounds(state.currentTab);
    } else {
        console.warn("Cannot reload sounds: No current tab is set.");
    }
}


function displaySounds(sounds) {
    if (!soundsContainerEl) return;
    soundsContainerEl.innerHTML = '';
    if (!sounds || sounds.length === 0) {
         soundsContainerEl.innerHTML = '<p class="no-sounds">No sounds in this tab.</p>';
        return;
    }

    sounds.forEach(sound => {
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

    updateSoundCardDisplay(sound.id, soundElement); // Apply color/emoji/indicators

    // Check if sound is currently playing and apply style
    if (state.currentlyPlaying.has(sound.id)) {
        soundElement.classList.add('playing');
        // Apply initial progress if available (relevant if loaded while playing)
        const playingInstance = soundProgress.activeSounds.get(state.currentlyPlaying.get(sound.id));
        if(playingInstance && playingInstance.lengthInMs > 0) {
            const percentage = (playingInstance.readInMs / playingInstance.lengthInMs) * 100;
             if (!soundsContainerEl.classList.contains('layout-list')) {
                const baseColor = soundElement.style.getPropertyValue('--sound-base-color') || 'var(--v-surface-dark)';
                soundElement.style.background = `linear-gradient(to right, var(--v-primary-darken1) ${percentage}%, ${baseColor} ${percentage}%)`;
            }
        }
    }

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

    let indicators = card.querySelector('.sound-indicators');
    if (!indicators) {
        indicators = document.createElement('div');
        indicators.className = 'sound-indicators';
        if (contentWrapper) card.insertBefore(indicators, contentWrapper.nextSibling);
        else card.appendChild(indicators);
    }
    indicators.innerHTML = '';

    // --- Apply Color ---
    let baseColor = 'var(--v-surface-dark)';
    card.classList.forEach(className => {
        if (className.startsWith('sound-color-')) card.classList.remove(className);
    });
    if (soundSettings.color && soundSettings.color !== 'default') {
        const colorClass = `sound-color-${soundSettings.color}`;
        card.classList.add(colorClass);
        baseColor = `var(--sound-color-${soundSettings.color}-bg)`;
    }
    card.style.setProperty('--sound-base-color', baseColor); // Set for gradient

    // --- Apply Emoji ---
    card.style.removeProperty('--sound-emoji');
    const existingEmojiSpan = contentWrapper?.querySelector('.sound-emoji-list');
    if (existingEmojiSpan) contentWrapper.removeChild(existingEmojiSpan);

    if (soundSettings.emoji && textElement && contentWrapper) {
        const currentLayout = soundsContainerEl?.className.match(/layout-([a-z0-9\-]+)/)?.[0];
        if (currentLayout && currentLayout.includes('list')) {
            const emojiSpan = document.createElement('span');
            emojiSpan.className = 'sound-emoji-list';
            emojiSpan.textContent = soundSettings.emoji;
            contentWrapper.insertBefore(emojiSpan, textElement);
        } else {
            card.style.setProperty('--sound-emoji', `"${soundSettings.emoji}"`);
        }
    }

    // --- Update Indicators ---
    const currentPersistedSettings = persistence.getSoundSettings(soundPath);
    const isFavorite = currentPersistedSettings.favorite ?? false;
    const hasCustomVolume = currentPersistedSettings.hasCustomVolume ?? false;

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

     if (indicators.children.length === 0 && card.contains(indicators)) {
         card.removeChild(indicators);
     }

     // If the card isn't playing, ensure its background is reset
     if (!card.classList.contains('playing')) {
         card.style.background = ''; // Reset gradient/color
         card.style.backgroundColor = baseColor === 'var(--v-surface-dark)' ? '' : baseColor; // Apply base color if custom
     }
}


// --- Playback Control ---
async function playSound(soundId) {
    if (editMode.isActive()) return;

    try {
        if (!soundsContainerEl) throw new Error("Sounds container not found.");

        const data = await apiFetch(`/api/sounds/${soundId}/play`, { method: 'POST' });
        if (data.success && data.playingId) {
            state.currentlyPlaying.set(soundId, data.playingId);

            const newSoundData = {
                id: data.playingId, soundId: soundId,
                lengthInMs: data.lengthInMs || 0, readInMs: 0,
                name: data.name || 'Sound', paused: false, repeat: false
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
        state.currentlyPlaying.delete(soundId);
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
    soundProgress.polling = true;
    if (soundProgress.interval) clearInterval(soundProgress.interval);
    fetchSoundProgress(); // Poll immediately
    soundProgress.interval = setInterval(fetchSoundProgress, 250);
}

function stopProgressPolling() {
    if (!soundProgress.polling) return;
    soundProgress.polling = false;
    if (soundProgress.interval) {
        clearInterval(soundProgress.interval);
        soundProgress.interval = null;
    }
}

async function fetchSoundProgress() {
    // Stop polling if no sounds are being tracked
    if (soundProgress.activeSounds.size === 0 && soundProgress.polling) {
        stopProgressPolling();
        handleAllSoundsFinishedVisuals(); // Ensure UI is reset
        return;
    }
    // Exit if polling was stopped externally but function was already in flight
    if (!soundProgress.polling && soundProgress.activeSounds.size === 0) return;


    try {
        const playingSoundsData = await apiFetch('/api/sounds/progress');
        const currentPlayingIdsFromServer = new Set(playingSoundsData.map(s => s.id));

        let maxProgressPercentage = 0;
        let isAnySoundPlaying = false; // Track if *any* sound is unpaused

        playingSoundsData.forEach(soundUpdate => {
            const existingSound = soundProgress.activeSounds.get(soundUpdate.id);
            // Basic validation
            if (typeof soundUpdate.id === 'undefined' || typeof soundUpdate.soundId === 'undefined') {
                console.warn("Received progress update with missing ID:", soundUpdate);
                return;
            }

            const isPaused = soundUpdate.paused ?? existingSound?.paused ?? true;
            const lengthMs = (typeof soundUpdate.lengthInMs === 'number' && soundUpdate.lengthInMs > 0 ? soundUpdate.lengthInMs : existingSound?.lengthInMs) || 0;
            const readMs = soundUpdate.readInMs ?? existingSound?.readInMs ?? 0;

            let soundDataToUpdate = existingSound;

            // Add to tracking if it's a new playing instance
            if (!existingSound) {
                console.warn(`Received progress for untracked playingId ${soundUpdate.id}. Adding.`);
                 soundDataToUpdate = {
                     id: soundUpdate.id, soundId: soundUpdate.soundId,
                     lengthInMs: lengthMs, readInMs: readMs,
                     name: soundUpdate.name || 'Sound', paused: isPaused,
                     repeat: soundUpdate.repeat || false,
                 };
                 soundProgress.activeSounds.set(soundUpdate.id, soundDataToUpdate);
                 state.currentlyPlaying.set(soundDataToUpdate.soundId, soundDataToUpdate.id);
                 // Don't call updatePlayingStateVisuals here, do it once at the end
            } else {
                // Update existing tracked sound
                existingSound.readInMs = readMs;
                existingSound.paused = isPaused;
                existingSound.repeat = soundUpdate.repeat ?? existingSound.repeat;
                if (lengthMs > 0) existingSound.lengthInMs = lengthMs;
            }

            // --- Calculate Max Progress for Top Bar ---
            if (!isPaused && lengthMs > 0) {
                isAnySoundPlaying = true; // Mark that at least one sound is playing
                const percentage = (readMs / lengthMs) * 100;
                maxProgressPercentage = Math.max(maxProgressPercentage, percentage);

                // --- Update Individual Card Background (Only Grid View) ---
                if (soundsContainerEl && !soundsContainerEl.classList.contains('layout-list')) {
                     const soundCard = soundsContainerEl.querySelector(`.sound-card[data-sound-id="${soundDataToUpdate.soundId}"]`);
                     if (soundCard) {
                         const baseColor = soundCard.style.getPropertyValue('--sound-base-color') || 'var(--v-surface-dark)';
                         soundCard.style.background = `linear-gradient(to right, var(--v-primary-darken1) ${percentage}%, ${baseColor} ${percentage}%)`;
                     }
                }
            }
        });

        // --- Update Global UI Elements ---
        updateTopBarProgress(maxProgressPercentage);
        updatePlayIndicator(isAnySoundPlaying);

        // --- Handle Finished Sounds ---
        const finishedSoundPlayingIds = [];
        soundProgress.activeSounds.forEach((soundData, playingId) => {
            if (!currentPlayingIdsFromServer.has(playingId)) {
                finishedSoundPlayingIds.push(playingId);
            }
        });

        finishedSoundPlayingIds.forEach(playingId => {
            const soundData = soundProgress.activeSounds.get(playingId);
            if (soundData) {
                state.currentlyPlaying.delete(soundData.soundId);
                soundProgress.activeSounds.delete(playingId);
                handleSoundFinishVisuals(soundData); // Reset individual card
            }
        });

        // --- Final Polling Check & State Update ---
        if (soundProgress.activeSounds.size === 0) {
            if(soundProgress.polling) stopProgressPolling(); // Stop only if we are currently polling
            handleAllSoundsFinishedVisuals(); // Reset global UI
        } else if (!soundProgress.polling) {
            startProgressPolling(); // Restart if needed
        }

         updatePlayingStateVisuals(); // Update 'playing' class on all cards

    } catch (error) {
        console.error('Error fetching sound progress:', error);
        stopProgressPolling();
        state.currentlyPlaying.clear();
        soundProgress.activeSounds.clear();
        updatePlayingStateVisuals();
        handleAllSoundsFinishedVisuals(); // Reset UI on error
    }
}

// --- Visual Updates for Playback & Progress ---

function handleSoundPlayedVisuals(soundData) {
    updatePlayIndicator(true); // Show icon immediately
    // Top bar progress updates are handled by fetchSoundProgress
}

function handleSoundFinishVisuals(soundData) {
    // Reset individual card background/style
    if (soundsContainerEl) {
        const soundCard = soundsContainerEl.querySelector(`.sound-card[data-sound-id="${soundData.soundId}"]`);
        if (soundCard) {
            soundCard.style.background = ''; // Reset background gradient
            updateSoundCardDisplay(soundData.soundId, soundCard); // Re-apply base styles
        }
    }
    // Global bar/icon reset is handled by handleAllSoundsFinishedVisuals when map becomes empty
}

function handleAllSoundsFinishedVisuals() {
    updateTopBarProgress(0); // Reset top bar gradient
    updatePlayIndicator(false); // Hide play icon

    // Reset all sound card backgrounds
    if (soundsContainerEl) {
        soundsContainerEl.querySelectorAll('.sound-card').forEach(card => {
             card.style.background = ''; // Clear background style
             const soundId = parseInt(card.dataset.soundId);
             if (!isNaN(soundId)) {
                 // Re-apply base color potentially
                 updateSoundCardDisplay(soundId, card);
             }
        });
    }

     updatePlayingStateVisuals(); // Ensure all 'playing' classes removed
}

function updatePlayingStateVisuals() {
     if (!soundsContainerEl) return;
    soundsContainerEl.querySelectorAll('.sound-card').forEach(card => {
        const soundId = parseInt(card.dataset.soundId);
        if (isNaN(soundId)) return;

        const isPlaying = state.currentlyPlaying.has(soundId);
        const wasPlaying = card.classList.contains('playing');

        card.classList.toggle('playing', isPlaying);

        // If it *stopped* playing, reset background and re-apply base style
        if (wasPlaying && !isPlaying) {
             card.style.background = '';
             updateSoundCardDisplay(soundId, card);
        }
        // If it *started* playing, the progress fetch will handle background updates
    });
}

// Initial check for sounds already playing
async function checkForPlayingSounds() {
    console.log("Checking for initially playing sounds...");
    startProgressPolling(); // Start polling to get initial state
}

// Make functions globally accessible if needed by other modules
window.app = {
    reloadSoundsForCurrentTab: reloadSoundsForCurrentTab,
    updateSoundCardDisplay: updateSoundCardDisplay
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', init);
// --- ENTIRE FILE REPLACE ---