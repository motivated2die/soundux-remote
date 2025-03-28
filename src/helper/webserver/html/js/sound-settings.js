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
// Emoji Elements (Revised)
const emojiSearchInput = document.getElementById('emoji-search-input');
const emojiPickerTrigger = document.getElementById('emoji-picker-trigger'); // Picmo reference element
const clearEmojiButtonSettings = document.getElementById('clear-emoji-button-settings'); // Specific button for settings


// Initialize the settings menu
function initSoundSettings() {
    if (!settingsOverlay) {
        console.error("Settings overlay element not found.");
        return;
    }
    console.log("Initializing Sound Settings...");

    // Set up event listeners
    setupDragBehavior();
    setupButtonActions();
    setupColorSelection();
    setupEmojiSelection();
    setupLongPressDetection(); // Keep long-press/right-click for non-edit mode
    setupRightClickBehavior();

    // Close when clicking backdrop
    settingsBackdrop?.addEventListener('click', closeSettingsMenu);

    // Initialize the emoji picker
    initializeEmojiPicker();
}

// Function to set the selected emoji
function setEmoji(emoji) {
    if (!currentSoundId || !currentSoundData) return;

    const soundPath = currentSoundData.path;
    if (!soundPath) {
        console.error("Cannot set emoji: sound path is missing from currentSoundData.");
        return;
    }
    persistence.setSoundEmoji(soundPath, emoji);

    // Update UI immediately
    // Update the trigger button display
    const trigger = document.getElementById('emoji-picker-trigger'); // Re-select just in case
    const currentEmojiSpan = trigger?.querySelector('.current-emoji');
    if (currentEmojiSpan) {
        currentEmojiSpan.textContent = emoji;
    } else if (trigger) {
        // Fallback if span structure changed
        const triggerText = trigger.querySelector('.button-text') || trigger;
        triggerText.textContent = emoji + ' Change Emoji';
        console.warn("Emoji display span not found inside trigger, using fallback.");
    }

    if (clearEmojiButtonSettings) clearEmojiButtonSettings.classList.remove('hidden');
    if (window.app && typeof window.app.updateSoundCardDisplay === 'function') {
        window.app.updateSoundCardDisplay(currentSoundId); // Update the main grid card
    }
}

// Function to clear the emoji
function clearEmoji() {
    if (!currentSoundId || !currentSoundData) return;

    const soundPath = currentSoundData.path;
     if (!soundPath) {
        console.error("Cannot clear emoji: sound path is missing from currentSoundData.");
        return;
    }
    persistence.clearSoundEmoji(soundPath);

    // Update UI immediately
    const trigger = document.getElementById('emoji-picker-trigger'); // Re-select
    const currentEmojiSpan = trigger?.querySelector('.current-emoji');
     if (currentEmojiSpan) {
         currentEmojiSpan.textContent = '❓'; // Reset placeholder
     } else if (trigger) {
         // Fallback if span structure changed
         const triggerText = trigger.querySelector('.button-text') || trigger;
         triggerText.textContent = 'Select Emoji';
         console.warn("Emoji display span not found inside trigger, using fallback.");
     }

    if (clearEmojiButtonSettings) clearEmojiButtonSettings.classList.add('hidden');
    if (window.app && typeof window.app.updateSoundCardDisplay === 'function') {
        window.app.updateSoundCardDisplay(currentSoundId); // Update the main grid card
    }
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
                if (window.soundSettings && typeof window.soundSettings.open === 'function') {
                   openSoundSettings(soundId);
                } else {
                   console.error("Sound settings module or open function not available for context menu.");
                }
           }
        }
        // Also prevent context menu on settings menu elements
        if (e.target.closest('#settings-card')) {
            e.preventDefault();
        }
    });
}

// Touch variables
let longPressTimer;
const longPressDuration = 500;
let longPressSoundCard = null;
let longPressStartPosition = null;
let hasMoved = false;

// Handle touch start
function handleTouchStart(e) {
    const soundCard = e.target.closest('.sound-card');
    if (!soundCard) return;
    longPressStartPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    hasMoved = false;
    longPressSoundCard = soundCard;
    longPressTimer = setTimeout(() => {
        if (!hasMoved && longPressSoundCard) {
            console.log("Long press detected, opening settings...");
            if (navigator.vibrate) navigator.vibrate(50);

            const soundId = parseInt(longPressSoundCard.dataset.soundId);
            // Check global state object exists before setting property
            if(window.state) state.lastLongPressTime = Date.now();
            else console.warn("Global state object not found in handleTouchStart");

            openSoundSettings(soundId);
        }
    }, longPressDuration);
}

// Handle touch move
function handleTouchMove(e) {
    if (!longPressSoundCard || !longPressStartPosition) return;
    const xDiff = Math.abs(e.touches[0].clientX - longPressStartPosition.x);
    const yDiff = Math.abs(e.touches[0].clientY - longPressStartPosition.y);
    if (xDiff > 10 || yDiff > 10) {
        hasMoved = true;
        clearTimeout(longPressTimer);
    }
}

// Handle touch end
function handleTouchEnd() {
    // Check global state object exists before setting property
    if(window.state) state.lastLongPressTime = Date.now();
    else console.warn("Global state object not found in handleTouchEnd");

    clearTimeout(longPressTimer);
    longPressSoundCard = null;
    longPressStartPosition = null;
    hasMoved = false; // Reset movement flag
}

// Setup drag behavior for the settings card
function setupDragBehavior() {
    if (!settingsCard) return;
    settingsCard.addEventListener('touchstart', onCardTouchStart, { passive: true });
    settingsCard.addEventListener('touchmove', onCardTouchMove, { passive: false });
    settingsCard.addEventListener('touchend', onCardTouchEnd, { passive: true });
}

// Handle card touch start
function onCardTouchStart(e) {
    // Added check for emojiPickerTrigger
    if (e.target === volumeSlider || e.target.closest('.color-selector') || e.target.closest('#emoji-picker-trigger')) return;
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
    if (deltaY > 0) {
        e.preventDefault();
        const translateY = Math.min(deltaY, cardHeight);
        settingsCard.style.transform = `translateY(${translateY}px)`;
        if (settingsBackdrop) {
            const opacity = 1 - (translateY / cardHeight) * 0.5;
            settingsBackdrop.style.opacity = opacity;
        }
    }
}

// Handle card touch end
function onCardTouchEnd() {
    if (!isDragging) return;
    isDragging = false;
    settingsCard.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    if (settingsBackdrop) settingsBackdrop.style.transition = 'opacity 0.3s ease';
    const deltaY = currentY - startY;
    if (deltaY > cardHeight * 0.4) {
        closeSettingsMenu();
    } else {
        settingsCard.style.transform = 'translateY(0)';
        if (settingsBackdrop) settingsBackdrop.style.opacity = '1';
    }
}

// Setup button actions
function setupButtonActions() {
    // Favorite button
    if (favoriteButton) {
        favoriteButton.addEventListener('click', () => {
            if (!currentSoundId || !currentSoundData) return;
            const soundPath = currentSoundData.path;
            const isCurrentlyFavorite = favoriteButton.classList.contains('active');
            const newFavoriteState = !isCurrentlyFavorite;

            fetch(`/api/sounds/${currentSoundId}/favorite`, { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    favoriteButton.classList.toggle('active', newFavoriteState);
                    // Also update the persistence layer directly
                    persistence.setSoundSetting(soundPath, 'favorite', newFavoriteState);
                    if (window.app) app.updateSoundCardDisplay(currentSoundId);
                } else { console.error("Failed to toggle favorite on server."); }
            }).catch(err => console.error("Error toggling favorite:", err));
        });
    } else { console.error("Favorite button not found."); }

    // Preview button
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
                        const icon = previewButton.querySelector('.material-symbols-outlined');
                        if (icon) icon.textContent = 'stop_circle';
                        const text = previewButton.querySelector('.button-text');
                        if (text) text.textContent = 'Stop';
                    } else { console.error("Failed to start preview"); }
                }).catch(err => console.error("Error starting preview:", err));
            } else {
                stopPreviewSound(currentPreviewId);
                currentPreviewId = null;
                previewButton.setAttribute('data-state', 'preview');
                const icon = previewButton.querySelector('.material-symbols-outlined');
                if (icon) icon.textContent = 'volume_up';
                const text = previewButton.querySelector('.button-text');
                if (text) text.textContent = 'Preview';
            }
        });
    } else { console.error("Preview button not found."); }

    // Volume slider
    let sliderDebounceTimer = null;
    if (volumeSlider) {
        volumeSlider.addEventListener('input', () => {
            const sliderPos = parseInt(volumeSlider.value);
            if (resetVolumeButton) resetVolumeButton.classList.toggle('hidden', sliderPos === 0);
            clearTimeout(sliderDebounceTimer);
            // Optionally visualize change immediately here
        });
        volumeSlider.addEventListener('change', () => { // Send on final change
            clearTimeout(sliderDebounceTimer);
            if (currentSoundId) updateVolumeWithSlider(parseInt(volumeSlider.value));
        });
    } else { console.error("Volume slider not found."); }

    // Reset volume button
    if (resetVolumeButton) {
        resetVolumeButton.addEventListener('click', resetVolume);
    } else { console.error("Reset volume button not found."); }

    // Clear emoji button
    if (clearEmojiButtonSettings) { // Check if the element exists
        clearEmojiButtonSettings.addEventListener('click', clearEmoji); // Use correct variable
    } else {
        console.error("Clear emoji button (settings) not found in settings menu.");
    }
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
            if (!soundPath) {
                console.error("Cannot set color: sound path missing.");
                return;
            }

            persistence.setSoundColor(soundPath, color);

            colorSelector.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');

            if (window.app) app.updateSoundCardDisplay(currentSoundId);
        }
    });
}

// Setup emoji selection
function initializeEmojiPicker() {
    const triggerElement = document.getElementById('emoji-picker-trigger');
    if (window.picmo && window.PicmoPopup && triggerElement) {
        try {
            emojiPicker = window.PicmoPopup.createPopup({
                 emojiSize: '1.5em', emojisPerRow: 7, visibleRows: 5,
                 showSearch: false, showCategoryTabs: true, showRecents: true, theme: 'dark'
            }, {
                referenceElement: triggerElement, triggerElement: triggerElement,
                position: 'top-start', // Try top-start
                hideOnClickOutside: true, hideOnEmojiSelect: true, hideOnEscape: true,
            });

            emojiPicker.addEventListener('emoji:select', (event) => {
                console.log('Emoji selected:', event.emoji);
                if (currentSoundId && currentSoundData) {
                    setEmoji(event.emoji);
                }
            });
            console.log("Picmo emoji picker initialized.");
        } catch (error) {
            console.error("Error initializing Picmo emoji picker:", error);
            emojiPicker = null;
        }
    } else {
        console.error("Picmo or trigger element not found for emoji picker initialization.");
    }
}

function setupEmojiSelection() {
    const trigger = document.getElementById('emoji-picker-trigger');
    const searchInput = document.getElementById('emoji-search-input');
    const clearButton = document.getElementById('clear-emoji-button-settings');

    if (trigger) {
        trigger.addEventListener('click', () => {
            if (emojiPicker) {
                emojiPicker.toggle();
            } else { console.warn("Emoji picker not initialized."); }
        });
    } else { console.error("Emoji picker trigger element not found."); }

     if (searchInput) {
         searchInput.addEventListener('input', () => {
             if (emojiPicker && emojiPicker.isOpen) {
                 emojiPicker.setSearchQuery(searchInput.value);
             } else if (emojiPicker && searchInput.value.length > 0) {
                 emojiPicker.open();
                 setTimeout(() => {
                     if (emojiPicker.isOpen) emojiPicker.setSearchQuery(searchInput.value);
                 }, 100);
             }
         });
         if (emojiPicker) {
             emojiPicker.addEventListener('picker:close', () => searchInput.value = '');
         }
     } else { console.error("Emoji search input not found."); }

     if (clearButton) {
         clearButton.addEventListener('click', clearEmoji);
     } else { console.error("Clear Emoji button (settings) not found."); }
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
            persistence.setSoundSetting(soundPath, 'hasCustomVolume', sliderPos !== 0); // Update persistence flag
            if(window.app) app.updateSoundCardDisplay(currentSoundId);
            currentSoundData.hasCustomVolume = (sliderPos !== 0);
            currentSoundData.sliderPosition = sliderPos;
            if (resetVolumeButton) resetVolumeButton.classList.toggle('hidden', sliderPos === 0);
        } else { console.error("Server failed to update volume."); }
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
            persistence.removeSoundSetting(soundPath, 'hasCustomVolume'); // Remove flag
            persistence.removeSoundSetting(soundPath, 'localVolume'); // Ensure specific values removed if they existed
            persistence.removeSoundSetting(soundPath, 'remoteVolume');
            if(window.app) app.updateSoundCardDisplay(currentSoundId);
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

    resetMenuState(); // Reset visuals first

    fetch(`/api/sounds/${soundId}`)
    .then(response => response.json())
    .then(sound => {
        if (!sound || !sound.id || !sound.path) throw new Error("Sound data not found or invalid (missing id or path).");

        currentSoundData = sound;
        const soundPath = sound.path;
        const savedSoundSettings = persistence.getSoundSettings(soundPath);

        if (soundNameElement) soundNameElement.textContent = sound.name || 'Unknown Sound';
        if (tabNameElement) tabNameElement.textContent = sound.tabName || 'Unknown Tab';
        if (favoriteButton) favoriteButton.classList.toggle('active', savedSoundSettings.favorite ?? sound.isFavorite); // Prioritize saved setting

        // Set color state
        if (colorSelector) {
            colorSelector.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            const color = savedSoundSettings.color || 'default';
            const activeSwatch = colorSelector.querySelector(`.color-swatch[data-color="${color}"]`);
            if (activeSwatch) activeSwatch.classList.add('selected');
        }

        // Set emoji state
        const trigger = document.getElementById('emoji-picker-trigger');
        const clearBtn = document.getElementById('clear-emoji-button-settings');
        const emoji = savedSoundSettings.emoji;
        if (trigger) {
            const currentEmojiSpan = trigger.querySelector('.current-emoji');
            if (emoji) {
                if (currentEmojiSpan) currentEmojiSpan.textContent = emoji;
                if (clearBtn) clearBtn.classList.remove('hidden');
            } else {
                if (currentEmojiSpan) currentEmojiSpan.textContent = '❓';
                if (clearBtn) clearBtn.classList.add('hidden');
            }
        }


        // Set volume slider state (using sliderPosition from API or default 0)
         const sliderPosition = sound.sliderPosition ?? 0; // Use sliderPosition from fetched data if available
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
        currentSoundId = null;
        currentSoundData = null;
        // Close menu on error?
        closeSettingsMenu();
        alert("Failed to load sound details.");
    });
}

// Reset the menu state to default
function resetMenuState() {
    if (!settingsOverlay) return;

    // Reset preview button
    if (previewButton) {
        previewButton.setAttribute('data-state', 'preview');
        const icon = previewButton.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = 'volume_up';
        const text = previewButton.querySelector('.button-text');
        if (text) text.textContent = 'Preview';
    }
    stopPreviewSound(currentPreviewId);
    currentPreviewId = null;

    // Reset volume slider and button
    if (volumeSlider) volumeSlider.value = 0;
    if (resetVolumeButton) resetVolumeButton.classList.add('hidden');

    // Reset favorite button
    if (favoriteButton) favoriteButton.classList.remove('active');

    // Reset color swatches
    const colorSelectorEl = document.getElementById('color-selector');
    if (colorSelectorEl) {
        colorSelectorEl.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        const defaultSwatch = colorSelectorEl.querySelector('.color-swatch[data-color="default"]');
        if (defaultSwatch) defaultSwatch.classList.add('selected');
    }

    // Reset emoji display
    const trigger = document.getElementById('emoji-picker-trigger');
    const clearBtn = document.getElementById('clear-emoji-button-settings');
    if (trigger) {
        const currentEmojiSpan = trigger.querySelector('.current-emoji');
        if (currentEmojiSpan) currentEmojiSpan.textContent = '❓';
    }
    if (clearBtn) clearBtn.classList.add('hidden');
    if (emojiSearchInput) emojiSearchInput.value = ''; // Clear search

    // Clear displayed names
    if (soundNameElement) soundNameElement.textContent = 'Loading...';
    if (tabNameElement) tabNameElement.textContent = '';
}

// Close settings menu
function closeSettingsMenu() {
    if (!settingsOverlay || !settingsCard) return;
    settingsCard.style.transform = 'translateY(100%)';
    if (settingsBackdrop) settingsBackdrop.style.opacity = '0';

    stopPreviewSound(currentPreviewId);
    currentPreviewId = null;
    if (emojiPicker && emojiPicker.isOpen) emojiPicker.close(); // Close emoji picker

    setTimeout(() => {
        settingsOverlay.classList.add('hidden');
        // Don't call resetMenuState here, it clears fields before animation finishes
        currentSoundId = null;
        currentSoundData = null;
        if (settingsCard) settingsCard.style.transform = ''; // Reset for next open
        if (settingsBackdrop) settingsBackdrop.style.opacity = '';
    }, 300);
}

// Helper function to stop preview sound
function stopPreviewSound(playingId) {
     if (playingId) {
         console.log("Stopping preview sound (via general stop)...");
         fetch('/api/sounds/stop', { method: 'POST' })
             .catch(error => console.error('Error stopping preview sound:', error));
     }
}

// Initialize when DOM content is loaded
document.addEventListener('DOMContentLoaded', initSoundSettings);

// Expose openSoundSettings globally
window.soundSettings = { open: openSoundSettings };