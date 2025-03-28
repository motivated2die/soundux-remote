// --- NEW FILE START ---
const layoutManager = (() => {
    const soundsContainer = document.getElementById('sounds-container');
    const layoutButton = document.getElementById('layout-mode-button');
    const layoutModes = ['grid-3', 'grid-2', 'list']; // Order matters for cycling

    const getCurrentLayoutModeForTab = (tabId) => {
        return persistence.getCurrentLayoutMode(tabId);
    };

    const applyLayoutMode = (layoutMode) => {
        if (!soundsContainer) return;

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
                case 'grid-3': layoutIcon.textContent = 'view_module'; break; // Shows 3 columns icon when next is 3
                case 'grid-2': layoutIcon.textContent = 'view_comfy'; break; // Shows 2 columns icon when next is 2
                case 'list': layoutIcon.textContent = 'view_list'; break; // Shows list icon when next is list
                default: layoutIcon.textContent = 'view_module';
            }
        }
         console.log(`Layout mode applied: ${layoutMode}`);
    };

    const cycleLayoutMode = () => {
        if (!state.currentTab) return;

        const currentMode = getCurrentLayoutModeForTab(state.currentTab);
        const currentModeIndex = layoutModes.indexOf(currentMode);
        const nextModeIndex = (currentModeIndex + 1) % layoutModes.length;
        const nextMode = layoutModes[nextModeIndex];

        console.log(`Cycling layout from ${currentMode} to ${nextMode} for tab ${state.currentTab}`);

        // Save the new mode
        persistence.setCurrentLayoutMode(state.currentTab, nextMode);

        // Apply the new mode visually
        applyLayoutMode(nextMode);

        // Reload sounds with potentially new order for the new layout
        // app.js needs a function like this, assuming it exists:
        if (typeof window.app !== 'undefined' && typeof window.app.reloadSoundsForCurrentTab === 'function') {
             window.app.reloadSoundsForCurrentTab(); // Reload to apply order specific to this layout
        } else {
            console.warn("app.reloadSoundsForCurrentTab() not found. Cannot reload sounds on layout change.");
        }
    };

    const init = () => {
        if (layoutButton) {
            layoutButton.addEventListener('click', cycleLayoutMode);
        } else {
            console.error("Layout mode button not found");
        }

         // Listen for tab changes to apply the correct layout
         document.addEventListener('tabChanged', (event) => {
             const { tabId } = event.detail;
             if (tabId) {
                const layoutMode = getCurrentLayoutModeForTab(tabId);
                applyLayoutMode(layoutMode);
             }
         });
    };

    return {
        init,
        applyLayoutMode,
        getCurrentLayoutModeForTab
    };
})();

document.addEventListener('DOMContentLoaded', layoutManager.init);