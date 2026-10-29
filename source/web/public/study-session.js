/* Local robotics exercises. All DOM content is plain text; no math service or tool execution. */
class RoboticsStudySession {
  constructor({ element, request, getConsent, refreshTasks, approve, onActivity = () => {} }) {
    this.element = element;
    this.request = request;
    this.getConsent = getConsent;
    this.refreshTasks = refreshTasks;
    this.approve = approve;
    this.onActivity = activity => {
      // A delayed response may update the exercise after it is closed, but its
      // presentation must not reclaim the companion while the panel is hidden.
      if (activity === 'closed' || !element('study-panel').hidden) onActivity(activity);
    };
    this.session = null;
    this.record = null;
    this.busy = false;
    this.epoch = 0;
    this.privacyEpoch = 0;
    this.topicsLoaded = false;
    element('study-toggle').addEventListener('click', () => this.toggle());
    element('study-start').addEventListener('click', () => this.start());
    element('study-answer-form').addEventListener('submit', event => {
      event.preventDefault(); return this.answer();
    });
    element('study-answer').addEventListener('focus', () => this.onActivity('answering'));
    element('study-save').addEventListener('click', () => this.action('study.save'));
    element('study-task').addEventListener('click', () => this.action('task.create'));
    element('study-refresh-records').addEventListener('click', () => this.loadRecords());
    this.updateControls();
  }
  status(text) { this.element('study-status').textContent = text; }
  updateControls() {
    this.element('study-start').disabled = this.busy;
    this.element('study-topic').disabled = this.busy;
    this.element('study-submit').disabled = this.busy || !this.session || Boolean(this.record);
    this.element('study-answer').disabled = this.busy || !this.session || Boolean(this.record);
    this.element('study-save').disabled = this.busy || !this.record || !this.getConsent().study;
    this.element('study-task').disabled = this.busy || !this.record;
    this.element('study-refresh-records').disabled = this.busy || !this.getConsent().study;
  }
  async toggle() {
    const panel = this.element('study-panel');
    panel.hidden = !panel.hidden;
    this.element('chat-log').hidden = !panel.hidden;
    this.element('study-toggle').setAttribute('aria-expanded', String(!panel.hidden));
    this.element('conversation-body').classList.toggle('studying', !panel.hidden);
    this.onActivity(panel.hidden ? 'closed' : this.record ? 'feedback' : 'reading');
    if (!panel.hidden && !this.topicsLoaded) {
      try {
        const { topics } = await this.request('/api/study/topics');
        const select = this.element('study-topic');
        select.replaceChildren();
        for (const topic of topics) {
          const option = this.element('study-panel').ownerDocument.createElement('option');
          option.value = topic.id; option.textContent = topic.title; select.appendChild(option);
        }
        if (topics.length && !select.value) select.value = topics[0].id;
        this.topicsLoaded = true;
      } catch (error) { this.status(error.message); }
    }
  }
  async start() {
    if (this.busy) return;
    const epoch = ++this.epoch;
    this.busy = true; this.updateControls(); this.onActivity('checking');
    try {
      const { session } = await this.request('/api/study/session', this.post({ topic: this.element('study-topic').value }));
      if (epoch !== this.epoch) return;
      this.session = session; this.record = null;
      this.element('study-question').textContent = session.question.prompt;
      this.element('study-answer-hint').textContent = session.question.answerHint;
      this.element('study-answer').value = '';
      this.element('study-exercise').hidden = false;
      this.element('study-result').hidden = true;
      this.status('Session started in local-first mode. Your answer stays unsaved until you approve a save.');
      this.onActivity('reading');
    } catch (error) { if (epoch === this.epoch) { this.status(error.message); this.onActivity('feedback'); } }
    finally { if (epoch === this.epoch) { this.busy = false; this.updateControls(); } }
  }
  post(body) { return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
  async answer() {
    if (this.busy || !this.session || this.record) return;
    const epoch = this.epoch;
    this.busy = true; this.updateControls(); this.onActivity('checking');
    try {
      const { record } = await this.request('/api/study/answer', this.post({ sessionId: this.session.id, answer: this.element('study-answer').value }));
      if (epoch !== this.epoch) return;
      this.record = record;
      this.element('study-score').textContent = `Score: ${record.score} / ${record.maxScore}`;
      this.element('study-feedback').textContent = record.feedback;
      this.element('study-steps').textContent = record.steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n');
      this.element('study-review').textContent = `${record.nextReview.title}\n${record.nextReview.details}\nSuggested review: ${new Date(record.nextReview.suggestedAt).toLocaleString()}`;
      this.element('study-result').hidden = false;
      this.status('Scored locally. Review the steps, then optionally save this result or approve a review task.');
      this.onActivity(record.score === record.maxScore ? 'correct' : 'feedback');
    } catch (error) { if (epoch === this.epoch) { this.status(error.message); this.onActivity('feedback'); } }
    finally { if (epoch === this.epoch) { this.busy = false; this.updateControls(); } }
  }
  async action(type, record = this.record) {
    if (this.busy || !record) return;
    if (type !== 'task.create' && !this.getConsent().study) {
      this.status('Enable local study record consent in Privacy & Permissions first.'); return;
    }
    const description = type === 'task.create'
      ? `Create this local study task?\n\n${record.nextReview.title}\n${record.nextReview.details}\nSuggested review: ${record.nextReview.suggestedAt}\n\nThis writes to the existing task list; no reminder or external tool is scheduled.`
      : type === 'study.save'
        ? `Save this study record locally?\n\n${record.question.prompt}\nYour answer: ${record.studentAnswer}\nScore: ${record.score}/${record.maxScore}\n\nFeedback, worked steps and the suggested review will also be stored.`
        : `Delete this saved study record?\n\n${record.question.prompt}\nYour answer: ${record.studentAnswer}\nScore: ${record.score}/${record.maxScore}\n\nCreated tasks are kept separately.`;
    if (!this.approve(description)) return;
    const epoch = this.privacyEpoch;
    this.busy = true; this.updateControls();
    try {
      const outcome = await this.request('/api/study/actions', this.post({ type, recordId: record.id, approved: true }));
      if (epoch !== this.privacyEpoch) return;
      if (outcome.status !== 'succeeded') throw new Error(outcome.reason || 'The action did not succeed.');
      if (type === 'task.create') {
        const task = outcome.result;
        if (!task || typeof task.id !== 'string' || !task.id) throw new Error('Task creation could not be verified.');
        let tasks;
        try { tasks = await this.refreshTasks(); }
        catch { throw new Error('The task action completed, but refreshing the task list failed. Inspect Tasks before retrying.'); }
        if (epoch !== this.privacyEpoch) return;
        if (!tasks.some(saved => saved.id === task.id && saved.title === task.title)) throw new Error('The task was not found in the saved task list.');
        this.status(`Verified task in Tasks: ${task.title} (ID: ${task.id}).`);
      } else {
        if (!this.getConsent().study) return;
        const refreshed = await this.loadRecords();
        if (epoch !== this.privacyEpoch) return;
        if (!refreshed) throw new Error('The record action completed, but inspecting saved records failed. Refresh before retrying.');
        this.status(type === 'study.save' ? 'Study record saved locally.' : 'Study record deleted.');
      }
    } catch (error) { if (epoch === this.privacyEpoch) this.status(error.message); }
    finally { this.busy = false; this.updateControls(); }
  }
  async loadRecords() {
    const epoch = this.privacyEpoch;
    const list = this.element('study-records');
    if (!this.getConsent().study) { list.replaceChildren(); this.status('Local study record consent is disabled.'); return false; }
    try {
      const { records } = await this.request('/api/study/records');
      if (epoch !== this.privacyEpoch || !this.getConsent().study) return false;
      list.replaceChildren();
      if (!records.length) { list.textContent = 'No saved study records.'; return true; }
      const document = list.ownerDocument;
      for (const record of records) {
        const entry = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = `${record.topic} · ${record.score}/${record.maxScore} · ${new Date(record.createdAt).toLocaleString()}`;
        const text = document.createElement('pre');
        text.className = 'study-math';
        text.textContent = `${record.question.prompt}\n\nYour answer: ${record.studentAnswer}\n${record.feedback}\n\n${record.steps.join('\n\n')}\n\n${record.nextReview.title}\n${record.nextReview.details}\nSuggested review: ${record.nextReview.suggestedAt}`;
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary-btn'; remove.textContent = 'Delete saved record';
        remove.addEventListener('click', () => this.action('study.delete', record));
        entry.append(summary, text, remove); list.appendChild(entry);
      }
      return true;
    } catch (error) { if (epoch === this.privacyEpoch) { list.replaceChildren(); this.status(error.message); } return false; }
  }
  consentChanged() {
    ++this.privacyEpoch;
    this.element('study-records').replaceChildren();
    this.status(this.getConsent().study
      ? 'Local study record access enabled for this visit. Saving still requires your approval.'
      : 'Local study record access disabled. Previously saved records remain on disk; enable consent to inspect or delete them.');
    this.updateControls();
  }
  dispose() {
    ++this.epoch;
    ++this.privacyEpoch;
  }
}
