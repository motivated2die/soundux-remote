// Soundux Remote Tutorial using Driver.js

// --- Global flag to prevent multiple instances ---
let isTutorialRunning = false;
// --- Global variable to hold the current driver instance ---
let currentDriverInstance = null;
// ---

function initializeTutorialTrigger() {
    // console.log("Attempting to initialize tutorial trigger...");
    const startTutorialButton = document.getElementById('start-tutorial-button');

    if (!startTutorialButton) {
        console.error('Start Tutorial button not found in the DOM yet.');
        return;
    }

    // console.log("Found Start Tutorial button. Attaching listener.");
    startTutorialButton.removeEventListener('click', handleStartTutorialClick);
    startTutorialButton.addEventListener('click', handleStartTutorialClick);
}

function handleStartTutorialClick() {
    // console.log("Start Tutorial button clicked.");

    // --- Prevent starting if already running ---
    if (isTutorialRunning || document.documentElement.classList.contains('driver-active')) {
        console.warn("Tutorial start prevented: Already running or driver active.");
        return;
    }
    // ---

    const appSettingsModalOverlay = document.getElementById('app-settings-modal-overlay');

    const attemptStartTutorial = () => {
        // console.log("Attempting to start tutorial after delay...");
        if (typeof window.driver?.js?.driver === 'function') {
            // console.log("Driver.js is ready. Starting tutorial.");
            startSounduxTutorial(); // Call the main function
        } else {
            console.error('Driver.js library (window.driver.js.driver) is still not defined or not a function when attempting to start!');
            isTutorialRunning = false; // Ensure flag is reset if driver isn't ready
            alert('Tutorial feature could not be loaded. Please check the console.');
        }
    };

    // Close the settings modal first
    if (appSettingsModalOverlay && !appSettingsModalOverlay.classList.contains('hidden')) {
        // console.log("Closing settings modal.");
        const closeButton = document.getElementById('close-app-settings-button');
        if (closeButton) {
            closeButton.click();
            setTimeout(attemptStartTutorial, 150); // Wait for modal animation
        } else {
            console.warn("Could not find close button for settings modal. Attempting to start tutorial immediately.");
            attemptStartTutorial();
        }
    } else {
        // console.log("Settings modal already closed or not found. Attempting to start tutorial directly.");
        attemptStartTutorial();
    }
}


function startSounduxTutorial() {
    console.log("Executing startSounduxTutorial function...");

     // Double check active state before proceeding
     if (isTutorialRunning || document.documentElement.classList.contains('driver-active')) {
        console.warn("startSounduxTutorial called, but tutorial seems already active.");
        return;
    }
     if (currentDriverInstance) {
         console.warn("startSounduxTutorial called, but currentDriverInstance exists. Attempting cleanup first.");
         try { currentDriverInstance.destroy(); } catch (e) { /* ignore */ }
         currentDriverInstance = null;
         isTutorialRunning = false;
         document.documentElement.classList.remove('driver-active'); // Force remove class
     }


    if (typeof window.driver?.js?.driver !== 'function') {
        console.error('Executing startSounduxTutorial, but window.driver.js.driver is unexpectedly not a function!');
        return; // Don't proceed
    }
    const driver = window.driver.js.driver;

    const safeClick = (selector) => {
        const element = document.querySelector(selector);
        if (element && typeof element.click === 'function') {
            element.click();
            return true;
        } else {
            console.warn(`Element not found or not clickable: ${selector}`);
            return false;
        }
    };

    // --- Helper Functions for Sound Settings Panel ---
    const openSoundSettingsPanelVisually = () => {
        console.log("Tutorial: Attempting to visually open sound settings panel...");
        const settingsOverlay = document.getElementById('sound-settings-overlay');
        const settingsCard = document.getElementById('settings-card');
        const settingsBackdrop = document.getElementById('settings-backdrop');

        if (settingsOverlay && settingsCard && settingsBackdrop) {
             settingsCard.style.transition = 'none';
             settingsBackdrop.style.transition = 'none';
             settingsCard.style.transform = 'translateY(100%)';
             settingsBackdrop.style.opacity = '0';
             settingsOverlay.classList.add('hidden');

             settingsOverlay.classList.remove('hidden');
             requestAnimationFrame(() => {
                 settingsCard.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                 settingsBackdrop.style.transition = 'opacity 0.3s ease';
                 settingsBackdrop.style.opacity = '1';
                 settingsCard.style.transform = 'translateY(0)';
                 console.log("Tutorial: Sound settings panel open animation started.");
             });
             return true;
        } else {
            console.error("Tutorial: Failed to find necessary elements for sound settings panel.");
            return false;
        }
    };

    const closeSoundSettingsPanelVisually = () => {
         console.log("Tutorial: Attempting to visually close sound settings panel...");
         const settingsOverlay = document.getElementById('sound-settings-overlay');
         const settingsCard = document.getElementById('settings-card');
         const settingsBackdrop = document.getElementById('settings-backdrop');

         if (settingsOverlay && settingsCard && settingsBackdrop && !settingsOverlay.classList.contains('hidden')) {
              settingsCard.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
              settingsBackdrop.style.transition = 'opacity 0.3s ease';
              settingsCard.style.transform = 'translateY(100%)';
              settingsBackdrop.style.opacity = '0';
              console.log("Tutorial: Sound settings panel close animation started.");

              setTimeout(() => {
                   const currentOverlay = document.getElementById('sound-settings-overlay');
                   if (currentOverlay && !currentOverlay.classList.contains('hidden')) {
                        console.log("Tutorial: Hiding sound settings panel after animation.");
                        currentOverlay.classList.add('hidden');
                        const currentCard = document.getElementById('settings-card');
                        const currentBackdrop = document.getElementById('settings-backdrop');
                        if (currentCard) {
                            currentCard.style.transform = '';
                            currentCard.style.transition = '';
                        }
                        if (currentBackdrop) {
                            currentBackdrop.style.opacity = '';
                            currentBackdrop.style.transition = '';
                        }
                   } else {
                       // console.log("Tutorial: Sound settings panel already hidden or removed before timeout completed.");
                   }
              }, 300);
              return true;
         } else {
              // console.log("Tutorial: Sound settings panel already closed or elements not found.");
              return false;
         }
    };
    // --- End Helper Functions ---

    // Define the driver instance configuration first
    const driverConfig = {
        stageRadius: 5,
        showProgress: true,
        allowClose: true,
        disableActiveInteraction: true,
        popoverClass: 'soundux-driver-popover',
        // --- Central Cleanup Hook ---
        onDestroyStarted: () => {
             console.log("--- Tutorial onDestroyStarted Hook Fired ---");
             // *** Use flag to prevent double execution ***
             if (!isTutorialRunning) {
                console.warn("onDestroyStarted called, but tutorial flag was already false. Skipping cleanup and destroy.");
                return; // Exit early if already processed
             }
             isTutorialRunning = false; // Set flag immediately on first run

             // Perform custom cleanup
             console.log("Tutorial Cleanup: Checking edit mode...");
             if (document.body.classList.contains('edit-mode-active')) {
                 if(safeClick('#edit-mode-button')) {
                    console.log("Tutorial Cleanup: Exited edit mode.");
                 } else {
                    console.warn("Tutorial Cleanup: Failed to exit edit mode via click.");
                 }
             }

             console.log("Tutorial Cleanup: Checking sound settings panel...");
             closeSoundSettingsPanelVisually();
             console.log("Tutorial Cleanup: Initiated sound settings panel close.");

             // *** Attempt manual destruction ***
             if (currentDriverInstance) {
                 console.log("Tutorial Cleanup: Attempting manual driver destroy()...");
                 try {
                     // Important: Call destroy on the *captured* instance
                     currentDriverInstance.destroy();
                     currentDriverInstance = null; // Clear the global reference
                     console.log("Tutorial Cleanup: Manual destroy() called successfully.");
                 } catch (e) {
                     console.error("Error calling driver destroy():", e);
                     // Force cleanup of class just in case destroy failed internally
                     document.documentElement.classList.remove('driver-active');
                     currentDriverInstance = null; // Clear ref even on error
                 }
             } else {
                 console.warn("onDestroyStarted: currentDriverInstance is null, cannot manually destroy.");
                 // Force cleanup of class as fallback
                 document.documentElement.classList.remove('driver-active');
             }

             console.log("--- Tutorial onDestroyStarted Hook Finished ---");
        },
        // --- Step Definitions ---
        steps: [
             // Step 1: Welcome
             { popover: { title: 'Welcome to Soundux Remote!', description: 'This quick tour will guide you through the main features. Click "Next" to begin.', side: "left", align: 'start' } },
             // Step 2: Playing Sounds
             { element: '#sounds-container', popover: { title: 'Playing Sounds', description: 'This is your sound grid. Simply tap any button to play the corresponding sound on your computer.', side: "top", align: 'center' } },
             // Step 3: Stop All Button
             { element: '#stop-all', popover: { title: 'Stop All Sounds', description: 'Need to stop playback? Tap this button to stop all sounds currently playing.', side: "left", align: 'start' } },
             // Step 4: Talk-Through Button
             { element: '#talk-through-button', popover: { title: 'Push-to-Talk', description: 'Hold this button to temporarily pause playback and talk through your default microphone output.', side: "top", align: 'center' } },
             // Step 5: Sound Tabs
             { element: '#tabs-container', popover: { title: 'Sound Tabs', description: 'Tabs from the desktop app get shown here. Tap a tab name to switch between different pages of sounds, or simply swipe left and right.', side: "top", align: 'center' } },
             // Step 6: Edit Mode Button
             { element: '#edit-mode-button', popover: { title: 'Edit Mode', description: 'Tap this button to enter Edit Mode for customizing sounds and rearranging the layout.', side: "bottom", align: 'center' } },
             // Step 7: Top Bar Overview (Edit Mode Active)
             {
                 element: '.top-bar',
                 popover: { title: 'Edit mode controls', description: 'When in edit mode, tap on any sound to edit it, toggle through layout options or rearrange buttons via drag & drop.', side: "bottom", align: 'center' },
                 userData: { enteredEditMode: false },
                 onHighlightStarted: (element, step, { config, state }) => {
                     // console.log("Step 7: Entering edit mode for highlight...");
                     if (!document.body.classList.contains('edit-mode-active')) {
                         if (safeClick('#edit-mode-button')) { step.userData.enteredEditMode = true; }
                         else { console.warn("Failed to enter edit mode for Step 7."); step.userData.enteredEditMode = false; }
                     } else { step.userData.enteredEditMode = false; }
                 },
                 onDeselected: (element, step, { config, state }) => {
                     // console.log("Step 7: Exiting edit mode after highlight...");
                     if (step.userData?.enteredEditMode) {
                         if (document.body.classList.contains('edit-mode-active')) { safeClick('#edit-mode-button'); }
                     }
                     step.userData.enteredEditMode = false;
                     closeSoundSettingsPanelVisually();
                 },
                 onNextClick: (element, step, { config, state }) => {
                     // console.log("Step 7: onNextClick -> Opening sound settings panel for Step 8.");
                     openSoundSettingsPanelVisually();
                 }
             },
             // Step 8: Sound Settings Panel
             {
                 element: '#settings-card',
                 popover: { title: 'Sound Settings', description: 'Here you can customize and preview individual sounds: toggle favorites, adjust volume, change button color, and add an emoji background.', side: "top", align: 'center' },
                 onHighlightStarted: (element, step, { config, state }) => {
                     // console.log("Step 8: Highlighting #settings-card.");
                      const settingsOverlay = document.getElementById('sound-settings-overlay');
                      if (!settingsOverlay || settingsOverlay.classList.contains('hidden')) {
                          console.warn("Step 8 onHighlightStarted: Sound settings panel is NOT visible! Attempting recovery open.");
                          openSoundSettingsPanelVisually();
                      }
                 },
                 onDeselected: (element, step, { config, state }) => {
                     // console.log("Step 8: onDeselected -> Closing sound settings panel.");
                     closeSoundSettingsPanelVisually();
                 }
             },
             // Step 9: Final Step
             {
                 popover: { title: 'Tour Complete!', description: 'You\'ve learned the basics of Soundux Remote. Edit mode is still on, so feel free to explore and customize and press the ✅ when you\'re done!', side: "top", align: 'center' }
             }
        ]
    }; // End driverConfig definition

    // Create the instance using the config and store it globally
    currentDriverInstance = driver(driverConfig);

    // --- Start the tour ---
    try {
        if (document.documentElement.classList.contains('driver-active')) {
             console.warn("Tutorial already active (driver-active class found), preventing new tour start.");
             isTutorialRunning = true; // Sync flag
             // Attempt cleanup of potential zombie instance
             if (currentDriverInstance) { try { currentDriverInstance.destroy(); } catch(e){} }
             currentDriverInstance = null;
             document.documentElement.classList.remove('driver-active');
             isTutorialRunning = false;
             return; // Prevent starting a new one immediately
        }
        console.log("Calling driver drive()...");
        isTutorialRunning = true; // Set flag *before* starting
        currentDriverInstance.drive(); // Start the tour!
    } catch (e) {
        console.error("Error starting Driver.js tour:", e);
        isTutorialRunning = false; // Reset flag on error
        if (currentDriverInstance) {
            try { currentDriverInstance.destroy(); } catch(err){} // Attempt cleanup on error too
        }
        currentDriverInstance = null; // Clear ref on error
        document.documentElement.classList.remove('driver-active'); // Force remove class
        alert("An error occurred while starting the tutorial. Please check the browser console.");
    }
} // End startSounduxTutorial function

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Content Loaded. Initializing tutorial trigger.");
    initializeTutorialTrigger();
    // Check initial state more carefully
    if (document.documentElement.classList.contains('driver-active')) {
        console.warn("DOM loaded, tutorial seems active from previous state (driver-active class found). Resetting state.");
        // Force cleanup if class exists but JS state might be reset
        document.documentElement.classList.remove('driver-active');
        isTutorialRunning = false;
        currentDriverInstance = null;
        // Also ensure panels are hidden
         const settingsOverlay = document.getElementById('sound-settings-overlay');
         if (settingsOverlay && !settingsOverlay.classList.contains('hidden')) {
             settingsOverlay.classList.add('hidden');
             console.log("Cleaned up visible sound settings panel on load.");
         }
          if (document.body.classList.contains('edit-mode-active')) {
              safeClick('#edit-mode-button');
              console.log("Cleaned up active edit mode on load.");
          }
    } else {
        isTutorialRunning = false; // Ensure flag is false if class isn't present
        currentDriverInstance = null;
    }
});