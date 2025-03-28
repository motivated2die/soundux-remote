// --- NEW FILE START ---
const dragDropManager = (() => {
    let sortableInstance = null;
    const soundsContainer = document.getElementById('sounds-container');

    const initSortable = () => {
        if (!soundsContainer || typeof Sortable === 'undefined') {
            console.error("Sounds container or SortableJS not found.");
            return;
        }

        sortableInstance = new Sortable(soundsContainer, {
            animation: 150, // ms, animation speed moving items when sorting, `0` — without animation
            ghostClass: 'sortable-ghost', // Class name for the drop placeholder
            chosenClass: 'sortable-chosen', // Class name for the chosen item
            dragClass: 'sortable-drag', // Class name for the dragging item
            delay: 50, // Time in ms to wait before starting drag (prevents accidental drags on tap)
            delayOnTouchOnly: true, // Only delay if user is using touch
            touchStartThreshold: 5, // Pixels tolerance for touch start


            disabled: !editMode.isActive(), // Initially disabled if edit mode is off

            onStart: function (evt) {
                // Add grabbing cursor style
                soundsContainer.style.cursor = 'grabbing';
                 // Haptic feedback on drag start
                 if (navigator.vibrate) {
                     navigator.vibrate(50); // Vibrate for 50ms
                 }
            },

            onEnd: function (evt) {
                // Remove grabbing cursor style
                soundsContainer.style.cursor = 'grab';

                const currentTabId = state.currentTab;
                const currentLayout = layoutManager.getCurrentLayoutModeForTab(currentTabId);

                if (!currentTabId || !currentLayout) {
                    console.error("Cannot save order: Current tab or layout unknown.");
                    return;
                }

                // Get the new order of sound paths
                const newOrder = Array.from(evt.to.children)
                    .map(el => el.dataset.soundPath) // Ensure sound cards have 'data-sound-path'
                    .filter(path => path); // Filter out any undefined paths

                if (newOrder.length > 0) {
                    console.log(`Saving new order for tab ${currentTabId}, layout ${currentLayout}:`, newOrder);
                    persistence.setLayoutOrder(currentTabId, currentLayout, newOrder);
                } else {
                    console.warn("Could not determine new order or order is empty.");
                }
            },
        });
         console.log("SortableJS initialized.");
    };

    const enable = () => {
        if (sortableInstance) {
            sortableInstance.option('disabled', false);
             soundsContainer.style.cursor = 'grab'; // Set cursor when enabled
             console.log("Drag & Drop enabled.");
        }
    };

    const disable = () => {
        if (sortableInstance) {
            sortableInstance.option('disabled', true);
            soundsContainer.style.cursor = 'pointer'; // Reset cursor when disabled
            console.log("Drag & Drop disabled.");
        }
    };

    const init = () => {
        // Ensure SortableJS is loaded before initializing
        if (typeof Sortable !== 'undefined') {
             initSortable();
             // Listen for edit mode changes
             document.addEventListener('editModeChanged', (event) => {
                 const isActive = event.detail.isActive;
                 if (isActive) {
                     enable();
                 } else {
                     disable();
                 }
             });
        } else {
             console.error("SortableJS library is not loaded.");
        }
    };

    return {
        init
    };
})();

document.addEventListener('DOMContentLoaded', dragDropManager.init);