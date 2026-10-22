/* Settings only change panel visibility. The companion workspace stays mounted. */
(() => {
  const drawer = document.getElementById('settings-drawer');
  const menuButton = document.getElementById('menu-button');
  const closeButton = document.getElementById('close-settings');
  if (!drawer || !menuButton || !closeButton) return;

  const navigation = drawer.querySelector('.settings-nav');
  const content = drawer.querySelector('.settings-content');
  const buttons = Array.from(drawer.querySelectorAll('[data-panel]'));
  const panels = Array.from(drawer.querySelectorAll('.settings-panel'));
  const panelIds = new Set(panels.map(panel => panel.id));
  let selectedPanel = panels.find(panel => !panel.hidden)?.id || panels[0]?.id;
  let returnFocus = null;

  function selectPanel(panelId) {
    if (!panelIds.has(panelId)) return false;
    if (selectedPanel !== panelId && content) content.scrollTop = 0;
    selectedPanel = panelId;
    for (const panel of panels) panel.hidden = panel.id !== panelId;
    for (const button of buttons) {
      if (button.dataset.panel === panelId) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    return true;
  }

  function finishClose() {
    menuButton.setAttribute('aria-expanded', 'false');
    const opener = returnFocus;
    returnFocus = null;
    if (opener?.isConnected !== false && !opener?.disabled) opener?.focus();
  }

  function openSettings(panelId) {
    selectPanel(panelId || selectedPanel);
    if (!drawer.open) {
      const activeElement = document.activeElement;
      returnFocus = activeElement && !drawer.contains(activeElement) ? activeElement : menuButton;
      drawer.showModal();
    }
    menuButton.setAttribute('aria-expanded', 'true');
    buttons.find(button => button.dataset.panel === selectedPanel)?.focus();
  }

  function closeSettings() {
    if (!drawer.open) return;
    drawer.close();
    // Restore synchronously so a caller may then deliberately focus the composer.
    // The native close event also handles the browser's Escape dismissal.
    finishClose();
  }

  menuButton.addEventListener('click', () => openSettings());
  closeButton.addEventListener('click', closeSettings);
  drawer.addEventListener('close', () => {
    if (!drawer.open) finishClose();
  });
  drawer.addEventListener('click', event => {
    if (event.target !== drawer) return;
    const bounds = drawer.getBoundingClientRect();
    const outside = event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom;
    if (outside) closeSettings();
  });

  for (const button of buttons) {
    button.addEventListener('click', () => selectPanel(button.dataset.panel));
  }
  // These are ordinary buttons, so every item remains reachable with Tab.
  // Arrow keys offer a shortcut without introducing incomplete tab semantics.
  navigation?.addEventListener('keydown', event => {
    const index = buttons.indexOf(event.target);
    if (index === -1) return;
    let nextIndex;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (index + 1) % buttons.length;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (index + buttons.length - 1) % buttons.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = buttons.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const button = buttons[nextIndex];
    selectPanel(button.dataset.panel);
    button.focus();
  });
  for (const button of document.querySelectorAll('[data-open-panel]')) {
    button.addEventListener('click', () => openSettings(button.dataset.openPanel));
  }

  function openHashPanel() {
    let panelId;
    try { panelId = decodeURIComponent(window.location.hash.slice(1)); }
    catch { return; }
    if (panelIds.has(panelId)) openSettings(panelId);
  }
  selectPanel(selectedPanel);
  window.companionWorkspace = { openSettings, closeSettings };
  window.addEventListener('hashchange', openHashPanel);
  openHashPanel();
})();
