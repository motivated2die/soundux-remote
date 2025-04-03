// --- NEW FILE START ---
const searchManager = (() => {
    // --- DOM Elements ---
    let searchContainerEl = null;
    let searchInputEl = null;
    let searchButtonEl = null;
    let soundsContainerEl = null;
    let topBarEl = null; // Needed for height calculation

    // --- State ---
    let isVisible = false;
    let isDragging = false;
    let isEligibleToOpen = false;
    let startY = 0;
    let currentY = 0;
    let searchBarHeight = 50; // Default, update dynamically
    let topBarHeight = 35; // Default, update dynamically
    let allSounds = [];
    let fuse = null;
    const dragThreshold = 30; // Min pixels to drag to trigger open/close

    // --- Initialization ---
    function init() {
        searchContainerEl = document.getElementById('search-bar-container');
        searchInputEl = document.getElementById('search-input');
        searchButtonEl = document.getElementById('search-clear-close-button');
        soundsContainerEl = document.getElementById('sounds-container');
        topBarEl = document.getElementById('top-bar');

        if (!searchContainerEl || !searchInputEl || !searchButtonEl || !soundsContainerEl || !topBarEl) {
            console.error("Search Bar init failed: Could not find all required elements.");
            return;
        }

        // Get dynamic heights
        searchBarHeight = searchContainerEl.offsetHeight;
        topBarHeight = topBarEl.offsetHeight;
        if (searchBarHeight === 0) searchBarHeight = 50; // Fallback
        if (topBarHeight === 0) topBarHeight = 35; // Fallback


        // Use appReady event to ensure allSounds is available
        document.addEventListener('appReady', loadAllSoundsData, { once: true });

        setupEventListeners();
        updateButtonIcon(); // Set initial icon state
        console.log("Search Manager Initialized");

        // Expose the unfocus function globally via window.app
        // Ensure window.app exists (app.js should create it)
        if (!window.app) window.app = {};
        window.app.unfocusSearchInput = unfocusInput;
    }

    // --- Input Control ---
    function unfocusInput() {
        if (searchInputEl) {
            searchInputEl.blur(); // Blurring the input usually closes the mobile keyboard
            console.log("Search input blurred via unfocusInput()");
        }
    }

    async function loadAllSoundsData() {
        console.log("Search Manager: appReady received, attempting to load all sounds.");
        // Check if data is already loaded by app.js (preferred)
        if (window.state && window.state.allSounds && window.state.allSounds.length > 0) {
             allSounds = window.state.allSounds;
             console.log(`Search Manager: Using pre-loaded sounds (${allSounds.length}).`);
             initializeFuse();
        } else if (window.app && typeof window.app.getAllSoundsData === 'function') {
             // Fallback: Ask app.js to fetch if not pre-loaded
             console.log("Search Manager: Requesting all sounds data from app.js.");
             try {
                 allSounds = await window.app.getAllSoundsData(); // Ensure app.js exposes this
                 console.log(`Search Manager: Received sounds from app.js (${allSounds.length}).`);
                 initializeFuse();
             } catch (error) {
                 console.error("Search Manager: Failed to get all sounds data from app.js:", error);
                 // Disable search? Show error?
             }
        } else {
             console.error("Search Manager: Cannot get all sounds data. window.state.allSounds or window.app.getAllSoundsData not available.");
        }
    }


    function initializeFuse() {
         if (allSounds.length === 0) {
             console.warn("Fuse.js not initialized: No sounds data available.");
             return;
         }
         const options = {
             includeScore: false, // Don't need score
             includeMatches: false, // Don't need match details
             shouldSort: true, // Sort by relevance
             threshold: 0.3, // Fuzziness level (0=exact, 1=match anything) - adjust as needed
             location: 0,
             distance: 100,
             maxPatternLength: 32,
             minMatchCharLength: 2, // Minimum characters to match
             keys: [
                 "name" // Search only by sound name
             ]
         };
         fuse = new Fuse(allSounds, options);
         console.log("Fuse.js initialized.");
    }


    function setupEventListeners() {
        // Swipe detection on the sounds grid
        soundsContainerEl.addEventListener('touchstart', handleTouchStart, { passive: true });
        soundsContainerEl.addEventListener('touchmove', handleTouchMove, { passive: false }); // Need passive: false to preventDefault potentially
        soundsContainerEl.addEventListener('touchend', handleTouchEnd);
        soundsContainerEl.addEventListener('touchcancel', handleTouchEnd); // Handle cancellations

        // Search input
        searchInputEl.addEventListener('input', handleSearchInput);
        searchInputEl.addEventListener('blur', handleInputBlur); // Handle focus loss

        // Clear/Close button
        searchButtonEl.addEventListener('click', handleClearOrClose);

        // Prevent clicks on search bar from propagating (e.g., to grid below)
         searchContainerEl.addEventListener('click', (e) => e.stopPropagation());
    }

    // --- Swipe Handling ---
    function handleTouchStart(e) {
        if (e.touches.length > 1) return; // Ignore multi-touch

        // Allow opening ONLY if scrolled to the very top
        const canOpen = soundsContainerEl.scrollTop === 0 && !editMode.isActive(); // Disable in edit mode
        // Allow closing/clearing if already visible
        const canCloseOrClear = isVisible;

        if (canOpen || canCloseOrClear) {
            startY = e.touches[0].clientY;
            currentY = startY;
            isEligibleToOpen = canOpen && !isVisible; // Eligible only if at top and not already open
            // No need to set isDragging yet
        } else {
            isEligibleToOpen = false; // Reset eligibility if scrolled down or in edit mode
        }
    }

    function handleTouchMove(e) {
        if (e.touches.length > 1) return; // Ignore multi-touch
        if (!isEligibleToOpen && !isVisible) return; // Exit if not eligible or visible

        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;

        // --- Dragging to OPEN ---
        if (isEligibleToOpen && deltaY > 0) { // Swiping down to open
            isDragging = true;
            soundsContainerEl.classList.add('search-dragging');
            searchContainerEl.classList.add('search-dragging');
            document.body.style.overflow = 'hidden'; // Prevent body scroll during drag

            // Calculate how much to reveal (0 to searchBarHeight)
            const revealAmount = Math.min(deltaY, searchBarHeight);
            const percentageRevealed = revealAmount / searchBarHeight;

            // Apply transform to slide down (negative Y is hidden)
            searchContainerEl.style.transform = `translateY(${-searchBarHeight + revealAmount}px)`;
            searchContainerEl.style.visibility = 'visible'; // Make visible during drag

            // Apply padding to push grid down
            soundsContainerEl.style.paddingTop = `${10 + revealAmount}px`; // 10 is original padding

            // Prevent default scroll behavior ONLY when actively dragging down to open
            e.preventDefault();

        }
        // --- Dragging while VISIBLE ---
        else if (isVisible) {
             // Check for drag DOWN (clear/close) or UP (close if empty)
             if (deltaY > dragThreshold && !isDragging) { // Dragging down to clear/close
                 isDragging = true; // Mark as dragging for this interaction
                 handleClearOrClose(); // Perform action immediately
                 // Optionally add visual feedback during drag-down-to-clear/close?
                 // Reset startY to prevent repeated actions in same drag
                 startY = currentY - dragThreshold * 1.1; // Adjust startY to prevent re-triggering immediately
                 isEligibleToOpen = false; // Not eligible to open anymore in this interaction
             } else if (deltaY < -dragThreshold && !isDragging && searchInputEl.value.trim() === '') { // Dragging up to close (only if empty)
                 isDragging = true; // Mark as dragging
                 hideSearchBar();
                 // Reset startY to prevent repeated actions
                 startY = currentY + dragThreshold * 1.1;
                 isEligibleToOpen = false; // Not eligible to open anymore in this interaction
             }
             // Allow normal grid scrolling if dragging up with text or not past threshold
        }
         // If dragging up when eligible to open, cancel the open attempt implicitly in touchend
    }

    function handleTouchEnd(e) {
        document.body.style.overflow = ''; // Restore body scroll
        soundsContainerEl.classList.remove('search-dragging');
        searchContainerEl.classList.remove('search-dragging');
        searchContainerEl.style.transform = ''; // Remove inline style
        soundsContainerEl.style.paddingTop = ''; // Remove inline style

        if (isDragging) {
            const deltaY = currentY - startY;

            if (isEligibleToOpen && deltaY > dragThreshold) { // Finished dragging open
                showSearchBar();
            } else if (isEligibleToOpen && deltaY <= dragThreshold) { // Didn't drag far enough to open
                hideSearchBar(); // Snap back
            }
            // Actions for dragging while visible were handled in touchmove
        }

        // Reset flags
        isDragging = false;
        isEligibleToOpen = false;
        startY = 0;
        currentY = 0;
    }

    // --- Search Logic ---
    function handleSearchInput() {
        const searchTerm = searchInputEl.value.trim();
        updateButtonIcon(); // Update icon based on text presence

        if (!fuse) {
             console.warn("Fuse.js not ready.");
             return;
        }
        if (searchTerm.length > 0) {
             console.log(`Searching for: "${searchTerm}"`);
             const results = fuse.search(searchTerm);
             const soundResults = results.map(result => result.item); // Extract original sound objects
             // Call app.js function to display results
             if (window.app && typeof window.app.displaySearchResults === 'function') {
                  window.app.displaySearchResults(soundResults, searchTerm);
             } else {
                  console.error("window.app.displaySearchResults function not found!");
             }
        } else {
             // Clear results - restore tab view
             if (window.app && typeof window.app.restoreTabView === 'function') {
                  window.app.restoreTabView();
             } else {
                  console.error("window.app.restoreTabView function not found!");
             }
        }
    }

    function handleInputBlur() {
        // Optional: Hide search bar if user taps outside and input is empty?
        // Could be annoying if they accidentally blur. Let's not hide for now.
        // setTimeout(() => { // Timeout allows button click to register before blur hides
        //     if (!document.activeElement || document.activeElement !== searchInputEl) {
        //         // console.log("Search input blurred");
        //         // if (isVisible && searchInputEl.value.trim() === '') {
        //         //     hideSearchBar();
        //         // }
        //     }
        // }, 100);
    }

    // --- Visibility Control ---
    function showSearchBar() {
        if (isVisible) return;
        console.log("Showing search bar");
        isVisible = true;
        searchContainerEl.classList.add('search-bar-visible');
        soundsContainerEl.classList.add('search-active');
        searchInputEl.focus(); // Auto-focus input
        // Attempt to show virtual keyboard (browser dependent)
        // searchInputEl.click(); // Sometimes helps trigger keyboard
        updateButtonIcon();
        // Disable tab switching? Optional.
        // document.getElementById('tabs-container')?.classList.add('disabled');
    }

    function hideSearchBar() {
        if (!isVisible) return;
        console.log("Hiding search bar");
        isVisible = false;
        searchInputEl.blur(); // Unfocus
        searchInputEl.value = ''; // Clear input value
        searchContainerEl.classList.remove('search-bar-visible');
        soundsContainerEl.classList.remove('search-active');
        updateButtonIcon();

        // Restore the normal tab view (important!)
         if (window.app && typeof window.app.restoreTabView === 'function') {
              window.app.restoreTabView();
         } else {
              console.error("Cannot restore tab view: window.app.restoreTabView function not found!");
         }

        // Re-enable tab switching if it was disabled
        // document.getElementById('tabs-container')?.classList.remove('disabled');
    }

    // --- Button Logic ---
    function handleClearOrClose() {
        if (searchInputEl.value.trim() !== '') {
            searchInputEl.value = ''; // Clear text
            handleSearchInput(); // Trigger search with empty value to clear results
            searchInputEl.focus(); // Keep focus
            updateButtonIcon(); // Update icon
        } else {
            hideSearchBar(); // Close bar
        }
    }

    function updateButtonIcon() {
         const iconSpan = searchButtonEl.querySelector('.material-symbols-outlined');
         if (!iconSpan) return;

         if (isVisible && searchInputEl.value.trim() !== '') {
             iconSpan.textContent = 'backspace'; // Clear icon (or delete)
             searchButtonEl.setAttribute('aria-label', 'Clear search text');
         } else {
             iconSpan.textContent = 'close'; // Close icon
             searchButtonEl.setAttribute('aria-label', 'Close search bar');
         }
    }


    // --- Public Methods (if needed) ---
    // function isSearchActive() { return isVisible; }

    // --- Initialize ---
    // Use DOMContentLoaded to ensure elements exist, but init waits for appReady for data.
    document.addEventListener('DOMContentLoaded', init);

    // Expose methods if needed, e.g. for debugging or external control
    // return { isSearchActive };

})(); // IIFE execution