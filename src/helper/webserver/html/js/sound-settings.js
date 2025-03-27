// Update the app.js file to show favorite indicators properly
function initFavoriteIndicators() {
    // First, make sure all hearts in favorites tab use FILL style
    document.addEventListener('DOMContentLoaded', () => {
        // When tabs are loaded
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length) {
                    // Check for the favorites tab
                    const favTab = Array.from(document.querySelectorAll('.tab')).find(tab => 
                        tab.dataset.tabId === 'favorites' || 
                        tab.querySelector('.material-symbols-outlined')?.textContent === 'favorite');
                    
                    if (favTab) {
                        const favIcon = favTab.querySelector('.material-symbols-outlined');
                        if (favIcon) {
                            favIcon.style.fontVariationSettings = "'FILL' 1";
                            favIcon.style.color = '#555';
                        }
                    }
                }
            });
        });
        
        observer.observe(document.getElementById('tabs-container'), { childList: true, subtree: true });
    });
}

// Update favorites styling when they are loaded
function initFavoritesStyling() {
    // Add a mutation observer to watch for when sound cards are added
    const soundsObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        // Find all sound cards that might already have the favorite attribute
                        const favoriteSounds = node.querySelectorAll?.('.sound-card[data-favorite="true"]') || [];
                        
                        favoriteSounds.forEach(card => {
                            updateSoundCardIndicator(card.dataset.soundId, 'favorite', true);
                        });
                        
                        // Also check for existing volume customizations
                        const volumeSounds = node.querySelectorAll?.('.sound-card[data-custom-volume="true"]') || [];
                        
                        volumeSounds.forEach(card => {
                            updateSoundCardIndicator(card.dataset.soundId, 'volume', true);
                        });
                    }
                });
            }
        });
    });
    
    // Start observing the sounds container
    const soundsContainer = document.getElementById('sounds-container');
    if (soundsContainer) {
        soundsObserver.observe(soundsContainer, { childList: true, subtree: true });
    }
}

// Initialize favorite styling
document.addEventListener('DOMContentLoaded', () => {
    initFavoriteIndicators();
    initFavoritesStyling();
});

// Setup sound card right-click behavior
function setupRightClickBehavior() {
    // Prevent default context menu on all sound cards
    document.addEventListener('contextmenu', (e) => {
        const soundCard = e.target.closest('.sound-card');
        if (soundCard) {
            e.preventDefault();
            
            const soundId = parseInt(soundCard.dataset.soundId);
            openSoundSettings(soundId);
        }
        
        // Also prevent context menu on settings menu elements
        if (e.target.closest('#settings-card')) {
            e.preventDefault();
        }
    });
}


// Visualize volume level change based on slider position
function visualizeVolumeChange(sliderPos) {
    if (!currentSoundId) return;
    
    // Get a sound card element if it exists in the current view
    const soundCard = document.querySelector(`.sound-card[data-sound-id="${currentSoundId}"]`);
    if (!soundCard) return;
    
    const defaultLocalVolume = currentSoundData?.defaultLocalVolume || 100;
    let volumePercent = 100; // Default is 100%
    
    // Right side: 100% to 200%
    if (sliderPos > 0) {
        volumePercent = 100 + (sliderPos * 3); // 0-50 → 100-200%
    } 
    // Left side: 0% to 100%
    else if (sliderPos < 0) {
        volumePercent = 100 + (sliderPos * 2); // -50-0 → 0-100%
    }
    
    // Show a subtle visual indicator on the sound card
    // This gives immediate visual feedback when adjusting volume
    soundCard.setAttribute('data-volume-level', volumePercent + '%');
    
    // Optional: add a temporary pulse animation to show volume change
    soundCard.classList.add('volume-adjusting');
    setTimeout(() => {
        soundCard.classList.remove('volume-adjusting');
    }, 300);
}

// Keep track of volume settings across application sessions
function setupVolumeStateTracking() {
    // Add a periodic check for volume settings to stay in sync with core application
    // This helps ensure the web UI reflects any changes made in the desktop app
    setInterval(() => {
        if (window.soundSettingsCache) {
            fetch('/api/sounds/settings')
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.customVolumes) {
                        // Update our local cache
                        data.customVolumes.forEach(sound => {
                            window.soundSettingsCache.set(sound.id, 
                                {...(window.soundSettingsCache.get(sound.id) || {}), 
                                    customVolume: true, 
                                    localVolume: sound.localVolume,
                                    remoteVolume: sound.remoteVolume
                                });
                            
                            // Update any visible sound cards
                            const soundCard = document.querySelector(`.sound-card[data-sound-id="${sound.id}"]`);
                            if (soundCard) {
                                updateSoundCardWithSettings(soundCard, {customVolume: true});
                            }
                        });
                    }
                })
                .catch(error => {
                    console.error('Error refreshing volume settings:', error);
                });
        }
    }, 30000); // Check every 30 seconds
}

// Define CSS for volume visualization
function addVolumeStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Volume adjustment visualization */
        .sound-card.volume-adjusting {
            transition: all 0.3s ease-out;
            box-shadow: 0 0 15px rgba(82, 177, 140, 0.5);
        }
        
        /* Add a subtle volume level indicator */
        .sound-card[data-volume-level]::after {
            content: attr(data-volume-level);
            position: absolute;
            bottom: 3px;
            left: 3px;
            font-size: 9px;
            opacity: 0.7;
            color: var(--text-secondary);
            pointer-events: none;
        }
        
        /* Style for volume indicator icon */
        .indicator-icon.volume-indicator {
            color: #555;
        }
    `;
    document.head.appendChild(style);
}


// Sound Settings Menu - Create as js/sound-settings.js

// State management
let currentSoundId = null;
let currentSoundData = null;
let startY = 0;
let currentY = 0;
let isDragging = false;
let cardHeight = 0;
let currentPreviewId = null;

// Elements
const settingsOverlay = document.getElementById('sound-settings-overlay');
const settingsCard = document.getElementById('settings-card');
const settingsBackdrop = document.getElementById('settings-backdrop');
const soundNameElement = document.getElementById('settings-sound-name');
const tabNameElement = document.getElementById('settings-tab-name');
const favoriteButton = document.getElementById('favorite-button');
const previewButton = document.getElementById('preview-button');
const volumeSlider = document.getElementById('volume-slider');
const resetVolumeButton = document.getElementById('reset-volume');

// Initialize the settings menu
function initSoundSettings() {
    if (!settingsOverlay) return;

    // Set up event listeners
    setupDragBehavior();
    setupButtonActions();
    setupLongPressDetection();
    setupRightClickBehavior();

    // Close when clicking backdrop
    settingsBackdrop.addEventListener('click', closeSettingsMenu);
}

// Set up long press detection for sound cards
function setupLongPressDetection() {
    // Use event delegation for dynamically added sound cards
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });
}

// Touch variables
let longPressTimer;
const longPressDuration = 500; // ms
let longPressSoundCard = null;
let longPressStartPosition = null;
let hasMoved = false;

// Handle touch start
function handleTouchStart(e) {
    const soundCard = e.target.closest('.sound-card');
    if (!soundCard) return;

    // Store the initial position
    longPressStartPosition = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
    };
    
    hasMoved = false;
    longPressSoundCard = soundCard;
    
    // Start the long press timer
    longPressTimer = setTimeout(() => {
        if (!hasMoved && longPressSoundCard) {
            // Provide haptic feedback if available
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
            
            const soundId = parseInt(longPressSoundCard.dataset.soundId);
            openSoundSettings(soundId);
        }
    }, longPressDuration);
}

// Handle touch move
function handleTouchMove(e) {
    if (!longPressSoundCard || !longPressStartPosition) return;
    
    const xDiff = Math.abs(e.touches[0].clientX - longPressStartPosition.x);
    const yDiff = Math.abs(e.touches[0].clientY - longPressStartPosition.y);
    
    // If moved more than 10px, cancel long press
    if (xDiff > 10 || yDiff > 10) {
        hasMoved = true;
        clearTimeout(longPressTimer);
    }
}

// Handle touch end
function handleTouchEnd() {
    clearTimeout(longPressTimer);
    longPressSoundCard = null;
    longPressStartPosition = null;
}

// Setup drag behavior for the settings card
function setupDragBehavior() {
    settingsCard.addEventListener('touchstart', onCardTouchStart, { passive: true });
    settingsCard.addEventListener('touchmove', onCardTouchMove, { passive: false });
    settingsCard.addEventListener('touchend', onCardTouchEnd, { passive: true });
}

// Handle card touch start
function onCardTouchStart(e) {
    if (e.target === volumeSlider) return;
    
    startY = e.touches[0].clientY;
    cardHeight = settingsCard.offsetHeight;
    isDragging = true;
    settingsCard.style.transition = 'none';
}

// Handle card touch move
function onCardTouchMove(e) {
    if (!isDragging) return;
    
    currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;
    
    // Only allow dragging down
    if (deltaY > 0) {
        e.preventDefault();
        const translateY = Math.min(deltaY, cardHeight);
        settingsCard.style.transform = `translateY(${translateY}px)`;
        
        // Adjust backdrop opacity based on drag distance
        const opacity = 1 - (translateY / cardHeight) * 0.5;
        settingsBackdrop.style.opacity = opacity;
    }
}

// Handle card touch end
function onCardTouchEnd() {
    if (!isDragging) return;
    
    isDragging = false;
    settingsCard.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    settingsBackdrop.style.transition = 'opacity 0.3s ease';
    
    const deltaY = currentY - startY;
    
    if (deltaY > cardHeight * 0.4) {
        // If dragged more than 40% of card height, close it
        closeSettingsMenu();
    } else {
        // Otherwise snap back
        settingsCard.style.transform = 'translateY(0)';
        settingsBackdrop.style.opacity = '1';
    }
}

// Updated setup button actions for better volume handling
function setupButtonActions() {
    // Favorite button code remains the same
    favoriteButton.addEventListener('click', () => {
        if (!currentSoundId) return;
        
        const isCurrentlyFavorite = favoriteButton.classList.contains('active');
        const newFavoriteState = !isCurrentlyFavorite;
        
        // Optimistic UI update
        favoriteButton.classList.toggle('active', newFavoriteState);
        
        // Update the server
        fetch(`/api/sounds/${currentSoundId}/favorite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ favorite: newFavoriteState })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Update the sound card in the grid
                updateSoundCardIndicator(currentSoundId, 'favorite', newFavoriteState);
            } else {
                // Revert UI if failed
                favoriteButton.classList.toggle('active', isCurrentlyFavorite);
            }
        })
        .catch(() => {
            // Revert UI on error
            favoriteButton.classList.toggle('active', isCurrentlyFavorite);
        });
    });
    
    // Preview button code remains the same
    previewButton.addEventListener('click', () => {
        if (!currentSoundId) return;
        
        const currentState = previewButton.getAttribute('data-state');
        
        if (currentState === 'preview') {
            // Preview implementation...
            previewButton.setAttribute('data-state', 'stop');
            previewButton.querySelector('.material-symbols-outlined').textContent = 'stop_circle';
            previewButton.querySelector('.button-text').textContent = 'Stop';
            
            fetch(`/api/sounds/${currentSoundId}/preview`, {
                method: 'POST'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success && data.playingId) {
                    currentPreviewId = data.playingId;
                }
            });
        } else {
            // Stop implementation...
            previewButton.setAttribute('data-state', 'preview');
            previewButton.querySelector('.material-symbols-outlined').textContent = 'volume_up';
            previewButton.querySelector('.button-text').textContent = 'Preview';
            
            // Stop the preview - use the main stop endpoint which is more reliable
            stopPreviewSound(currentPreviewId);
            currentPreviewId = null;
        }
    });
    
    // Volume slider with improved implementation
    let sliderDebounceTimer = null;
    
    // Update volume indicator while sliding without sending API requests
    volumeSlider.addEventListener('input', () => {
        const sliderPos = parseInt(volumeSlider.value);
        
        // Toggle reset button visibility
        resetVolumeButton.classList.toggle('hidden', sliderPos === 0);
        
        // Clear any pending requests
        if (sliderDebounceTimer) {
            clearTimeout(sliderDebounceTimer);
        }
    });
    
    // Send volume update when slider is released or clicked
    volumeSlider.addEventListener('change', () => {
        const sliderPos = parseInt(volumeSlider.value);
        
        // If there's a pending timer, clear it
        if (sliderDebounceTimer) {
            clearTimeout(sliderDebounceTimer);
        }
        
        // Send the new slider position to the server
        updateVolumeWithSlider(sliderPos);
    });
    
    // Reset volume button
    resetVolumeButton.addEventListener('click', resetVolume);

}

// Function to update volume with slider position
function updateVolumeWithSlider(sliderPos) {
    if (!currentSoundId) return;
    
    // Send the slider position to the server
    fetch(`/api/sounds/${currentSoundId}/volume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sliderPosition: sliderPos })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update the sound card indicator
            updateSoundCardIndicator(currentSoundId, 'volume', sliderPos !== 0);
            
            // Update current sound data with the returned values
            if (currentSoundData) {
                currentSoundData.localVolume = data.localVolume;
                currentSoundData.remoteVolume = data.remoteVolume;
                currentSoundData.hasCustomVolume = (sliderPos !== 0);
                currentSoundData.sliderPosition = sliderPos;
            }
            
            // Show/hide reset button based on whether we have custom volume
            resetVolumeButton.classList.toggle('hidden', sliderPos === 0);
        }
    })
    .catch(error => {
        console.error('Error updating volume:', error);
    });
}

// Reset volume with improved implementation
function resetVolume() {
    if (!currentSoundId) return;
    
    // First update UI immediately for responsiveness
    volumeSlider.value = 0;
    resetVolumeButton.classList.add('hidden');
    
    // Send reset request to server
    fetch(`/api/sounds/${currentSoundId}/volume/reset`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update sound card indicator
            updateSoundCardIndicator(currentSoundId, 'volume', false);
            
            // Update current sound data
            if (currentSoundData) {
                // Remove custom volumes
                delete currentSoundData.localVolume;
                delete currentSoundData.remoteVolume;
                currentSoundData.hasCustomVolume = false;
                currentSoundData.sliderPosition = 0;
            }
        }
    })
    .catch(error => {
        console.error('Error resetting volume:', error);
    });
}

// Improved open settings menu function that properly loads volume state
function openSoundSettings(soundId) {
    currentSoundId = soundId;
    
    // Fetch sound details with volume info
    fetch(`/api/sounds/${soundId}`)
    .then(response => response.json())
    .then(sound => {
        currentSoundData = sound;
        
        // Reset menu state
        resetMenuState();
        
        // Update UI
        soundNameElement.textContent = sound.name;
        tabNameElement.textContent = sound.tabName || '';
        
        // Update favorite state
        favoriteButton.classList.toggle('active', sound.isFavorite);
        
        // Update volume slider with correct position
        if (sound.hasCustomVolume && sound.sliderPosition !== undefined) {
            volumeSlider.value = sound.sliderPosition;
            resetVolumeButton.classList.remove('hidden');
        } else {
            volumeSlider.value = 0; // Default to center
            resetVolumeButton.classList.add('hidden');
        }
        
        // Reset backdrop and card styles before showing
        settingsBackdrop.style.opacity = '0';
        settingsBackdrop.style.transition = 'opacity 0.3s ease';
        settingsCard.style.transform = 'translateY(100%)';
        settingsCard.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        
        // Show the settings overlay first
        settingsOverlay.classList.remove('hidden');
        
        // Force a reflow to ensure styles are applied
        void settingsOverlay.offsetWidth;
        
        // Then animate in the backdrop and card
        requestAnimationFrame(() => {
            settingsBackdrop.style.opacity = '1';
            settingsCard.style.transform = 'translateY(0)';
        });
    })
    .catch(error => {
        console.error('Failed to fetch sound details:', error);
    });
}



// Reset the menu state to default
function resetMenuState() {
    // Reset preview button
    previewButton.setAttribute('data-state', 'preview');
    previewButton.querySelector('.material-symbols-outlined').textContent = 'volume_up';
    previewButton.querySelector('.button-text').textContent = 'Preview';
    
    // Stop any playing preview
    if (currentPreviewId) {
        stopPreviewSound(currentPreviewId);
        currentPreviewId = null;
    }
    
    // Reset volume slider
    volumeSlider.value = 0;
    resetVolumeButton.classList.add('hidden');
}

// Close settings menu
function closeSettingsMenu() {
    settingsCard.style.transform = 'translateY(100%)';
    settingsBackdrop.style.opacity = '0';
    
    // Stop any playing preview
    if (previewButton.getAttribute('data-state') === 'stop' && currentPreviewId) {
        stopPreviewSound(currentPreviewId);
        currentPreviewId = null;
    }
    
    // Hide the overlay after animation completes
    setTimeout(() => {
        settingsOverlay.classList.add('hidden');
        
        // Reset styles completely
        settingsCard.style.transform = '';
        settingsCard.style.transition = '';
        settingsBackdrop.style.opacity = '';
        settingsBackdrop.style.transition = '';
        
        // Reset UI elements
        previewButton.setAttribute('data-state', 'preview');
        previewButton.querySelector('.material-symbols-outlined').textContent = 'volume_up';
        previewButton.querySelector('.button-text').textContent = 'Preview';
        
        // Reset state
        currentSoundId = null;
        currentSoundData = null;
    }, 300);
}

// Helper function to stop preview sound
function stopPreviewSound(soundId) {
    // Use the main stop endpoint which is more reliable
    fetch('/api/sounds/stop', {
        method: 'POST'
    })
    .catch(error => {
        console.error('Error stopping preview sound:', error);
    });
}

// Update sound card indicator
function updateSoundCardIndicator(soundId, type, state) {
    const soundCard = document.querySelector(`.sound-card[data-sound-id="${soundId}"]`);
    if (!soundCard) return;
    
    // Get or create indicators container
    let indicators = soundCard.querySelector('.sound-indicators');
    if (!indicators) {
        indicators = document.createElement('div');
        indicators.className = 'sound-indicators';
        soundCard.appendChild(indicators);
    }
    
    // Handle favorite indicator
    if (type === 'favorite') {
        // Update data attribute
        soundCard.dataset.favorite = state ? 'true' : 'false';
        
        // Remove existing favorite indicator if exists
        const existingFavorite = indicators.querySelector('.favorite-indicator');
        if (existingFavorite) {
            indicators.removeChild(existingFavorite);
        }
        
        // Add new indicator if favorited
        if (state) {
            const favoriteIcon = document.createElement('span');
            favoriteIcon.className = 'indicator-icon material-symbols-outlined favorite-indicator';
            favoriteIcon.textContent = 'favorite';
            // Add filled style
            favoriteIcon.style.color = '#555';
            favoriteIcon.style.fontVariationSettings = "'FILL' 1";
            indicators.appendChild(favoriteIcon);
        }
    }
    
    // Handle volume indicator
    if (type === 'volume') {
        // Update data attribute
        soundCard.dataset.customVolume = state ? 'true' : 'false';
        
        // Remove existing volume indicator if exists
        const existingVolume = indicators.querySelector('.volume-indicator');
        if (existingVolume) {
            indicators.removeChild(existingVolume);
        }
        
        // Add new indicator if has custom volume
        if (state) {
            const volumeIcon = document.createElement('span');
            volumeIcon.className = 'indicator-icon material-symbols-outlined volume-indicator';
            volumeIcon.textContent = 'volume_up';
            indicators.appendChild(volumeIcon);
        }
    }
    
    // Remove the indicators container if empty
    if (indicators.children.length === 0) {
        soundCard.removeChild(indicators);
    }
}


// Call this during initialization
document.addEventListener('DOMContentLoaded', () => {
    addVolumeStyles();
    setupVolumeStateTracking();
});


// Initialize when DOM content is loaded
document.addEventListener('DOMContentLoaded', initSoundSettings);

