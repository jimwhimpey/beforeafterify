export interface LabelConfig {
  text: string;
  x: number;       // x position in canvas pixels (top-left of text)
  y: number;       // y position in canvas pixels (top of text)
  fontSize: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number; // 0–1
  padding: number;
}

/** Blank margin added around the image, in original image pixels. */
export interface CanvasExtend {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ErrorResponse {
  error: string;
}
