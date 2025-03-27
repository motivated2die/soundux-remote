// Global state management
const state = {
    currentlyPlaying: new Set(),
    tabs: [],
    currentTab: null
};

// DOM Elements
const serverStatus = document.getElementById('server-status');
const statusIndicator = document.getElementById('status-indicator');
const stopAllButton = document.getElementById('stop-all');
const tabsContainer = document.getElementById('tabs-container');
const soundsContainer = document.getElementById('sounds-container');

// Initialize the application
function init() {
    checkServerStatus();
    setupEventListeners();
    setTimeout(initSoundProgressBar, 100);
}

// Check server status
function checkServerStatus() {
    fetch('/api/status')
        .then(response => response.json())
        .then(data => {
            serverStatus.textContent = 'Connected';
            statusIndicator.classList.add('connected');
            loadTabs();
        })
        .catch(error => {
            serverStatus.textContent = 'Connection Error';
            statusIndicator.classList.add('error');
            console.error('Error:', error);
        });
}

// Setup event listeners
function setupEventListeners() {
    stopAllButton.addEventListener('click', stopAllSounds);
}

// Load tabs
function loadTabs() {
    fetch('/api/tabs')
        .then(response => response.json())
        .then(tabs => {
            state.tabs = tabs;
            tabsContainer.innerHTML = '';
            
            // Add favorites tab with icon
            const favTab = createTabElement('favorite', 'favorites');
            tabsContainer.appendChild(favTab);
            
            // Add regular tabs
            tabs.forEach(tab => {
                const tabElement = createTabElement(tab.name, tab.id);
                tabsContainer.appendChild(tabElement);
            });
            
            // Activate first tab by default
            const firstTab = tabsContainer.children[0];
            setActiveTab(firstTab, 'favorites');
            loadSounds('favorites');
        })
        .catch(error => console.error('Error loading tabs:', error));
}

// Create tab element
function createTabElement(name, id) {
    const tabElement = document.createElement('button');
    tabElement.className = 'tab';
    tabElement.dataset.tabId = id;

    // Use icon for favorites, text for other tabs
    if (id === 'favorites') {
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined';
        icon.textContent = 'favorite';
        tabElement.appendChild(icon);
    } else {
        tabElement.textContent = name;
    }

    tabElement.addEventListener('click', () => {
        setActiveTab(tabElement, id);
        loadSounds(id);
    });
    return tabElement;
}

// Set active tab
function setActiveTab(tabElement, tabId) {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    tabElement.classList.add('active');
    state.currentTab = tabId;
}

// Load sounds
function loadSounds(tabId) {
    let fetchPromise;
    
    if (tabId === 'favorites') {
        fetchPromise = fetch('/api/favorites');
    } else {
        fetchPromise = fetch(`/api/tabs/${tabId}/sounds`);
    }
    
    fetchPromise
        .then(response => response.json())
        .then(sounds => {
            displaySounds(sounds);
        })
        .catch(error => console.error('Error loading sounds:', error));
}

// Display sounds
function displaySounds(sounds) {
    soundsContainer.innerHTML = '';
    
    sounds.forEach(sound => {
        const soundElement = document.createElement('div');
        soundElement.className = 'sound-card fade-in';
        soundElement.textContent = sound.name;
        soundElement.dataset.soundId = sound.id;
        
        // Check if this sound is currently playing
        if (state.currentlyPlaying.has(sound.id)) {
            soundElement.classList.add('playing');
        }
        
        soundElement.addEventListener('click', () => playSound(sound.id));
        soundsContainer.appendChild(soundElement);
    });
}

// Play a sound
function playSound(soundId) {
    fetch(`/api/sounds/${soundId}/play`, { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            // Use soundId for visual state
            state.currentlyPlaying.add(soundId);
            updatePlayingState();
            
            // Use playingId for progress tracking
            if (data.lengthInMs && data.playingId) {
                // Store mapping between playingId and soundId
                soundProgress.activeSounds.set(data.playingId, {
                    id: data.playingId,
                    soundId: soundId,  // Keep reference to original sound
                    lengthInMs: data.lengthInMs,
                    readInMs: 0
                });
                
                // Start tracking with clear data
                handleSoundPlayed(data);
                startProgressPolling();
            }
        });
}


// Add initial check for already playing sounds
function checkForPlayingSounds() {
    fetch('/api/sounds/progress')
        .then(response => response.json())
        .then(data => {
            if (Array.isArray(data) && data.length > 0) {
                // Update state with already playing sounds
                data.forEach(sound => {
                    soundProgress.activeSounds.set(sound.id, sound);
                    state.currentlyPlaying.add(sound.soundId);
                });
                updatePlayingState();
                startProgressPolling();
            }
        });
}



// Stop all sounds
function stopAllSounds() {
    fetch('/api/sounds/stop', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            // Clear playing state
            state.currentlyPlaying.clear();
            updatePlayingState();
            
            // Clear progress tracking
            soundProgress.activeSounds.clear();
            stopProgressPolling();
            
            // Reset progress bar
            handleSoundFinished();
        })
        .catch(error => {
            console.error('Error stopping sounds:', error);
        });
}



// Update playing state visually
function updatePlayingState() {
    const soundCards = document.querySelectorAll('.sound-card');
    soundCards.forEach(card => {
        const soundId = parseInt(card.dataset.soundId);
        
        // If sound is currently playing and card doesn't have the playing class yet
        if (state.currentlyPlaying.has(soundId) && !card.classList.contains('playing')) {
            // Add the playing class which will trigger the highlight animation
            card.classList.add('playing');
            
            // Create a temporary highlight effect that fades out
            // Remove and re-add the class after animation completes to reset it
            card.addEventListener('animationend', function resetHighlight() {
                // After animation ends, keep the class but reset for future animations
                card.classList.remove('playing');
                
                // If still playing (didn't get stopped during animation), re-add class immediately
                if (state.currentlyPlaying.has(soundId)) {
                    requestAnimationFrame(() => {
                        card.classList.add('playing');
                    });
                }
                
                // Remove this specific instance of the event listener
                card.removeEventListener('animationend', resetHighlight);
            });
        } 
        // If sound is no longer playing
        else if (!state.currentlyPlaying.has(soundId) && card.classList.contains('playing')) {
            card.classList.remove('playing');
        }
    });
}
// Global tracking variable for sound progress
const soundProgress = {
    polling: false,
    interval: null,
    activeSounds: new Map(), // Maps playingId to sound data
};

// Initialize progress bar
function initSoundProgressBar() {
    const progressContainer = document.getElementById('sound-progress-container');
    const progressBar = document.getElementById('sound-progress-bar');
    
    if (!progressContainer || !progressBar) return;
    
    // Initially set it as inactive
    progressContainer.classList.add('inactive');
}

// Handle sound played event
function handleSoundPlayed(soundData) {
    // Store the length of the sound for progress tracking
    soundProgressData = {
        isPlaying: true,
        currentPosition: 0,
        totalLength: soundData.lengthInMs,
        soundId: soundData.id
    };
    
    // Activate progress container
    const progressContainer = document.getElementById('sound-progress-container');
    if (progressContainer) {
        progressContainer.classList.remove('inactive');
        progressContainer.classList.add('active');
    }
    
    // Reset progress bar to 0
    updateProgressBar(0);
}

// Update progress bar with data from sound progress updates
function handleSoundProgress(soundData) {
    // Find corresponding DOM element for this sound
    const soundElement = document.querySelector(`.sound-card[data-sound-id="${soundData.soundId}"]`);
    
    // Calculate percentage
    const percentage = (soundData.readInMs / soundData.lengthInMs) * 100;
    
    // Update progress bar - for now just show the first active sound's progress
    if (soundProgress.activeSounds.size === 1 || soundData.id === [...soundProgress.activeSounds.keys()][0]) {
        updateProgressBar(percentage);
    }
    
    // Optional: Add individual progress indicators to each sound card
    if (soundElement) {
        // Add progress indication to the specific sound
        soundElement.style.background = `linear-gradient(to right, var(--v-primary-base) ${percentage}%, var(--v-surface-dark) ${percentage}%)`;
    }
}


// Update the progress bar width
function updateProgressBar(percentage) {
    const progressBar = document.getElementById('sound-progress-bar');
    if (progressBar) {
        progressBar.style.width = `${percentage}%`;
    }
}

// Handle sound finished event
function handleSoundFinished() {
    // Animate to 100% then reset
    updateProgressBar(100);
    
    // After a moment, hide the progress bar
    setTimeout(() => {
        const progressContainer = document.getElementById('sound-progress-container');
        if (progressContainer) {
            progressContainer.classList.remove('active');
            progressContainer.classList.add('inactive');
        }
        
        // Reset to 0 after transition completes
        setTimeout(() => {
            updateProgressBar(0);
        }, 500);
    }, 300);
}

// Function to start polling for sound progress
function startProgressPolling() {
    if (soundProgress.polling) return; // Already polling
    
    soundProgress.polling = true;
    
    // Poll every 250ms (4 times per second)
    soundProgress.interval = setInterval(fetchSoundProgress, 250);
}

// Function to stop polling
function stopProgressPolling() {
    if (!soundProgress.polling) return; // Not polling
    
    soundProgress.polling = false;
    
    if (soundProgress.interval) {
        clearInterval(soundProgress.interval);
        soundProgress.interval = null;
    }
}

// Function to fetch sound progress from the server
function fetchSoundProgress() {
    // Only fetch if we have active sounds
    if (soundProgress.activeSounds.size === 0) {
        stopProgressPolling();
        return;
    }
    
    fetch('/api/sounds/progress')
        .then(response => response.json())
        .then(data => {
            // Process progress data
            if (Array.isArray(data) && data.length > 0) {
                data.forEach(sound => {
                    soundProgress.activeSounds.set(sound.id, sound);
                    handleSoundProgress(sound);
                });
            } else {
                // No sounds playing
                soundProgress.activeSounds.clear();
                stopProgressPolling();
                handleSoundFinished();
            }
        })
        .catch(error => {
            console.error('Error fetching sound progress:', error);
        });
}

function addFullscreenReentryFeature() {
    // Get all navbar elements
    const header = document.querySelector('header');
    const logo = document.querySelector('.logo');
    const title = document.querySelector('h1');
    const serverStatus = document.querySelector('.server-status');
    const stopButton = document.getElementById('stop-all');
    
    // Function to request fullscreen
    function requestFullscreen() {
        if (!document.fullscreenElement) {
            console.log('Re-entering fullscreen mode');
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.mozRequestFullScreen) { // Firefox
                elem.mozRequestFullScreen();
            } else if (elem.webkitRequestFullscreen) { // Chrome, Safari and Opera
                elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) { // IE/Edge
                elem.msRequestFullscreen();
            }
        }
    }
    
    // Add click event listeners to all navbar elements
    const navbarElements = [header, logo, title, serverStatus, stopButton];
    
    navbarElements.forEach(element => {
        if (element) {
            element.addEventListener('click', (e) => {
                // Prevent click from propagating if it's just for fullscreen
                if (!document.fullscreenElement) {
                    e.stopPropagation();
                    requestFullscreen();
                    
                    // Also re-enable NoSleep if necessary
                    if (typeof noSleep !== 'undefined' && typeof noSleepEnabled !== 'undefined') {
                        if (!noSleepEnabled) {
                            enableNoSleep();
                        }
                    }
                }
            });
        }
    });
    
    // Also add listener to tabs container
    const tabsContainer = document.getElementById('tabs-container');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            // Only handle clicks directly on the container, not on tabs
            if (e.target === tabsContainer) {
                if (!document.fullscreenElement) {
                    requestFullscreen();
                }
            }
        });
    }
    
    // Add listener for app visibility changes to re-enter fullscreen when app regains focus
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // Short delay to let the UI stabilize
            setTimeout(() => {
                requestFullscreen();
            }, 300);
        }
    });
}

// Add these functions to app.js

// Function to check for favorited and custom volume sounds
function checkForSoundSettings() {
    // Check for sounds with existing settings when displayed
    fetch('/api/sounds/settings')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Store settings for immediate application when cards are added
                window.soundSettingsCache = window.soundSettingsCache || new Map();
                
                // Process favorites
                if (data.favorites && Array.isArray(data.favorites)) {
                    data.favorites.forEach(id => {
                        window.soundSettingsCache.set(id, {...(window.soundSettingsCache.get(id) || {}), favorite: true});
                    });
                }
                
                // Process custom volumes
                if (data.customVolumes && Array.isArray(data.customVolumes)) {
                    data.customVolumes.forEach(sound => {
                        window.soundSettingsCache.set(sound.id, {...(window.soundSettingsCache.get(sound.id) || {}), customVolume: true});
                    });
                }
                
                // Apply settings to existing sound cards
                document.querySelectorAll('.sound-card').forEach(card => {
                    const soundId = parseInt(card.dataset.soundId);
                    const settings = window.soundSettingsCache.get(soundId);
                    if (settings) {
                        updateSoundCardWithSettings(card, settings);
                    }
                });
            }
        })
        .catch(error => {
            console.error('Error fetching sound settings:', error);
        });
}

// Update a sound card with settings indicators
function updateSoundCardWithSettings(card, settings) {
    if (!card) return;
    
    // Get or create indicators container
    let indicators = card.querySelector('.sound-indicators');
    if (!indicators) {
        indicators = document.createElement('div');
        indicators.className = 'sound-indicators';
        card.appendChild(indicators);
    }
    
    // Add favorite indicator if needed
    if (settings.favorite) {
        card.dataset.favorite = 'true';
        
        // Add favorite indicator if not already there
        if (!indicators.querySelector('.favorite-indicator')) {
            const favoriteIcon = document.createElement('span');
            favoriteIcon.className = 'indicator-icon material-symbols-outlined favorite-indicator';
            favoriteIcon.textContent = 'favorite';
            favoriteIcon.style.fontVariationSettings = "'FILL' 1";
            favoriteIcon.style.color = '#ff4081';
            indicators.appendChild(favoriteIcon);
        }
    }
    
    // Add custom volume indicator if needed
    if (settings.customVolume) {
        card.dataset.customVolume = 'true';
        
        // Add volume indicator if not already there
        if (!indicators.querySelector('.volume-indicator')) {
            const volumeIcon = document.createElement('span');
            volumeIcon.className = 'indicator-icon material-symbols-outlined volume-indicator';
            volumeIcon.textContent = 'volume_up';
            indicators.appendChild(volumeIcon);
        }
    }
}

// Add event listener when sounds are loaded
document.addEventListener('DOMContentLoaded', () => {
    // Create a CSS style for sound indicators
    const style = document.createElement('style');
    style.textContent = `
        .sound-indicators {
            position: absolute;
            bottom: 3px;
            right: 3px;
            display: flex;
            gap: 3px;
            z-index: 5;
            pointer-events: none; /* Allow clicks to pass through */
        }
        
        .indicator-icon {
            font-size: 12px; /* Smaller size */
            color: rgba(255, 255, 255, 0.7);
        }
        
        .indicator-icon.favorite-indicator {
            color: #ff4081;
            font-variation-settings: 'FILL' 1;
        }
        
        /* Ensure sound-card has proper positioning for absolute children */
        .sound-card {
            position: relative !important; /* Ensure absolute positioning works inside */
        }
    `;
    document.head.appendChild(style);
    
    // Load sound settings initially
    window.soundSettingsCache = new Map();
    checkForSoundSettings();
    
    // Observe the sounds container for newly added sound cards
    const soundsContainer = document.getElementById('sounds-container');
    if (soundsContainer) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Process each new node
                    mutation.addedNodes.forEach(node => {
                        if (node.classList && node.classList.contains('sound-card')) {
                            const soundId = parseInt(node.dataset.soundId);
                            const settings = window.soundSettingsCache.get(soundId);
                            if (settings) {
                                // Apply settings immediately, don't wait
                                updateSoundCardWithSettings(node, settings);
                            }
                        }
                    });
                }
            });
        });
        
        // Start observing
        observer.observe(soundsContainer, { 
            childList: true, 
            subtree: false
        });
    }
    
    // Also observe tab switching
    const tabsContainer = document.getElementById('tabs-container');
    if (tabsContainer) {
        const tabObserver = new MutationObserver(() => {
            // Refresh settings when tabs change
            setTimeout(checkForSoundSettings, 50);
        });
        
        tabObserver.observe(tabsContainer, { 
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    init();
    checkForPlayingSounds();
    addFullscreenReentryFeature();
    initTabSwiping();
});