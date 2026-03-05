import type { ReactNode } from "react";
import type { AppProps, BitmapProps, CircleProps, LineProps, PixelProps, RectProps, TextProps } from "./types.ts";

export interface AwtrixAppComponentProps extends AppProps {
  children?: ReactNode;
}

export interface AwtrixTextComponentProps extends TextProps {
  children?: string | number | Array<string | number>;
}

export function AwtrixApp(props: AwtrixAppComponentProps) {
  return <awtrix-app {...props}>{props.children}</awtrix-app>;
}

export function AwtrixPixel(props: PixelProps) {
  return <awtrix-pixel {...props} />;
}

export function AwtrixLine(props: LineProps) {
  return <awtrix-line {...props} />;
}

export function AwtrixRect(props: RectProps) {
  return <awtrix-rect {...props} />;
}

export function AwtrixCircle(props: CircleProps) {
  return <awtrix-circle {...props} />;
}

export function AwtrixText(props: AwtrixTextComponentProps) {
  return <awtrix-text {...props}>{props.children}</awtrix-text>;
}

export function AwtrixBitmap(props: BitmapProps) {
  return <awtrix-bitmap {...props} />;
}
