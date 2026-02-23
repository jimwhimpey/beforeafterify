export interface LabelConfig {
  text: string;
  x: number;       // x position in original image pixels (top-left of text)
  y: number;       // y position in original image pixels (top of text)
  fontSize: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number; // 0–1
  padding: number;
}

export interface ErrorResponse {
  error: string;
}
