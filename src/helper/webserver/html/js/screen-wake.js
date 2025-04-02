const screenWakeLock = (() => {
    // Check if NoSleep constructor exists (loaded from CDN)
    if (typeof NoSleep === 'undefined') {
        console.error('NoSleep.js library not found. Wake Lock functionality disabled.');
        // Update UI elements to reflect permanent failure
        const indicator = document.getElementById('wake-lock-indicator');
        const toggleInput = document.getElementById('wake-lock-toggle');
        const toggleLabel = document.getElementById('wake-lock-toggle-label');
        const toggleContainer = document.getElementById('wake-lock-toggle-label-container');
        if (indicator) {
            indicator.textContent = 'disabled_visible';
            indicator.title = 'Wake Lock library failed to load';
            indicator.classList.add('failed');
            indicator.style.cursor = 'default';
        }
        if (toggleInput) toggleInput.disabled = true;
        if (toggleLabel) toggleLabel.textContent = "Browser doesn't allow Wake-Lock";
        if (toggleContainer) toggleContainer.classList.add('disabled');
        return { init: () => {}, request: () => {}, release: () => {}, isActive: () => false };
    }

    const noSleep = new NoSleep();
    let wakeLockIndicator = null;
    let wakeLockToggle = null;
    let wakeLockToggleLabel = null;
    let wakeLockToggleContainer = null;

    let isEnabled = false; // Tracks if NoSleep is *currently* enabled
    let enableFailed = false; // Tracks if enabling failed permanently
    // No longer need userInteracted flag, we tie enable directly to the first *enabling* action

    const WAKE_LOCK_INDICATOR_ID = 'wake-lock-indicator';
    const WAKE_LOCK_TOGGLE_ID = 'wake-lock-toggle';
    const WAKE_LOCK_TOGGLE_LABEL_ID = 'wake-lock-toggle-label';
    const WAKE_LOCK_TOGGLE_CONTAINER_ID = 'wake-lock-toggle-label-container';

    // --- Core Enable/Disable Logic ---

    // Tries to enable NoSleep. MUST be called directly from a user interaction handler.
    const tryEnableNoSleep = async () => {
        if (enableFailed || isEnabled) return; // Don't try if failed or already enabled

        try {
            // *** Direct call to noSleep.enable() ***
            await noSleep.enable();
            console.log('NoSleep.js enabled successfully.');
            isEnabled = true;
            enableFailed = false; // Reset failed state on success
            updateUI(); // Update both indicator and toggle
        } catch (err) {
            console.error(`NoSleep.js enable failed: ${err}`);
            isEnabled = false;
            enableFailed = true; // Set failed state permanently on first failure
            updateUI(); // Update both indicator and toggle to show failure
        }
    };

    // Disables NoSleep. Can be called anytime.
    const disableNoSleep = () => {
        if (enableFailed || !isEnabled) return; // Don't try if failed or already disabled

        if (!noSleep.isEnabled) {
             console.log('NoSleep.js already disabled internally.');
             isEnabled = false;
             updateUI();
             return;
        }

        try {
            noSleep.disable();
            console.log('NoSleep.js disabled.');
            isEnabled = false;
            updateUI();
        } catch (err) {
            console.error(`NoSleep.js disable failed: ${err}`);
            isEnabled = false;
            updateUI();
        }
    };

    // --- UI Update Logic ---

    // Updates both the indicator and the settings toggle based on state
    const updateUI = () => {
        // Update Header Indicator
        if (wakeLockIndicator) {
            wakeLockIndicator.classList.remove('active', 'failed');
            if (enableFailed) {
                wakeLockIndicator.textContent = 'disabled_visible';
                wakeLockIndicator.title = 'Screen Lock Prevention Failed/Unavailable';
                wakeLockIndicator.classList.add('failed');
                wakeLockIndicator.style.cursor = 'default';
            } else if (isEnabled) {
                wakeLockIndicator.textContent = 'visibility';
                wakeLockIndicator.title = 'Screen Lock Prevention Active (Click to disable)';
                wakeLockIndicator.classList.add('active');
                wakeLockIndicator.style.cursor = 'pointer';
            } else {
                wakeLockIndicator.textContent = 'visibility_off';
                wakeLockIndicator.title = 'Screen Lock Prevention Inactive (Click to enable)';
                wakeLockIndicator.style.cursor = 'pointer';
            }
        }

        // Update Settings Toggle
        if (wakeLockToggle && wakeLockToggleLabel && wakeLockToggleContainer) {
            wakeLockToggleContainer.classList.remove('disabled');
            if (enableFailed) {
                wakeLockToggle.checked = false;
                wakeLockToggle.disabled = true;
                wakeLockToggleLabel.textContent = "Browser doesn't allow Wake-Lock";
                wakeLockToggleContainer.classList.add('disabled');
            } else {
                wakeLockToggle.disabled = false;
                wakeLockToggle.checked = isEnabled; // Mirror the current state
                wakeLockToggleLabel.textContent = "Prevent Screen Lock";
            }
        }
    };

    // --- Initialization and Event Listeners ---

    const init = () => {
        // Get references
        wakeLockIndicator = document.getElementById(WAKE_LOCK_INDICATOR_ID);
        wakeLockToggle = document.getElementById(WAKE_LOCK_TOGGLE_ID);
        wakeLockToggleLabel = document.getElementById(WAKE_LOCK_TOGGLE_LABEL_ID);
        wakeLockToggleContainer = document.getElementById(WAKE_LOCK_TOGGLE_CONTAINER_ID);

        if (!wakeLockIndicator) console.error(`Wake Lock Indicator element not found.`);
        if (!wakeLockToggle || !wakeLockToggleLabel || !wakeLockToggleContainer) console.error(`Wake Lock toggle elements not found.`);

        // Set initial UI state (inactive, not failed)
        updateUI();

        // Re-enable NoSleep when page becomes visible again (if it was enabled before and hasn't failed)
        // Note: NoSleep.js might handle this internally, but this adds robustness
        document.addEventListener('visibilitychange', () => {
            if (!enableFailed && isEnabled && document.visibilityState === 'visible') {
                console.log('Page became visible, attempting to re-enable NoSleep.js.');
                // We don't call tryEnableNoSleep directly here as it might not be a user interaction context
                // Instead, rely on NoSleep's internal handling or the user clicking again if needed.
                // If NoSleep *was* enabled, we assume it should still be. If it got disabled by browser,
                // the user would need to interact again anyway. Let's just ensure UI is correct.
                if (!noSleep.isEnabled) {
                    console.warn("NoSleep was expected to be enabled but wasn't. Re-attempting.");
                    // Re-attempting here might fail if not in user context.
                    // Best approach might be to just update UI to reflect it's off now.
                    isEnabled = false;
                    updateUI();
                } else {
                    console.log("NoSleep still enabled internally on visibility change.");
                }
            }
        });

        // Add click listener to the indicator icon
        if (wakeLockIndicator) {
            wakeLockIndicator.addEventListener('click', () => {
                if (enableFailed) return; // Do nothing if failed

                if (isEnabled) {
                    disableNoSleep(); // Disable if currently enabled
                } else {
                    // *** Directly call tryEnableNoSleep from the click handler ***
                    tryEnableNoSleep();
                }
            });
        }

        // Add change listener to the settings toggle
        if (wakeLockToggle) {
            wakeLockToggle.addEventListener('change', () => {
                if (enableFailed) return; // Should be disabled, but double-check

                if (wakeLockToggle.checked) {
                     // *** Directly call tryEnableNoSleep from the change handler ***
                    tryEnableNoSleep();
                } else {
                    disableNoSleep(); // Disable if unchecked
                }
            });
        }
    };

    // Public interface (less relevant now, but keep for consistency)
    return {
        init,
        request: tryEnableNoSleep, // Map request to enable attempt
        release: disableNoSleep, // Map release to disable
        isActive: () => isEnabled && !enableFailed,
    };
})();

// Initialize the wake lock module after the DOM is ready
document.addEventListener('DOMContentLoaded', screenWakeLock.init);
