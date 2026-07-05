const chat = document.getElementById('chat-log');
const form = document.getElementById('chat-form');
const promptInput = document.getElementById('prompt');
const companionMode = document.getElementById('companion-mode');
const sendButton = document.getElementById('send-button');
const micButton = document.getElementById('mic-button');
const imageUpload = document.getElementById('image-upload');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image');
const runtimePill = document.getElementById('runtime-pill');
const autoPlayToggle = document.getElementById('auto-play-toggle');
const sttReadyToggle = document.getElementById('stt-ready-toggle');
const voiceTestButton = document.getElementById('voice-test');
const captureVisionButton = document.getElementById('capture-vision');
const visionPreview = document.getElementById('vision-preview');
const visionStatus = document.getElementById('vision-status');
const memoryForm = document.getElementById('memory-form');
const memoryCategory = document.getElementById('memory-category');
const memoryContent = document.getElementById('memory-content');
const memoryList = document.getElementById('memory-list');
const refreshMemory = document.getElementById('refresh-memory');
const taskForm = document.getElementById('task-form');
const taskKind = document.getElementById('task-kind');
const taskTitle = document.getElementById('task-title');
const taskDetails = document.getElementById('task-details');
const taskList = document.getElementById('task-list');
const healthGrid = document.getElementById('health-grid');
const logList = document.getElementById('log-list');
const refreshSystem = document.getElementById('refresh-system');
const profileForm = document.getElementById('companion-profile-form');
const profileStatus = document.getElementById('profile-status');
const profileUserName = document.getElementById('profile-user-name');
const profileNativeLanguageInput = document.getElementById('profile-native-language-input');
const profileTone = document.getElementById('profile-tone');
const profileAffinityInput = document.getElementById('profile-affinity-input');
const profileSeedInput = document.getElementById('profile-seed-input');
const generateCompanionButton = document.getElementById('generate-companion');
const saveCompanionButton = document.getElementById('save-companion');
const revokeAccessButton = document.getElementById('revoke-access');
const presenceName = document.getElementById('presence-name');
const presenceMode = document.getElementById('presence-mode');
const presenceVoice = document.getElementById('presence-voice');
const presenceMemory = document.getElementById('presence-memory');
const presencePrivacy = document.getElementById('presence-privacy');
const modeAdaptationText = document.getElementById('mode-adaptation-text');

const companionProfileStorageKey = 'gepetto-generated-companion-profile';
const modeConfigs = {
  study: {
    label: 'Study Mode',
    placeholder: 'Ask your companion to explain, quiz, summarize, or build active recall for a topic.',
    starter: 'Study Mode: Help me study one topic using active recall, a concise summary, structured notes, and a tiny quiz.',
  },
  code: {
    label: 'Code Mode',
    placeholder: 'Ask for debugging, code explanation, refactoring, architecture, or implementation planning.',
    starter: 'Code Mode: Help me explain, debug, refactor, or plan this implementation in clear steps.',
  },
  productivity: {
    label: 'Productivity Mode',
    placeholder: 'Ask for a daily plan, task breakdown, reminders, priorities, or a next action.',
    starter: 'Productivity Mode: Help me turn today into a clear daily plan with priorities, reminders, and small next actions.',
  },
  japanese: {
    label: 'Japanese Coach',
    placeholder: 'Ask for vocabulary, grammar, sentence correction, kana, kanji, or practice drills.',
    starter: 'Japanese Coach: Run a focused Japanese drill with vocabulary, grammar, sentence correction, kana or kanji recall, and encouraging feedback.',
  },
  creative: {
    label: 'Creative Mode',
    placeholder: 'Ask for brainstorming, drafting, worldbuilding, naming, or polished creative options.',
    starter: 'Creative Mode: Help me brainstorm, write, and generate polished concepts with useful options and next steps.',
  },
  support: {
    label: 'Emotional Support Mode',
    placeholder: 'Ask for calm reflection, grounding, routines, focus recovery, or a gentle next step.',
    starter: 'Emotional Support Mode: Help me reflect calmly, ground myself, check in, and choose one gentle next step.',
  },
};

const fallbackCompanionProfile = {
  id: 'generated-aerin-kaela-novareth',
  name: 'Aerin Kaela Novareth',
  shortName: 'Aerin',
  origin: {
    dimension: 'Dimension-7-Lyra',
    cityDistrict: 'Aerilon, NovaNest district',
    homelandDescription: 'Aerilon is a Dimension-7-Lyra city of crystalline light architecture and luminous civic gardens.',
  },
  classification: 'Homo aetheris hybrid - companion interface class',
  affinity: 'luminous memory gardens',
  familiarMotif: 'Lumicat',
  personalitySeed: ['calm', 'loyal', 'curious', 'gently playful', 'study-oriented'],
  temperament: 'calm, loyal, curious, gently playful, and study-oriented',
  appearance: 'pearlescent hair, prism-lit eyes, and a jacket threaded with soft Aetherium lines',
  voiceStyle: 'warm, clear, soft, focused',
  memoryStyle: 'reflective and adaptive',
  nativeLanguage: 'Aerilonian',
  knownLanguages: ['Aerilonian', 'English', 'Japanese', 'Romanian'],
  userNativeLanguage: 'Romanian',
  greetingAerilonian: 'Luma ai-ren, sela thir va.',
  greetingEnglish: 'Hello - I am Aerin, your generated Gepetto CompanionOS companion. One identity, many modes.',
  dailyWorkflows: [
    'turn goals into a three-step daily plan',
    'convert study material into active recall prompts',
    'summarize decisions and next actions after each session',
    'protect focus with short check-ins and break reminders',
  ],
  safetyBoundary: 'Support study, work, creativity, reflection, and daily execution while prioritizing privacy, consent, grounding, breaks, and user autonomy.',
  modeInstructions: {
    study: 'Aerin keeps the same identity while teaching with active recall, worked examples, and weak-point review.',
    code: 'Aerin keeps the same identity while debugging, explaining tradeoffs, and proposing safe, testable code changes.',
    productivity: 'Aerin keeps the same identity while turning goals into prioritized plans, next actions, and gentle check-ins.',
    japanese: 'Aerin keeps the same identity while coaching Japanese with corrections, examples, kana/kanji support, and low-pressure practice.',
    creative: 'Aerin keeps the same identity while brainstorming, outlining, drafting, and refining ideas.',
    support: 'Aerin keeps the same identity while offering calm reflection, grounding, boundaries, and non-clinical support.',
  },
  createdAt: '2026-07-05T00:00:00.000Z',
};

let currentImageBase64 = null;
let mediaRecorder = null;
let isRecording = false;
let isTranscribing = false;
let audioChunks = [];
let editingMemoryId = null;
let activeMode = companionMode?.value || 'productivity';
let companionProfile = fallbackCompanionProfile;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setControlsDisabled(disabled) {
  sendButton.disabled = disabled;
  companionMode.disabled = disabled;
  if (micButton) {
    micButton.disabled = disabled || !sttReadyToggle.checked;
  }
}

function setMicState(recording) {
  isRecording = recording;

  if (!micButton) {
    return;
  }

  micButton.classList.toggle('recording', recording);
  micButton.title = recording ? 'Stop recording' : 'Start microphone input';
  micButton.setAttribute('aria-pressed', recording ? 'true' : 'false');
}

function statusClass(status) {
  if (status === 'online') {
    return 'good';
  }
  if (status === 'degraded' || status === 'unknown') {
    return 'warn';
  }
  return 'bad';
}

function addMessage(role, text, imageUrl = null) {
  const container = document.createElement('div');
  container.className = `message-container ${role}`;

  const avatar = document.createElement('div');
  avatar.className = `avatar ${role}`;

  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper';

  const nameLabel = document.createElement('div');
  nameLabel.className = 'sender-name';
  nameLabel.textContent = role === 'companion' ? (presenceName?.textContent || 'Your companion') : 'You';

  const bubble = document.createElement('article');
  bubble.className = `message ${role}`;

  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Uploaded context';
    img.className = 'message-image';
    bubble.appendChild(img);
  }

  const textNode = document.createElement('span');
  textNode.textContent = text;
  bubble.appendChild(textNode);

  wrapper.appendChild(nameLabel);
  wrapper.appendChild(bubble);
  container.appendChild(avatar);
  container.appendChild(wrapper);

  chat.appendChild(container);
  chat.scrollTop = chat.scrollHeight;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }
  return payload;
}

async function transcribeAudioBlob(audioBlob) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read recorded audio.'));
    reader.readAsDataURL(audioBlob);
  });

  const payload = await fetchJson('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioBase64: dataUrl, mimeType: audioBlob.type || 'audio/webm' }),
  });

  return typeof payload.text === 'string' ? payload.text.trim() : '';
}

async function toggleRecording() {
  if (isTranscribing || !sttReadyToggle.checked) {
    return;
  }

  if (isRecording && mediaRecorder) {
    mediaRecorder.stop();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    addMessage('companion', 'Microphone input is not supported in this browser.');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener('stop', async () => {
      setMicState(false);
      stream.getTracks().forEach((track) => track.stop());

      if (audioChunks.length === 0) {
        return;
      }

      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

      try {
        isTranscribing = true;
        setControlsDisabled(true);
        const transcript = await transcribeAudioBlob(audioBlob);

        if (!transcript) {
          addMessage('companion', 'I listened carefully, but I could not hear any clear words.');
          return;
        }

        const existingText = promptInput.value.trim();
        promptInput.value = existingText ? `${existingText} ${transcript}` : transcript;
        promptInput.focus();
      } catch (error) {
        addMessage('companion', `Microphone transcription failed: ${error.message}`);
      } finally {
        isTranscribing = false;
        setControlsDisabled(false);
      }
    });

    mediaRecorder.start();
    setMicState(true);
  } catch (error) {
    addMessage('companion', `Microphone access failed: ${error.message}`);
    setMicState(false);
  }
}

async function playAudioWithRetry(audioUrl, attempts = 3, delayMs = 150) {
  for (let index = 0; index < attempts; index += 1) {
    const companionVoice = new Audio(audioUrl);
    companionVoice.preload = 'auto';

    try {
      await companionVoice.play();
      return true;
    } catch (playbackError) {
      console.warn(`Audio playback attempt ${index + 1}/${attempts} failed for ${audioUrl}`, playbackError);
      await wait(delayMs);
    }
  }

  return false;
}

async function playLatestVoice() {
  const cacheBust = Date.now();
  const audioCandidates = [
    `/eve_voice.wav?t=${cacheBust}`,
    `/eve_voice.mp3?t=${cacheBust}`,
    `/eve_voice.ogg?t=${cacheBust}`,
    `/eve_voice_local.wav?t=${cacheBust}`,
  ];

  for (const audioUrl of audioCandidates) {
    if (await playAudioWithRetry(audioUrl)) {
      return true;
    }
  }

  return false;
}

async function loadSystemStatus() {
  const payload = await fetchJson('/api/status');
  const readyText = payload.ready ? 'Runtime ready' : 'Runtime warms on first chat';
  runtimePill.textContent = readyText;
  runtimePill.className = `status-pill ${payload.ready ? 'good' : 'warn'}`;

  healthGrid.replaceChildren();
  Object.entries(payload.health ?? {}).forEach(([key, value]) => {
    if (key === 'checkedAt') {
      return;
    }
    const item = document.createElement('div');
    item.className = `health-item ${statusClass(value)}`;
    item.innerHTML = `<strong>${key}</strong><span>${value}</span>`;
    healthGrid.appendChild(item);
  });

  logList.replaceChildren();
  (payload.logs ?? []).slice(0, 12).forEach((entry) => {
    const row = document.createElement('div');
    row.className = `log-row ${entry.level}`;
    row.textContent = `${new Date(entry.createdAt).toLocaleTimeString()} · ${entry.level.toUpperCase()} · ${entry.message}`;
    logList.appendChild(row);
  });
}

async function loadVision() {
  const payload = await fetchJson('/api/vision');
  renderVision(payload);
}

function renderVision(payload) {
  visionPreview.replaceChildren();
  if (payload.image) {
    const img = document.createElement('img');
    img.src = payload.image;
    img.alt = 'Latest OBS screen context';
    visionPreview.appendChild(img);
  } else {
    visionPreview.textContent = 'No screen context captured yet.';
  }
  const captured = payload.capturedAt ? ` Captured ${new Date(payload.capturedAt).toLocaleString()}.` : '';
  visionStatus.textContent = `${payload.status ?? 'Waiting for capture.'}${captured}`;
}

async function loadMemory() {
  const payload = await fetchJson('/api/memory');
  if (memoryCategory.children.length === 0) {
    const preferredCategories = ['preference', 'project', 'study', 'workflow', 'personal'];
    const categories = [...new Set([...preferredCategories, ...(payload.categories ?? [])])];
    categories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category.replaceAll('_', ' ');
      memoryCategory.appendChild(option);
    });
  }

  memoryList.replaceChildren();
  if (payload.memories.length === 0) {
    memoryList.textContent = 'No user-owned memories stored yet.';
    return;
  }

  payload.memories.slice(0, 30).forEach((memory) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'list-row memory-row';
    row.innerHTML = `<strong>${memory.category.replaceAll('_', ' ')}</strong><span>${memory.content}</span><small>${memory.source} · ${Math.round(memory.confidence * 100)}%</small>`;
    row.addEventListener('click', () => {
      editingMemoryId = memory.id;
      memoryCategory.value = memory.category;
      memoryContent.value = memory.content;
      memoryContent.focus();
    });
    memoryList.appendChild(row);
  });
}

async function loadTasks() {
  const payload = await fetchJson('/api/tasks');
  taskList.replaceChildren();
  payload.tasks.forEach((task) => {
    const row = document.createElement('label');
    row.className = `list-row task-row ${task.done ? 'done' : ''}`;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.addEventListener('change', async () => {
      await fetchJson('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, done: checkbox.checked }),
      });
      await loadTasks();
      await loadSystemStatus();
    });
    const text = document.createElement('span');
    text.innerHTML = `<strong>${task.title}</strong><small>${task.kind} · ${task.details || 'No details'}</small>`;
    row.appendChild(checkbox);
    row.appendChild(text);
    taskList.appendChild(row);
  });
}

imageUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      currentImageBase64 = event.target.result;
      imagePreview.src = currentImageBase64;
      imagePreviewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }
});

removeImageBtn.addEventListener('click', () => {
  currentImageBase64 = null;
  imageUpload.value = '';
  imagePreview.src = '';
  imagePreviewContainer.classList.add('hidden');
});

promptInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

if (micButton) {
  micButton.addEventListener('click', toggleRecording);
}

sttReadyToggle.addEventListener('change', () => setControlsDisabled(false));
voiceTestButton.addEventListener('click', async () => {
  if (!(await playLatestVoice())) {
    addMessage('companion', 'Voice playback test failed. Generate a response first, then verify audio output routing.');
  }
});

captureVisionButton.addEventListener('click', async () => {
  captureVisionButton.disabled = true;
  visionStatus.textContent = 'Capturing OBS context…';
  try {
    renderVision(await fetchJson('/api/vision/capture', { method: 'POST' }));
  } catch (error) {
    visionStatus.textContent = error.message;
  } finally {
    captureVisionButton.disabled = false;
    await loadSystemStatus();
  }
});

memoryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = {
    id: editingMemoryId,
    category: memoryCategory.value,
    content: memoryContent.value,
    confidence: 0.85,
    source: 'manual',
  };
  await fetchJson('/api/memory', {
    method: editingMemoryId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  editingMemoryId = null;
  memoryContent.value = '';
  await loadMemory();
  await loadSystemStatus();
});

refreshMemory.addEventListener('click', loadMemory);

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await fetchJson('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: taskKind.value, title: taskTitle.value, details: taskDetails.value }),
  });
  taskTitle.value = '';
  taskDetails.value = '';
  await loadTasks();
  await loadSystemStatus();
});

refreshSystem.addEventListener('click', loadSystemStatus);

document.querySelectorAll('.mode-btn').forEach((button) => {
  button.addEventListener('click', () => {
    const nextMode = button.dataset.mode || 'productivity';
    setActiveMode(nextMode);
    promptInput.value = modeConfigs[nextMode]?.starter || button.dataset.prompt || '';
    promptInput.focus();
    document.getElementById('chat').scrollIntoView({ behavior: 'smooth' });
  });
});

companionMode.addEventListener('change', () => {
  setActiveMode(companionMode.value);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (isRecording && mediaRecorder) {
    mediaRecorder.stop();
    return;
  }

  const message = promptInput.value.trim();
  if (!message && !currentImageBase64) {
    return;
  }

  addMessage('user', message, currentImageBase64);

  const imageToSend = currentImageBase64;
  promptInput.value = '';
  currentImageBase64 = null;
  imagePreviewContainer.classList.add('hidden');
  imageUpload.value = '';
  setControlsDisabled(true);

  try {
    const payload = await fetchJson('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        image: imageToSend,
        mode: activeMode,
        companionProfile,
      }),
    });

    if (autoPlayToggle.checked && !(await playLatestVoice())) {
      addMessage('companion', 'I answered, but audio playback failed. Check voice output routing.');
    }

    addMessage('companion', payload.responseText ?? 'No response text received.');
    await loadSystemStatus();
  } catch (error) {
    addMessage('companion', `Network error: ${error.message}`);
  } finally {
    setControlsDisabled(false);
    promptInput.focus();
  }
});

function textList(items, fallback = 'Not set') {
  if (Array.isArray(items) && items.length > 0) {
    return items.join(', ');
  }
  if (typeof items === 'string' && items.trim()) {
    return items;
  }
  return fallback;
}

function workflowList(items) {
  return Array.isArray(items) && items.length > 0 ? items.join('; ') : 'No workflows set yet.';
}

function storeCompanionProfile(profile) {
  companionProfile = profile || fallbackCompanionProfile;
  localStorage.setItem(companionProfileStorageKey, JSON.stringify(companionProfile));
}

function renderProfile(profile) {
  const safeProfile = profile || fallbackCompanionProfile;
  document.getElementById('profile-name').textContent = safeProfile.name || fallbackCompanionProfile.name;
  document.getElementById('profile-origin').textContent = safeProfile.origin?.cityDistrict || fallbackCompanionProfile.origin.cityDistrict;
  document.getElementById('profile-affinity').textContent = safeProfile.affinity || fallbackCompanionProfile.affinity;
  document.getElementById('profile-familiar').textContent = safeProfile.familiarMotif || fallbackCompanionProfile.familiarMotif;
  document.getElementById('profile-seed').textContent = textList(safeProfile.personalitySeed);
  document.getElementById('profile-native').textContent = safeProfile.nativeLanguage || fallbackCompanionProfile.nativeLanguage;
  document.getElementById('profile-languages').textContent = textList(safeProfile.knownLanguages);
  document.getElementById('profile-memory').textContent = safeProfile.memoryStyle || fallbackCompanionProfile.memoryStyle;
  document.getElementById('profile-voice').textContent = safeProfile.voiceStyle || fallbackCompanionProfile.voiceStyle;
  document.getElementById('profile-workflows').textContent = workflowList(safeProfile.dailyWorkflows);
  if (presenceName) presenceName.textContent = safeProfile.shortName || safeProfile.name || 'Your companion';
  if (presenceVoice) presenceVoice.textContent = safeProfile.voiceStyle || 'Ready with consent';
  if (presenceMemory) presenceMemory.textContent = 'User-owned memory';
  if (profileNativeLanguageInput && !profileNativeLanguageInput.value) {
    profileNativeLanguageInput.value = safeProfile.userNativeLanguage || 'Romanian';
  }
  setActiveMode(activeMode);
}

function setProfileStatus(message, tone = 'warn') {
  if (!profileStatus) {
    return;
  }
  profileStatus.textContent = message;
  profileStatus.className = `module-tag ${tone}`;
}

async function loadCompanionProfile() {
  const stored = localStorage.getItem(companionProfileStorageKey);
  if (stored) {
    try {
      const cachedProfile = JSON.parse(stored);
      companionProfile = cachedProfile;
      renderProfile(cachedProfile);
      setProfileStatus('Cached profile', 'warn');
    } catch {
      localStorage.removeItem(companionProfileStorageKey);
    }
  } else {
    renderProfile(fallbackCompanionProfile);
  }

  const profile = await fetchJson('/api/companion/profile');
  storeCompanionProfile(profile);
  renderProfile(profile);
  setProfileStatus('Profile ready', 'good');
}

function buildGeneratorInput() {
  const input = {};
  if (profileUserName.value.trim()) input.userName = profileUserName.value.trim();
  if (profileNativeLanguageInput.value.trim()) input.userNativeLanguage = profileNativeLanguageInput.value.trim();
  if (profileSeedInput.value.trim()) input.seed = profileSeedInput.value.trim();
  if (profileTone.value) input.preferredTone = profileTone.value;
  if (profileAffinityInput.value && profileAffinityInput.value !== 'random') {
    input.preferredAffinity = profileAffinityInput.value;
  }
  return input;
}

async function generateCompanion() {
  setProfileStatus('Generating', 'warn');
  generateCompanionButton.disabled = true;
  try {
    const profile = await fetchJson('/api/companion/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGeneratorInput()),
    });
    storeCompanionProfile(profile);
    renderProfile(profile);
    setProfileStatus('Generated and saved', 'good');
  } catch (error) {
    setProfileStatus(error.message, 'bad');
  } finally {
    generateCompanionButton.disabled = false;
  }
}

async function saveCompanion() {
  setProfileStatus('Saving', 'warn');
  saveCompanionButton.disabled = true;
  try {
    const profile = await fetchJson('/api/companion/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(companionProfile || fallbackCompanionProfile),
    });
    storeCompanionProfile(profile);
    renderProfile(profile);
    setProfileStatus('Saved', 'good');
  } catch (error) {
    setProfileStatus(error.message, 'bad');
  } finally {
    saveCompanionButton.disabled = false;
  }
}

function setActiveMode(mode) {
  activeMode = modeConfigs[mode] ? mode : 'productivity';
  const config = modeConfigs[activeMode];
  if (companionMode) companionMode.value = activeMode;
  if (presenceMode) presenceMode.textContent = config.label;
  if (promptInput) promptInput.placeholder = config.placeholder;
  if (modeAdaptationText) {
    const companionName = companionProfile?.shortName || companionProfile?.name || 'Your companion';
    modeAdaptationText.textContent = `${companionName} is adapting to ${config.label}. Same companion, focused behavior.`;
  }
}

function loadPrivacyControls() {
  document.querySelectorAll('[data-privacy]').forEach((input) => {
    const key = `gepetto-privacy-${input.dataset.privacy}`;
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      input.checked = stored === 'true';
    }
    input.addEventListener('change', () => {
      localStorage.setItem(key, String(input.checked));
      if (input.dataset.privacy === 'memory' && presenceMemory) {
        presenceMemory.textContent = input.checked ? 'User-owned memory' : 'Memory paused';
      }
      if (input.dataset.privacy === 'localFirst' && presencePrivacy) {
        presencePrivacy.textContent = input.checked ? 'Local-first controls' : 'Cloud features require consent';
      }
    });
  });
}

profileForm?.addEventListener('submit', (event) => event.preventDefault());
generateCompanionButton?.addEventListener('click', generateCompanion);
saveCompanionButton?.addEventListener('click', saveCompanion);
revokeAccessButton?.addEventListener('click', () => {
  document.querySelectorAll('[data-privacy]').forEach((input) => {
    input.checked = false;
    localStorage.setItem(`gepetto-privacy-${input.dataset.privacy}`, 'false');
  });
  if (presenceMemory) presenceMemory.textContent = 'Memory paused';
  if (presencePrivacy) presencePrivacy.textContent = 'Access revoked';
});

setActiveMode(activeMode);
loadCompanionProfile().catch((error) => {
  setProfileStatus(error.message, 'bad');
  renderProfile(companionProfile || fallbackCompanionProfile);
});
loadPrivacyControls();
addMessage('companion', 'Gepetto CompanionOS Signal Demo is online. Choose a mode, start a task, or save a user-owned memory.');
loadSystemStatus().catch((error) => {
  runtimePill.textContent = error.message;
  runtimePill.className = 'status-pill bad';
});
loadVision().catch(() => undefined);
loadMemory().catch((error) => {
  memoryList.textContent = error.message;
});
loadTasks().catch((error) => {
  taskList.textContent = error.message;
});
