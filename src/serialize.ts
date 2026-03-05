import type { AppPayload, AwtrixContainer, AwtrixInstance, AwtrixNode, AwtrixPayload, DrawCommand } from "./types.ts";
import { normalizeColor } from "./types.ts";

function collectText(children: AwtrixNode[]): string {
  let value = "";

  for (const child of children) {
    if (child.hidden) {
      continue;
    }

    if (child.type === "__text") {
      value += child.value;
      continue;
    }

    value += collectText(child.children);
  }

  return value;
}

function serializeInstance(instance: AwtrixInstance): DrawCommand | null {
  if (instance.hidden) {
    return null;
  }

  if (instance.type === "pixel") {
    return { dp: [instance.props.x, instance.props.y, normalizeColor(instance.props.color)] };
  }

  if (instance.type === "line") {
    return {
      dl: [
        instance.props.x1,
        instance.props.y1,
        instance.props.x2,
        instance.props.y2,
        normalizeColor(instance.props.color),
      ],
    };
  }

  if (instance.type === "rect") {
    if (instance.props.filled) {
      return {
        df: [
          instance.props.x,
          instance.props.y,
          instance.props.width,
          instance.props.height,
          normalizeColor(instance.props.color),
        ],
      };
    }

    return {
      dr: [
        instance.props.x,
        instance.props.y,
        instance.props.width,
        instance.props.height,
        normalizeColor(instance.props.color),
      ],
    };
  }

  if (instance.type === "circle") {
    if (instance.props.filled) {
      return {
        dfc: [
          instance.props.x,
          instance.props.y,
          instance.props.radius,
          normalizeColor(instance.props.color),
        ],
      };
    }

    return {
      dc: [
        instance.props.x,
        instance.props.y,
        instance.props.radius,
        normalizeColor(instance.props.color),
      ],
    };
  }

  if (instance.type === "text") {
    return {
      dt: [
        instance.props.x,
        instance.props.y,
        collectText(instance.children),
        normalizeColor(instance.props.color),
      ],
    };
  }

  if (instance.type === "bitmap") {
    return {
      db: [
        instance.props.x,
        instance.props.y,
        instance.props.width,
        instance.props.height,
        instance.props.data,
      ],
    };
  }

  return null;
}

function collectDrawCommands(nodes: AwtrixNode[], commands: DrawCommand[]): void {
  for (const node of nodes) {
    if (node.hidden || node.type === "__text") {
      continue;
    }

    const command = serializeInstance(node);
    if (command !== null) {
      commands.push(command);
    }

    if (node.type !== "text") {
      collectDrawCommands(node.children, commands);
    }
  }
}

function mergeAppProps(target: AppPayload, source: AppPayload): void {
  if (source.icon !== undefined) target.icon = source.icon;
  if (source.duration !== undefined) target.duration = source.duration;
  if (source.lifetime !== undefined) target.lifetime = source.lifetime;
  if (source.lifetimeMode !== undefined) target.lifetimeMode = source.lifetimeMode;
  if (source.text !== undefined) target.text = source.text;
  if (source.textCase !== undefined) target.textCase = source.textCase;
  if (source.topText !== undefined) target.topText = source.topText;
  if (source.textOffset !== undefined) target.textOffset = source.textOffset;
  if (source.center !== undefined) target.center = source.center;
  if (source.noScroll !== undefined) target.noScroll = source.noScroll;
  if (source.scrollSpeed !== undefined) target.scrollSpeed = source.scrollSpeed;
  if (source.background !== undefined) target.background = source.background;
  if (source.effect !== undefined) target.effect = source.effect;
  if (source.effectSettings !== undefined) target.effectSettings = source.effectSettings;
  if (source.overlay !== undefined) target.overlay = source.overlay;
  if (source.progress !== undefined) target.progress = source.progress;
  if (source.progressC !== undefined) target.progressC = source.progressC;
  if (source.progressBC !== undefined) target.progressBC = source.progressBC;
  if (source.bar !== undefined) target.bar = source.bar;
  if (source.line !== undefined) target.line = source.line;
  if (source.rainbow !== undefined) target.rainbow = source.rainbow;
  if (source.pushIcon !== undefined) target.pushIcon = source.pushIcon;
  if (source.repeat !== undefined) target.repeat = source.repeat;
  if (source.save !== undefined) target.save = source.save;
}

function collectAppProps(nodes: AwtrixNode[]): AppPayload {
  const appPayload: AppPayload = {};

  for (const node of nodes) {
    if (node.hidden || node.type === "__text") {
      continue;
    }

    if (node.type === "app") {
      const fromApp: AppPayload = {
        icon: node.props.icon,
        duration: node.props.duration,
        lifetime: node.props.lifetime,
        lifetimeMode: node.props.lifetimeMode,
        text: node.props.text,
        textCase: node.props.textCase,
        topText: node.props.topText,
        textOffset: node.props.textOffset,
        center: node.props.center,
        noScroll: node.props.noScroll,
        scrollSpeed: node.props.scrollSpeed,
        background: node.props.background === undefined ? undefined : normalizeColor(node.props.background),
        effect: node.props.effect,
        effectSettings: node.props.effectSettings,
        overlay: node.props.overlay,
        progress: node.props.progress,
        progressC: node.props.progressC === undefined ? undefined : normalizeColor(node.props.progressC),
        progressBC: node.props.progressBC === undefined ? undefined : normalizeColor(node.props.progressBC),
        bar: node.props.bar,
        line: node.props.line,
        rainbow: node.props.rainbow,
        pushIcon: node.props.pushIcon,
        repeat: node.props.repeat,
        save: node.props.save,
      };

      mergeAppProps(appPayload, fromApp);
    }
  }

  return appPayload;
}

export function serialize(container: AwtrixContainer): AwtrixPayload {
  const payload: AwtrixPayload = collectAppProps(container.children);

  const draw: DrawCommand[] = [];
  collectDrawCommands(container.children, draw);
  if (draw.length > 0) {
    payload.draw = draw;
  }

  if (container.mode === "notify" && container.notifyOptions !== undefined) {
    if (container.notifyOptions.hold !== undefined) payload.hold = container.notifyOptions.hold;
    if (container.notifyOptions.sound !== undefined) payload.sound = container.notifyOptions.sound;
    if (container.notifyOptions.stack !== undefined) payload.stack = container.notifyOptions.stack;
    if (container.notifyOptions.wakeup !== undefined) payload.wakeup = container.notifyOptions.wakeup;
  }

  return payload;
}
