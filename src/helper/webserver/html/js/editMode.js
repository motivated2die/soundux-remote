// --- NEW FILE START ---
const editMode = (() => {
    let isEditModeActive = false;
    const editButton = document.getElementById('edit-mode-button');
    const layoutButton = document.getElementById('layout-mode-button');
    const topBar = document.getElementById('top-bar');
    const soundsContainer = document.getElementById('sounds-container');
    // --- NEW CODE START ---
    const editModeInfo = document.getElementById('edit-mode-info');
    // --- NEW CODE END ---

    const toggleEditMode = () => {
        isEditModeActive = !isEditModeActive;
        console.log("Edit mode toggled:", isEditModeActive);
        updateUI();
        // Notify other modules (e.g., dragDrop, sound-settings)
        document.dispatchEvent(new CustomEvent('editModeChanged', { detail: { isActive: isEditModeActive } }));
    };

    const updateUI = () => {
        document.body.classList.toggle('edit-mode', isEditModeActive);
        topBar?.classList.toggle('edit-mode-active', isEditModeActive);
        layoutButton?.classList.toggle('hidden', !isEditModeActive);
        editButton?.classList.toggle('active', isEditModeActive);

        // --- NEW CODE START ---
        editModeInfo?.classList.toggle('hidden', !isEditModeActive); // Show/hide info text
        // --- NEW CODE END ---

        // Change icon based on state
        const editIcon = editButton?.querySelector('.material-symbols-outlined');
        if (editIcon) {
            editIcon.textContent = isEditModeActive ? 'done' : 'edit';
        }

        // Update cursor for sound cards only if the container exists
        if (soundsContainer) {
             soundsContainer.style.cursor = isEditModeActive ? 'grab' : 'pointer';
        }
    };

    const isActive = () => isEditModeActive;

    const init = () => {
        if (editButton) {
            editButton.addEventListener('click', toggleEditMode);
        } else {
            console.error("Edit mode button not found");
        }
        // Ensure initial UI state is correct (edit mode off)
        updateUI();
    };

    return {
        init,
        isActive,
        // toggleEditMode // Expose if needed externally, but button click is primary way
    };
})();

document.addEventListener('DOMContentLoaded', editMode.init);