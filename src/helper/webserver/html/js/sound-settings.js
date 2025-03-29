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
let isClickHandlingCleanup = false; // Flag to prevent blur/click race condition


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
const emojiPickerPlaceholder = document.getElementById('emoji-picker-placeholder'); // Placeholder element


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

function setupEmojiSelection() {
    // Check required elements
    if (!emojiDisplayArea || !emojiPickerContainer || !clearEmojiButtonSettings || !currentEmojiDisplay) {
        console.error("One or more required emoji elements not found.");
        return;
    }

    emojiPickerInstance = emojiPickerContainer.querySelector('emoji-picker');
    if (!emojiPickerInstance) {
        console.error("emoji-picker element not found within the container.");
        return;
    }

    // --- MODIFIED: Handle emoji selection ---
    emojiPickerInstance.addEventListener('emoji-click', event => {
        // 1. Signal that cleanup will be handled here
        isClickHandlingCleanup = true;
        // console.log("Setting isClickHandlingCleanup = true"); // Debug

        const selectedEmoji = event.detail.unicode;
        console.log("Emoji clicked:", selectedEmoji);

        // 2. Apply the selection FIRST
        setEmoji(selectedEmoji); // Update internal state and persistence

        // 3. Check if it was floating *before* potentially modifying classes
        const wasFloating = emojiPickerContainer.classList.contains('emoji-picker-floating');

        // 4. Update UI visibility (Hide picker, show display)
        emojiPickerContainer.classList.add('hidden');
        emojiDisplayArea.classList.remove('hidden');
        isEmojiPickerOpen = false;

        // 5. Clean up floating state if it was active
        if (wasFloating) {
            console.log("Selection occurred while floating. Cleaning up floating state now.");
            emojiPickerContainer.classList.remove('visible');
            emojiPickerContainer.classList.remove('emoji-picker-floating');
            if (emojiPickerPlaceholder) {
                emojiPickerPlaceholder.classList.remove('placeholder-active');
            }
            settingsOverlay?.classList.remove('picker-is-floating');
        }

        // 6. Reset the flag after a very short delay, allowing blur to potentially fire but be ignored
        setTimeout(() => {
            // console.log("Resetting isClickHandlingCleanup = false"); // Debug
            isClickHandlingCleanup = false;
        }, 50); // 50ms should be enough
    });

    // Handle clearing the emoji
    clearEmojiButtonSettings.addEventListener('click', () => {
        clearEmoji();
        // After clearing, show picker and hide display area
        emojiPickerContainer.classList.remove('hidden');
        emojiDisplayArea.classList.add('hidden');
        isEmojiPickerOpen = true; // Picker is now visible
        console.log("Emoji cleared, picker shown without focus.");
        // NO automatic focus
    });

    // --- Keyboard Handling ---
    requestAnimationFrame(() => {
        if (emojiPickerInstance && emojiPickerInstance.shadowRoot) {
            emojiPickerInputElement = emojiPickerInstance.shadowRoot.querySelector('input[type="search"]');
            if (emojiPickerInputElement) {
                emojiPickerInputElement.addEventListener('focus', handleEmojiInputFocus);
                emojiPickerInputElement.addEventListener('blur', handleEmojiInputBlur); // Keep blur listener
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

// Function to handle keyboard appearance (Focus) - POP-OUT LOGIC + PLACEHOLDER
function handleEmojiInputFocus() {
    const isLikelyMobile = navigator.maxTouchPoints > 0 && window.innerWidth < 768;

    if (isLikelyMobile && emojiPickerContainer && emojiPickerPlaceholder) {
        console.log("Emoji search focus on likely mobile device, making picker float and showing placeholder.");
        // Activate placeholder first to prevent layout jump
        emojiPickerPlaceholder.classList.add('placeholder-active');

        // Add floating classes to the picker
        emojiPickerContainer.classList.add('emoji-picker-floating');
        requestAnimationFrame(() => { // Use RAF for smooth animation start
            emojiPickerContainer.classList.add('visible');
        });

        // Optional: Dim overlay
        settingsOverlay?.classList.add('picker-is-floating');
    } else {
         console.log("Emoji search focus on non-mobile or wide screen, no floating.");
         handleEmojiInputBlur(); // Ensure cleanup if state is wrong
    }
}

// Function to handle keyboard disappearance (Blur) - RESET POP-OUT
function handleEmojiInputBlur() {
    // Check if the picker is currently floating
    if (emojiPickerContainer && emojiPickerContainer.classList.contains('emoji-picker-floating')) {
        console.log("Emoji search blur detected, returning picker to normal position and hiding placeholder.");

        // Remove floating classes from picker
        emojiPickerContainer.classList.remove('visible');
        emojiPickerContainer.classList.remove('emoji-picker-floating');

        // Hide the placeholder
        if (emojiPickerPlaceholder) {
            emojiPickerPlaceholder.classList.remove('placeholder-active');
        }

        // Optional: Undim overlay
        settingsOverlay?.classList.remove('picker-is-floating');
    }
    // No need to handle non-floating case specifically, state is already correct
}

// Function to update volume via API
function handleEmojiInputBlur() {
    // --- MODIFIED: Check the flag first ---
    if (isClickHandlingCleanup) {
        // console.log("Blur event ignored: Click handler is managing cleanup."); // Debug
        return; // Let the click handler finish managing the state
    }
    // --- END MODIFICATION ---

    // Check if the picker is currently floating (and click handler is NOT active)
    if (emojiPickerContainer && emojiPickerContainer.classList.contains('emoji-picker-floating')) {
        console.log("Emoji search blur detected (no click), returning picker to normal position and hiding placeholder.");

        // Remove floating classes from picker
        emojiPickerContainer.classList.remove('visible');
        emojiPickerContainer.classList.remove('emoji-picker-floating');

        // Hide the placeholder
        if (emojiPickerPlaceholder) {
            emojiPickerPlaceholder.classList.remove('placeholder-active');
        }

        // Optional: Undim overlay
        settingsOverlay?.classList.remove('picker-is-floating');
    }
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
function openSoundSettings(soundId) {
    if (!settingsOverlay) return;
    currentSoundId = soundId;

    resetMenuState(); // Reset visuals first, ensures picker is hidden initially

    fetch(`/api/sounds/${soundId}`)
    .then(response => response.json())
    .then(sound => {
        if (!sound || !sound.id || !sound.path) throw new Error("Sound data not found or invalid.");

        currentSoundData = sound;
        const soundPath = sound.path;
        const savedSoundSettings = persistence.getSoundSettings(soundPath);

        // Populate basic info
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

        // Set volume slider state
        const sliderPosition = sound.sliderPosition ?? 0;
        if (volumeSlider) volumeSlider.value = sliderPosition;
        if (resetVolumeButton) resetVolumeButton.classList.toggle('hidden', sliderPosition === 0);

        // --- Updated Emoji Visibility Logic ---
        const currentEmoji = savedSoundSettings.emoji;
        if (currentEmoji) {
            // Emoji IS set: Show display area, ensure picker is hidden
            if (currentEmojiDisplay) currentEmojiDisplay.textContent = currentEmoji;
            if (emojiDisplayArea) emojiDisplayArea.classList.remove('hidden');
            if (emojiPickerContainer) emojiPickerContainer.classList.add('hidden'); // Ensure hidden
            isEmojiPickerOpen = false;
        } else {
            // NO emoji set: Ensure display area is hidden, show picker
            if (currentEmojiDisplay) currentEmojiDisplay.textContent = '❓';
            if (emojiDisplayArea) emojiDisplayArea.classList.add('hidden'); // Ensure hidden
            if (emojiPickerContainer) emojiPickerContainer.classList.remove('hidden'); // Now show picker
            isEmojiPickerOpen = true;
            // Focus after animation frame to ensure it's visible
            requestAnimationFrame(focusEmojiSearchInput);
        }
        if (clearEmojiButtonSettings) clearEmojiButtonSettings.classList.toggle('hidden', !currentEmoji);
        // --- End Updated Emoji Visibility Logic ---

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
        handleEmojiInputBlur(); // Ensure picker is not floating on error
        closeSettingsMenu();
        console.error("Failed to load sound details.");
    });
}


// Reset the menu state to default
function resetMenuState() {
    if (!settingsOverlay) return;

    // Reset Buttons and Slider
    if (previewButton) {
        previewButton.setAttribute('data-state', 'preview');
        previewButton.querySelector('.material-symbols-outlined').textContent = 'volume_up';
        previewButton.querySelector('.button-text').textContent = 'Preview';
    }
    stopPreviewSound(currentPreviewId); currentPreviewId = null;

    if (volumeSlider) volumeSlider.value = 0;
    if (resetVolumeButton) resetVolumeButton.classList.add('hidden');
    if (favoriteButton) favoriteButton.classList.remove('active');

    // Reset Color Selector
    if (colorSelector) {
        colorSelector.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        const defaultSwatch = colorSelector.querySelector('.color-swatch[data-color="default"]');
        if (defaultSwatch) defaultSwatch.classList.add('selected');
    }

    // --- Emoji Reset Logic ---
    // Default to hiding BOTH display and picker. openSoundSettings will show the correct one later.
    if (currentEmojiDisplay) currentEmojiDisplay.textContent = '❓'; // Reset display text
    if (emojiDisplayArea) emojiDisplayArea.classList.add('hidden');
    if (emojiPickerContainer) emojiPickerContainer.classList.add('hidden'); // Keep picker hidden initially
    if (clearEmojiButtonSettings) clearEmojiButtonSettings.classList.add('hidden');
    isEmojiPickerOpen = false; // Assume picker is closed initially

    // Reset Text Fields
    if (soundNameElement) soundNameElement.textContent = 'Loading...';
    if (tabNameElement) tabNameElement.textContent = '';

    // Cleanup Floating Picker State (Important!)
    if (emojiPickerContainer && emojiPickerContainer.classList.contains('emoji-picker-floating')) {
        handleEmojiInputBlur(); // Use existing cleanup logic
    }
    // Ensure placeholder is hidden
    if (emojiPickerPlaceholder) {
        emojiPickerPlaceholder.classList.remove('placeholder-active');
    }
    settingsOverlay?.classList.remove('picker-is-floating');
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

    // --- NEW CODE START ---
    // Ensure floating state is removed immediately when closing starts
    handleEmojiInputBlur();
    // --- NEW CODE END ---

    setTimeout(() => {
        settingsOverlay.classList.add('hidden');
        currentSoundId = null; currentSoundData = null;
        if (settingsCard) settingsCard.style.transform = '';
        if (settingsBackdrop) settingsBackdrop.style.opacity = '';
        // Reset picker visibility state completely after transition out
        if (emojiPickerContainer) {
            emojiPickerContainer.classList.add('hidden'); // Ensure it's hidden after close animation
            emojiPickerContainer.classList.remove('visible'); // Clean up animation class
            emojiPickerContainer.classList.remove('emoji-picker-floating'); // Clean up state class
        }
        if (emojiDisplayArea) emojiDisplayArea.classList.add('hidden'); // Hide display area too
        settingsOverlay?.classList.remove('picker-is-floating'); // Clean up overlay class
        // Ensure placeholder is hidden after close animation
        if (emojiPickerPlaceholder) {
             emojiPickerPlaceholder.classList.remove('placeholder-active');
        }

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