// Resolve the unrelated initial YouTube SDK handshake so serialized provider
// initialization cannot hang on an empty intercepted script. This SDK contract
// stub emits no sound. Native WAV playback remains the audio acceptance signal.
export const youtubeStub = `
window.YT = {
  PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  Player: class {
    constructor(element, config) {
      this.events = config.events || {}; this.time = 0; this.volume = 85;
      this.muted = false; this.state = 5; this.destroyed = false;
      setTimeout(() => { if (!this.destroyed) this.events.onReady?.(); }, 0);
    }
    cueVideoById() { this.time = 0; this.change(5); }
    loadVideoById() { this.time = 0; this.change(5); }
    playVideo() { this.change(1); }
    pauseVideo() { this.change(2); }
    stopVideo() { this.change(2); }
    seekTo(time) { this.time = time; }
    change(state) { this.state = state; this.events.onStateChange?.({ data: state }); }
    setVolume(volume) { this.volume = volume; }
    getVolume() { return this.volume; }
    mute() { this.muted = true; }
    unMute() { this.muted = false; }
    isMuted() { return this.muted; }
    getCurrentTime() { return this.time; }
    getDuration() { return 0; }
    getPlayerState() { return this.state; }
    setPlaybackRate() {}
    destroy() { this.destroyed = true; }
  }
};
window.onYouTubeIframeAPIReady?.();
`;
