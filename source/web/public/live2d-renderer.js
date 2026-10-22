/* Host-independent Cubism canvas renderer. No microphone, TTS, IPC or socket ownership. */
(function (root) {
  'use strict';
  const DEFAULT_PARAMETERS = Object.freeze({
    angleX: 'ParamAngleX', angleY: 'ParamAngleY', angleZ: 'ParamAngleZ',
    bodyAngleX: 'ParamBodyAngleX', eyeLOpen: 'ParamEyeLOpen', eyeROpen: 'ParamEyeROpen',
    eyeBallX: 'ParamEyeBallX', eyeBallY: 'ParamEyeBallY', browLY: 'ParamBrowLY',
    browRY: 'ParamBrowRY', mouthOpen: 'ParamMouthOpenY', mouthForm: 'ParamMouthForm', breath: 'ParamBreath',
  });
  const activities = new Set(['idle', 'listening', 'thinking', 'speaking']);
  const emotions = new Set(['neutral', 'love', 'angry', 'sad', 'amazed', 'sleepy', 'nervous']);
  const frameworks = new WeakMap();
  let sdkLoading;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function localAssetUrl(path, base, extension) {
    if (typeof path !== 'string' || !path || /[\\\u0000-\u001f]/.test(path)) throw new Error('Invalid local model asset path.');
    // Decode before checking so encoded traversal and alternate separators cannot bypass containment.
    let decoded;
    try { decoded = decodeURIComponent(path); } catch { throw new Error('Invalid model asset encoding.'); }
    if (decoded.split('/').includes('..') || /[\\%?#:\u0000-\u001f]/.test(decoded) || path.startsWith('//')) {
      throw new Error('Model assets must stay inside the local /models/ directory.');
    }
    const url = new URL(path, base);
    if (url.origin !== new URL(base).origin || !url.pathname.startsWith('/models/') || !url.pathname.toLowerCase().endsWith(extension)) {
      throw new Error(`Expected a local /models/ asset ending in ${extension}.`);
    }
    return url.href;
  }

  function poseForState(state, seconds, mouth) {
    const phase = seconds % 4.7;
    const blink = phase > 4.5 ? Math.abs(phase - 4.6) / 0.1 : 1;
    const pose = { angleX: Math.sin(seconds * 0.7) * 2, angleY: Math.sin(seconds * 0.5),
      angleZ: Math.sin(seconds * 0.4), bodyAngleX: Math.sin(seconds * 0.55),
      eyeLOpen: blink, eyeROpen: blink, eyeBallX: 0, eyeBallY: 0,
      browLY: 0, browRY: 0, mouthForm: 0, mouthOpen: 0, breath: (Math.sin(seconds * 1.8) + 1) / 2 };
    if (state.activity === 'listening') Object.assign(pose, { angleX: 3, angleY: 7, angleZ: -4, bodyAngleX: 2, browLY: 0.25, browRY: 0.25 });
    if (state.activity === 'thinking') Object.assign(pose, { angleX: -12, angleY: 8, angleZ: 7, eyeBallX: 0.65, eyeBallY: 0.4, eyeLOpen: blink * 0.7, eyeROpen: blink * 0.7, browLY: 0.4, browRY: -0.15 });
    if (state.activity === 'speaking') Object.assign(pose, { angleY: Math.sin(seconds * 4) * 2, bodyAngleX: Math.sin(seconds * 2) * 2, mouthForm: 0.15, mouthOpen: clamp(mouth, 0, 1) });
    switch (state.emotion) {
      case 'love': Object.assign(pose, { mouthForm: 0.8, browLY: 0.35, browRY: 0.35 }); break;
      case 'angry': Object.assign(pose, { mouthForm: -0.5, browLY: -0.75, browRY: -0.75 }); break;
      case 'sad': Object.assign(pose, { mouthForm: -0.6, angleY: -5, browLY: -0.4, browRY: -0.4 }); break;
      case 'amazed': Object.assign(pose, { browLY: 0.8, browRY: 0.8, eyeLOpen: blink * 1.2, eyeROpen: blink * 1.2 }); break;
      case 'sleepy': Object.assign(pose, { eyeLOpen: blink * 0.35, eyeROpen: blink * 0.35, angleY: -4 }); break;
      case 'nervous': Object.assign(pose, { angleZ: Math.sin(seconds * 5) * 2, browLY: 0.5, browRY: -0.3, mouthForm: -0.25 }); break;
    }
    return pose;
  }

  class Live2DParameterDriver {
    constructor(model, framework, setting, overrides = {}) {
      this.model = model;
      this.parameters = new Map();
      const known = new Map();
      for (let i = 0; i < model.getParameterCount(); i++) known.set(model.getParameterId(i), i);
      const idManager = framework.getIdManager();
      for (const [key, id] of Object.entries({ ...DEFAULT_PARAMETERS, ...overrides })) {
        const index = known.get(idManager.getId(id));
        if (index !== undefined) this.parameters.set(key, [index]);
      }
      // Prefer the rig's own LipSync group, unless the user explicitly maps the mouth.
      if (!overrides.mouthOpen && setting.getLipSyncParameterCount()) {
        const indices = [];
        for (let i = 0; i < setting.getLipSyncParameterCount(); i++) {
          const index = known.get(setting.getLipSyncParameterId(i));
          if (index !== undefined) indices.push(index);
        }
        if (indices.length) this.parameters.set('mouthOpen', indices);
      }
      if (setting.getEyeBlinkParameterCount && !overrides.eyeLOpen && !overrides.eyeROpen) {
        const indices = [];
        for (let i = 0; i < setting.getEyeBlinkParameterCount(); i++) {
          const index = known.get(setting.getEyeBlinkParameterId(i));
          if (index !== undefined) indices.push(index);
        }
        if (indices.length) { this.parameters.set('eyeLOpen', indices); this.parameters.delete('eyeROpen'); this.groupedEyes = true; }
      }
    }
    apply(pose) {
      for (const [key, indices] of this.parameters) {
        for (const index of indices) {
          this.model.setParameterValueByIndex(index, clamp(pose[key], this.model.getParameterMinimumValue(index), this.model.getParameterMaximumValue(index)));
        }
      }
    }
    closeMouth() {
      for (const index of this.parameters.get('mouthOpen') || []) this.model.setParameterValueByIndex(index, 0);
    }
    get missing() { return Object.keys(DEFAULT_PARAMETERS).filter(key => !this.parameters.has(key) && !(key === 'eyeROpen' && this.groupedEyes)); }
  }

  function script(src) {
    return new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = src;
      element.onload = resolve;
      element.onerror = () => { element.remove(); reject(new Error('Install the official Cubism SDK with npm run setup:live2d. See docs/native-live2d.md.')); };
      document.head.appendChild(element);
    });
  }
  async function loadOfficialSdk() {
    if (root.CompanionCubism && root.Live2DCubismCore) return root.CompanionCubism;
    sdkLoading ??= (async () => {
      if (!root.Live2DCubismCore) await script('/live2d/live2dcubismcore.min.js');
      if (!root.CompanionCubism) await script('/live2d/cubism-framework.js');
      if (!root.CompanionCubism || !root.Live2DCubismCore) throw new Error('The local Cubism SDK is incomplete. Run setup:live2d again.');
      return root.CompanionCubism;
    })().catch(error => { sdkLoading = undefined; throw error; });
    return sdkLoading;
  }
  function acquireFramework(sdk) {
    const count = frameworks.get(sdk) || 0;
    if (!count) {
      if (!sdk.CubismFramework.startUp()) throw new Error('Cubism Core could not start. Check the installed SDK version.');
      sdk.CubismFramework.initialize();
    }
    frameworks.set(sdk, count + 1);
  }
  function releaseFramework(sdk) {
    const count = frameworks.get(sdk) || 0;
    if (count > 1) frameworks.set(sdk, count - 1);
    else { frameworks.delete(sdk); sdk.CubismFramework.dispose(); sdk.CubismFramework.cleanUp(); }
  }
  function decodeImage(blob, signal) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(blob);
      const finish = (error) => {
        image.onload = image.onerror = null;
        signal.removeEventListener('abort', abort);
        URL.revokeObjectURL(url);
        if (error) { image.src = ''; reject(error); } else resolve(image);
      };
      const abort = () => finish(new DOMException('Model load cancelled', 'AbortError'));
      image.onload = () => finish();
      image.onerror = () => finish(new Error('A Live2D texture could not be decoded.'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort(); else image.src = url;
    });
  }

  class NativeLive2DRenderer {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.options = options;
      this.fetch = options.fetch || root.fetch.bind(root);
      this.getSdk = options.getSdk || loadOfficialSdk;
      this.decodeImage = options.decodeImage || decodeImage;
      this.raf = options.requestAnimationFrame || root.requestAnimationFrame.bind(root);
      this.cancelRaf = options.cancelAnimationFrame || root.cancelAnimationFrame.bind(root);
      this.origin = options.origin || root.location.origin;
      this.state = { activity: 'idle', emotion: 'neutral' };
      this.mouth = 0;
      this.generation = 0;
      this.disposed = false;
      this.loading = 0;
      this.idleWaiters = [];
      this.contextLost = false;
      this.resetSdkWhenIdle = false;
      this.resource = null;
      this.onLost = event => {
        event.preventDefault();
        this.contextLost = true;
        this.unload();
        this.resetSdkWhenIdle = true;
        if (!this.loading) this.releaseSdk();
        this.status('error', 'Graphics context lost. Waiting for the browser to restore it.');
      };
      this.onRestored = async () => {
        this.contextLost = false;
        if (this.loading) await new Promise(resolve => this.idleWaiters.push(resolve));
        if (this.modelUrl && !this.disposed && !this.contextLost) this.loadModel(this.modelUrl, this.parameterMap).catch(() => {});
      };
      canvas.addEventListener('webglcontextlost', this.onLost);
      canvas.addEventListener('webglcontextrestored', this.onRestored);
    }
    status(status, message, extra = {}) { this.options.onStatus?.({ status, message, ...extra }); }
    setState(state) {
      this.state = { activity: activities.has(state?.activity) ? state.activity : 'idle', emotion: emotions.has(state?.emotion) ? state.emotion : 'neutral' };
      if (this.state.activity !== 'speaking') this.setMouth(0);
    }
    setMouth(level) {
      this.mouth = this.state.activity === 'speaking' && Number.isFinite(level) ? clamp(level, 0, 1) : 0;
      if (!this.mouth) this.resource?.driver?.closeMouth();
    }
    async read(url, signal) {
      // Do not follow redirects out of the local asset tree, even if a model was edited externally.
      const response = await this.fetch(url, { signal, redirect: 'error', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Local Live2D asset was unavailable (${response.status}). Check the model path and its companion files.`);
      return response;
    }
    async loadModel(path, parameterMap = {}) {
      if (this.disposed) throw new Error('Live2D renderer has been disposed.');
      this.unload();
      this.modelUrl = path;
      this.parameterMap = parameterMap;
      if (this.contextLost) return false;
      if (!path) { this.status('empty', 'Choose an authorized local .model3.json model to show your companion.'); return false; }
      const generation = this.generation;
      const controller = new AbortController();
      this.controller = controller;
      const { signal } = controller;
      ++this.loading;
      let resource;
      const check = () => { if (generation !== this.generation || signal.aborted || this.disposed) throw new DOMException('Model load cancelled', 'AbortError'); };
      this.status('loading', 'Loading local Live2D model…');
      try {
        const url = localAssetUrl(path, `${this.origin}/`, '.model3.json');
        const sdk = await this.getSdk(); check();
        if (!this.sdk) { acquireFramework(sdk); this.sdk = sdk; }
        const contextOptions = { alpha: true, premultipliedAlpha: true, antialias: true };
        const gl = this.canvas.getContext('webgl2', contextOptions) || this.canvas.getContext('webgl', contextOptions);
        if (!gl) throw new Error('WebGL is unavailable in this browser.');
        this.gl = gl;
        const buffer = await (await this.read(url, signal)).arrayBuffer(); check();
        const json = JSON.parse(new TextDecoder().decode(buffer));
        const refs = json.FileReferences;
        if (json.Version !== 3 || !refs || typeof refs.Moc !== 'string' || !Array.isArray(refs.Textures) || !refs.Textures.length) {
          throw new Error('Expected a Cubism 3+ .model3.json with a moc3 and texture files.');
        }
        resource = { sdk, gl, textures: [], user: new sdk.CubismUserModel() };
        resource.setting = new sdk.CubismModelSettingJson(buffer, buffer.byteLength);
        const moc = await (await this.read(localAssetUrl(refs.Moc, url, '.moc3'), signal)).arrayBuffer(); check();
        resource.user.loadModel(moc, true);
        resource.model = resource.user.getModel();
        if (!resource.model) throw new Error('Cubism could not load this moc3. Check model integrity and SDK compatibility.');
        const matrix = resource.user.getModelMatrix();
        matrix.setHeight(2);
        // Cubism drawable coordinates already use the model's exported origin.
        // centerX/Y would apply a second offset and crop ordinary centered rigs.
        if (json.Layout && sdk.csmMap) {
          const layout = new sdk.csmMap();
          for (const [key, value] of Object.entries(json.Layout)) {
            if (Number.isFinite(value)) {
              if (typeof layout.setValue === 'function') layout.setValue(key, value);
              else layout.set(key, value);
            }
          }
          matrix.setupFromLayout(layout);
        }
        resource.user.createRenderer(this.canvas.width, this.canvas.height);
        const renderer = resource.user.getRenderer();
        renderer.startUp(gl);
        renderer.setIsPremultipliedAlpha(true);
        for (let i = 0; i < refs.Textures.length; i++) {
          const response = await this.read(localAssetUrl(refs.Textures[i], url, '.png'), signal);
          const image = await this.decodeImage(await response.blob(), signal); check();
          const texture = gl.createTexture();
          if (!texture) throw new Error('Unable to allocate a Live2D texture.');
          resource.textures.push(texture);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          renderer.bindTexture(i, texture);
        }
        if (refs.Physics && sdk.CubismPhysics) {
          const data = await (await this.read(localAssetUrl(refs.Physics, url, '.physics3.json'), signal)).arrayBuffer(); check();
          resource.physics = sdk.CubismPhysics.create(data, data.byteLength);
        }
        if (refs.Pose && sdk.CubismPose) {
          const data = await (await this.read(localAssetUrl(refs.Pose, url, '.pose3.json'), signal)).arrayBuffer(); check();
          resource.pose = sdk.CubismPose.create(data, data.byteLength);
        }
        if (renderer.loadShaders) {
          if (!sdk.prepareRenderer) throw new Error('The Cubism shader bridge is missing. Run npm run setup:live2d again.');
          // The SDK owns these async fetches. Await completion even if this load is
          // superseded, so Framework disposal cannot race shader compilation.
          await sdk.prepareRenderer(renderer, gl, '/live2d/shaders/'); check();
        }
        resource.driver = new Live2DParameterDriver(resource.model, sdk.CubismFramework, resource.setting, parameterMap);
        resource.projection = new sdk.CubismMatrix44();
        this.resource = resource;
        this.status('ready', 'Local Live2D model ready.', { missingParameters: resource.driver.missing });
        this.lastFrame = null;
        this.frame = this.raf(time => this.draw(time, resource, generation));
        return true;
      } catch (error) {
        this.release(resource);
        if (generation !== this.generation || signal.aborted || this.disposed) return false;
        this.setMouth(0);
        this.status('error', error.message || 'Live2D model could not be loaded.');
        throw error;
      } finally {
        --this.loading;
        // Aborted fetch/decode work must release its model before SDK teardown.
        if (!this.loading) {
          if (this.disposed || this.resetSdkWhenIdle) this.releaseSdk();
          for (const resolve of this.idleWaiters.splice(0)) resolve();
        }
      }
    }
    draw(time, expectedResource = this.resource, generation = this.generation) {
      if (generation !== this.generation || expectedResource !== this.resource || this.disposed) return;
      this.frame = null;
      const resource = this.resource;
      if (!resource || this.disposed) return;
      try {
        const { gl, model, driver, user, projection } = resource;
        if (!this.canvas.clientWidth || !this.canvas.clientHeight) {
          this.frame = this.raf(next => this.draw(next, resource, generation));
          return;
        }
        const dt = this.lastFrame === null ? 1 / 60 : clamp((time - this.lastFrame) / 1000, 0, 0.1);
        this.lastFrame = time;
        const ratio = Math.min(root.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
        const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
        if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
        model.loadParameters();
        const pose = poseForState(this.state, time / 1000, this.mouth);
        driver.apply(pose);
        resource.physics?.evaluate(model, dt);
        resource.pose?.updateParameters(model, dt);
        // Physics/pose must never reopen a mouth after playback stops.
        if (!pose.mouthOpen) driver.closeMouth();
        model.update();
        const aspect = width / height;
        const modelAspect = model.getCanvasWidth() / model.getCanvasHeight();
        const scale = 0.92 * Math.min(1, aspect / modelAspect);
        projection.loadIdentity();
        projection.scale(scale / aspect, scale);
        projection.multiplyByMatrix(user.getModelMatrix());
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const renderer = user.getRenderer();
        renderer.setMvpMatrix(projection);
        renderer.setRenderState(null, [0, 0, width, height]);
        renderer.drawModel();
        this.frame = this.raf(next => this.draw(next, resource, generation));
      } catch (error) {
        this.unload();
        this.status('error', error.message || 'Live2D rendering stopped.');
      }
    }
    release(resource) {
      if (!resource || resource.released) return;
      resource.released = true;
      const actions = [() => resource.user.release(),
        ...resource.textures.map(texture => () => resource.gl.deleteTexture(texture)),
        () => { if (resource.physics) resource.sdk.CubismPhysics.delete(resource.physics); },
        () => { if (resource.pose) resource.sdk.CubismPose.delete(resource.pose); },
        () => resource.setting?.release()];
      for (const action of actions) { try { action(); } catch { /* Continue releasing remaining resources after device loss. */ } }
    }
    unload() {
      ++this.generation;
      this.controller?.abort();
      this.controller = null;
      if (this.frame != null) this.cancelRaf(this.frame);
      this.frame = null;
      this.mouth = 0;
      const resource = this.resource;
      this.resource = null;
      this.release(resource);
      if (this.gl && !this.gl.isContextLost()) { this.gl.clearColor(0, 0, 0, 0); this.gl.clear(this.gl.COLOR_BUFFER_BIT); }
    }
    releaseSdk() {
      if (this.sdk) { releaseFramework(this.sdk); this.sdk = null; }
      this.resetSdkWhenIdle = false;
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.unload();
      this.canvas.removeEventListener('webglcontextlost', this.onLost);
      this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
      if (!this.loading) this.releaseSdk();
    }
  }
  const api = { NativeLive2DRenderer, Live2DParameterDriver, poseForState, localAssetUrl, DEFAULT_PARAMETERS };
  if (typeof module !== 'undefined') module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : window);
