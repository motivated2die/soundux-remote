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
                // Use the persistence method to get the layout mode consistently
                const currentLayout = persistence.getCurrentLayoutMode(currentTabId);

                if (!currentTabId || !currentLayout) {
                    console.error("Cannot save order: Current tab or layout unknown.");
                    // Reset cursor even on error
                    soundsContainer.style.cursor = editMode.isActive() ? 'grab' : 'pointer';
                    return;
                }

                const oldIndex = evt.oldIndex; // Index in the original DOM/persisted order
                const newIndex = evt.newIndex; // Index where the item was dropped

                // If the item didn't actually move position, do nothing
                if (oldIndex === newIndex) {
                    console.log("Item dropped in the same position, no order change.");
                    soundsContainer.style.cursor = 'grab'; // Reset cursor
                    return;
                }

                // Get the current order from persistence
                let currentOrder = persistence.getLayoutOrder(currentTabId, currentLayout);
                if (!Array.isArray(currentOrder)) {
                    console.error(`Persisted order for tab ${currentTabId}, layout ${currentLayout} is not an array or is missing. Cannot perform swap reliably.`);
                    // Prevent default DOM change and reload to be safe
                    evt.preventDefault();
                    if (window.app?.reloadSoundsForCurrentTab) window.app.reloadSoundsForCurrentTab();
                    soundsContainer.style.cursor = 'grab'; // Reset cursor
                    return;
                }

                // Ensure indices are within the bounds of the persisted array length
                if (oldIndex < 0 || oldIndex >= currentOrder.length || newIndex < 0 || newIndex >= currentOrder.length) {
                    console.error(`Swap indices (old: ${oldIndex}, new: ${newIndex}) out of bounds for persisted order length (${currentOrder.length}). Aborting swap.`);
                    // Prevent default DOM change and reload to be safe
                    evt.preventDefault();
                    if (window.app?.reloadSoundsForCurrentTab) window.app.reloadSoundsForCurrentTab();
                    soundsContainer.style.cursor = 'grab'; // Reset cursor
                    return;
                }

                // Create a copy and perform the swap using the indices from the event
                const newOrder = [...currentOrder];
                console.log(`Original persisted order: [${currentOrder.join(', ')}]`);
                console.log(`Attempting to swap item at index ${oldIndex} ('${newOrder[oldIndex]}') with item at index ${newIndex} ('${newOrder[newIndex]}')`);

                // Perform the swap
                const itemToMove = newOrder[oldIndex];
                newOrder[oldIndex] = newOrder[newIndex];
                newOrder[newIndex] = itemToMove;

                console.log(`Saving swapped order for tab ${currentTabId}, layout ${currentLayout}: [${newOrder.join(', ')}]`);

                // Save the swapped order
                persistence.setLayoutOrder(currentTabId, currentLayout, newOrder);

                // *** Prevent SortableJS DOM update - visual order snaps back ***
                evt.preventDefault();
                console.log("Prevented SortableJS DOM update. Swapped order saved, will apply on next load.");

                // Reset cursor based on edit mode state
                soundsContainer.style.cursor = editMode.isActive() ? 'grab' : 'pointer';
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
