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
const conversationStatus = document.getElementById('conversation-status');
const connectionStatus = document.getElementById('connection-status');
const latestButton = document.getElementById('jump-to-latest');
let followConversation = true;
let conversationError = false;

function showConversationStatus(message, activity = 'idle') {
  conversationStatus.textContent = message;
  conversationStatus.dataset.activity = activity;
}

function showChatError(message) {
  conversationError = true;
  showConversationStatus(message, 'error');
  addMessage('companion', message);
}

function showConnection(connected) {
  connectionStatus.textContent = connected ? 'Online' : 'Reconnecting';
  connectionStatus.dataset.status = connected ? 'online' : 'offline';
}

function scrollToLatest() {
  followConversation = true;
  chat.scrollTop = chat.scrollHeight;
  latestButton.classList.add('hidden');
}

chat.addEventListener('scroll', () => {
  followConversation = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 48;
  if (followConversation) latestButton.classList.add('hidden');
});
latestButton.addEventListener('click', scrollToLatest);
window.addEventListener('resize', () => { if (followConversation) scrollToLatest(); });
document.getElementById('image-upload-button').addEventListener('click', () => imageUpload.click());

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

const blockedPublicIdentityNames = ['eve', 'lyriel', 'rea'];
const internalLanguageLabels = ['aerilonian'];
const preferredMemoryCategories = [
  'user_profile',
  'projects',
  'language_learning',
  'coding_history',
  'emotional_preferences',
  'startup_tasks',
];
const memoryCategoryLabels = {
  user_profile: 'user profile',
  projects: 'projects',
  language_learning: 'language learning',
  coding_history: 'coding history',
  emotional_preferences: 'emotional preferences',
  blocked_distractions: 'focus blockers',
  startup_tasks: 'tasks and routines',
  robotics_design: 'robotics design',
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
  micButton.setAttribute('aria-label', micButton.title);
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

function addMessage(role, text, imageUrl = null, senderLabel = null) {
  const container = document.createElement('div');
  container.className = `message-container ${role}`;

  const avatar = document.createElement('div');
  avatar.className = `avatar ${role}`;
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = role === 'companion' ? '✧' : 'Y';

  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper';

  const nameLabel = document.createElement('div');
  nameLabel.className = 'sender-name';
  nameLabel.textContent = senderLabel || (role === 'companion' ? (presenceName?.textContent || 'Your companion') : 'You');

  const bubble = document.createElement('article');
  bubble.className = `message ${role}`;

  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Uploaded context';
    img.className = 'message-image';
    img.addEventListener('load', () => { if (followConversation) scrollToLatest(); });
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
  if (followConversation || role === 'user') scrollToLatest();
  else latestButton.classList.remove('hidden');
}

function getConsent() {
  const consent = { microphone: false, camera: false, screen: false, memory: false, study: false, localFirst: true };
  document.querySelectorAll('[data-privacy]').forEach(input => { consent[input.dataset.privacy] = input.checked; });
  return consent;
}

async function fetchJson(url, options = {}) {
  options.headers = { ...options.headers, 'X-Companion-Consent': JSON.stringify(getConsent()) };
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? payload.reason ?? `Request failed: ${response.status}`);
  }
  return payload;
}

let recordedInteractionId = null;
let recordingCancelled = false;
const avatarStateLabel = document.getElementById('avatar-state');
const avatarRenderStatus = document.getElementById('avatar-render-status');
const avatarSettingsStatus = document.getElementById('avatar-settings-status');
const avatarModelInput = document.getElementById('avatar-model-url');
const avatarVoiceInput = document.getElementById('avatar-voice-id');
const avatarParameterInput = document.getElementById('avatar-parameter-map');
let avatarStateVersion = 0;
let presentationGeneration = 0;
let renderedPresentation = null;
let avatarPageClosed = false;
let avatarResponsePending = false;
let studyVisualState = null;
let runtimeAvatarState = { activity: 'idle', emotion: 'neutral' };
const nativeRenderer = new NativeLive2DRenderer(document.getElementById('live2d-canvas'), {
  onStatus({ status, message, missingParameters = [] }) {
    avatarRenderStatus.textContent = message;
    avatarRenderStatus.dataset.status = status;
    if (status === 'ready' && missingParameters.length) {
      avatarRenderStatus.textContent += ` Rig controls not found: ${missingParameters.join(', ')}. Customize parameter names if needed.`;
    }
    document.getElementById('avatar-rig-status').textContent = avatarRenderStatus.textContent;
  },
});
const avatarMedia = new AvatarMediaSession(body => fetchJson('/api/avatar', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), undefined, {
  onState(avatar) {
    ++avatarStateVersion;
    runtimeAvatarState = avatar;
    renderAvatarPresentation();
    if (!conversationError) {
      const feedback = { idle: 'Ready when you are', listening: 'Listening… tap the microphone to finish', thinking: isTranscribing ? 'Transcribing your voice…' : 'Thinking…', speaking: 'Speaking… you can interrupt at any time' };
      showConversationStatus(feedback[avatar.activity] || feedback.idle, avatar.activity);
    }
  },
  onMouth: level => nativeRenderer.setMouth(level),
});

function renderAvatarPresentation() {
  const visual = runtimeAvatarState.activity === 'idle' && !avatarMedia.id && studyVisualState
    ? studyVisualState : runtimeAvatarState;
  nativeRenderer.setState(visual);
  avatarStateLabel.textContent = `${visual.activity} · ${visual.emotion}`;
}

function observeAvatarState(avatar) {
  // A text-only response resets the server owner before its HTTP reply arrives.
  // Show that idle state without discarding the reply still in transit.
  if (avatarResponsePending && avatar?.activity === 'idle' && !avatarMedia.audio) avatarMedia.notifyState(avatar);
  else avatarMedia.observe(avatar);
}

async function applyPresentation(presentation) {
  avatarModelInput.value = presentation.modelUrl || '';
  avatarVoiceInput.value = presentation.voiceId || '';
  avatarParameterInput.value = JSON.stringify(presentation.parameterMap || {}, null, 2);
  avatarSettingsStatus.textContent = `Saved for this companion · ${presentation.backend} backend. Voice and model are independent.`;
  const key = JSON.stringify([presentation.modelUrl, presentation.parameterMap, presentation.backend]);
  if (renderedPresentation === key) return;
  renderedPresentation = key;
  if (['vtube', 'hybrid'].includes(presentation.backend)) {
    await nativeRenderer.loadModel(null);
    avatarRenderStatus.textContent = `The ${presentation.backend} backend uses VTube Studio. Select the native backend at startup to render here.`;
    return;
  }
  try { await nativeRenderer.loadModel(presentation.modelUrl, presentation.parameterMap || {}); }
  catch { renderedPresentation = null; /* The renderer displays the actionable load error. */ }
}

async function loadPresentation() {
  const generation = ++presentationGeneration;
  const presentation = await fetchJson(`/api/companion/presentation?companionMode=${encodeURIComponent(activeMode)}`);
  if (avatarPageClosed || generation !== presentationGeneration || presentation.profileId !== companionProfile.id) return;
  await applyPresentation(presentation);
}

document.getElementById('avatar-settings').addEventListener('submit', async event => {
  event.preventDefault();
  const saveButton = document.getElementById('save-avatar-settings');
  saveButton.disabled = true;
  const generation = ++presentationGeneration;
  const profileId = companionProfile.id;
  const mode = activeMode;
  try {
    const parameterMap = JSON.parse(avatarParameterInput.value || '{}');
    const selection = { profileId, modelUrl: avatarModelInput.value.trim() || null,
      voiceId: avatarVoiceInput.value.trim() || null, parameterMap, companionMode: mode };
    recordingCancelled = true;
    if (isRecording && mediaRecorder) mediaRecorder.stop();
    await avatarMedia.cancel();
    const presentation = await fetchJson('/api/companion/presentation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selection),
    });
    if (avatarPageClosed || generation !== presentationGeneration || profileId !== companionProfile.id || mode !== activeMode) return;
    await applyPresentation(presentation);
  } catch (error) { if (generation === presentationGeneration) avatarSettingsStatus.textContent = error.message; }
  finally { saveButton.disabled = false; }
});

let avatarPolling = false;
const avatarPollTimer = setInterval(async () => {
  if (avatarPolling || avatarPageClosed) return;
  avatarPolling = true;
  const version = avatarStateVersion;
  try {
    const payload = await fetchJson('/api/avatar');
    showConnection(true);
    if (!avatarPageClosed && version === avatarStateVersion) observeAvatarState(payload.avatar);
  } catch { nativeRenderer.setMouth(0); showConnection(false); }
  finally { avatarPolling = false; }
}, 1000);
const stopVoiceButton = document.getElementById('interrupt-voice');
stopVoiceButton.addEventListener('click', () => {
  recordingCancelled = true;
  conversationError = false;
  showConversationStatus('Voice interrupted');
  if (isRecording && mediaRecorder) mediaRecorder.stop();
  avatarMedia.cancel().catch(() => {});
});
autoPlayToggle.addEventListener('change', () => {
  if (!autoPlayToggle.checked) avatarMedia.cancel().catch(() => {});
});
window.addEventListener('pagehide', () => {
  avatarPageClosed = true;
  studySession?.dispose();
  clearInterval(avatarPollTimer);
  if (avatarMedia.id) fetch('/api/avatar', {
    method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'cancel', interactionId: avatarMedia.id }),
  }).catch(() => {});
  recordingCancelled = true;
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
  mediaRecorder?.stream?.getTracks().forEach(track => track.stop());
  avatarMedia.dispose().catch(() => {});
  nativeRenderer.dispose();
});
window.addEventListener('pageshow', event => { if (event.persisted && avatarPageClosed) window.location.reload(); });

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

  if (!getConsent().microphone || getConsent().localFirst) {
    showChatError('Enable microphone consent and disable local-first mode in Privacy & Permissions for cloud transcription.'); return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showChatError('Microphone input is not supported in this browser.');
    return;
  }

  let microphoneStream;
  try {
    conversationError = false;
    showConversationStatus('Opening microphone…', 'listening');
    await avatarMedia.cancel();
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const stream = microphoneStream;
    recordingCancelled = false;
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener('error', () => {
      stream.getTracks().forEach(track => track.stop());
      setMicState(false);
      avatarMedia.cancel().catch(() => {});
      showChatError('Microphone recording failed. Please try again.');
    });
    let recordingSession;
    let recordingId;
    mediaRecorder.addEventListener('start', () => {
      recordingSession = avatarMedia.begin('listening');
      recordingSession.catch(() => { if (mediaRecorder.state !== 'inactive') mediaRecorder.stop(); });
    });
    mediaRecorder.addEventListener('stop', async () => {
      setMicState(false);
      stream.getTracks().forEach((track) => track.stop());

      if (recordingCancelled || audioChunks.length === 0) {
        await avatarMedia.cancel();
        return;
      }

      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

      try {
        isTranscribing = true;
        showConversationStatus('Transcribing your voice…', 'thinking');
        setControlsDisabled(true);
        recordingId = await recordingSession;
        if (avatarMedia.id !== recordingId) return;
        await avatarMedia.event('processing', recordingId);
        const transcript = await transcribeAudioBlob(audioBlob);
        if (avatarMedia.id !== recordingId) return;

        if (!transcript) {
          showChatError('I could not hear any clear words. Please try again.');
          return;
        }

        const existingText = promptInput.value.trim();
        promptInput.value = existingText ? `${existingText} ${transcript}` : transcript;
        recordedInteractionId = recordingId;
        promptInput.focus();
      } catch (error) {
        showChatError(`Microphone transcription failed: ${error.message}`);
      } finally {
        isTranscribing = false;
        setControlsDisabled(false);
        if (recordedInteractionId && avatarMedia.id === recordedInteractionId) form.requestSubmit();
        else if (recordingId) await avatarMedia.finish('ended', recordingId).catch(() => {});
      }
    });

    mediaRecorder.start();
    setMicState(true);
  } catch (error) {
    microphoneStream?.getTracks().forEach(track => track.stop());
    await avatarMedia.cancel().catch(() => {});
    showChatError(`Microphone access failed: ${error.message}`);
    setMicState(false);
  }
}

async function loadSystemStatus() {
  const version = avatarStateVersion;
  const payload = await fetchJson('/api/status');
  showConnection(true);
  if (!avatarPageClosed && version === avatarStateVersion) observeAvatarState(payload.avatar);
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
  if (!getConsent().memory) { memoryList.textContent = 'Enable memory consent to view and manage memories.'; return; }
  const payload = await fetchJson('/api/memory');
  if (memoryCategory.children.length === 0) {
    const categories = [...new Set([...preferredMemoryCategories, ...(payload.categories ?? [])])];
    categories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = formatMemoryCategory(category);
      memoryCategory.appendChild(option);
    });
  }

  memoryList.replaceChildren();
  if (payload.memories.length === 0) {
    memoryList.textContent = 'No user-owned memories stored yet.';
    return;
  }

  payload.memories.slice(0, 30).forEach((memory) => {
    const row = document.createElement('div');
    row.className = 'list-row memory-row';
    const content = document.createElement('span');
    content.textContent = `${formatMemoryCategory(memory.category)}: ${memory.content}`;
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit';
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete';
    remove.addEventListener('click', async () => {
      try {
        await fetchJson('/api/memory', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: memory.id }) });
        if (editingMemoryId === memory.id) { editingMemoryId = null; memoryContent.value = ''; }
        await loadMemory(); await loadSystemStatus();
      } catch (error) { memoryList.textContent = error.message; }
    });
    row.append(content, edit, remove);
    edit.addEventListener('click', () => {
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
    const title = document.createElement('strong'); title.textContent = task.title;
    const details = document.createElement('small'); details.textContent = `${task.kind} · ${task.details || 'No details'}`;
    text.append(title, details);
    row.appendChild(checkbox);
    row.appendChild(text);
    taskList.appendChild(row);
  });
  return payload.tasks;
}

imageUpload.addEventListener('change', (e) => {
  if (!getConsent().camera) { imageUpload.value = ''; showChatError('Enable camera / uploaded image consent in Privacy & Permissions to attach an image.'); return; }
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
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    if (!sendButton.disabled) form.requestSubmit();
  }
});

if (micButton) {
  micButton.addEventListener('click', toggleRecording);
}

sttReadyToggle.addEventListener('change', () => setControlsDisabled(false));
voiceTestButton.addEventListener('click', async () => {
  voiceTestButton.disabled = true;
  conversationError = false;
  avatarResponsePending = true;
  let interactionId;
  try {
    interactionId = await avatarMedia.begin('thinking');
    const payload = await fetchJson('/api/voice/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interactionId, companionMode: activeMode }),
    });
    if (!payload.success) throw new Error(payload.error ?? 'TypeCast voice test failed.');
    if (avatarMedia.id !== interactionId) return;
    if (payload.avatar) avatarMedia.observe(payload.avatar);
    if (!payload.audioUrl || !(await avatarMedia.play(`${payload.audioUrl}?t=${Date.now()}`))) {
      throw new Error('Browser playback failed. Check audio output routing.');
    }
    addMessage('companion', payload.message ?? 'Voice test generated.');
  } catch (error) {
    if (interactionId) await avatarMedia.finish('error', interactionId).catch(() => {});
    showChatError(`Voice test failed: ${error.message}`);
  } finally {
    avatarResponsePending = false;
    voiceTestButton.disabled = false;
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
  try {
  await fetchJson('/api/memory', {
    method: editingMemoryId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  editingMemoryId = null;
  memoryContent.value = '';
  await loadMemory();
  await loadSystemStatus();
  } catch (error) { memoryList.textContent = error.message; }
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
    window.companionWorkspace?.closeSettings();
    promptInput.focus();
  });
});

companionMode.addEventListener('change', () => {
  setActiveMode(companionMode.value);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (sendButton.disabled) return;

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
  conversationError = false;
  showConversationStatus('Thinking…', 'thinking');
  promptInput.value = '';
  currentImageBase64 = null;
  imagePreviewContainer.classList.add('hidden');
  imageUpload.value = '';
  setControlsDisabled(true);

  let interactionId;
  avatarResponsePending = true;
  try {
    interactionId = recordedInteractionId ?? await avatarMedia.begin('thinking');
    recordedInteractionId = null;
    const payload = await fetchJson('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        interactionId,
        audioEnabled: autoPlayToggle.checked,
        image: imageToSend,
        mode: activeMode,
        companionProfile,
      }),
    });

    if (avatarMedia.id !== interactionId) return;
    if (payload.avatar) avatarMedia.observe(payload.avatar);
    if (autoPlayToggle.checked && payload.spokenText && payload.audioUrl) {
      if (!(await avatarMedia.play(`${payload.audioUrl}?t=${Date.now()}`))) {
        showChatError('I answered, but audio playback failed. Check voice output routing.');
      }
    } else {
      await avatarMedia.finish('ended', interactionId);
    }

    addMessage('companion', payload.responseText ?? 'No response text received.');
    await loadSystemStatus();
  } catch (error) {
    if (interactionId) await avatarMedia.finish('error', interactionId).catch(() => {});
    showChatError(`Could not send your message: ${error.message}`);
  } finally {
    avatarResponsePending = false;
    setControlsDisabled(false);
    if (!document.getElementById('settings-drawer').open) promptInput.focus();
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

function normalizePublicText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

function hasBlockedPublicIdentityName(value) {
  const normalized = normalizePublicText(value);
  return blockedPublicIdentityNames.some((name) => normalized.includes(name));
}

function publicCompanionName(profile, useShortName = false) {
  const candidate = useShortName ? (profile.shortName || profile.name) : profile.name;
  if (candidate && !hasBlockedPublicIdentityName(candidate)) {
    return candidate;
  }
  return useShortName ? 'Companion' : 'Generated Gepetto companion';
}

function publicLanguages(profile) {
  const languages = Array.isArray(profile.knownLanguages) ? profile.knownLanguages : [];
  const visibleLanguages = languages.filter((language) => !internalLanguageLabels.includes(language.toLowerCase()));
  const userLanguage = profile.userNativeLanguage;

  if (userLanguage && !visibleLanguages.some((language) => language.toLowerCase() === userLanguage.toLowerCase())) {
    visibleLanguages.push(userLanguage);
  }

  return textList(visibleLanguages, "English, Japanese, and the user's native language");
}

function formatMemoryCategory(category) {
  return memoryCategoryLabels[category] || String(category || 'memory').replaceAll('_', ' ');
}

function storeCompanionProfile(profile) {
  companionProfile = profile || fallbackCompanionProfile;
  localStorage.setItem(companionProfileStorageKey, JSON.stringify(companionProfile));
}

function renderProfile(profile) {
  const safeProfile = profile || fallbackCompanionProfile;
  document.getElementById('profile-name').textContent = publicCompanionName(safeProfile);
  document.getElementById('profile-origin').textContent = 'Persistent across chat, voice, memory, tasks, and modes.';
  document.getElementById('profile-affinity').textContent = 'Study, code, productivity, Japanese, creative, and support modes.';
  document.getElementById('profile-familiar').textContent = 'Public generated avatar cue';
  document.getElementById('profile-seed').textContent = textList(safeProfile.personalitySeed);
  document.getElementById('profile-native').textContent = 'User language first; Japanese coach available.';
  document.getElementById('profile-languages').textContent = publicLanguages(safeProfile);
  document.getElementById('profile-memory').textContent = safeProfile.memoryStyle || fallbackCompanionProfile.memoryStyle;
  document.getElementById('profile-voice').textContent = safeProfile.voiceStyle || fallbackCompanionProfile.voiceStyle;
  document.getElementById('profile-workflows').textContent = workflowList(safeProfile.dailyWorkflows);
  if (presenceName) presenceName.textContent = publicCompanionName(safeProfile, true);
  document.getElementById('stage-companion-name').textContent = publicCompanionName(safeProfile, true);
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
  await loadPresentation();
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
    await loadPresentation();
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
    await loadPresentation();
  } catch (error) {
    setProfileStatus(error.message, 'bad');
  } finally {
    saveCompanionButton.disabled = false;
  }
}

function setActiveMode(mode) {
  const previousMode = activeMode;
  activeMode = modeConfigs[mode] ? mode : 'productivity';
  const config = modeConfigs[activeMode];
  if (companionMode) companionMode.value = activeMode;
  if (presenceMode) presenceMode.textContent = config.label;
  if (promptInput) promptInput.placeholder = config.placeholder;
  if (modeAdaptationText) {
    const companionName = companionProfile?.shortName || companionProfile?.name || 'Your companion';
    modeAdaptationText.textContent = `${companionName} is adapting to ${config.label}. Same companion, focused behavior.`;
  }
  if (previousMode !== activeMode) loadPresentation().catch(error => { avatarSettingsStatus.textContent = error.message; });
}

function loadPrivacyControls() {
  document.querySelectorAll('[data-privacy]').forEach((input) => {
    const key = `gepetto-privacy-${input.dataset.privacy}`;
    // Study persistence always needs a fresh explicit grant for this visit.
    const stored = input.dataset.privacy === 'study' ? null : localStorage.getItem(key);
    if (input.dataset.privacy === 'study') input.checked = false;
    if (stored !== null) {
      input.checked = stored === 'true';
    }
    input.addEventListener('change', () => {
      if (input.dataset.privacy !== 'study') localStorage.setItem(key, String(input.checked));
      if (input.dataset.privacy === 'study') studySession?.consentChanged();
      if (!getConsent().microphone && isRecording && mediaRecorder) mediaRecorder.stop();
      if (!getConsent().screen) { visionPreview.replaceChildren(); visionStatus.textContent = 'Screen consent disabled.'; }
      if (!getConsent().camera) removeImageBtn.click();
      if (input.dataset.privacy === 'memory') loadMemory().catch(error => { memoryList.textContent = error.message; });
      if (input.dataset.privacy === 'memory' && presenceMemory) {
        presenceMemory.textContent = input.checked ? 'User-owned memory' : 'Memory paused';
      }
      if (input.dataset.privacy === 'localFirst' && presencePrivacy) {
        presencePrivacy.textContent = input.checked ? 'Local-first controls' : 'Cloud features require consent';
        if (input.checked) {
          recordingCancelled = true;
          avatarMedia.cancel().catch(() => {});
        }
      }
    });
  });
}

profileForm?.addEventListener('submit', (event) => event.preventDefault());
generateCompanionButton?.addEventListener('click', generateCompanion);
saveCompanionButton?.addEventListener('click', saveCompanion);
revokeAccessButton?.addEventListener('click', () => {
  recordingCancelled = true;
  avatarMedia.cancel().catch(() => {});
  document.querySelectorAll('[data-privacy]').forEach((input) => {
    input.checked = input.dataset.privacy === 'localFirst';
    localStorage.setItem(`gepetto-privacy-${input.dataset.privacy}`, String(input.checked));
  });
  if (isRecording && mediaRecorder) mediaRecorder.stop();
  loadMemory();
  removeImageBtn.click();
  visionPreview.replaceChildren();
  visionStatus.textContent = 'Screen consent disabled.';
  if (presenceMemory) presenceMemory.textContent = 'Memory paused';
  if (presencePrivacy) presencePrivacy.textContent = 'Access revoked';
  studySession?.consentChanged();
});

const studySession = typeof RoboticsStudySession === 'undefined' ? null : new RoboticsStudySession({
  element: id => document.getElementById(id), request: fetchJson, getConsent,
  refreshTasks: loadTasks, approve: message => window.confirm(message),
  onActivity(activity) {
    // Browser expression only. Media ownership always takes precedence; no body command is sent.
    studyVisualState = activity === 'closed' ? null : {
      activity: activity === 'answering' ? 'listening' : activity === 'checking' ? 'thinking' : 'idle',
      emotion: activity === 'correct' ? 'amazed' : 'neutral',
    };
    renderAvatarPresentation();
  },
});

setActiveMode(activeMode);
loadCompanionProfile().catch((error) => {
  setProfileStatus(error.message, 'bad');
  renderProfile(companionProfile || fallbackCompanionProfile);
});
loadPrivacyControls();
addMessage('companion', 'I’m here with you. What would you like to work on today?', null, 'Your companion');
loadSystemStatus().catch((error) => {
  runtimePill.textContent = error.message;
  runtimePill.className = 'status-pill bad';
  showConnection(false);
});
loadVision().catch(() => undefined);
loadMemory().catch((error) => {
  memoryList.textContent = error.message;
});
loadTasks().catch((error) => {
  taskList.textContent = error.message;
});
