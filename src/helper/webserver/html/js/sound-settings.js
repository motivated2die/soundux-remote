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
                            favIcon.style.color = '#ff4081';
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
});// Setup sound card right-click behavior
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
}// Sound Settings Menu - Create as js/sound-settings.js

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

// Setup button actions
function setupButtonActions() {
    // Favorite button
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
    
    // Preview button
    previewButton.addEventListener('click', () => {
        if (!currentSoundId) return;
        
        const currentState = previewButton.getAttribute('data-state');
        
        if (currentState === 'preview') {
            // Switch to stop state first (for better UI feedback)
            previewButton.setAttribute('data-state', 'stop');
            previewButton.querySelector('.material-symbols-outlined').textContent = 'stop_circle';
            previewButton.querySelector('.button-text').textContent = 'Stop';
            
            // Play the preview
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
            // Switch back to preview state
            previewButton.setAttribute('data-state', 'preview');
            previewButton.querySelector('.material-symbols-outlined').textContent = 'volume_up';
            previewButton.querySelector('.button-text').textContent = 'Preview';
            
            // Stop the preview - use the main stop endpoint which is more reliable
            stopPreviewSound(currentPreviewId);
            currentPreviewId = null;
        }
    });
    
    // Volume slider
    let volumeChangeTimer = null;
    
    // Handle continuous sliding updates
    volumeSlider.addEventListener('input', () => {
        const value = parseInt(volumeSlider.value);
        
        // Show reset button when volume is adjusted from center
        resetVolumeButton.classList.toggle('hidden', value === 0);
        
        // Clear any pending updates
        if (volumeChangeTimer) {
            clearTimeout(volumeChangeTimer);
        }
        
        // Set a short delay to minimize excessive API calls while sliding
        volumeChangeTimer = setTimeout(() => {
            updateVolume(value);
        }, 50);
    });
    
    // Handle final value when releasing slider or clicking directly
    volumeSlider.addEventListener('change', () => {
        const value = parseInt(volumeSlider.value);
        
        // If value is 0 (center), treat as reset
        if (value === 0) {
            resetVolume();
            return;
        }
        
        // Clear any pending updates
        if (volumeChangeTimer) {
            clearTimeout(volumeChangeTimer);
            volumeChangeTimer = null;
        }
        
        // Update volume with final value
        updateVolume(value);
    });
    
    // Function to update volume
    function updateVolume(adjustment) {
        if (!currentSoundId) return;
        
        // Send volume adjustment to server
        fetch(`/api/sounds/${currentSoundId}/volume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adjustment: adjustment })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Update the sound card indicator
                updateSoundCardIndicator(currentSoundId, 'volume', true);
            }
        })
        .catch(error => {
            console.error('Error updating volume:', error);
        });
    }
    
    // Reset volume button
    resetVolumeButton.addEventListener('click', resetVolume);
}

// Reset volume function
function resetVolume() {
    if (!currentSoundId) return;
    
    fetch(`/api/sounds/${currentSoundId}/volume/reset`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Reset UI
            volumeSlider.value = 0;
            resetVolumeButton.classList.add('hidden');
            
            // Update indicator
            updateSoundCardIndicator(currentSoundId, 'volume', false);
        }
    });
}

// Open settings menu for a sound
function openSoundSettings(soundId) {
    currentSoundId = soundId;
    
    // Fetch sound details
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
        
        // Update volume slider - reset to center initially
        volumeSlider.value = 0;
        resetVolumeButton.classList.toggle('hidden', !sound.hasCustomVolume);
        
        // Show the settings overlay
        settingsOverlay.classList.remove('hidden');
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
        settingsCard.style.transform = '';
        settingsCard.style.transition = '';
        
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
            favoriteIcon.style.color = '#ff4081';
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

// Initialize when DOM content is loaded
document.addEventListener('DOMContentLoaded', initSoundSettings);