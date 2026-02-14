declare module 'screenshot-desktop' {
  interface Display {
    id: string;
    name: string;
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    scaleFactor: number;
  }

  interface ScreenshotOptions {
    screen?: string | number;
    format?: 'png' | 'jpg';
    quality?: number;
    filename?: string;
  }

  function screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  function screenshot(filename: string, options?: ScreenshotOptions): Promise<void>;
  function listDisplays(): Promise<Display[]>;

  export = screenshot;
  export { listDisplays, Display, ScreenshotOptions };
}