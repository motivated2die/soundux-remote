// Add this to your app.js file or include as a separate script

// Tab swiping functionality
function initTabSwiping() {
    const soundsContainer = document.getElementById('sounds-container');
    const tabsContainer = document.getElementById('tabs-container');
    
    if (!soundsContainer || !tabsContainer) return;
    
    let touchStartX = 0;
    let touchEndX = 0;
    let tabs = [];
    
    // Function to update tabs array and get current index
    function getTabsInfo() {
        tabs = Array.from(tabsContainer.querySelectorAll('.tab'));
        const currentTabIndex = tabs.findIndex(tab => tab.classList.contains('active'));
        return {
            tabs,
            currentTabIndex: currentTabIndex === -1 ? 0 : currentTabIndex
        };
    }
    
    // Handle touch events for swipe
    soundsContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });
    
    soundsContainer.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });
    
    function handleSwipe() {
        // --- NEW CODE START ---
        // Disable swipe if in edit mode
        if (typeof editMode !== 'undefined' && editMode.isActive()) {
            console.log("Swipe disabled in edit mode.");
            return;
        }
        // --- NEW CODE END ---

        // Get fresh tabs information at the moment of the swipe
        const { tabs, currentTabIndex } = getTabsInfo();

        if (tabs.length <= 1) return; // No need to swipe with 0 or 1 tabs

        const swipeThreshold = 100; // Minimum swipe distance in pixels

        const swipeDistance = touchEndX - touchStartX;
        
        // Debug logs to help understand what's happening
        console.log(`Current tab index: ${currentTabIndex}, Total tabs: ${tabs.length}`);
        console.log(`Swipe distance: ${swipeDistance}`);
        
        // Right swipe (previous tab)
        if (swipeDistance > swipeThreshold) {
            const newIndex = Math.max(0, currentTabIndex - 1);
            console.log(`Right swipe, new index: ${newIndex}`);
            if (newIndex !== currentTabIndex && tabs[newIndex]) {
                // Delay the click slightly to allow for any pending DOM updates
                setTimeout(() => {
                    tabs[newIndex].click();
                    scrollActiveTabIntoView();
                }, 50);
            }
        }
        // Left swipe (next tab)
        else if (swipeDistance < -swipeThreshold) {
            const newIndex = Math.min(tabs.length - 1, currentTabIndex + 1);
            console.log(`Left swipe, new index: ${newIndex}`);
            if (newIndex !== currentTabIndex && tabs[newIndex]) {
                // Delay the click slightly to allow for any pending DOM updates
                setTimeout(() => {
                    tabs[newIndex].click();
                    scrollActiveTabIntoView();
                }, 50);
            }
        }
    }
    
    // Also update tab scrolling to center the active tab
    function scrollActiveTabIntoView() {
        const activeTab = tabsContainer.querySelector('.tab.active');
        if (activeTab) {
            const containerWidth = tabsContainer.offsetWidth;
            const tabLeft = activeTab.offsetLeft;
            const tabWidth = activeTab.offsetWidth;
            
            // Calculate scroll position to center the tab
            const scrollPosition = tabLeft - (containerWidth / 2) + (tabWidth / 2);
            
            // Smooth scroll to the position
            tabsContainer.scrollTo({
                left: scrollPosition,
                behavior: 'smooth'
            });
        }
    }
    
    // Set up a mutation observer to watch for changes to the tabs
    const tabContainerObserver = new MutationObserver(() => {
        // When tabs change, recalculate tabs array
        const { tabs: newTabs } = getTabsInfo();
        
        // Update observers for all tabs
        newTabs.forEach(tab => {
            // Remove any existing observers to avoid duplicates
            tabClassObserver.observe(tab, { attributes: true });
        });
    });
    
    tabContainerObserver.observe(tabsContainer, {
        childList: true,
        subtree: false
    });
    
    // Set up a mutation observer to watch for class changes on tabs
    const tabClassObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.attributeName === 'class') {
                if (mutation.target.classList.contains('active')) {
                    setTimeout(scrollActiveTabIntoView, 50);
                }
            }
        });
    });
    
    // Initial setup
    const { tabs: initialTabs } = getTabsInfo();
    initialTabs.forEach(tab => {
        tabClassObserver.observe(tab, { attributes: true });
    });
    
    // Initial scroll to active tab
    setTimeout(scrollActiveTabIntoView, 300);
}

// Initialize the swipe functionality when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initTabSwiping();
});