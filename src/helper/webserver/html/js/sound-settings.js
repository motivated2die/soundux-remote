// State management
let currentSoundId = null;
let currentSoundData = null; // Stores details fetched for the current sound
let startY = 0;
let currentY = 0;
let isDragging = false;
let cardHeight = 0;
let currentPreviewId = null;
let emojiPickerInstance = null; // Reference to the emoji picker element INSIDE THE MODAL
let emojiPickerInputElement = null; // To store the reference to the search input inside the shadow DOM of the picker in the modal

// Elements (Settings Card)
const settingsOverlay = document.getElementById('sound-settings-overlay'); // Main settings slide-in
const settingsCard = document.getElementById('settings-card');
const settingsBackdrop = document.getElementById('settings-backdrop');
const soundNameElement = document.getElementById('settings-sound-name');
const tabNameElement = document.getElementById('settings-tab-name');
const favoriteButton = document.getElementById('favorite-button');
const previewButton = document.getElementById('preview-button');
const volumeSlider = document.getElementById('volume-slider');
const resetVolumeButton = document.getElementById('reset-volume');
const colorSelector = document.getElementById('color-selector');
// Emoji Elements (Settings Card)
const emojiDisplayArea = document.getElementById('emoji-display-area'); // Area showing selected emoji + clear button in settings
const selectedEmojiButton = document.getElementById('selected-emoji-button'); // Button showing the selected emoji in settings (not interactive itself)
const currentEmojiDisplay = document.getElementById('current-emoji-display'); // Span inside the selected-emoji-button in settings
const clearEmojiButtonSettings = document.getElementById('clear-emoji-button-settings'); // The clear button in settings
const selectEmojiButton = document.getElementById('select-emoji-button'); // Button to open the modal

// Elements (Emoji Picker Modal)
const emojiPickerModalOverlay = document.getElementById('emoji-picker-modal-overlay');
const emojiPickerModal = document.getElementById('emoji-picker-modal');
const emojiPickerContainer = document.getElementById('emoji-picker-container'); // Container for <emoji-picker> IN THE MODAL
const closeEmojiPickerButton = document.getElementById('close-emoji-picker-button');


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
    setupEmojiSelection(); // Now handles modal logic
    setupLongPressDetection();
    setupRightClickBehavior();

    settingsBackdrop?.addEventListener('click', closeSettingsMenu);
}

// --- MODIFIED: Function to set the selected emoji (called from modal) ---
function setEmoji(emoji) {
    if (!currentSoundId || !currentSoundData) return;

    const soundPath = currentSoundData.path;
    if (!soundPath) {
        console.error("Cannot set emoji: sound path is missing.");
        return;
    }
    persistence.setSoundEmoji(soundPath, emoji);

    // Update UI in the SETTINGS CARD immediately
    if (currentEmojiDisplay) currentEmojiDisplay.textContent = emoji;
    if (emojiDisplayArea) emojiDisplayArea.classList.remove('hidden'); // Show display area
    if (selectEmojiButton) selectEmojiButton.classList.add('hidden'); // Hide select button
    if (clearEmojiButtonSettings) clearEmojiButtonSettings.classList.remove('hidden'); // Show clear button

    // Update the main sound card display
    if (window.app && typeof window.app.updateSoundCardDisplay === 'function') {
        window.app.updateSoundCardDisplay(currentSoundId);
    }

    // Close the modal
    closeEmojiPickerModal();
}

// --- MODIFIED: Function to clear the emoji (called from settings card) ---
function clearEmoji() {
    if (!currentSoundId || !currentSoundData) return;
    const soundPath = currentSoundData.path;
    if (!soundPath) {
        console.error("Cannot clear emoji: sound path missing.");
        return;
    }
    persistence.clearSoundEmoji(soundPath);

    // Update UI in the SETTINGS CARD immediately
    if (currentEmojiDisplay) currentEmojiDisplay.textContent = '❓'; // Reset display text just in case
    if (emojiDisplayArea) emojiDisplayArea.classList.add('hidden'); // Hide display area
    if (selectEmojiButton) selectEmojiButton.classList.remove('hidden'); // Show select button
    if (clearEmojiButtonSettings) clearEmojiButtonSettings.classList.add('hidden'); // Hide clear button

    // Update the main sound card display
    if (window.app && typeof window.app.updateSoundCardDisplay === 'function') {
        window.app.updateSoundCardDisplay(currentSoundId);
    }

    // DO NOT open the modal automatically
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
        // Prevent context menu inside the settings card AND the emoji modal
        if (e.target.closest('#settings-card') || e.target.closest('#emoji-picker-modal')) {
            e.preventDefault();
        }
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
    // --- Check if the target is the PTT button or inside it ---
    if (e.target.closest('#talk-through-button')) {
        // console.log("Ignoring touchstart for long press detection on PTT button.");
        return; // DO NOT PROCEED for PTT button
    }
    // --- END Check ---

    // If we reach here, it's NOT the PTT button, proceed with sound card logic
    const soundCard = e.target.closest('.sound-card');
    if (!soundCard) {
        // console.log("Ignoring touchstart for long press detection - not on sound card.");
        return; // Ignore if not on a sound card either
    }

    // --- Start long press logic ONLY for sound cards ---
    // console.log("Starting long press detection for sound card."); // Optional debug
    longPressStartPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    hasMoved = false;
    longPressSoundCard = soundCard; // Track the target sound card

    // Clear any potentially existing timer from previous touches
    clearTimeout(longPressTimer);
    longPressTimer = null; // Explicitly nullify

    // Set the timer *only* for sound cards
    longPressTimer = setTimeout(() => {
        // --- THIS CHECK MUST REMAIN ---
        if (window.state && window.state.isTalkThroughButtonPressed) {
             console.log("Long press timer fired, but PTT is active. Aborting sound card long press action.");
             longPressSoundCard = null;
             return;
        }
        // Check conditions *when timer fires*
        if (!hasMoved && longPressSoundCard === soundCard) { // Ensure target hasn't changed
            // console.log("Long press timer fired for sound card."); // Optional debug
            // Vibration for sound card long press (KEEP THIS if you want haptic feedback for opening settings)
            // if (navigator.vibrate) navigator.vibrate(50);

            const soundId = parseInt(soundCard.dataset.soundId);
            // Update last long press time ONLY if it's a valid sound card long press
            if(window.state) state.lastLongPressTime = Date.now();
            openSoundSettings(soundId);
        } else {
            // console.log("Long press timer fired, but conditions not met (moved or target changed)."); // Optional debug
        }
        // Clear target reference after timer execution
        longPressSoundCard = null;

    }, longPressDuration);
}


/* --- Add clarification to handleTouchEnd --- */
function handleTouchEnd() {
    // Update last long press time regardless, as the touch ended
    if(window.state) state.lastLongPressTime = Date.now();

    // --- KEEP: Clear the timer on touch end ---
    // This is crucial. If the touch ends before the timer fires,
    // the long press action (including vibration) is cancelled.
    clearTimeout(longPressTimer);
    // --- END KEEP ---

    longPressSoundCard = null;
    longPressStartPosition = null;
    hasMoved = false;
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
    // Prevent drag if interacting with interactive elements within the card
    if (e.target === volumeSlider ||
        e.target.closest('.color-selector') ||
        e.target.closest('#select-emoji-button') || // Prevent drag on select button
        e.target.closest('#emoji-display-area')) // Prevent drag on display area (incl. clear button)
    {
        return;
    }
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

// Setup button actions within the settings card
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

    // Clear button listener remains here as it's in the settings card
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

// --- MODIFIED: Setup Emoji Selection (Modal Logic) ---
function setupEmojiSelection() {
    // Check required elements for both settings card and modal
    if (!emojiDisplayArea || !clearEmojiButtonSettings || !currentEmojiDisplay || !selectEmojiButton ||
        !emojiPickerModalOverlay || !emojiPickerModal || !emojiPickerContainer || !closeEmojiPickerButton) {
        console.error("One or more required emoji elements (settings or modal) not found.");
        return;
    }

    // Get the picker instance from the MODAL
    emojiPickerInstance = emojiPickerContainer.querySelector('emoji-picker');
    if (!emojiPickerInstance) {
        console.error("emoji-picker element not found within the modal container.");
        return;
    }

    // 1. Listener for the "Select Background Emoji" button (in settings card)
    selectEmojiButton.addEventListener('click', openEmojiPickerModal);

    // 2. Listener for selecting an emoji within the MODAL
    emojiPickerInstance.addEventListener('emoji-click', event => {
        const selectedEmoji = event.detail.unicode;
        console.log("Emoji selected in modal:", selectedEmoji);
        setEmoji(selectedEmoji); // This will update state, update settings UI, and close the modal
    });

    // 3. Listener for the "Cancel" button in the MODAL
    closeEmojiPickerButton.addEventListener('click', closeEmojiPickerModal);

    // 4. Listener for clicking the modal overlay (backdrop) to close
    emojiPickerModalOverlay.addEventListener('click', (event) => {
        // Only close if the click is directly on the overlay, not the modal content
        if (event.target === emojiPickerModalOverlay) {
            closeEmojiPickerModal();
        }
    });

    // 5. Listener for the clear button remains in setupButtonActions as it's part of the main settings card.

    // 6. Find the search input within the picker's shadow DOM (for focusing later)
    // Use requestAnimationFrame or a small delay if shadow DOM isn't ready immediately
    requestAnimationFrame(() => {
        if (emojiPickerInstance && emojiPickerInstance.shadowRoot) {
            emojiPickerInputElement = emojiPickerInstance.shadowRoot.querySelector('input[type="search"]');
            if (emojiPickerInputElement) {
                console.log("Emoji search input found in modal picker.");
            } else {
                console.warn("Could not find search input within modal emoji-picker shadow DOM.");
            }
        } else {
             console.warn("Modal emoji picker instance or its shadow DOM not ready for input search binding.");
        }
    });
}

// --- NEW: Function to open the emoji picker modal ---
function openEmojiPickerModal() {
    if (!emojiPickerModalOverlay) return;
    console.log("Opening emoji picker modal.");
    emojiPickerModalOverlay.classList.remove('hidden');
    // Optional: Add animation class if needed
    // requestAnimationFrame(() => emojiPickerModal.classList.add('visible'));

    // Focus the search input after the modal is potentially visible
    focusEmojiSearchInput();
}

// --- NEW: Function to close the emoji picker modal ---
function closeEmojiPickerModal() {
    if (!emojiPickerModalOverlay) return;
    console.log("Closing emoji picker modal.");
    // Optional: Add animation class for fade out before hiding
    emojiPickerModalOverlay.classList.add('hidden');
    // Optional: Remove animation class after transition
    // emojiPickerModal.classList.remove('visible');
}

// --- NEW: Function to focus the search input inside the modal picker ---
function focusEmojiSearchInput() {
    // Use a small delay or RAF to ensure the element is visible and focusable after modal opens
    requestAnimationFrame(() => {
        if (emojiPickerInputElement) {
            emojiPickerInputElement.focus();
            console.log("Attempted to focus emoji search input.");
        } else {
            console.warn("Emoji search input element not available for focus.");
            // Retry after a short delay if it wasn't found initially
            setTimeout(() => {
                 if (emojiPickerInstance && emojiPickerInstance.shadowRoot && !emojiPickerInputElement) {
                    emojiPickerInputElement = emojiPickerInstance.shadowRoot.querySelector('input[type="search"]');
                    if(emojiPickerInputElement) {
                        emojiPickerInputElement.focus();
                        console.log("Attempted to focus emoji search input after delay.");
                    } else {
                         console.error("Still couldn't find emoji search input after delay.");
                    }
                 }
            }, 200);
        }
    });
}

// --- REMOVED Floating Logic (handleEmojiInputFocus, handleEmojiInputBlur) ---

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

    resetMenuState(); // Reset visuals first

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

        // --- MODIFIED: Emoji Visibility Logic (Settings Card) ---
        const currentEmoji = savedSoundSettings.emoji;
        if (currentEmoji) {
            // Emoji IS set: Show display area, hide select button
            if (currentEmojiDisplay) currentEmojiDisplay.textContent = currentEmoji;
            if (emojiDisplayArea) emojiDisplayArea.classList.remove('hidden');
            if (selectEmojiButton) selectEmojiButton.classList.add('hidden');
            if (clearEmojiButtonSettings) clearEmojiButtonSettings.classList.remove('hidden');
        } else {
            // NO emoji set: Hide display area, show select button
            if (currentEmojiDisplay) currentEmojiDisplay.textContent = '❓'; // Reset just in case
            if (emojiDisplayArea) emojiDisplayArea.classList.add('hidden');
            if (selectEmojiButton) selectEmojiButton.classList.remove('hidden');
            if (clearEmojiButtonSettings) clearEmojiButtonSettings.classList.add('hidden');
        }
        // --- End Modified Emoji Visibility Logic ---

        // Animate in the settings card
        settingsOverlay.classList.remove('hidden');
        requestAnimationFrame(() => {
            if (settingsBackdrop) settingsBackdrop.style.opacity = '1';
            settingsCard.style.transform = 'translateY(0)';
        });

    })
    .catch(error => {
        console.error('Failed to fetch sound details:', error);
        currentSoundId = null; currentSoundData = null;
        closeSettingsMenu(); // Close the main settings menu on error
        closeEmojiPickerModal(); // Ensure modal is also closed if it was somehow open
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

    // --- MODIFIED: Emoji Reset Logic ---
    // Default to showing the "Select Emoji" button and hiding the display area
    if (currentEmojiDisplay) currentEmojiDisplay.textContent = '❓'; // Reset display text
    if (emojiDisplayArea) emojiDisplayArea.classList.add('hidden');
    if (selectEmojiButton) selectEmojiButton.classList.remove('hidden'); // Show select button by default
    if (clearEmojiButtonSettings) clearEmojiButtonSettings.classList.add('hidden');

    // Reset Text Fields
    if (soundNameElement) soundNameElement.textContent = 'Loading...';
    if (tabNameElement) tabNameElement.textContent = '';

    // --- REMOVED Floating Picker State Cleanup ---
}


// Close settings menu
function closeSettingsMenu() {
    if (!settingsOverlay || !settingsCard) return;
    settingsCard.style.transform = 'translateY(100%)';
    if (settingsBackdrop) settingsBackdrop.style.opacity = '0';

    stopPreviewSound(currentPreviewId); currentPreviewId = null;

    // Ensure the emoji modal is also closed when the main settings menu closes
    closeEmojiPickerModal();

    setTimeout(() => {
        settingsOverlay.classList.add('hidden');
        currentSoundId = null; currentSoundData = null;
        // Reset styles after transition
        if (settingsCard) settingsCard.style.transform = '';
        if (settingsBackdrop) settingsBackdrop.style.opacity = '';
        // Ensure modal is definitely hidden after animation
        if (emojiPickerModalOverlay) emojiPickerModalOverlay.classList.add('hidden');

    }, 300); // Match transition duration
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
