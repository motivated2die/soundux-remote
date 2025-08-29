
// Tab swiping functionality

// --- NEW: Declare state variable in the script's scope ---
let isTabSwiping = false; // Flag set true during active horizontal swipe gesture

// --- NEW: Define getter function in the script's scope ---
const isCurrentlyTabSwiping = () => isTabSwiping;

function initTabSwiping() {
    // --- MODIFIED: Target the sounds grid specifically for swiping ---
    const swipeArea = document.getElementById('sounds-container');
    const tabsContainer = document.getElementById('tabs-container');
    // Reference the wrapper element, ensure it exists
    const contentWrapper = document.getElementById('tab-content-wrapper');

    // Add checks for essential elements
    if (!swipeArea) {
        console.error("Tab Swiping Init Error: Sounds container ('sounds-container') not found.");
        return;
    }
    if (!tabsContainer) {
        console.error("Tab Swiping Init Error: Tabs container ('tabs-container') not found.");
        return;
    }
     if (!contentWrapper) {
         console.error("Tab Swiping Init Error: Content wrapper ('tab-content-wrapper') not found.");
         return;
     }

    let touchStartX = 0;
    let touchStartY = 0;
    let touchCurrentX = 0;
    let isSwiping = false; // Tracks horizontal swipe determination (local to init)
    let tabs = [];

    function getTabsInfo() {
        tabs = Array.from(tabsContainer.querySelectorAll('.tab'));
        const currentTabIndex = tabs.findIndex(tab => tab.classList.contains('active'));
        return {
            tabs,
            currentTabIndex: currentTabIndex === -1 ? 0 : currentTabIndex
        };
    }

    // Track swipe gestures with improved handling
    swipeArea.addEventListener('touchstart', (e) => {
        if (typeof editMode !== 'undefined' && editMode.isActive()) {
            return; // Disable swipe in edit mode
        }
        if (e.touches.length > 1) return; // Ignore multi-touch

        touchStartX = touchCurrentX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
        isSwiping = false; // Reset local determination flag
        isTabSwiping = false; // Reset GLOBAL flag on new touch start
        contentWrapper.style.transition = 'none';
        // Reset swipe-active class immediately if present
        if (contentWrapper.classList.contains('swipe-active')) {
            contentWrapper.classList.remove('swipe-active');
        }
    }, { passive: true });

    swipeArea.addEventListener('touchmove', (e) => {
        if (typeof editMode !== 'undefined' && editMode.isActive()) {
            return; // Disable swipe in edit mode
        }
        if (e.touches.length > 1) return; // Ignore multi-touch

        const touchX = e.changedTouches[0].screenX;
        const touchY = e.changedTouches[0].screenY;
        const deltaX = touchX - touchStartX;
        const deltaY = touchY - touchStartY;

        // Determine if this is a horizontal swipe (after some movement)
        // Check only once per gesture using the local 'isSwiping' flag
        if (isSwiping === false && Math.abs(deltaX) > 10) {
            if (Math.abs(deltaX) > Math.abs(deltaY) * 1.5) { // Horizontal threshold
                 isSwiping = true; // Mark as determined (horizontal)
                 isTabSwiping = true; // Set the GLOBAL flag
                 contentWrapper.classList.add('swipe-active'); // Add class for CSS hiding
                 // console.log("Tab swipe detected (horizontal)"); // Debug
            } else {
                 // It's determined to be vertical or not a swipe
                 isSwiping = null; // Mark as determined (not horizontal), use null to prevent re-check
                 isTabSwiping = false; // Ensure GLOBAL flag is false
                 // console.log("Swipe determined as vertical or insufficient"); // Debug
            }
        }

        // Use the GLOBAL isTabSwiping flag here
        if (isTabSwiping) {
            // Only prevent default and apply transform if actively tab swiping
            e.preventDefault();
            touchCurrentX = touchX;
            contentWrapper.style.transform = `translateX(${deltaX}px)`;
        }
    }, { passive: false }); // Keep passive: false for preventDefault

    swipeArea.addEventListener('touchend', (e) => {
        // Read the global flag *before* potentially resetting it
        const wasTabSwiping = isTabSwiping;

        // Reset flags after processing
        isSwiping = false; // Reset local determination flag for next touch
        isTabSwiping = false; // Reset GLOBAL flag

        // Always remove the swipe-active class on touchend
        if (contentWrapper.classList.contains('swipe-active')) {
             contentWrapper.classList.remove('swipe-active');
        }

        // Only proceed with swipe logic if it *was* a tab swipe
        if (!wasTabSwiping) return;

        const deltaX = touchCurrentX - touchStartX;
        const absDeltaX = Math.abs(deltaX);

        // Check threshold and trigger swipe animation/logic
        if (absDeltaX > 80) {
            // Use non-blocking setTimeout to allow UI to settle before handleSwipe
            setTimeout(() => {
                 // Apply animation smoothly
                 contentWrapper.style.transition = 'transform 0.2s ease-out';
                 contentWrapper.style.transform = `translateX(${deltaX > 0 ? '100%' : '-100%'})`;
                 // Call handleSwipe AFTER animation likely starts
                 handleSwipe(deltaX);
            }, 0); // Execute after current event loop finishes

        } else {
            // Return to center if not enough swipe
            contentWrapper.style.transition = 'transform 0.2s ease-out';
            contentWrapper.style.transform = '';
            // Clean up transition/transform after animation
            setTimeout(() => {
                 if (!isTabSwiping) { // Check flag again in case of rapid new touch
                     contentWrapper.style.transition = '';
                     contentWrapper.style.transform = '';
                 }
            }, 200);
        }

        // Reset start coordinates (moved from touchend start)
        touchStartX = 0;
        touchCurrentX = 0;

    });

     // Add touchcancel handler to reset state like touchend
     swipeArea.addEventListener('touchcancel', (e) => {
         // console.log("Tab swipe touch cancelled"); // Debug
         isSwiping = false;
         isTabSwiping = false;
         if (contentWrapper.classList.contains('swipe-active')) {
              contentWrapper.classList.remove('swipe-active');
         }
         // Reset visual state if cancelled mid-drag
         contentWrapper.style.transition = 'transform 0.2s ease-out';
         contentWrapper.style.transform = '';
         setTimeout(() => {
              contentWrapper.style.transition = '';
              contentWrapper.style.transform = '';
         }, 200);
         touchStartX = 0;
         touchCurrentX = 0;
     });

    function handleSwipe(deltaX) {
        const { tabs, currentTabIndex } = getTabsInfo();
        if (tabs.length <= 1) return;

        const swipeDirection = deltaX > 0 ? 'right' : 'left';

        // Determine the target index
        let newIndex;
        if (swipeDirection === 'right') {
            newIndex = tabs[currentTabIndex - 1] ? currentTabIndex - 1 : tabs.length - 1;
        } else {
            newIndex = tabs[currentTabIndex + 1] ? currentTabIndex + 1 : 0;
        }

        // Action after the slide-out animation completes (approx 200ms)
        setTimeout(() => {
            if (tabs[newIndex]) {
                // --- Hide search bar immediately BEFORE triggering tab change ---
                // Check existence of searchManager and the function
                if (window.searchManager && typeof window.searchManager.hideImmediately === 'function') {
                    window.searchManager.hideImmediately();
                } else {
                    // Log warning only if searchManager exists but function doesn't
                    if (window.searchManager) {
                        console.warn("Search Manager hideImmediately function not found during tab swipe.");
                    }
                    // Otherwise, searchManager might not be initialized yet, which is ok early on.
                }
                // --- END Hiding Search Bar ---

                // Trigger the tab change
                tabs[newIndex].click();

                // Reset transform and apply fast fade-in for the new content
                contentWrapper.style.transition = 'none'; // Turn off transition for immediate reset
                contentWrapper.style.transform = '';    // Reset position
                contentWrapper.style.opacity = '0';     // Make invisible before fade

                // Force reflow/repaint might be needed for opacity reset on some browsers
                void contentWrapper.offsetWidth;

                // Apply fade-in transition
                requestAnimationFrame(() => { // Use rAF for smoother transition start
                    contentWrapper.style.transition = 'opacity 150ms ease-in';
                    contentWrapper.style.opacity = '1';
                     // Clean up transition style after it finishes
                     setTimeout(() => {
                          contentWrapper.style.transition = '';
                     }, 150);
                });

            } else {
                 // If no valid new tab, just reset the transform
                 contentWrapper.style.transition = 'transform 0.2s ease-out';
                 contentWrapper.style.transform = '';
                 setTimeout(() => { contentWrapper.style.transition = ''; }, 200);
            }
        }, 200); // Delay matches the swipe animation duration
    }


    function scrollActiveTabIntoView() {
        const activeTab = tabsContainer.querySelector('.tab.active');
        if (activeTab) {
            activeTab.scrollIntoView({
                behavior: 'smooth',
                inline: 'center',
                block: 'nearest'
            });
        }
    }

    // Observer for active class change to trigger scroll
    const tabClassObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.attributeName === 'class' && mutation.target.classList.contains('active')) {
                // Use a slightly longer delay to ensure layout is stable after tab load
                setTimeout(scrollActiveTabIntoView, 150);
            }
        });
    });

    // Initial setup: Observe existing tabs
    const { tabs: initialTabs } = getTabsInfo();
    initialTabs.forEach(tab => {
        tabClassObserver.observe(tab, { attributes: true });
    });

    // Initial scroll after a short delay to allow layout stabilization
    setTimeout(scrollActiveTabIntoView, 500); // Increased delay

    console.log("Tab Swiping Initialized."); // Log success
}

// Initialize the swipe functionality when the DOM is loaded
document.addEventListener('DOMContentLoaded', initTabSwiping);

// --- NEW: Expose the getter function globally ---
window.tabManager = {
    isCurrentlySwiping: isCurrentlyTabSwiping
};