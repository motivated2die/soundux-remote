// --- ENTIRE FILE REPLACE ---
// State management
let currentSoundId = null;
let currentSoundData = null; // Stores details fetched for the current sound
let startY = 0;
let currentY = 0;
let isDragging = false;
let cardHeight = 0;
let currentPreviewId = null;
let emojiPicker = null; // Reference to the emoji picker instance

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
const colorSelector = document.getElementById('color-selector');
const emojiSelectorButton = document.getElementById('emoji-selector-button');
const currentEmojiDisplay = document.getElementById('current-emoji-display');
const clearEmojiButton = document.getElementById('clear-emoji-button');


// Initialize the settings menu
function initSoundSettings() {
    if (!settingsOverlay) return;

    // Set up event listeners
    setupDragBehavior();
    setupButtonActions();
    setupColorSelection();
    setupEmojiSelection();
    setupLongPressDetection(); // Keep long-press/right-click for non-edit mode
    setupRightClickBehavior();

    // Close when clicking backdrop
    settingsBackdrop.addEventListener('click', closeSettingsMenu);

    // Initialize emoji picker (using Picmo example)
    if (window.picmo && window.PicmoPopup) {
        const rootElement = document.querySelector('body'); // Picker needs a root element
        emojiPicker = window.PicmoPopup.createPopup({}, {
            rootElement: rootElement,
            referenceElement: emojiSelectorButton,
            triggerElement: emojiSelectorButton,
            position: 'bottom-start', // Adjust as needed
            showCloseButton: false,
            showPreview: false, // Optional: hide the preview
            theme: 'dark' // Match the app theme
        });

        emojiPicker.addEventListener('emoji:select', (event) => {
            console.log('Emoji selected:', event.emoji);
            if (currentSoundId && currentSoundData) {
                setEmoji(event.emoji); // Function to handle setting the emoji
            }
        });
    } else {
         console.error("Picmo or PicmoPopup library not loaded.");
    }

}

// Function to set the selected emoji
function setEmoji(emoji) {
    if (!currentSoundId || !currentSoundData) return;

    const soundPath = currentSoundData.path;
    persistence.setSoundEmoji(soundPath, emoji);

    // Update UI immediately
    currentEmojiDisplay.textContent = emoji;
    clearEmojiButton.classList.remove('hidden');
    app.updateSoundCardDisplay(currentSoundId); // Use app.js function to update the card
}

// Function to clear the emoji
function clearEmoji() {
    if (!currentSoundId || !currentSoundData) return;

    const soundPath = currentSoundData.path;
    persistence.clearSoundEmoji(soundPath);

    // Update UI immediately
    currentEmojiDisplay.textContent = '❓'; // Reset to placeholder
    clearEmojiButton.classList.add('hidden');
    app.updateSoundCardDisplay(currentSoundId); // Use app.js function to update the card
}

// Set up long press detection (only active when NOT in edit mode)
function setupLongPressDetection() {
    document.addEventListener('touchstart', (e) => {
        if (editMode.isActive()) return; // Only work when not in edit mode
        handleTouchStart(e);
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
         if (editMode.isActive()) return;
         handleTouchMove(e);
     }, { passive: false });
    document.addEventListener('touchend', (e) => {
         if (editMode.isActive()) return;
         handleTouchEnd(e);
     }, { passive: false });
}

// Setup right-click (only active when NOT in edit mode)
function setupRightClickBehavior() {
    document.addEventListener('contextmenu', (e) => {
        const soundCard = e.target.closest('.sound-card');
        if (soundCard) {
            e.preventDefault(); // Always prevent default context menu on sound cards

            // Only open settings if NOT in edit mode
            if (!editMode.isActive()) {
                 const soundId = parseInt(soundCard.dataset.soundId);
                 openSoundSettings(soundId);
            }
        }
        // Also prevent context menu on settings menu elements
        if (e.target.closest('#settings-card')) {
            e.preventDefault();
        }
    });
}

// Touch variables (same as before)
let longPressTimer;
const longPressDuration = 500;
let longPressSoundCard = null;
let longPressStartPosition = null;
let hasMoved = false;

// Handle touch start (same as before)
function handleTouchStart(e) {
    const soundCard = e.target.closest('.sound-card');
    if (!soundCard) return;
    longPressStartPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    hasMoved = false;
    longPressSoundCard = soundCard;
    longPressTimer = setTimeout(() => {
        if (!hasMoved && longPressSoundCard) {
            if (navigator.vibrate) navigator.vibrate(50);
            const soundId = parseInt(longPressSoundCard.dataset.soundId);
            openSoundSettings(soundId);
        }
    }, longPressDuration);
}

// Handle touch move (same as before)
function handleTouchMove(e) {
    if (!longPressSoundCard || !longPressStartPosition) return;
    const xDiff = Math.abs(e.touches[0].clientX - longPressStartPosition.x);
    const yDiff = Math.abs(e.touches[0].clientY - longPressStartPosition.y);
    if (xDiff > 10 || yDiff > 10) {
        hasMoved = true;
        clearTimeout(longPressTimer);
    }
}

// Handle touch end (same as before)
function handleTouchEnd() {
    clearTimeout(longPressTimer);
    longPressSoundCard = null;
    longPressStartPosition = null;
}

// Setup drag behavior for the settings card (same as before)
function setupDragBehavior() {
    settingsCard.addEventListener('touchstart', onCardTouchStart, { passive: true });
    settingsCard.addEventListener('touchmove', onCardTouchMove, { passive: false });
    settingsCard.addEventListener('touchend', onCardTouchEnd, { passive: true });
}

// Handle card touch start (same as before)
function onCardTouchStart(e) {
    if (e.target === volumeSlider || e.target.closest('.color-selector') || e.target.closest('.emoji-selector-container')) return; // Ignore drag on controls
    startY = e.touches[0].clientY;
    cardHeight = settingsCard.offsetHeight;
    isDragging = true;
    settingsCard.style.transition = 'none';
}

// Handle card touch move (same as before)
function onCardTouchMove(e) {
    if (!isDragging) return;
    currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;
    if (deltaY > 0) {
        e.preventDefault();
        const translateY = Math.min(deltaY, cardHeight);
        settingsCard.style.transform = `translateY(${translateY}px)`;
        const opacity = 1 - (translateY / cardHeight) * 0.5;
        settingsBackdrop.style.opacity = opacity;
    }
}

// Handle card touch end (same as before)
function onCardTouchEnd() {
    if (!isDragging) return;
    isDragging = false;
    settingsCard.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    settingsBackdrop.style.transition = 'opacity 0.3s ease';
    const deltaY = currentY - startY;
    if (deltaY > cardHeight * 0.4) {
        closeSettingsMenu();
    } else {
        settingsCard.style.transform = 'translateY(0)';
        settingsBackdrop.style.opacity = '1';
    }
}

// Setup button actions (including volume, favorite, preview)
function setupButtonActions() {
    // Favorite button
    favoriteButton.addEventListener('click', () => {
        if (!currentSoundId || !currentSoundData) return;
        const soundPath = currentSoundData.path;
        const isCurrentlyFavorite = favoriteButton.classList.contains('active');
        const newFavoriteState = !isCurrentlyFavorite;

        // Update server/persistence (using sound.path)
        fetch(`/api/sounds/${currentSoundId}/favorite`, { method: 'POST' }) // Assume API works with ID for toggle
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                 favoriteButton.classList.toggle('active', newFavoriteState);
                 app.updateSoundCardDisplay(currentSoundId); // Update main grid card
            } else { console.error("Failed to toggle favorite on server."); }
        }).catch(err => console.error("Error toggling favorite:", err));
    });

    // Preview button
    previewButton.addEventListener('click', () => {
        if (!currentSoundId) return;
        const currentState = previewButton.getAttribute('data-state');
        if (currentState === 'preview') {
             // Stop any previous preview first
             if (currentPreviewId) stopPreviewSound(currentPreviewId);

            fetch(`/api/sounds/${currentSoundId}/preview`, { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.success && data.playingId) {
                    currentPreviewId = data.playingId;
                    previewButton.setAttribute('data-state', 'stop');
                    previewButton.querySelector('.material-symbols-outlined').textContent = 'stop_circle';
                    previewButton.querySelector('.button-text').textContent = 'Stop';
                } else { console.error("Failed to start preview"); }
            }).catch(err => console.error("Error starting preview:", err));
        } else {
            stopPreviewSound(currentPreviewId); // Function defined below
            currentPreviewId = null;
            previewButton.setAttribute('data-state', 'preview');
            previewButton.querySelector('.material-symbols-outlined').textContent = 'volume_up';
            previewButton.querySelector('.button-text').textContent = 'Preview';
        }
    });

    // Volume slider (debounced update)
    let sliderDebounceTimer = null;
    volumeSlider.addEventListener('input', () => {
        const sliderPos = parseInt(volumeSlider.value);
        resetVolumeButton.classList.toggle('hidden', sliderPos === 0);
        // Clear existing timer
        clearTimeout(sliderDebounceTimer);
        // Set a new timer
        sliderDebounceTimer = setTimeout(() => {
             if (currentSoundId) updateVolumeWithSlider(sliderPos);
        }, 250); // 250ms debounce
    });
    // Also update on final change event
    volumeSlider.addEventListener('change', () => {
        clearTimeout(sliderDebounceTimer); // Clear debounce timer if exists
        if (currentSoundId) updateVolumeWithSlider(parseInt(volumeSlider.value));
    });

    // Reset volume button
    resetVolumeButton.addEventListener('click', resetVolume);

     // Clear emoji button
     clearEmojiButton.addEventListener('click', clearEmoji);
}

// Setup color selection
function setupColorSelection() {
    colorSelector.addEventListener('click', (e) => {
        const swatch = e.target.closest('.color-swatch');
        if (swatch && currentSoundId && currentSoundData) {
            const color = swatch.dataset.color;
            const soundPath = currentSoundData.path;

            // Update persistence
            persistence.setSoundColor(soundPath, color);

            // Update swatch UI
            document.querySelectorAll('#color-selector .color-swatch').forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');

            // Update sound card in grid
            app.updateSoundCardDisplay(currentSoundId);
        }
    });
}

// Setup emoji selection
function setupEmojiSelection() {
    if (emojiSelectorButton) {
        emojiSelectorButton.addEventListener('click', () => {
             if(emojiPicker && !emojiPicker.isOpen) {
                 emojiPicker.toggle();
             } else {
                 console.log("Emoji picker not ready or already open");
             }
        });
    }
}


// Function to update volume via API (using slider position)
function updateVolumeWithSlider(sliderPos) {
    if (!currentSoundId || !currentSoundData) return;
    const soundPath = currentSoundData.path;

    fetch(`/api/sounds/${currentSoundId}/volume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sliderPosition: sliderPos })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update sound card indicator
            app.updateSoundCardDisplay(currentSoundId); // Let app.js handle the card update
            // Update local data if needed (though fetching again on open is safer)
            currentSoundData.hasCustomVolume = (sliderPos !== 0);
            currentSoundData.sliderPosition = sliderPos;
            // Ensure reset button visibility is correct
             resetVolumeButton.classList.toggle('hidden', sliderPos === 0);
        } else { console.error("Server failed to update volume."); }
    })
    .catch(error => console.error('Error updating volume:', error));
}

// Reset volume via API
function resetVolume() {
    if (!currentSoundId || !currentSoundData) return;
    const soundPath = currentSoundData.path;

    fetch(`/api/sounds/${currentSoundId}/volume/reset`, { method: 'POST' })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update UI
            volumeSlider.value = 0;
            resetVolumeButton.classList.add('hidden');
            // Update sound card indicator
             app.updateSoundCardDisplay(currentSoundId); // Let app.js handle the card update
            // Update local data
            currentSoundData.hasCustomVolume = false;
            currentSoundData.sliderPosition = 0;
        } else { console.error("Server failed to reset volume."); }
    })
    .catch(error => console.error('Error resetting volume:', error));
}

// Open settings menu and load data
function openSoundSettings(soundId) {
    if (!settingsOverlay) return;
    currentSoundId = soundId;

    // Reset menu state before fetching
    resetMenuState();

    fetch(`/api/sounds/${soundId}`)
    .then(response => response.json())
    .then(sound => {
        if (!sound || !sound.id) throw new Error("Sound data not found or invalid.");

        currentSoundData = sound; // Store fetched data

        // Update UI elements
        soundNameElement.textContent = sound.name || 'Unknown Sound';
        tabNameElement.textContent = sound.tabName || 'Unknown Tab';

        // Set favorite state
        favoriteButton.classList.toggle('active', sound.isFavorite);

        // Set color state
        const savedSoundSettings = persistence.getSoundSettings(sound.path);
        document.querySelectorAll('#color-selector .color-swatch').forEach(s => s.classList.remove('selected'));
        const color = savedSoundSettings.color || 'default';
        const activeSwatch = document.querySelector(`#color-selector .color-swatch[data-color="${color}"]`);
        if (activeSwatch) activeSwatch.classList.add('selected');

        // Set emoji state
        const emoji = savedSoundSettings.emoji;
        if (emoji) {
            currentEmojiDisplay.textContent = emoji;
            clearEmojiButton.classList.remove('hidden');
        } else {
            currentEmojiDisplay.textContent = '❓'; // Placeholder
            clearEmojiButton.classList.add('hidden');
        }


        // Set volume slider state
        if (sound.hasCustomVolume && typeof sound.sliderPosition === 'number') {
            volumeSlider.value = sound.sliderPosition;
            resetVolumeButton.classList.remove('hidden');
        } else {
            volumeSlider.value = 0;
            resetVolumeButton.classList.add('hidden');
        }

        // Animate in
        settingsOverlay.classList.remove('hidden');
        requestAnimationFrame(() => { // Ensure display is set before animating
            settingsBackdrop.style.opacity = '1';
            settingsCard.style.transform = 'translateY(0)';
        });

    })
    .catch(error => {
        console.error('Failed to fetch sound details:', error);
        currentSoundId = null; // Reset ID on error
        currentSoundData = null;
        // Optionally show an error message to the user
    });
}

// Reset the menu state to default
function resetMenuState() {
    if (!settingsOverlay) return;
    // Reset preview button
    previewButton.setAttribute('data-state', 'preview');
    previewButton.querySelector('.material-symbols-outlined').textContent = 'volume_up';
    previewButton.querySelector('.button-text').textContent = 'Preview';
    stopPreviewSound(currentPreviewId); // Stop any active preview
    currentPreviewId = null;

    // Reset volume slider and button
    volumeSlider.value = 0;
    resetVolumeButton.classList.add('hidden');

    // Reset favorite button state (will be set when data loads)
    favoriteButton.classList.remove('active');

     // Reset color swatches
     document.querySelectorAll('#color-selector .color-swatch').forEach(s => s.classList.remove('selected'));
     const defaultSwatch = document.querySelector('#color-selector .color-swatch[data-color="default"]');
     if (defaultSwatch) defaultSwatch.classList.add('selected');

     // Reset emoji display
     currentEmojiDisplay.textContent = '❓';
     clearEmojiButton.classList.add('hidden');

    // Clear displayed names
    soundNameElement.textContent = 'Loading...';
    tabNameElement.textContent = '';
}

// Close settings menu (same as before, ensures preview stops)
function closeSettingsMenu() {
    if (!settingsOverlay) return;
    settingsCard.style.transform = 'translateY(100%)';
    settingsBackdrop.style.opacity = '0';

    stopPreviewSound(currentPreviewId); // Stop preview on close
    currentPreviewId = null;

    setTimeout(() => {
        settingsOverlay.classList.add('hidden');
        resetMenuState(); // Reset state after hiding
        currentSoundId = null;
        currentSoundData = null;
        // Ensure styles are reset for next open
        settingsCard.style.transform = '';
        settingsBackdrop.style.opacity = '';
    }, 300);
}

// Helper function to stop preview sound (uses main stop endpoint)
function stopPreviewSound(playingId) {
    // No specific API to stop just one sound *instance*, use general stop
     if (playingId) { // Only stop if we have an ID
         console.log("Stopping preview sound (via general stop)...");
         fetch('/api/sounds/stop', { method: 'POST' })
             .catch(error => console.error('Error stopping preview sound:', error));
     }
}

// Initialize when DOM content is loaded
document.addEventListener('DOMContentLoaded', initSoundSettings);

// Expose openSoundSettings globally if needed by app.js (or use custom events)
window.soundSettings = { open: openSoundSettings };