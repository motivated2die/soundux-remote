// Soundux Remote Tutorial using Driver.js

// --- Immediate Check ---
console.log(`[Tutorial.js Executing] typeof window.driver?.js?.driver: ${typeof window.driver?.js?.driver}`);
// --- End Immediate Check ---

function initializeTutorialTrigger() {
    console.log("Attempting to initialize tutorial trigger...");
    const startTutorialButton = document.getElementById('start-tutorial-button');

    if (!startTutorialButton) {
        console.error('Start Tutorial button not found in the DOM yet.');
        return;
    }

    console.log("Found Start Tutorial button. Attaching listener.");
    startTutorialButton.removeEventListener('click', handleStartTutorialClick);
    startTutorialButton.addEventListener('click', handleStartTutorialClick);
}

function handleStartTutorialClick() {
    console.log("Start Tutorial button clicked.");
    const appSettingsModalOverlay = document.getElementById('app-settings-modal-overlay');

    // Function to start the tutorial after a delay (for modal close animation)
    const attemptStartTutorial = () => {
        console.log("Attempting to start tutorial after delay...");
        // Check if driver is ready *now* using the correct path
        if (typeof window.driver?.js?.driver === 'function') {
            console.log("Driver.js is ready. Starting tutorial.");
            startSounduxTutorial();
        } else {
            console.error('Driver.js library (window.driver.js.driver) is still not defined or not a function when attempting to start!');
            alert('Tutorial feature could not be loaded. Please check the console.');
        }
    };

    // Close the settings modal first
    if (appSettingsModalOverlay && !appSettingsModalOverlay.classList.contains('hidden')) {
        console.log("Closing settings modal.");
        const closeButton = document.getElementById('close-app-settings-button');
        if (closeButton) {
            closeButton.click();
            // Wait a moment for modal to close *before* starting
            setTimeout(attemptStartTutorial, 150);
        } else {
            console.warn("Could not find close button for settings modal. Attempting to start tutorial immediately.");
            attemptStartTutorial(); // Try starting immediately
        }
    } else {
        console.log("Settings modal already closed or not found. Attempting to start tutorial directly.");
        attemptStartTutorial(); // Try starting immediately
    }
}


function startSounduxTutorial() {
    console.log("Executing startSounduxTutorial function...");

    if (typeof window.driver?.js?.driver !== 'function') {
        console.error('Executing startSounduxTutorial, but window.driver.js.driver is unexpectedly not a function!');
        return;
    }
    const driver = window.driver.js.driver; // Get the actual driver function


    // Helper function to safely click elements
    const safeClick = (selector) => {
        const element = document.querySelector(selector);
        if (element && typeof element.click === 'function') {
            console.log(`Safely clicking element: ${selector}`);
            element.click();
            return true;
        } else {
            console.warn(`Element not found or not clickable: ${selector}`);
            return false;
        }
    };

    // Helper function to ensure element is visible (basic check)
    // (Not currently needed with the revised steps, but keep for potential future use)
    // const ensureVisible = (selector) => {
    //      const element = document.querySelector(selector);
    //      if (element) {
    //          element.classList.remove('hidden');
    //          console.log(`Ensured visibility for: ${selector}`);
    //      } else {
    //          console.warn(`Element not found for visibility check: ${selector}`);
    //      }
    // };

    const driverObj = driver({
        // --- Configuration Changes ---
        stageRadius: 5, // Set cutout radius
        // --- End Configuration Changes ---
        showProgress: true,
        allowClose: true,
        popoverClass: 'soundux-driver-popover',
        steps: [
            // Step 1: Welcome (Original Step 1)
            {
                popover: {
                    title: 'Welcome to Soundux Remote!',
                    description: 'This quick tour will guide you through the main features. Click "Next" to begin.',
                    side: "top", align: 'center'
                }
            },
            // Step 2: Playing Sounds (Original Step 2)
            {
                element: '#sounds-container',
                popover: { title: 'Playing Sounds', description: 'This is your sound grid. Simply tap any button to play the corresponding sound on your computer.', side: "top", align: 'center' }
            },
            // Step 3: Stop All Button (Original Step 3)
            {
                element: '#stop-all',
                popover: { title: 'Stop All Sounds', description: 'Need to stop playback? Tap this button to stop all sounds currently playing.', side: "left", align: 'center' }
            },
            // Step 4: Talk-Through Button (Moved from Step 9)
            {
                element: '#talk-through-button',
                popover: { title: 'Push-to-Talk', description: 'Hold this button to temporarily pause playback and talk through your default microphone output.', side: "top", align: 'center' }
            },
            // Step 5: Sound Tabs (Original Step 4 - Updated Text)
            {
                element: '#tabs-container',
                popover: { title: 'Sound Tabs', description: 'Tabs from the desktop app get shown here. Tap a tab name to switch between different pages of sounds, or simply swipe left and right.', side: "top", align: 'center' }
            },
            // Step 6: Edit Mode Button
            {
                element: '#edit-mode-button',
                popover: { 
                    title: 'Edit Mode', 
                    description: 'Tap this button to enter Edit Mode for customizing sounds and rearranging the layout.', 
                    side: "bottom", 
                    align: 'center' 
                }
            },
            // Step 7: Top Bar Overview
            {
                element: '.top-bar',
                popover: {
                    title: 'Edit mode controls',
                    description: 'When in edit mode, tap on any sound to edit it, toggle through layout options or rearrange buttons via drag & drop.',
                    side: "bottom",
                    align: 'center'
                },
                onHighlightStarted: () => {
                    console.log("Step 7: Opening Sound Settings...");
                    // Ensure edit mode is active
                    if (!document.body.classList.contains('edit-mode-active')) {
                        if (!safeClick('#edit-mode-button')) {
                            console.warn("Failed to enter edit mode.");
                            return;
                        }
                    }
                },
                onDeselected: () => {
                    console.log("Step 7: Closing Edit Mode Settings...");
                    if (document.body.classList.contains('edit-mode-active')) {
                        safeClick('#edit-mode-button');
                    }
                }
            },
            // Step 8: Sound Settings Panel
            {
                element: '#settings-card',
                popover: { 
                    title: 'Sound Settings', 
                    description: 'Here you can customize individual sounds: toggle favorites, adjust volume, change button color, and add an emoji background.', 
                    side: "left", 
                    align: 'center' 
                },
                onHighlightStarted: () => {
                    console.log("Step 8: Opening Sound Settings...");
                    const settingsOverlay = document.getElementById('sound-settings-overlay');
                        if (settingsOverlay) {
                            settingsOverlay.classList.remove('hidden');
                    }
                },
                onDeselected: () => {
                    console.log("Step 8: Closing Sound Settings...");
                    const settingsOverlay = document.getElementById('sound-settings-overlay');
                        if (settingsOverlay) {
                            settingsOverlay.classList.add('hidden');
                    }
                }
            },
            // Step 9: App Settings Button (Original Step 8)
            {
                element: '#app-settings-button',
                popover: { title: 'App Settings', description: 'Access general application settings, manage layouts, and find this tutorial again here.', side: "bottom", align: 'center' },
            },
             // Step 10: Final Step (Original Step 13)
            {
                popover: { title: 'Tour Complete!', description: 'You\'ve learned the basics of Soundux Remote. Feel free to explore and customize!', side: "top", align: 'center' }
            }
        ]
    });

    try {
        console.log("Calling driverObj.drive()...");
        driverObj.drive(); // Start the tour!
    } catch (e) {
        console.error("Error starting Driver.js tour:", e);
        alert("An error occurred while starting the tutorial. Please check the browser console.");
    }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Content Loaded. Initializing tutorial trigger.");
    initializeTutorialTrigger();

    // Fallback initialization attempt after a delay
    setTimeout(initializeTutorialTrigger, 1000);

    console.log(`[Tutorial.js DOMContentLoaded] typeof window.driver?.js?.driver: ${typeof window.driver?.js?.driver}`);
});
