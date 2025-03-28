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
};

// DOM Elements
const serverStatusEl = document.getElementById('server-status');
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


// Initialize the application
function init() {
    state.apiBaseUrl = window.location.origin; // Assuming server is on same origin
    console.log("API Base URL:", state.apiBaseUrl);
    checkServerStatus();
    setupEventListeners();
    initSoundProgressBar();
    // Initial load depends on server status check now
    // checkForPlayingSounds(); // Check for sounds playing on load
}

// --- API Helper ---
async function apiFetch(endpoint, options = {}) {
    const url = `${state.apiBaseUrl}${endpoint}`;
    try {
        const response = await fetch(url, {
             credentials: 'include', // Send cookies
            ...options
        });
        if (!response.ok) {
            if (response.status === 401) {
                 console.warn("API request unauthorized. Redirecting to login.");
                 window.location.href = '/login.html'; // Redirect if unauthorized
                 throw new Error('Unauthorized');
            }
            // Try to parse error message from server
            try {
                 const errorData = await response.json();
                 throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            } catch (parseError) {
                 // If response is not JSON or parsing fails
                 throw new Error(`HTTP error! status: ${response.status}`);
            }
        }
        // Check content type before parsing JSON
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return await response.json();
        } else {
            // Handle non-JSON responses if necessary, or just return the response object
            console.log("Received non-JSON response for", endpoint);
            return response; // Or handle as text, blob etc. if needed
        }
    } catch (error) {
        console.error('API Fetch Error:', error);
        // Update UI to show connection error state
        serverStatusEl.textContent = 'Connection Error';
        statusIndicatorEl.className = 'status-dot error'; // Reset and add error
        throw error; // Re-throw error for calling function to handle if needed
    }
}


// --- Server Status & Initial Load ---
async function checkServerStatus() {
    try {
        await apiFetch('/api/status');
        serverStatusEl.textContent = 'Connected';
        statusIndicatorEl.className = 'status-dot connected'; // Reset and add connected
        // Load data only after successful status check
        loadTabs();
        checkForPlayingSounds();
    } catch (error) {
        // Error already logged by apiFetch, UI updated there
        // No further action needed here unless specific error handling is required
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    stopAllButton.addEventListener('click', stopAllSounds);

    // App Settings Modal Listeners
    if (appSettingsButton) {
        appSettingsButton.addEventListener('click', openAppSettingsModal);
    }
    if (appSettingsModalOverlay) {
        appSettingsModalOverlay.addEventListener('click', (e) => {
             if (e.target === appSettingsModalOverlay) closeAppSettingsModal(); // Close on backdrop click
        });
    }
    if (closeAppSettingsButton) {
        closeAppSettingsButton.addEventListener('click', closeAppSettingsModal);
    }
    if (exportSettingsButton) {
        exportSettingsButton.addEventListener('click', persistence.exportSettings);
    }
    if (importSettingsButton) {
        importSettingsButton.addEventListener('click', () => importFileInput?.click());
    }
    if (importFileInput) {
        importFileInput.addEventListener('change', handleImportFile);
    }

    // --- Sound Card Interactions ---
     soundsContainerEl.addEventListener('click', (e) => {
         const card = e.target.closest('.sound-card');
         if (!card) return;
         const soundId = parseInt(card.dataset.soundId);

         if (editMode.isActive()) {
             // In edit mode, click opens settings
             window.soundSettings.open(soundId);
         } else {
             // In normal mode, click plays sound
             playSound(soundId);
         }
     });

     // --- Global listener for events dispatched by other modules ---
     document.addEventListener('settingsChanged', () => {
         // Maybe refresh UI elements if needed
         console.log("Global settings changed event received.");
         // Could potentially reload sounds if a major setting affecting display changed
         // reloadSoundsForCurrentTab();
     });

      // Add listener for progress updates (optional, if backend pushes events)
     // Example using EventSource (Server-Sent Events)
     /*
     const evtSource = new EventSource("/api/events"); // Assuming an SSE endpoint exists
     evtSource.onmessage = function(event) {
         const data = JSON.parse(event.data);
         if (data.type === 'progressUpdate') {
             handleSoundProgressUpdate(data.payload);
         } else if (data.type === 'soundFinished') {
             handleSoundFinishUpdate(data.payload);
         } else if (data.type === 'soundStarted') {
             // ... handle new sound starting ...
         }
     };
     evtSource.onerror = function(err) {
         console.error("EventSource failed:", err);
         // Maybe try to reconnect or update status indicator
     };
     */
}

// --- App Settings Modal ---
function openAppSettingsModal() {
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
        reloadSoundsForCurrentTab(); // Refresh UI
        closeAppSettingsModal();
    } catch (error) {
        console.error('Import failed:', error);
        alert(`Failed to import settings: ${error.message}`);
    } finally {
        // Reset file input
        event.target.value = null;
    }
}

// --- Tabs ---
async function loadTabs() {
    try {
        const tabs = await apiFetch('/api/tabs');
        state.tabs = tabs;
        tabsContainerEl.innerHTML = ''; // Clear existing tabs

        // Add Favorites Tab
        const favTab = createTabElement('Favorites', 'favorites', 'favorite');
        tabsContainerEl.appendChild(favTab);

        // Add Regular Tabs
        tabs.forEach(tab => {
            const tabElement = createTabElement(tab.name, tab.id);
            tabsContainerEl.appendChild(tabElement);
        });

        // Activate the persisted or first tab
        const persistedTabId = state.settings.lastTabId || 'favorites'; // Assuming you save last tab ID
        let tabToActivate = tabsContainerEl.querySelector(`[data-tab-id="${persistedTabId}"]`) || tabsContainerEl.children[0];

        if (tabToActivate) {
            const tabId = tabToActivate.dataset.tabId;
             setActiveTab(tabToActivate, tabId);
            loadSounds(tabId); // Load sounds for the initially active tab
        } else {
            console.warn("No tabs found to activate.");
        }

    } catch (error) {
        console.error('Error loading tabs:', error);
        // Handle error display in UI if necessary
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
             icon.style.color = 'var(--text-secondary)'; // Use a muted color for the icon itself
         }
        tabElement.appendChild(icon);
        // Add text label for accessibility if desired
        // const textSpan = document.createElement('span');
        // textSpan.textContent = name;
        // textSpan.classList.add('tab-text-label'); // Add class for potential styling/hiding
        // tabElement.appendChild(textSpan);
        tabElement.setAttribute('aria-label', name); // Important for accessibility
    } else {
        tabElement.textContent = name;
    }

    tabElement.addEventListener('click', () => {
        setActiveTab(tabElement, id);
        loadSounds(id);
    });
    return tabElement;
}

function setActiveTab(tabElement, tabId) {
    if (state.currentTab === tabId) return; // Already active

    // Remove active class from all tabs
    tabsContainerEl.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));

    // Add active class to the clicked tab
    tabElement.classList.add('active');
    state.currentTab = tabId;

     // Save last selected tab (optional)
     state.settings.lastTabId = tabId; // Add this property to your settings structure if needed
     persistence.save(state.settings);

     // Dispatch event for layout manager
     document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tabId } }));
}

// --- Sounds ---
async function loadSounds(tabId) {
    try {
        const endpoint = (tabId === 'favorites') ? '/api/favorites' : `/api/tabs/${tabId}/sounds`;
        let sounds = await apiFetch(endpoint);

        // Apply custom order if available for the current layout
        const currentLayout = layoutManager.getCurrentLayoutModeForTab(tabId);
        const customOrder = persistence.getLayoutOrder(tabId, currentLayout);

        if (customOrder && Array.isArray(customOrder)) {
            sounds.sort((a, b) => {
                const indexA = customOrder.indexOf(a.path);
                const indexB = customOrder.indexOf(b.path);

                if (indexA === -1 && indexB === -1) return 0; // Both not in order, keep relative order
                if (indexA === -1) return 1; // A not in order, put it after B
                if (indexB === -1) return -1; // B not in order, put it after A
                return indexA - indexB; // Both in order, sort by index
            });
             console.log(`Applied custom order for tab ${tabId}, layout ${currentLayout}`);
        } else {
             console.log(`No custom order found for tab ${tabId}, layout ${currentLayout}. Using default order.`);
             // Optionally apply default sorting from tab settings if needed
             // const tabData = state.tabs.find(t => t.id == tabId);
             // if (tabData && tabData.sortMode) { applySortMode(sounds, tabData.sortMode); }
        }


        displaySounds(sounds);
    } catch (error) {
        console.error(`Error loading sounds for tab ${tabId}:`, error);
        soundsContainerEl.innerHTML = '<p class="error-text">Failed to load sounds.</p>'; // Show error in UI
    }
}

// Function to reload sounds for the currently active tab
function reloadSoundsForCurrentTab() {
    if (state.currentTab !== null) {
        console.log(`Reloading sounds for current tab: ${state.currentTab}`);
        loadSounds(state.currentTab);
    }
}


function displaySounds(sounds) {
    soundsContainerEl.innerHTML = ''; // Clear previous sounds
    if (!sounds || sounds.length === 0) {
         soundsContainerEl.innerHTML = '<p class="no-sounds">No sounds in this tab.</p>';
        return;
    }

    sounds.forEach(sound => {
        const soundElement = createSoundCardElement(sound);
        soundsContainerEl.appendChild(soundElement);
    });
}

function createSoundCardElement(sound) {
    const soundElement = document.createElement('div');
    soundElement.className = 'sound-card fade-in';
    soundElement.dataset.soundId = sound.id;
    soundElement.dataset.soundPath = sound.path; // Store path for persistence key

    // Content wrapper for text and potential background emoji
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'sound-content-wrapper';

    // Text element
    const textElement = document.createElement('span');
    textElement.className = 'sound-text';
    textElement.textContent = sound.name;

     // Add text to wrapper
     contentWrapper.appendChild(textElement);

     // Add wrapper to card
     soundElement.appendChild(contentWrapper);

    // Apply persisted settings (color, emoji)
    updateSoundCardDisplay(sound.id, soundElement); // Pass the element to avoid re-querying

    // Check if this sound is currently playing
    if (state.currentlyPlaying.has(sound.id)) {
        soundElement.classList.add('playing');
        // Re-trigger animation if needed, handled in updatePlayingState logic
    }

    // Add indicators container (will be populated by updateSoundCardDisplay)
    const indicators = document.createElement('div');
    indicators.className = 'sound-indicators';
    soundElement.appendChild(indicators);


    return soundElement;
}

// Update visual display of a sound card (color, emoji, indicators)
function updateSoundCardDisplay(soundId, cardElement = null) {
    const card = cardElement || soundsContainerEl.querySelector(`.sound-card[data-sound-id="${soundId}"]`);
    if (!card) return;

    const soundPath = card.dataset.soundPath;
    if (!soundPath) return; // Need path to get settings

    const soundSettings = persistence.getSoundSettings(soundPath);
    const contentWrapper = card.querySelector('.sound-content-wrapper');
    const textElement = card.querySelector('.sound-text');
    let indicators = card.querySelector('.sound-indicators');
    if (!indicators) {
        indicators = document.createElement('div');
        indicators.className = 'sound-indicators';
        card.appendChild(indicators);
    }
    indicators.innerHTML = ''; // Clear existing indicators

    // --- Apply Color ---
    // Remove existing color classes
    card.classList.forEach(className => {
        if (className.startsWith('sound-color-')) {
            card.classList.remove(className);
        }
    });
    // Add new color class if set
    if (soundSettings.color && soundSettings.color !== 'default') {
        card.classList.add(`sound-color-${soundSettings.color}`);
    }

    // --- Apply Emoji ---
    // Remove existing emoji elements (pseudo or actual)
    const existingEmojiPseudo = card.style.getPropertyValue('--sound-emoji'); // Check CSS variable
    if (existingEmojiPseudo) card.style.removeProperty('--sound-emoji');
    const existingEmojiSpan = contentWrapper?.querySelector('.sound-emoji-list');
    if (existingEmojiSpan) contentWrapper.removeChild(existingEmojiSpan);

    if (soundSettings.emoji) {
        // Check current layout mode to decide placement
        const currentLayout = soundsContainerEl.className.match(/layout-([a-z0-9\-]+)/)?.[0]; // layout-grid-3, layout-list etc.

        if (currentLayout && currentLayout.includes('list')) {
            // List View: Prepend emoji span
            const emojiSpan = document.createElement('span');
            emojiSpan.className = 'sound-emoji-list';
            emojiSpan.textContent = soundSettings.emoji;
            contentWrapper.insertBefore(emojiSpan, textElement);
        } else {
            // Grid View: Use CSS variable for pseudo-element
            card.style.setProperty('--sound-emoji', `"${soundSettings.emoji}"`);
        }
    }

    // --- Update Indicators ---
    const isFavorite = state.settings.soundSettings[soundPath]?.favorite ?? soundSettings.favorite; // Check global state too if needed
    const hasCustomVolume = state.settings.soundSettings[soundPath]?.hasOwnProperty('localVolume') || state.settings.soundSettings[soundPath]?.hasOwnProperty('remoteVolume') || soundSettings.customVolume; // More robust check


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

     // Remove indicators container if empty
     if (indicators.children.length === 0) {
         card.removeChild(indicators);
     }
}


// --- Playback Control ---
async function playSound(soundId) {
    // Prevent playing in edit mode
    if (editMode.isActive()) return;

    console.log(`Attempting to play sound: ${soundId}`);
    try {
        const data = await apiFetch(`/api/sounds/${soundId}/play`, { method: 'POST' });
        if (data.success && data.playingId) {
            console.log(`Sound ${soundId} started playing with instance ID: ${data.playingId}`);
            // Store mapping: soundId -> playingId
            state.currentlyPlaying.set(soundId, data.playingId);

            // Store additional details for progress tracking
            soundProgress.activeSounds.set(data.playingId, {
                 id: data.playingId,
                 soundId: soundId,
                 lengthInMs: data.lengthInMs,
                 readInMs: 0, // Start at 0
                 name: data.name || 'Sound', // Get name if provided
            });

            updatePlayingStateVisuals();
            handleSoundPlayedVisuals(data); // Update progress bar etc.
            startProgressPolling(); // Start polling if not already active
        } else {
            console.error(`Failed to play sound ${soundId}:`, data.error || 'Unknown server error');
            // Optionally remove from playing state if it failed immediately
            state.currentlyPlaying.delete(soundId);
            updatePlayingStateVisuals();
        }
    } catch (error) {
        console.error(`Error playing sound ${soundId}:`, error);
        // Optionally update UI to show error
    }
}

async function stopAllSounds() {
    console.log("Stopping all sounds...");
    try {
        await apiFetch('/api/sounds/stop', { method: 'POST' });
        // Clear local state *after* successful API call
        state.currentlyPlaying.clear();
        soundProgress.activeSounds.clear();
        updatePlayingStateVisuals();
        stopProgressPolling();
        handleAllSoundsFinishedVisuals(); // Reset progress bar etc.
    } catch (error) {
        console.error('Error stopping sounds:', error);
    }
}

// --- Progress Polling ---
const soundProgress = {
    polling: false,
    interval: null,
    activeSounds: new Map(), // Maps playingId -> { id, soundId, lengthInMs, readInMs, name, ... }
};

function startProgressPolling() {
    if (soundProgress.polling) return;
    console.log("Starting progress polling.");
    soundProgress.polling = true;
    // Clear any existing interval just in case
    if (soundProgress.interval) clearInterval(soundProgress.interval);
    // Poll immediately first time
    fetchSoundProgress();
    // Then set interval
    soundProgress.interval = setInterval(fetchSoundProgress, 250); // Poll 4 times/sec
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
    // If no sounds are supposed to be playing according to our state, stop polling
    if (soundProgress.activeSounds.size === 0) {
        // console.log("No active sounds tracked, stopping polling.");
        stopProgressPolling();
        handleAllSoundsFinishedVisuals(); // Ensure UI is reset
        return;
    }

    try {
        const playingSoundsData = await apiFetch('/api/sounds/progress');

        // Keep track of playing IDs received from the server
        const currentPlayingIdsFromServer = new Set(playingSoundsData.map(s => s.id));

        // Update or add sounds received from the server
        playingSoundsData.forEach(soundUpdate => {
            const existingSound = soundProgress.activeSounds.get(soundUpdate.id);
            if (existingSound) {
                // Update existing sound data
                existingSound.readInMs = soundUpdate.readInMs;
                // Update other properties if necessary (e.g., paused state)
                 existingSound.paused = soundUpdate.paused;
                 existingSound.repeat = soundUpdate.repeat;

                handleSoundProgressVisuals(existingSound);
            } else {
                // This case should ideally not happen if soundStarted events are handled
                // But as a fallback, add it if we missed the start event
                console.warn(`Received progress for untracked playingId ${soundUpdate.id}. Adding.`);
                 soundProgress.activeSounds.set(soundUpdate.id, {
                     id: soundUpdate.id,
                     soundId: soundUpdate.soundId, // Ensure soundId is part of progress payload
                     lengthInMs: soundUpdate.lengthInMs,
                     readInMs: soundUpdate.readInMs,
                     name: soundUpdate.name,
                     paused: soundUpdate.paused,
                     repeat: soundUpdate.repeat,
                 });
                 // Also update the main playing state
                 state.currentlyPlaying.set(soundUpdate.soundId, soundUpdate.id);
                 updatePlayingStateVisuals();
                 handleSoundProgressVisuals(soundProgress.activeSounds.get(soundUpdate.id));
            }
        });

        // Remove sounds from our tracking if they are no longer reported by the server
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
                state.currentlyPlaying.delete(soundData.soundId); // Remove from main playing map
                soundProgress.activeSounds.delete(playingId); // Remove from progress tracking
                handleSoundFinishVisuals(soundData); // Update visuals for this specific sound
            }
        });

        // If after cleanup, no sounds are active, stop polling and reset global progress bar
        if (soundProgress.activeSounds.size === 0) {
            console.log("All sounds finished, stopping polling.");
            stopProgressPolling();
            handleAllSoundsFinishedVisuals();
        }

         // Refresh the playing state visuals based on the updated state.currentlyPlaying
         updatePlayingStateVisuals();


    } catch (error) {
        console.error('Error fetching sound progress:', error);
        // Consider stopping polling on error or implementing retry logic
        stopProgressPolling();
        // Reset UI potentially
        state.currentlyPlaying.clear();
        soundProgress.activeSounds.clear();
        updatePlayingStateVisuals();
        handleAllSoundsFinishedVisuals();
    }
}

// --- Visual Updates for Playback & Progress ---

function initSoundProgressBar() {
    if (progressContainerEl) progressContainerEl.classList.add('inactive');
    updateProgressBar(0);
}

function handleSoundPlayedVisuals(soundData) {
    // Only show progress bar if it's not already active for another sound
    // Or maybe always show the *latest* sound's progress? Decided: show latest.
    if (progressContainerEl) {
        progressContainerEl.classList.remove('inactive');
        progressContainerEl.classList.add('active');
    }
    updateProgressBar(0); // Start at 0%
}

function handleSoundProgressVisuals(soundData) {
    const percentage = soundData.lengthInMs > 0 ? (soundData.readInMs / soundData.lengthInMs) * 100 : 0;

    // Update global progress bar - Show progress of the *first* sound in the map for simplicity
     const firstPlayingSound = soundProgress.activeSounds.values().next().value;
     if (firstPlayingSound && soundData.id === firstPlayingSound.id) {
         updateProgressBar(percentage);
     }

    // Update individual sound card visuals
    const soundCard = soundsContainerEl.querySelector(`.sound-card[data-sound-id="${soundData.soundId}"]`);
    if (soundCard) {
        // Example: Use background gradient for progress
         soundCard.style.background = `linear-gradient(to right, var(--v-primary-darken1) ${percentage}%, var(--v-surface-dark) ${percentage}%)`;
         // Re-apply base color class if it exists
         const colorClass = Array.from(soundCard.classList).find(c => c.startsWith('sound-color-'));
         if (colorClass && soundSettings.color !== 'default') { // Check persistence
             // Adjust background logic if color class is present
              const baseColor = getComputedStyle(soundCard).getPropertyValue('--sound-base-color') || 'var(--v-surface-dark)'; // Get color from CSS variable or default
              soundCard.style.background = `linear-gradient(to right, var(--v-primary-darken1) ${percentage}%, ${baseColor} ${percentage}%)`;
         }

    }
}

function handleSoundFinishVisuals(soundData) {
    const soundCard = soundsContainerEl.querySelector(`.sound-card[data-sound-id="${soundData.soundId}"]`);
    if (soundCard) {
        soundCard.style.background = ''; // Reset background gradient
        // Re-apply base color if needed
        updateSoundCardDisplay(soundData.soundId, soundCard); // Re-apply color/emoji/indicators
    }
    // Note: Global progress bar reset is handled in handleAllSoundsFinishedVisuals
}

function handleAllSoundsFinishedVisuals() {
    // Hide global progress bar
    if (progressContainerEl) {
        progressContainerEl.classList.remove('active');
        progressContainerEl.classList.add('inactive');
    }
    // Reset to 0 after transition
    setTimeout(() => updateProgressBar(0), 500); // Match transition duration

    // Reset background for all cards (redundant if handleSoundFinishVisuals works, but safe)
    soundsContainerEl.querySelectorAll('.sound-card').forEach(card => {
         card.style.background = '';
         updateSoundCardDisplay(parseInt(card.dataset.soundId), card); // Re-apply base styles
    });

     updatePlayingStateVisuals(); // Ensure all 'playing' classes are removed
}


function updatePlayingStateVisuals() {
    soundsContainerEl.querySelectorAll('.sound-card').forEach(card => {
        const soundId = parseInt(card.dataset.soundId);
        card.classList.toggle('playing', state.currentlyPlaying.has(soundId));
        // If not playing, ensure background is reset (might have progress)
        if (!state.currentlyPlaying.has(soundId)) {
             card.style.background = ''; // Clear potential progress gradient
             updateSoundCardDisplay(soundId, card); // Re-apply base color/emoji
        }
    });
}

// Initial check for sounds already playing when the page loads
async function checkForPlayingSounds() {
    console.log("Checking for initially playing sounds...");
    await fetchSoundProgress(); // Use the polling function once to populate initial state
}

// Make reload function globally accessible if needed by layout.js
window.app = {
    reloadSoundsForCurrentTab: reloadSoundsForCurrentTab,
    updateSoundCardDisplay: updateSoundCardDisplay // Expose for sound-settings.js
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', init);