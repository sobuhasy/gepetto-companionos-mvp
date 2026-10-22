/* Playback-only analysis: no microphone input, fetches, or separate audio player. */
class AvatarPlaybackMeter {
  constructor(onMouth, options = {}) {
    this.onMouth = onMouth;
    this.makeContext = options.makeAudioContext || (() => {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      return AudioContext ? new AudioContext() : null;
    });
    this.requestFrame = options.requestFrame || (callback => globalThis.requestAnimationFrame(callback));
    this.cancelFrame = options.cancelFrame || (frame => globalThis.cancelAnimationFrame(frame));
    this.context = null;
    this.records = new WeakMap();
    this.graph = null;
    this.frame = null;
    this.epoch = 0;
    this.closed = false;
  }
  emit(value) {
    try { this.onMouth?.(value); } catch { /* Rendering must not interrupt playback. */ }
  }
  warmup() {
    if (this.closed || !this.onMouth) return;
    try {
      this.context ||= this.makeContext();
      // Called before begin() awaits the network, while user activation is available.
      if (this.context?.state === 'suspended') Promise.resolve(this.context.resume()).catch(() => {});
    } catch { /* Web Audio is optional; leave HTMLAudioElement playback intact. */ }
  }
  start(audio, ownsPlayback) {
    this.stop();
    this.warmup();
    const context = this.context;
    // Do not redirect an element into a suspended or unavailable audio context.
    if (!context || context.state !== 'running' || !ownsPlayback()) return;
    let record = this.records.get(audio);
    try {
      if (!record) {
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0;
        // Create the source last: this operation redirects the element's output.
        record = { analyser, samples: new Float32Array(analyser.fftSize), source: context.createMediaElementSource(audio) };
        this.records.set(audio, record);
      }
      this.graph = record;
      record.source.disconnect();
      record.source.connect(record.analyser);
      record.analyser.connect(context.destination);
      const epoch = this.epoch;
      const sample = () => {
        if (epoch !== this.epoch || this.graph !== record) return;
        this.frame = null;
        if (!ownsPlayback() || context.state !== 'running' || audio.paused || audio.ended) {
          this.stop();
          return;
        }
        try {
          record.analyser.getFloatTimeDomainData(record.samples);
          let squared = 0;
          for (const value of record.samples) squared += value * value;
          // A small noise gate prevents the mouth drifting open over digital silence.
          const rms = Math.sqrt(squared / record.samples.length);
          this.emit(Math.max(0, Math.min(1, (rms - 0.012) * 5)));
          this.frame = this.requestFrame(sample);
        } catch {
          this.stop();
        }
      };
      this.frame = this.requestFrame(sample);
    } catch {
      // If graph setup fails after redirection, preserve ordinary audio output.
      this.stop();
      if (record) {
        try { record.source.disconnect(); record.source.connect(context.destination); } catch { /* Device unavailable. */ }
      }
    }
  }
  stop() {
    ++this.epoch;
    if (this.frame !== null) {
      try { this.cancelFrame(this.frame); } catch { /* Browser is unloading. */ }
      this.frame = null;
    }
    const graph = this.graph;
    this.graph = null;
    if (graph) {
      // Keep a direct route while buffering; disconnecting a source would mute it.
      try { graph.source.disconnect(); } catch { /* Already disconnected. */ }
      try { graph.analyser.disconnect(); } catch { /* Already disconnected. */ }
      try { graph.source.connect(this.context.destination); } catch { /* Device unavailable. */ }
    }
    this.emit(0);
  }
  disconnect(audio) {
    this.stop();
    const graph = audio && this.records.get(audio);
    if (graph) {
      try { graph.source.disconnect(); } catch { /* Already disconnected. */ }
      try { graph.analyser.disconnect(); } catch { /* Already disconnected. */ }
    }
  }
  async dispose() {
    this.closed = true;
    this.stop();
    const context = this.context;
    this.context = null;
    this.records = new WeakMap();
    try { await context?.close(); } catch { /* Browser is unloading. */ }
  }
}

/* Browser media events are forwarded to the backend RobotBody owner. */
class AvatarMediaSession {
  constructor(send, makeAudio = url => new Audio(url), options = {}) {
    this.send = send;
    this.makeAudio = makeAudio;
    this.onState = options.onState;
    this.meter = new AvatarPlaybackMeter(options.onMouth, options);
    this.id = null;
    this.audio = null;
    this.audioListeners = [];
    this.queue = Promise.resolve();
    this.timer = null;
    this.generation = 0;
    this.disposed = false;
  }
  notifyState(avatar) {
    if (avatar) {
      try { this.onState?.(avatar); } catch { /* Rendering is independent of ownership. */ }
    }
  }
  stopPlayback() {
    const audio = this.audio;
    this.audio = null;
    for (const [event, listener] of this.audioListeners) audio?.removeEventListener(event, listener);
    this.audioListeners = [];
    this.meter.disconnect(audio);
    // Remove listeners first: a synchronous pause event cannot finish the next owner.
    try { audio?.pause(); } catch { /* An unavailable output is already stopped. */ }
  }
  release() {
    ++this.generation;
    clearInterval(this.timer);
    this.timer = null;
    const id = this.id;
    this.id = null;
    this.stopPlayback();
    return id;
  }
  request(event, id, generation, finished = false) {
    this.queue = this.queue.catch(() => {}).then(async () => {
      const result = await this.send({ event, interactionId: id });
      if (generation !== this.generation || (this.id !== id && !(finished && this.id === null))) return result;
      if (this.id === id && (result?.accepted === false || result?.avatar?.activity === 'idle')) this.release();
      this.notifyState(result?.avatar);
      return result;
    }).catch(error => {
      if (generation === this.generation && (this.id === id || (finished && this.id === null))) this.release();
      throw error;
    });
    return this.queue;
  }
  event(event, id = this.id) {
    if (!id || id !== this.id || this.disposed) return Promise.resolve();
    return this.request(event, id, this.generation);
  }
  async begin(activity) {
    if (this.disposed) throw new Error('Avatar media session is disposed');
    this.meter.warmup();
    await this.cancel();
    const generation = ++this.generation;
    const result = await this.send({ event: 'begin', activity });
    if (generation !== this.generation || this.disposed) {
      if (result?.interactionId) await this.send({ event: 'cancel', interactionId: result.interactionId });
      throw new Error('Interaction cancelled');
    }
    if (!result?.interactionId) throw new Error('Avatar interaction was not accepted');
    this.id = result.interactionId;
    this.notifyState(result.avatar);
    const id = this.id;
    this.timer = setInterval(() => { this.event('heartbeat', id).catch(() => {}); }, 5000);
    return id;
  }
  async finish(event = 'ended', id = this.id) {
    if (!id || id !== this.id) return;
    this.release();
    await this.request(event, id, this.generation, true);
  }
  async cancel() {
    const id = this.release();
    if (id) await this.request('cancel', id, this.generation, true);
  }
  // A status observer may report server watchdog expiry before the next heartbeat.
  observe(avatar) {
    if (avatar?.activity === 'idle' && this.id) this.release();
    this.notifyState(avatar);
  }
  async play(url) {
    const id = this.id;
    const generation = this.generation;
    if (!id || this.disposed) { this.meter.emit(0); return false; }
    this.stopPlayback();
    this.meter.warmup();
    let audio;
    try { audio = this.makeAudio(url); }
    catch { await this.finish('error', id); return false; }
    this.audio = audio;
    audio.preload = 'auto';
    const ownsPlayback = () => this.id === id && this.audio === audio && this.generation === generation && !this.disposed;
    let playing = false;
    let playbackEpoch = 0;
    const listen = (event, listener) => {
      audio.addEventListener(event, listener);
      this.audioListeners.push([event, listener]);
    };
    listen('playing', () => {
      if (!ownsPlayback()) return;
      playing = true;
      const epoch = ++playbackEpoch;
      this.event('playing', id).then(result => {
        if (ownsPlayback() && playing && epoch === playbackEpoch && result?.accepted !== false) this.meter.start(audio, () => ownsPlayback() && playing);
      }).catch(() => {});
    });
    for (const event of ['waiting', 'stalled']) listen(event, () => {
      if (ownsPlayback()) { playing = false; ++playbackEpoch; this.meter.stop(); }
    });
    for (const event of ['ended', 'error', 'pause']) listen(event, () => {
      if (ownsPlayback()) this.finish(event === 'ended' ? 'ended' : 'error', id).catch(() => {});
    });
    try { await audio.play(); return ownsPlayback(); }
    catch {
      if (ownsPlayback()) await this.finish('error', id);
      return false;
    }
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    // Local audio/resources are released before any pending network cancellation.
    const cancellation = this.cancel();
    await Promise.all([cancellation, this.meter.dispose()]);
  }
}
if (typeof module !== 'undefined') module.exports = { AvatarMediaSession, AvatarPlaybackMeter };
