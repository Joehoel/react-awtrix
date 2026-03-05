import type { ReactNode } from "react";
import type {
  AppProps,
  BitmapProps,
  CircleProps,
  LineProps,
  PixelProps,
  RectProps,
  TextProps,
} from "./types.ts";

interface TextElementProps extends TextProps {
  children?: string | number | Array<string | number>;
}

interface AppElementProps extends AppProps {
  children?: ReactNode;
}

interface AwtrixIntrinsicElements {
  app: AppElementProps;
  pixel: PixelProps;
  "awtrix-line": LineProps;
  "awtrix-rect": RectProps;
  "awtrix-circle": CircleProps;
  "awtrix-text": TextElementProps;
  "awtrix-bitmap": BitmapProps;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends AwtrixIntrinsicElements {
      app: AppElementProps;
      pixel: PixelProps;
      "awtrix-line": LineProps;
      "awtrix-rect": RectProps;
      "awtrix-circle": CircleProps;
      "awtrix-text": TextElementProps;
      "awtrix-bitmap": BitmapProps;
    }
  }
}

declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements extends AwtrixIntrinsicElements {
      app: AppElementProps;
      pixel: PixelProps;
      "awtrix-line": LineProps;
      "awtrix-rect": RectProps;
      "awtrix-circle": CircleProps;
      "awtrix-text": TextElementProps;
      "awtrix-bitmap": BitmapProps;
    }
  }
}

export {};
