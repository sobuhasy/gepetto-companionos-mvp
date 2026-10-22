/* Browser media events are forwarded to the backend RobotBody owner. */
class AvatarMediaSession {
  constructor(send, makeAudio = url => new Audio(url)) {
    this.send = send;
    this.makeAudio = makeAudio;
    this.id = null;
    this.audio = null;
    this.queue = Promise.resolve();
    this.timer = null;
    this.generation = 0;
  }
  event(event, id = this.id) {
    if (!id) return Promise.resolve();
    this.queue = this.queue.catch(() => {}).then(() => this.send({ event, interactionId: id }));
    return this.queue;
  }
  async begin(activity) {
    await this.cancel();
    const generation = ++this.generation;
    const result = await this.send({ event: 'begin', activity });
    if (generation !== this.generation) {
      await this.event('cancel', result.interactionId);
      throw new Error('Interaction cancelled');
    }
    this.id = result.interactionId;
    this.timer = setInterval(() => { this.event('heartbeat').then(result => { if (result && result.accepted === false) return this.cancel(); }).catch(() => {}); }, 5000);
    return this.id;
  }
  async finish(event = 'ended', id = this.id) {
    if (id === this.id) {
      clearInterval(this.timer);
      this.id = null;
      this.audio = null;
    }
    await this.event(event, id);
  }
  async cancel() {
    ++this.generation;
    const id = this.id;
    const audio = this.audio;
    this.audio = null;
    if (audio) audio.pause();
    await this.finish('cancel', id);
  }
  async play(url) {
    const id = this.id;
    const audio = this.makeAudio(url);
    this.audio = audio;
    audio.preload = 'auto';
    audio.addEventListener('playing', () => { if (this.id === id && this.audio === audio) this.event('playing', id).catch(() => {}); });
    for (const event of ['ended', 'error', 'pause']) {
      audio.addEventListener(event, () => {
        this.finish(event === 'ended' ? 'ended' : 'error', id).catch(() => {});
      }, { once: true });
    }
    try { await audio.play(); return true; }
    catch { await this.finish('error', id); return false; }
  }
}
if (typeof module !== 'undefined') module.exports = { AvatarMediaSession };
