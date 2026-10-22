const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../source/web/public/workspace-navigation.js'), 'utf8');

function workspace(hash = '') {
  const queued = [];
  const elements = new Map();
  let document;
  class Element {
    constructor(id, dataset = {}) {
      this.id = id;
      this.dataset = dataset;
      this.listeners = new Map();
      this.attributes = new Map();
      this.isConnected = true;
      this.hidden = false;
      this.open = false;
      elements.set(id, this);
    }
    addEventListener(name, callback) {
      if (!this.listeners.has(name)) this.listeners.set(name, []);
      this.listeners.get(name).push(callback);
    }
    fire(name, properties = {}) {
      const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...properties };
      for (const callback of this.listeners.get(name) || []) callback(event);
      // Native dialog dismisses on an uncancelled Escape/cancel event.
      if (name === 'cancel' && !event.defaultPrevented) this.close();
      return event;
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; this.showCount = (this.showCount || 0) + 1; }
    close() { this.open = false; queued.push(() => this.fire('close')); }
    getBoundingClientRect() { return { left: 600, right: 1200, top: 0, bottom: 900 }; }
  }

  const menu = new Element('menu-button');
  const close = new Element('close-settings');
  const drawer = new Element('settings-drawer');
  const navigation = new Element('settings-nav');
  const content = new Element('settings-content');
  const panelIds = ['identity', 'avatar', 'modes', 'tasks', 'memory', 'voice', 'vision', 'privacy', 'system', 'roadmap'];
  const buttons = panelIds.map(panel => new Element(`nav-${panel}`, { panel }));
  const panels = panelIds.map((id, index) => {
    const panel = new Element(id); panel.hidden = index !== 0; return panel;
  });
  const avatarShortcut = new Element('avatar-shortcut', { openPanel: 'avatar' });
  const privacyShortcut = new Element('privacy-shortcut', { openPanel: 'privacy' });
  const prompt = new Element('prompt');
  const identityInput = new Element('identity-input');
  identityInput.value = 'Unsaved companion name';
  const canvas = new Element('live2d-canvas');
  const conversation = new Element('chat-history');
  conversation.messages = [{ role: 'user', text: 'Remember our conversation.' }];
  drawer.querySelector = selector => selector === '.settings-nav' ? navigation : selector === '.settings-content' ? content : null;
  drawer.querySelectorAll = selector => selector === '[data-panel]' ? buttons : selector === '.settings-panel' ? panels : [];
  drawer.contains = element => [drawer, navigation, close, identityInput, ...buttons, ...panels].includes(element);
  document = {
    activeElement: menu,
    getElementById: id => elements.get(id),
    querySelectorAll: selector => selector === '[data-open-panel]' ? [avatarShortcut, privacyShortcut] : [],
  };
  const window = new Element('window');
  window.location = { hash };
  vm.runInNewContext(source, { window, document }, { filename: 'workspace-navigation.js' });
  return {
    document, window, menu, close, drawer, navigation, content, buttons, panels, avatarShortcut, privacyShortcut,
    prompt, identityInput, canvas, conversation, elements,
    flush: () => { while (queued.length) queued.shift()(); },
    visible: () => panels.filter(panel => !panel.hidden).map(panel => panel.id),
    click: element => { element.focus(); element.fire('click'); },
  };
}

test('native settings drawer opens once, selects a panel, and restores focus after Escape', () => {
  const page = workspace();
  page.click(page.menu);
  assert.equal(page.drawer.open, true);
  assert.equal(page.menu.getAttribute('aria-expanded'), 'true');
  assert.equal(page.document.activeElement.id, 'nav-identity');
  page.click(page.buttons.find(button => button.dataset.panel === 'privacy'));
  assert.deepEqual(page.visible(), ['privacy']);
  page.drawer.fire('cancel');
  page.flush();
  assert.equal(page.drawer.open, false);
  assert.equal(page.menu.getAttribute('aria-expanded'), 'false');
  assert.equal(page.document.activeElement, page.menu);
  page.click(page.menu);
  assert.deepEqual(page.visible(), ['privacy']);
  assert.equal(page.document.activeElement.id, 'nav-privacy');
});

test('quick settings and panel navigation preserve workspace nodes and unsaved forms', () => {
  const page = workspace();
  const originalCanvas = page.canvas;
  const originalMessages = page.conversation.messages;
  page.click(page.avatarShortcut);
  assert.deepEqual(page.visible(), ['avatar']);
  page.content.scrollTop = 400;
  page.click(page.buttons.find(button => button.dataset.panel === 'identity'));
  assert.equal(page.content.scrollTop, 0, 'a different settings section starts at the top');
  page.click(page.buttons.find(button => button.dataset.panel === 'tasks'));
  page.click(page.privacyShortcut);
  assert.deepEqual(page.visible(), ['privacy']);
  assert.equal(page.drawer.showCount, 1, 'changing settings must reuse the open dialog');
  assert.equal(page.identityInput.value, 'Unsaved companion name');
  assert.equal(page.elements.get('live2d-canvas'), originalCanvas);
  assert.equal(page.conversation.messages, originalMessages);
  page.click(page.close);
  page.flush();
  assert.equal(page.document.activeElement, page.avatarShortcut);
});

test('only a click beyond the drawer bounds closes it', () => {
  const page = workspace();
  page.click(page.menu);
  page.drawer.fire('click', { clientX: 900, clientY: 500 });
  assert.equal(page.drawer.open, true, 'internal dialog whitespace is not the backdrop');
  page.drawer.fire('click', { target: page.panels[0], clientX: 20, clientY: 20 });
  assert.equal(page.drawer.open, true, 'a child click cannot dismiss the dialog');
  page.drawer.fire('click', { clientX: 400, clientY: 500 });
  assert.equal(page.drawer.open, false);
  assert.equal(page.document.activeElement, page.menu);
});

test('arrow keys and Home/End navigate ordinary buttons and keep one current panel', () => {
  const page = workspace();
  page.click(page.menu);
  const event = page.navigation.fire('keydown', { target: page.buttons[0], key: 'ArrowUp' });
  assert.equal(event.defaultPrevented, true);
  assert.equal(page.document.activeElement, page.buttons.at(-1));
  assert.deepEqual(page.visible(), ['roadmap']);
  page.navigation.fire('keydown', { target: page.buttons.at(-1), key: 'Home' });
  assert.deepEqual(page.visible(), ['identity']);
  page.navigation.fire('keydown', { target: page.buttons[0], key: 'End' });
  assert.deepEqual(page.visible(), ['roadmap']);
  assert.equal(page.buttons.filter(button => button.getAttribute('aria-current') === 'page').length, 1);
});

test('settings hash links work at startup and on navigation without recreating the dialog', () => {
  const page = workspace('#privacy');
  assert.equal(page.drawer.open, true);
  assert.deepEqual(page.visible(), ['privacy']);
  page.window.location.hash = '#avatar';
  page.window.fire('hashchange');
  assert.deepEqual(page.visible(), ['avatar']);
  page.window.location.hash = '#unknown';
  page.window.fire('hashchange');
  assert.deepEqual(page.visible(), ['avatar']);
  page.window.location.hash = '#%E0%A4%A';
  assert.doesNotThrow(() => page.window.fire('hashchange'));
  assert.equal(page.drawer.showCount, 1);
});

test('closing settings lets a mode action focus the composer without a later focus reset', () => {
  const page = workspace();
  page.click(page.menu);
  page.window.companionWorkspace.closeSettings();
  page.prompt.focus();
  page.flush();
  assert.equal(page.document.activeElement, page.prompt);
  assert.equal(page.menu.getAttribute('aria-expanded'), 'false');
});
