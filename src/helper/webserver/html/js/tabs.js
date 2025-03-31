// --- ENTIRE FILE REPLACE ---
// Tab swiping functionality
function initTabSwiping() {
    // --- MODIFIED: Target the sounds grid specifically for swiping ---
    const swipeArea = document.getElementById('sounds-container'); 
    const tabsContainer = document.getElementById('tabs-container');

    if (!swipeArea || !tabsContainer) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchCurrentX = 0;
    let isSwiping = false;
    let tabs = [];
    const contentWrapper = document.getElementById('tab-content-wrapper');

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
        
        touchStartX = touchCurrentX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
        isSwiping = false; // Start as non-swiping until we determine direction
        contentWrapper.style.transition = 'none';
    }, { passive: true });

    swipeArea.addEventListener('touchmove', (e) => {
        if (typeof editMode !== 'undefined' && editMode.isActive()) {
            return; // Disable swipe in edit mode
        }

        const touchX = e.changedTouches[0].screenX;
        const touchY = e.changedTouches[0].screenY;
        const deltaX = touchX - touchStartX;
        const deltaY = touchY - touchStartY;
        
        // Determine if this is a horizontal swipe (after some movement)
        if (!isSwiping && Math.abs(deltaX) > 10) {
            isSwiping = Math.abs(deltaX) > Math.abs(deltaY) * 1.5;
        }

        if (isSwiping) {
            e.preventDefault();
            touchCurrentX = touchX;
            contentWrapper.style.transform = `translateX(${deltaX}px)`;
        }
    }, { passive: false });

    swipeArea.addEventListener('touchend', (e) => {
        if (!isSwiping) return;
        isSwiping = false;
        
        const deltaX = touchCurrentX - touchStartX;
        const absDeltaX = Math.abs(deltaX);
        
        // Continue current transform into swipe animation
        if (absDeltaX > 80) {
            contentWrapper.style.transition = 'transform 0.2s ease-out';
            contentWrapper.style.transform = `translateX(${deltaX > 0 ? '100%' : '-100%'})`;
            handleSwipe(deltaX);
        } else {
            // Return to center if not enough swipe
            contentWrapper.style.transition = 'transform 0.2s ease-out';
            contentWrapper.style.transform = '';
        }
        
        setTimeout(() => {
            contentWrapper.style.transition = '';
            contentWrapper.style.transform = '';
        }, 200);
    });

    function handleSwipe(deltaX) {
        const { tabs, currentTabIndex } = getTabsInfo();
        if (tabs.length <= 1) return;

        const swipeDirection = deltaX > 0 ? 'right' : 'left';
        
        setTimeout(() => {
            let newIndex;
            if (swipeDirection === 'right') {
                newIndex = tabs[currentTabIndex - 1] ? currentTabIndex - 1 : tabs.length - 1;
            } else {
                newIndex = tabs[currentTabIndex + 1] ? currentTabIndex + 1 : 0;
            }
            
            if (tabs[newIndex]) {
                tabs[newIndex].click();
                // Force immediate opacity reset followed by fast fade-in
                const sounds = document.getElementById('sounds-container');
                sounds.style.opacity = '0';
                sounds.style.transition = 'opacity 100ms ease-in';
                setTimeout(() => sounds.style.opacity = '1', 10);
            }
        }, 200);
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
