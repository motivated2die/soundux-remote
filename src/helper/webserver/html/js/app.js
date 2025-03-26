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
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // Mark sound as playing
            state.currentlyPlaying.add(soundId);
            updatePlayingState();
            console.log('Sound played:', data);
        })
        .catch(error => {
            console.error('Error playing sound:', error);
            alert(`Failed to play sound: ${error.message}`);
        });
}

// Stop all sounds
function stopAllSounds() {
    stopAllButton.disabled = true;
    
    fetch('/api/sounds/stop', { method: 'POST' })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // Clear playing state
            state.currentlyPlaying.clear();
            updatePlayingState();
            
            stopAllButton.disabled = false;
            console.log('All sounds stopped:', data);
        })
        .catch(error => {
            console.error('Error stopping sounds:', error);
            alert(`Failed to stop sounds: ${error.message}`);
            
            stopAllButton.disabled = false;
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);