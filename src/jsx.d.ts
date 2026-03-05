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

interface AwtrixTextElementProps extends TextProps {
  children?: string | number | Array<string | number>;
}

interface AwtrixAppElementProps extends AppProps {
  children?: ReactNode;
}

interface AwtrixIntrinsicElements {
  "awtrix-app": AwtrixAppElementProps;
  "awtrix-pixel": PixelProps;
  "awtrix-line": LineProps;
  "awtrix-rect": RectProps;
  "awtrix-circle": CircleProps;
  "awtrix-text": AwtrixTextElementProps;
  "awtrix-bitmap": BitmapProps;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends AwtrixIntrinsicElements {}
  }
}

declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements extends AwtrixIntrinsicElements {}
  }
}

export {};
