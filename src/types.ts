export type TextAlign = 'left' | 'center' | 'right';

export interface LabelConfig {
  text: string;
  x: number;       // anchor x in canvas pixels — which edge of the chip this pins depends on textAlign
  y: number;       // y position in canvas pixels (top of text)
  fontSize: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number; // 0–1
  padding: number;
  textAlign: TextAlign; // which edge (or center) of the chip is pinned to x
}

/** Blank margin added around the image, in original image pixels. */
export interface CanvasExtend {
  top: number;
  right: number;
  bottom: number;
  left: number;
  backgroundColor: string;
}

export interface ErrorResponse {
  error: string;
}
