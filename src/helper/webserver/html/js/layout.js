// --- ENTIRE FILE REPLACE ---
const layoutManager = (() => {
    const soundsContainer = document.getElementById('sounds-container');
    const layoutButton = document.getElementById('layout-mode-button');
    const layoutModes = ['grid-3', 'grid-2', 'list']; // Order matters for cycling

    const getCurrentLayoutModeForTab = (tabId) => {
        // Ensure tabId is treated consistently (string)
        const currentTabId = String(tabId);
        return persistence.getCurrentLayoutMode(currentTabId);
    };

    const applyLayoutMode = (layoutMode) => {
        if (!soundsContainer) {
            console.error("Cannot apply layout: Sounds container not found.");
            return;
        }

        // Remove existing layout classes
        layoutModes.forEach(mode => soundsContainer.classList.remove(`layout-${mode}`));

        // Add the new layout class
        soundsContainer.classList.add(`layout-${layoutMode}`);

        // Update button icon based on the *next* mode in the cycle
        const currentModeIndex = layoutModes.indexOf(layoutMode);
        const nextModeIndex = (currentModeIndex + 1) % layoutModes.length;
        const nextMode = layoutModes[nextModeIndex];

        const layoutIcon = layoutButton?.querySelector('.material-symbols-outlined');
        if (layoutIcon) {
            switch (nextMode) {
                case 'grid-3': layoutIcon.textContent = 'view_module'; break;
                case 'grid-2': layoutIcon.textContent = 'view_comfy'; break;
                case 'list': layoutIcon.textContent = 'view_list'; break;
                default: layoutIcon.textContent = 'view_module';
            }
        }
         // console.log(`Layout mode applied: ${layoutMode}`);
    };

    const cycleLayoutMode = () => {
        // Ensure state.currentTab is valid before proceeding
        if (state.currentTab === null || typeof state.currentTab === 'undefined') {
            console.warn("Cannot cycle layout: No current tab selected.");
            return;
        }

        const currentTabId = String(state.currentTab); // Ensure string
        const currentMode = getCurrentLayoutModeForTab(currentTabId);
        const currentModeIndex = layoutModes.indexOf(currentMode);
        const nextModeIndex = (currentModeIndex + 1) % layoutModes.length;
        const nextMode = layoutModes[nextModeIndex];

        console.log(`Cycling layout from ${currentMode} to ${nextMode} for tab ${currentTabId}`);

        // Save the new mode
        persistence.setCurrentLayoutMode(currentTabId, nextMode);

        // Apply the new mode visually
        applyLayoutMode(nextMode);

        // Reload sounds to potentially apply a layout-specific order
        if (typeof window.app !== 'undefined' && typeof window.app.reloadSoundsForCurrentTab === 'function') {
             window.app.reloadSoundsForCurrentTab();
        } else {
            console.warn("app.reloadSoundsForCurrentTab() not found. Cannot reload sounds on layout change.");
        }
    };

    // --- NEW: Apply initial layout when app is ready ---
    const applyInitialLayout = () => {
        // Check if state.currentTab is validly set by app.js
        if (state.currentTab !== null && typeof state.currentTab !== 'undefined') {
            console.log(`Applying initial layout for tab: ${state.currentTab}`);
            const initialLayoutMode = getCurrentLayoutModeForTab(String(state.currentTab)); // Ensure string
            applyLayoutMode(initialLayoutMode);
        } else {
            console.warn("Initial layout application skipped: state.currentTab not set or invalid after appReady.");
            // Optionally apply a default layout if needed
            // applyLayoutMode('grid-3');
        }
    };
    // --- END NEW ---

    const init = () => {
        if (layoutButton) {
            layoutButton.addEventListener('click', cycleLayoutMode);
        } else {
            console.error("Layout mode button not found");
        }

        // Listen for tab changes to apply the correct layout
        document.addEventListener('tabChanged', (event) => {
            const { tabId } = event.detail;
            if (tabId !== null && typeof tabId !== 'undefined') {
               // console.log(`Layout Manager: Tab changed to: ${tabId}. Applying layout.`);
               if (!soundsContainer) {
                    console.error("Layout Manager: Cannot apply layout, soundsContainer not found.");
                    return;
               }
               const layoutMode = getCurrentLayoutModeForTab(String(tabId)); // Ensure string
               applyLayoutMode(layoutMode);
            } else {
               console.warn("Layout Manager: Tab changed event received with invalid tabId:", tabId);
            }
        });

        // --- MODIFIED: Listen for appReady event ---
        document.addEventListener('appReady', applyInitialLayout);
        // --- END MODIFICATION ---

    };

    return {
        init,
        applyLayoutMode,
        getCurrentLayoutModeForTab
    };
})();

document.addEventListener('DOMContentLoaded', layoutManager.init);
// --- ENTIRE FILE REPLACE ---