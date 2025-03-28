// --- ENTIRE FILE REPLACE ---
// Tab swiping functionality
function initTabSwiping() {
    const soundsContainer = document.getElementById('sounds-container');
    const tabsContainer = document.getElementById('tabs-container');

    if (!soundsContainer || !tabsContainer) return;

    let touchStartX = 0;
    let touchEndX = 0;
    let tabs = [];

    function getTabsInfo() {
        tabs = Array.from(tabsContainer.querySelectorAll('.tab'));
        const currentTabIndex = tabs.findIndex(tab => tab.classList.contains('active'));
        return {
            tabs,
            currentTabIndex: currentTabIndex === -1 ? 0 : currentTabIndex
        };
    }

    // --- MODIFIED: Added { passive: true } ---
    soundsContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    // --- END MODIFICATION ---

    soundsContainer.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });

    function handleSwipe() {
        if (typeof editMode !== 'undefined' && editMode.isActive()) {
            // console.log("Swipe disabled in edit mode.");
            return;
        }

        const { tabs, currentTabIndex } = getTabsInfo();
        if (tabs.length <= 1) return;

        const swipeThreshold = 80; // Slightly lower threshold
        const swipeDistance = touchEndX - touchStartX;

        // Right swipe (previous tab)
        if (swipeDistance > swipeThreshold) {
            const newIndex = Math.max(0, currentTabIndex - 1);
            if (newIndex !== currentTabIndex && tabs[newIndex]) {
                setTimeout(() => { tabs[newIndex].click(); scrollActiveTabIntoView(); }, 50);
            }
        }
        // Left swipe (next tab)
        else if (swipeDistance < -swipeThreshold) {
            const newIndex = Math.min(tabs.length - 1, currentTabIndex + 1);
            if (newIndex !== currentTabIndex && tabs[newIndex]) {
                setTimeout(() => { tabs[newIndex].click(); scrollActiveTabIntoView(); }, 50);
            }
        }
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

    // Observer for dynamic tab changes (if needed, currently relies on app reload)
    // const tabContainerObserver = new MutationObserver(() => { getTabsInfo(); });
    // tabContainerObserver.observe(tabsContainer, { childList: true, subtree: false });

    // Observer for active class change to trigger scroll
    const tabClassObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.attributeName === 'class' && mutation.target.classList.contains('active')) {
                setTimeout(scrollActiveTabIntoView, 50); // Delay slightly
            }
        });
    });

    // Initial setup: Observe existing tabs
    const { tabs: initialTabs } = getTabsInfo();
    initialTabs.forEach(tab => {
        tabClassObserver.observe(tab, { attributes: true });
    });

    // Initial scroll after a short delay
    setTimeout(scrollActiveTabIntoView, 300);
}

// Initialize the swipe functionality when the DOM is loaded
document.addEventListener('DOMContentLoaded', initTabSwiping);
// --- ENTIRE FILE REPLACE ---