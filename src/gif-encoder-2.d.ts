declare module 'gif-encoder-2' {
  interface GifOut {
    getData(): Buffer;
  }

  class GifEncoder {
    public out: GifOut;
    constructor(
      width: number,
      height: number,
      algorithm?: 'neuquant' | 'octree',
      useOptimizer?: boolean,
      totalFrames?: number
    );
    setDelay(ms: number): void;
    setRepeat(count: number): void;
    setQuality(quality: number): void;
    setFrameRate(fps: number): void;
    start(): void;
    addFrame(imageData: Uint8ClampedArray): void;
    finish(): void;
  }

  export = GifEncoder;
}
