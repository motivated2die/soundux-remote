// --- ENTIRE FILE REPLACE ---
// State management
let currentSoundId = null;
let currentSoundData = null; // Stores details fetched for the current sound
let startY = 0;
let currentY = 0;
let isDragging = false;
let cardHeight = 0;
let currentPreviewId = null;
let emojiPickerInstance = null; // Reference to the emoji picker element
let isEmojiPickerOpen = false;

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
// Emoji Elements
const emojiDisplayArea = document.getElementById('emoji-display-area'); // Area showing selected emoji + clear button
const selectedEmojiButton = document.getElementById('selected-emoji-button'); // Button showing the selected emoji
const currentEmojiDisplay = document.getElementById('current-emoji-display'); // Span inside the selected-emoji-button
const emojiPickerContainer = document.getElementById('emoji-picker-container'); // Container for <emoji-picker>
const clearEmojiButtonSettings = document.getElementById('clear-emoji-button-settings'); // The clear button itself

// --- NEW CODE START ---
let emojiPickerInputElement = null; // To store the reference to the search input inside the shadow DOM
const initialCardBottom = settingsCard ? settingsCard.style.bottom : '0px'; // Store initial position

// Initialize the settings menu
function initSoundSettings() {
    if (!settingsOverlay) {
        console.error("Settings overlay element not found.");
        return;
    }
    console.log("Initializing Sound Settings...");

    setupDragBehavior();
    setupButtonActions();
    setupColorSelection();
    setupEmojiSelection(); // Uses emoji-picker-element
    setupLongPressDetection();
    setupRightClickBehavior();

    settingsBackdrop?.addEventListener('click', closeSettingsMenu);

    // --- REMOVED Picmo Init Call ---
    // initializeEmojiPicker();
}

// Function to set the selected emoji
function setEmoji(emoji) {
    if (!currentSoundId || !currentSoundData) return;

    const soundPath = currentSoundData.path;
    if (!soundPath) {
        console.error("Cannot set emoji: sound path is missing.");
        return;
    }
    persistence.setSoundEmoji(soundPath, emoji);

    // Update UI immediately
    if (currentEmojiDisplay) currentEmojiDisplay.textContent = emoji;
    if (clearEmojiButtonSettings) clearEmojiButtonSettings.classList.remove('hidden');

    if (window.app && typeof window.app.updateSoundCardDisplay === 'function') {
        window.app.updateSoundCardDisplay(currentSoundId);
    }

    // Close the picker
    if (emojiPickerContainer) emojiPickerContainer.classList.add('hidden');
    isEmojiPickerOpen = false;
}

// Function to clear the emoji
function clearEmoji() {
    if (!currentSoundId || !currentSoundData) return;
    const soundPath = currentSoundData.path;
    if (!soundPath) {
        console.error("Cannot clear emoji: sound path missing.");
        return;
    }
    persistence.clearSoundEmoji(soundPath);

    // Update UI immediately
    if (currentEmojiDisplay) currentEmojiDisplay.textContent = '❓';
    if (clearEmojiButtonSettings) clearEmojiButtonSettings.classList.add('hidden');

    if (window.app && typeof window.app.updateSoundCardDisplay === 'function') {
        window.app.updateSoundCardDisplay(currentSoundId);
    }

    // Close the picker if it was open
    if (emojiPickerContainer) emojiPickerContainer.classList.add('hidden');
    isEmojiPickerOpen = false;
}


// Set up long press detection
function setupLongPressDetection() {
    document.addEventListener('touchstart', (e) => {
        if (editMode.isActive()) return;
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

// Setup right-click
function setupRightClickBehavior() {
    document.addEventListener('contextmenu', (e) => {
        const soundCard = e.target.closest('.sound-card');
        if (soundCard) {
            e.preventDefault();
            if (!editMode.isActive()) {
                const soundId = parseInt(soundCard.dataset.soundId);
                if (window.soundSettings && typeof window.soundSettings.open === 'function') {
                   openSoundSettings(soundId);
                } else { console.error("Sound settings module not available."); }
           }
        }
        if (e.target.closest('#settings-card')) e.preventDefault();
    });
}

// Touch variables for long press
let longPressTimer;
const longPressDuration = 500;
let longPressSoundCard = null;
let longPressStartPosition = null;
let hasMoved = false;

// Handle touch start for long press
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
            if(window.state) state.lastLongPressTime = Date.now();
            openSoundSettings(soundId);
        }
    }, longPressDuration);
}

// Handle touch move for long press
function handleTouchMove(e) {
    if (!longPressSoundCard || !longPressStartPosition) return;
    const xDiff = Math.abs(e.touches[0].clientX - longPressStartPosition.x);
    const yDiff = Math.abs(e.touches[0].clientY - longPressStartPosition.y);
    if (xDiff > 10 || yDiff > 10) {
        hasMoved = true;
        clearTimeout(longPressTimer);
    }
}

// Handle touch end for long press
function handleTouchEnd() {
    if(window.state) state.lastLongPressTime = Date.now();
    clearTimeout(longPressTimer);
    longPressSoundCard = null; longPressStartPosition = null; hasMoved = false;
}

// Setup drag behavior for the settings card
function setupDragBehavior() {
    if (!settingsCard) return;
    settingsCard.addEventListener('touchstart', onCardTouchStart, { passive: true });
    settingsCard.addEventListener('touchmove', onCardTouchMove, { passive: false });
    settingsCard.addEventListener('touchend', onCardTouchEnd, { passive: true });
}

// Handle card touch start for dragging
function onCardTouchStart(e) {
    if (e.target === volumeSlider || e.target.closest('.color-selector') || e.target.closest('#emoji-picker-trigger') || e.target.closest('#emoji-picker-container')) return;
    startY = e.touches[0].clientY;
    cardHeight = settingsCard.offsetHeight;
    isDragging = true;
    settingsCard.style.transition = 'none';
}

// Handle card touch move for dragging
function onCardTouchMove(e) {
    if (!isDragging) return;
    currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;
    if (deltaY > 0) { // Only allow dragging down
        e.preventDefault();
        const translateY = Math.min(deltaY, cardHeight);
        settingsCard.style.transform = `translateY(${translateY}px)`;
        if (settingsBackdrop) settingsBackdrop.style.opacity = 1 - (translateY / cardHeight) * 0.5;
    }
}

// Handle card touch end for dragging
function onCardTouchEnd() {
    if (!isDragging) return;
    isDragging = false;
    settingsCard.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    if (settingsBackdrop) settingsBackdrop.style.transition = 'opacity 0.3s ease';
    const deltaY = currentY - startY;
    if (deltaY > cardHeight * 0.3) { closeSettingsMenu(); }
    else {
        settingsCard.style.transform = 'translateY(0)';
        if (settingsBackdrop) settingsBackdrop.style.opacity = '1';
    }
    startY = 0; currentY = 0;
}

// Setup button actions
function setupButtonActions() {
    if (favoriteButton) {
        favoriteButton.addEventListener('click', () => {
            if (!currentSoundId || !currentSoundData) return;
            const soundPath = currentSoundData.path;
            const newFavoriteState = !favoriteButton.classList.contains('active');
            fetch(`/api/sounds/${currentSoundId}/favorite`, { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    favoriteButton.classList.toggle('active', newFavoriteState);
                    persistence.setSoundSetting(soundPath, 'favorite', newFavoriteState);
                    if (window.app) app.updateSoundCardDisplay(currentSoundId);
                }
            }).catch(err => console.error("Error toggling favorite:", err));
        });
    } else { console.error("Favorite button not found."); }

    if (previewButton) {
        previewButton.addEventListener('click', () => {
            if (!currentSoundId) return;
            const currentState = previewButton.getAttribute('data-state');
            if (currentState === 'preview') {
                if (currentPreviewId) stopPreviewSound(currentPreviewId);
                fetch(`/api/sounds/${currentSoundId}/preview`, { method: 'POST' })
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.playingId) {
                        currentPreviewId = data.playingId;
                        previewButton.setAttribute('data-state', 'stop');
                        previewButton.querySelector('.material-symbols-outlined').textContent = 'stop_circle';
                        previewButton.querySelector('.button-text').textContent = 'Stop';
                    }
                }).catch(err => console.error("Error starting preview:", err));
            } else {
                stopPreviewSound(currentPreviewId);
                currentPreviewId = null;
                previewButton.setAttribute('data-state', 'preview');
                previewButton.querySelector('.material-symbols-outlined').textContent = 'volume_up';
                previewButton.querySelector('.button-text').textContent = 'Preview';
            }
        });
    } else { console.error("Preview button not found."); }

    let sliderDebounceTimer = null;
    if (volumeSlider) {
        volumeSlider.addEventListener('input', () => {
            const sliderPos = parseInt(volumeSlider.value);
            if (resetVolumeButton) resetVolumeButton.classList.toggle('hidden', sliderPos === 0);
            clearTimeout(sliderDebounceTimer);
        });
        volumeSlider.addEventListener('change', () => {
            clearTimeout(sliderDebounceTimer);
            if (currentSoundId) updateVolumeWithSlider(parseInt(volumeSlider.value));
        });
    } else { console.error("Volume slider not found."); }

    if (resetVolumeButton) {
        resetVolumeButton.addEventListener('click', resetVolume);
    } else { console.error("Reset volume button not found."); }

    if (clearEmojiButtonSettings) {
        clearEmojiButtonSettings.addEventListener('click', clearEmoji);
    } else { console.error("Clear emoji button (settings) not found."); }
}

// Setup color selection
function setupColorSelection() {
    if (!colorSelector) {
        console.error("Color selector element not found.");
        return;
    }
    colorSelector.addEventListener('click', (e) => {
        const swatch = e.target.closest('.color-swatch');
        if (swatch && currentSoundId && currentSoundData) {
            const color = swatch.dataset.color;
            const soundPath = currentSoundData.path;
            if (!soundPath) { console.error("Cannot set color: sound path missing."); return; }
            persistence.setSoundColor(soundPath, color);
            colorSelector.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');
            if (window.app) app.updateSoundCardDisplay(currentSoundId);
        }
    });
}

// Setup emoji selection using emoji-picker-element
function setupEmojiSelection() {
    // Check required elements for the NEW logic
    if (!emojiDisplayArea || !emojiPickerContainer || !clearEmojiButtonSettings || !currentEmojiDisplay) {
        console.error("One or more required emoji elements not found.");
        return;
    }

    emojiPickerInstance = emojiPickerContainer.querySelector('emoji-picker');
    if (!emojiPickerInstance) {
        console.error("emoji-picker element not found within the container.");
        return;
    }

    // Handle emoji selection from the component
    emojiPickerInstance.addEventListener('emoji-click', event => {
        setEmoji(event.detail.unicode);
        // After selecting, hide picker and show display area
        emojiPickerContainer.classList.add('hidden');
        emojiDisplayArea.classList.remove('hidden');
        isEmojiPickerOpen = false;
    });

    // Handle clearing the emoji
    clearEmojiButtonSettings.addEventListener('click', () => {
        clearEmoji();
        // After clearing, show picker and hide display area
        emojiPickerContainer.classList.remove('hidden');
        emojiDisplayArea.classList.add('hidden');
        isEmojiPickerOpen = true; // Picker is now visible
        // Focus the search input if possible
        focusEmojiSearchInput();
    });

    // --- Keyboard Handling ---
    // Find the input inside the shadow DOM (needs to run after picker is potentially rendered)
    // We do this once, assuming the picker structure is stable after init.
    // Use requestAnimationFrame to wait for potential initial rendering cycles.
    requestAnimationFrame(() => {
        if (emojiPickerInstance && emojiPickerInstance.shadowRoot) {
            emojiPickerInputElement = emojiPickerInstance.shadowRoot.querySelector('input[type="search"]');
            if (emojiPickerInputElement) {
                emojiPickerInputElement.addEventListener('focus', handleEmojiInputFocus);
                emojiPickerInputElement.addEventListener('blur', handleEmojiInputBlur);
                console.log("Emoji search input found and listeners attached.");
            } else {
                console.warn("Could not find search input within emoji-picker shadow DOM.");
            }
        } else {
             console.warn("Emoji picker instance or its shadow DOM not ready for input search binding.");
        }
    });
}

// --- NEW CODE START ---
function focusEmojiSearchInput() {
    // Use a small delay to ensure the element is visible and focusable
    requestAnimationFrame(() => {
        if (emojiPickerInputElement) {
            emojiPickerInputElement.focus();
        }
    });
}

// Function to handle keyboard appearance (Focus)
function handleEmojiInputFocus() {
    // Check for touch capability as a proxy for mobile keyboard likelihood
    const isLikelyMobile = navigator.maxTouchPoints > 0 && window.innerWidth < 768;

    if (isLikelyMobile) {
        console.log("Emoji search focus on likely mobile device, adjusting card position.");
        // Adjust this value based on testing with virtual keyboards
        // This needs careful tuning based on target devices and keyboard heights.
        const keyboardOffset = '15vh'; // Example: Move up by 15% of viewport height
        if (settingsCard) {
            // Ensure transition is set *before* changing transform
            settingsCard.style.transition = 'transform 0.25s ease-out';
            settingsCard.style.transform = `translateY(-${keyboardOffset})`;
        }
    } else {
         console.log("Emoji search focus on non-mobile or wide screen, no adjustment.");
         // Ensure card is reset if somehow it was previously offset
         handleEmojiInputBlur();
    }
}

// Function to handle keyboard disappearance (Blur)
function handleEmojiInputBlur() {
    if (settingsCard) {
        // Only reset if it was potentially moved
        if (settingsCard.style.transform !== 'translateY(0px)' && settingsCard.style.transform !== '') {
            console.log("Emoji search blur detected, resetting card position.");
            settingsCard.style.transition = 'transform 0.25s ease-out'; // Ensure transition for smooth return
            settingsCard.style.transform = 'translateY(0)';
        }
    }
}



// Function to update volume via API
function updateVolumeWithSlider(sliderPos) {
    if (!currentSoundId || !currentSoundData) return;
    const soundPath = currentSoundData.path;
    if (!soundPath) { console.error("Cannot update volume: sound path missing."); return; }

    fetch(`/api/sounds/${currentSoundId}/volume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sliderPosition: sliderPos })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            persistence.setSoundSetting(soundPath, 'hasCustomVolume', sliderPos !== 0);
            if(window.app) app.updateSoundCardDisplay(currentSoundId);
            currentSoundData.hasCustomVolume = (sliderPos !== 0);
            currentSoundData.sliderPosition = sliderPos;
            if (resetVolumeButton) resetVolumeButton.classList.toggle('hidden', sliderPos === 0);
        }
    })
    .catch(error => console.error('Error updating volume:', error));
}

// Reset volume via API
function resetVolume() {
    if (!currentSoundId || !currentSoundData) return;
    const soundPath = currentSoundData.path;
    if (!soundPath) { console.error("Cannot reset volume: sound path missing."); return; }

    fetch(`/api/sounds/${currentSoundId}/volume/reset`, { method: 'POST' })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (volumeSlider) volumeSlider.value = 0;
            if (resetVolumeButton) resetVolumeButton.classList.add('hidden');
            persistence.removeSoundSetting(soundPath, 'hasCustomVolume');
            persistence.removeSoundSetting(soundPath, 'localVolume');
            persistence.removeSoundSetting(soundPath, 'remoteVolume');
            if(window.app) app.updateSoundCardDisplay(currentSoundId);
            currentSoundData.hasCustomVolume = false;
            currentSoundData.sliderPosition = 0;
        }
    })
    .catch(error => console.error('Error resetting volume:', error));
}

// Open settings menu and load data
// Open settings menu and load data
function openSoundSettings(soundId) {
    if (!settingsOverlay) return;
    currentSoundId = soundId;

    resetMenuState(); // Reset visuals first

    fetch(`/api/sounds/${soundId}`)
    .then(response => response.json())
    .then(sound => {
        if (!sound || !sound.id || !sound.path) throw new Error("Sound data not found or invalid.");

        currentSoundData = sound;
        const soundPath = sound.path;
        const savedSoundSettings = persistence.getSoundSettings(soundPath);

        if (soundNameElement) soundNameElement.textContent = sound.name || 'Unknown Sound';
        if (tabNameElement) tabNameElement.textContent = sound.tabName || 'Unknown Tab';
        if (favoriteButton) favoriteButton.classList.toggle('active', savedSoundSettings.favorite ?? sound.isFavorite);

        // Set color state
        if (colorSelector) {
            colorSelector.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            const color = savedSoundSettings.color || 'default';
            const activeSwatch = colorSelector.querySelector(`.color-swatch[data-color="${color}"]`);
            if (activeSwatch) activeSwatch.classList.add('selected');
        }

        // --- NEW Emoji State Logic ---
        const currentEmoji = savedSoundSettings.emoji;
        if (currentEmoji) {
            // Emoji IS set: Show display area, hide picker
            if (currentEmojiDisplay) currentEmojiDisplay.textContent = currentEmoji;
            if (emojiDisplayArea) emojiDisplayArea.classList.remove('hidden');
            if (emojiPickerContainer) emojiPickerContainer.classList.add('hidden');
            isEmojiPickerOpen = false;
        } else {
            // NO emoji set: Hide display area, show picker
            if (currentEmojiDisplay) currentEmojiDisplay.textContent = '❓';
            if (emojiDisplayArea) emojiDisplayArea.classList.add('hidden');
            if (emojiPickerContainer) emojiPickerContainer.classList.remove('hidden');
            isEmojiPickerOpen = true;
            // Attempt to focus search input when picker is shown by default
            focusEmojiSearchInput();
        }
         // Show/hide the clear button (part of emojiDisplayArea now)
         if (clearEmojiButtonSettings) clearEmojiButtonSettings.classList.toggle('hidden', !currentEmoji);
        // --- END NEW Emoji State Logic ---


        // Set volume slider state
         const sliderPosition = sound.sliderPosition ?? 0;
         if (volumeSlider) volumeSlider.value = sliderPosition;
         if (resetVolumeButton) resetVolumeButton.classList.toggle('hidden', sliderPosition === 0);

        // Animate in
        settingsOverlay.classList.remove('hidden');
        requestAnimationFrame(() => {
            if (settingsBackdrop) settingsBackdrop.style.opacity = '1';
            settingsCard.style.transform = 'translateY(0)';
        });

    })
    .catch(error => {
        console.error('Failed to fetch sound details:', error);
        currentSoundId = null; currentSoundData = null;
        closeSettingsMenu();
        // Consider a less intrusive error display than alert
        // e.g., display error in a dedicated element
        console.error("Failed to load sound details.");
    });
}

// Reset the menu state to default
function resetMenuState() {
    if (!settingsOverlay) return;

    if (previewButton) {
        previewButton.setAttribute('data-state', 'preview');
        previewButton.querySelector('.material-symbols-outlined').textContent = 'volume_up';
        previewButton.querySelector('.button-text').textContent = 'Preview'; // Keep original case for now, CSS handles display
    }
    stopPreviewSound(currentPreviewId); currentPreviewId = null;

    if (volumeSlider) volumeSlider.value = 0;
    if (resetVolumeButton) resetVolumeButton.classList.add('hidden');
    if (favoriteButton) favoriteButton.classList.remove('active');

    if (colorSelector) {
        colorSelector.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        const defaultSwatch = colorSelector.querySelector('.color-swatch[data-color="default"]');
        if (defaultSwatch) defaultSwatch.classList.add('selected');
    }

    // Reset Emoji Section - default to picker shown
    if (currentEmojiDisplay) currentEmojiDisplay.textContent = '❓';
    if (emojiDisplayArea) emojiDisplayArea.classList.add('hidden');
    if (emojiPickerContainer) emojiPickerContainer.classList.remove('hidden'); // Show picker by default on reset
    if (clearEmojiButtonSettings) clearEmojiButtonSettings.classList.add('hidden');
    isEmojiPickerOpen = true; // Picker is shown

    if (soundNameElement) soundNameElement.textContent = 'Loading...';
    if (tabNameElement) tabNameElement.textContent = '';

    // Reset card position if moved by keyboard handling
    handleEmojiInputBlur();
}

// Close settings menu
function closeSettingsMenu() {
    if (!settingsOverlay || !settingsCard) return;
    settingsCard.style.transform = 'translateY(100%)';
    if (settingsBackdrop) settingsBackdrop.style.opacity = '0';

    stopPreviewSound(currentPreviewId); currentPreviewId = null;
    if (isEmojiPickerOpen) { // Close emoji picker if open
        emojiPickerContainer.classList.add('hidden');
        isEmojiPickerOpen = false;
    }

    setTimeout(() => {
        settingsOverlay.classList.add('hidden');
        currentSoundId = null; currentSoundData = null;
        if (settingsCard) settingsCard.style.transform = '';
        if (settingsBackdrop) settingsBackdrop.style.opacity = '';
    }, 300);
}

// Helper function to stop preview sound
function stopPreviewSound(playingId) {
     if (playingId) {
         fetch('/api/sounds/stop', { method: 'POST' }) // Use general stop endpoint
             .catch(error => console.error('Error stopping preview sound:', error));
     }
}

// Initialize when DOM content is loaded
document.addEventListener('DOMContentLoaded', initSoundSettings);

// Expose openSoundSettings globally
window.soundSettings = { open: openSoundSettings };
// --- ENTIRE FILE REPLACE ---