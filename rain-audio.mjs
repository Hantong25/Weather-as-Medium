const bounded = (x, a, b) => Math.min(b, Math.max(a, x));

export function rainProfile(people) {
  const count = Number.isFinite(Number(people)) ? bounded(Math.floor(Number(people)), 0, 20) : 0;
  const amount = count ? (count - 1) / 19 : 0;
  return {
    count, label: count === 0 ? '等待人数' : count <= 2 ? '稀疏雨声' : count <= 6 ? '中等雨声' : '密集雨声',
    grainsPerSecond: count ? 2 + 2.2 * (count - 1) : 0,
    bedGain: count ? .20 + .05 * amount : 0,
    washGain: count ? .25 * amount ** 1.15 : 0,
    grainGain: count ? .38 / Math.sqrt(1 + (2 + 2.2 * (count - 1)) * .10) : 0,
  };
}

// A short wrap crossfade avoids a click where the field recording loops.
export function seamlessLoop(context, input, seconds = .35) {
  const overlap = Math.min(Math.floor(seconds * input.sampleRate), Math.floor(input.length / 4));
  const length = input.length - overlap;
  const output = context.createBuffer(input.numberOfChannels, length, input.sampleRate);
  for (let channel = 0; channel < input.numberOfChannels; channel++) {
    const src = input.getChannelData(channel), dst = output.getChannelData(channel);
    dst.set(src.subarray(0, length));
    for (let i = 0; i < overlap; i++) {
      const mix = i / overlap;
      dst[i] = src[length + i] * (1 - mix) + src[i] * mix;
    }
  }
  return output;
}

export class RainAudio {
  constructor(context) {
    this.context = context; this.buffer = null; this.beds = []; this.voices = new Set();
    this.scheduled = 0; this.nextGrain = 0; this.target = 0; this.profile = rainProfile(0);
    this.master = context.createGain(); this.master.gain.value = 0;
    const filter = context.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 100;
    this.output = context.createDynamicsCompressor(); this.output.threshold.value = -16; this.output.knee.value = 12;
    this.output.ratio.value = 4; this.output.attack.value = .008; this.output.release.value = .2;
    this.master.connect(filter).connect(this.output).connect(context.destination);
  }
  async load() {
    const response = await fetch('assets/audio/rain-garden.mp3');
    if (!response.ok) throw Error('内置雨声文件无法读取');
    const decoded = await this.context.decodeAudioData(await response.arrayBuffer());
    this.setBuffer(decoded);
  }
  async loadFile(file) {
    if (file.size > 64 * 1024 * 1024) throw Error('请选择小于 64 MB 的音频文件');
    const decoded = await this.context.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration < .5) throw Error('音频长度至少需要半秒');
    this.setBuffer(decoded);
  }
  setBuffer(input) {
    // Normalize once, preserving the original file on disk.
    let power = 0;
    for (let ch = 0; ch < input.numberOfChannels; ch++) {
      const values = input.getChannelData(ch);
      for (let i = 0; i < values.length; i++) power += values[i] * values[i];
    }
    const rms = Math.sqrt(power / (input.length * input.numberOfChannels));
    if (!Number.isFinite(rms) || rms < 1e-7) throw Error('音频没有可用的声音信号');
    // The source is very quiet with isolated peaks: RMS lift plus a soft peak bound keeps the rain audible.
    const gain = .18 / rms;
    const normalized = this.context.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
    for (let ch = 0; ch < input.numberOfChannels; ch++) {
      const src = input.getChannelData(ch), dst = normalized.getChannelData(ch);
      for (let i = 0; i < src.length; i++) dst[i] = Math.tanh(src[i] * gain) * .82;
    }
    this.silence();
    for (const bed of this.beds) { bed.source.stop(); bed.source.disconnect(); bed.gain.disconnect(); }
    this.buffer = normalized; this.loop = seamlessLoop(this.context, normalized); this.beds = [];
    for (const offset of [0, .43]) {
      const source = this.context.createBufferSource(), level = this.context.createGain();
      source.buffer = this.loop; source.loop = true; level.gain.value = 0;
      source.connect(level).connect(this.master); source.start(this.context.currentTime, offset * this.loop.duration);
      this.beds.push({ source, gain: level });
    }
  }
  silence() {
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now); this.master.gain.setTargetAtTime(0, now, .025);
    for (const voice of this.voices) {
      voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setTargetAtTime(0, now, .006);
      try { voice.source.stop(now + .035); } catch {}
    }
    this.voices.clear(); this.nextGrain = now; this.target = 0;
  }
  update({ people, envelope, volume, enabled, preview = false }) {
    const now = this.context.currentTime;
    const previousRate = this.profile.grainsPerSecond;
    this.profile = rainProfile(people); this.preview = preview;
    const level = [envelope, volume].every(Number.isFinite) ? bounded(envelope, 0, 1) * bounded(volume, 0, 1) : 0;
    if (!enabled || !this.buffer || level <= .0001 || this.profile.count === 0) { this.silence(); return; }
    this.target = level * .8;
    this.master.gain.setTargetAtTime(this.target, now, .08);
    this.beds[0].gain.gain.setTargetAtTime(this.profile.bedGain, now, .15);
    this.beds[1].gain.gain.setTargetAtTime(this.profile.washGain, now, .15);
    // More visitors add actual overlapping snippets, not just a louder copy of one loop.
    if (this.nextGrain < now) this.nextGrain = now + .01;
    if (previousRate !== this.profile.grainsPerSecond) this.nextGrain = Math.min(this.nextGrain, now + 1 / this.profile.grainsPerSecond);
    while (this.nextGrain < now + .24) {
      this.grain(this.nextGrain, this.profile.grainGain);
      this.nextGrain += (.70 + Math.random() * .60) / this.profile.grainsPerSecond;
    }
  }
  grain(when, amplitude) {
    const context = this.context, source = context.createBufferSource(), gain = context.createGain(), pan = context.createStereoPanner();
    const duration = .08 + Math.random() * .13;
    source.buffer = this.buffer; source.playbackRate.value = .95 + Math.random() * .10;
    pan.pan.value = (Math.random() * 2 - 1) * .75;
    gain.gain.setValueAtTime(0, when); gain.gain.linearRampToValueAtTime(amplitude, when + .012);
    gain.gain.linearRampToValueAtTime(0, when + duration);
    source.connect(gain).connect(pan).connect(this.master);
    const voice = { source, gain, pan }; this.voices.add(voice); this.scheduled++;
    source.onended = () => { source.disconnect(); gain.disconnect(); pan.disconnect(); this.voices.delete(voice); };
    source.start(when, Math.random() * Math.max(0, this.buffer.duration - .3)); source.stop(when + duration + .01);
  }
  get diagnostics() {
    return { loaded: !!this.buffer, duration: this.buffer?.duration || 0, contextState: this.context.state,
      people: this.profile.count, rate: this.profile.grainsPerSecond, bedGain: this.profile.bedGain,
      washGain: this.profile.washGain, scheduled: this.scheduled, activeVoices: this.voices.size, target: this.target, preview: !!this.preview };
  }
}
