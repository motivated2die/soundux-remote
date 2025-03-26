// Add this to your app.js file or include as a separate script

// Tab swiping functionality
function initTabSwiping() {
    const soundsContainer = document.getElementById('sounds-container');
    const tabsContainer = document.getElementById('tabs-container');
    
    if (!soundsContainer || !tabsContainer) return;
    
    let touchStartX = 0;
    let touchEndX = 0;
    let currentTabIndex = 0;
    let tabs = [];
    
    // Function to update tabs array
    function updateTabsArray() {
        tabs = Array.from(tabsContainer.querySelectorAll('.tab'));
        // Find the active tab index
        currentTabIndex = tabs.findIndex(tab => tab.classList.contains('active'));
        if (currentTabIndex === -1) currentTabIndex = 0;
    }
    
    // Initial tabs setup
    updateTabsArray();
    
    // Watch for new tabs being added
    const tabsObserver = new MutationObserver(() => {
        updateTabsArray();
    });
    
    tabsObserver.observe(tabsContainer, {
        childList: true,
        subtree: false
    });
    
    // Handle touch events for swipe
    soundsContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });
    
    soundsContainer.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });
    
    function handleSwipe() {
        updateTabsArray(); // Make sure we have the latest tabs
        
        if (tabs.length <= 1) return; // No need to swipe with 0 or 1 tabs
        
        const swipeThreshold = 100; // Minimum swipe distance in pixels
        const swipeDistance = touchEndX - touchStartX;
        
        // Right swipe (previous tab)
        if (swipeDistance > swipeThreshold) {
            const newIndex = Math.max(0, currentTabIndex - 1);
            if (newIndex !== currentTabIndex && tabs[newIndex]) {
                tabs[newIndex].click();
            }
        }
        // Left swipe (next tab)
        else if (swipeDistance < -swipeThreshold) {
            const newIndex = Math.min(tabs.length - 1, currentTabIndex + 1);
            if (newIndex !== currentTabIndex && tabs[newIndex]) {
                tabs[newIndex].click();
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
    
    // Set up a mutation observer to watch for class changes on tabs
    const tabClassObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.attributeName === 'class') {
                if (mutation.target.classList.contains('active')) {
                    scrollActiveTabIntoView();
                }
            }
        });
    });
    
    // Observe all current and future tabs
    tabs.forEach(tab => {
        tabClassObserver.observe(tab, { attributes: true });
    });
    
    // Initial scroll to active tab
    setTimeout(scrollActiveTabIntoView, 300);
}

// Initialize the swipe functionality when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initTabSwiping();
});