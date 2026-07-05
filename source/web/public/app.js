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
const regenerateProfileButton = document.getElementById('regenerate-profile');
const revokeAccessButton = document.getElementById('revoke-access');
const presenceName = document.getElementById('presence-name');
const presenceMode = document.getElementById('presence-mode');
const presenceVoice = document.getElementById('presence-voice');
const presenceMemory = document.getElementById('presence-memory');
const presencePrivacy = document.getElementById('presence-privacy');

let currentImageBase64 = null;
let mediaRecorder = null;
let isRecording = false;
let isTranscribing = false;
let audioChunks = [];
let editingMemoryId = null;

const profileSeeds = [
  { name: 'Aerin', seed: 'Calm strategist with playful curiosity', voice: 'Warm, clear, focused', memory: 'Consent-based highlights and workflows', languages: 'English, Japanese, Aerilonian', workflows: 'Study sprints, build plans, reflection check-ins' },
  { name: 'Nova', seed: 'Optimistic systems thinker with gentle accountability', voice: 'Bright, concise, encouraging', memory: 'Project milestones, preferences, and study weak points', languages: 'English, Japanese, Spanish', workflows: 'Daily planning, coding blocks, language drills' },
  { name: 'Mira', seed: 'Patient coach with creative momentum', voice: 'Soft, precise, reassuring', memory: 'User-approved goals, routines, and context notes', languages: 'English, Japanese, French', workflows: 'Active recall, writing sessions, calm check-ins' },
];

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
  nameLabel.textContent = role === 'eve' ? (presenceName?.textContent || 'Your companion') : 'You';

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
    addMessage('eve', 'Microphone input is not supported in this browser.');
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
          addMessage('eve', 'I listened carefully, but I could not hear any clear words.');
          return;
        }

        const existingText = promptInput.value.trim();
        promptInput.value = existingText ? `${existingText} ${transcript}` : transcript;
        promptInput.focus();
      } catch (error) {
        addMessage('eve', `Microphone transcription failed: ${error.message}`);
      } finally {
        isTranscribing = false;
        setControlsDisabled(false);
      }
    });

    mediaRecorder.start();
    setMicState(true);
  } catch (error) {
    addMessage('eve', `Microphone access failed: ${error.message}`);
    setMicState(false);
  }
}

async function playAudioWithRetry(audioUrl, attempts = 3, delayMs = 150) {
  for (let index = 0; index < attempts; index += 1) {
    const eveVoice = new Audio(audioUrl);
    eveVoice.preload = 'auto';

    try {
      await eveVoice.play();
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
    addMessage('eve', 'Voice playback test failed. Generate a response first, then verify audio output routing.');
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
    promptInput.value = button.dataset.prompt;
    if (button.dataset.mode) {
      companionMode.value = button.dataset.mode;
    }
    if (button.dataset.label && presenceMode) {
      presenceMode.textContent = button.dataset.label;
    }
    promptInput.focus();
    document.getElementById('chat').scrollIntoView({ behavior: 'smooth' });
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (isRecording && mediaRecorder) {
    mediaRecorder.stop();
    return;
  }

  const prompt = promptInput.value.trim();
  if (!prompt && !currentImageBase64) {
    return;
  }

  addMessage('user', prompt, currentImageBase64);

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
      body: JSON.stringify({ prompt, image: imageToSend, mode: companionMode.value }),
    });

    if (autoPlayToggle.checked && !(await playLatestVoice())) {
      addMessage('eve', 'I answered, but audio playback failed. Check /eve_voice.wav and verify your output device.');
    }

    addMessage('eve', payload.responseText ?? 'No response text received.');
    await loadSystemStatus();
  } catch (error) {
    addMessage('eve', `Network error: ${error.message}`);
  } finally {
    setControlsDisabled(false);
    promptInput.focus();
  }
});

function renderProfile(profile) {
  document.getElementById('profile-name').textContent = profile.name;
  document.getElementById('profile-seed').textContent = profile.seed;
  document.getElementById('profile-voice').textContent = profile.voice;
  document.getElementById('profile-memory').textContent = profile.memory;
  document.getElementById('profile-languages').textContent = profile.languages;
  document.getElementById('profile-workflows').textContent = profile.workflows;
  if (presenceName) presenceName.textContent = profile.name;
  if (presenceVoice) presenceVoice.textContent = profile.voice;
  if (presenceMemory) presenceMemory.textContent = 'User-owned memory';
}

function loadProfile() {
  const stored = localStorage.getItem('gepetto-demo-profile');
  const profile = stored ? JSON.parse(stored) : profileSeeds[0];
  localStorage.setItem('gepetto-demo-profile', JSON.stringify(profile));
  renderProfile(profile);
}

function regenerateProfile() {
  const currentName = document.getElementById('profile-name').textContent;
  const next = profileSeeds.find((profile) => profile.name !== currentName) || profileSeeds[0];
  localStorage.setItem('gepetto-demo-profile', JSON.stringify(next));
  renderProfile(next);
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

regenerateProfileButton?.addEventListener('click', regenerateProfile);
revokeAccessButton?.addEventListener('click', () => {
  document.querySelectorAll('[data-privacy]').forEach((input) => {
    input.checked = false;
    localStorage.setItem(`gepetto-privacy-${input.dataset.privacy}`, 'false');
  });
  if (presenceMemory) presenceMemory.textContent = 'Memory paused';
  if (presencePrivacy) presencePrivacy.textContent = 'Access revoked';
});

loadProfile();
loadPrivacyControls();
addMessage('eve', 'Gepetto CompanionOS Signal Demo is online. Choose a mode, start a task, or save a user-owned memory.');
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
