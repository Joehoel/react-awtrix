import { mergeElementPayload, serializeElement } from "./elements.ts";
import type { DrawCommand } from "./display.ts";
import type { AppPayload, AwtrixPayload } from "./payload.ts";
import type { AwtrixContainer, AwtrixNode } from "./render-tree.ts";

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

function collectDrawCommands(
  nodes: AwtrixNode[],
  commands: DrawCommand[],
  container: AwtrixContainer,
): void {
  for (const node of nodes) {
    if (node.hidden || node.type === "__text") {
      continue;
    }

    const command = serializeElement(node, { container, textContent: collectText });
    if (command !== null) {
      commands.push(command);
    }

    if (node.type !== "text") {
      collectDrawCommands(node.children, commands, container);
    }
  }
}

function collectAppProps(nodes: AwtrixNode[]): AppPayload {
  const appPayload: AppPayload = {};

  for (const node of nodes) {
    if (node.hidden || node.type === "__text") {
      continue;
    }

    if (node.type === "app") {
      mergeElementPayload(appPayload, node);
    }
  }

  return appPayload;
}

export function serialize(container: AwtrixContainer): AwtrixPayload {
  const payload: AwtrixPayload = collectAppProps(container.children);

  const draw: DrawCommand[] = [];
  collectDrawCommands(container.children, draw, container);
  if (draw.length > 0) {
    payload.draw = draw;
  }

  if (container.mode === "notify" && container.notifyOptions !== undefined) {
    if (container.notifyOptions.hold !== undefined) payload.hold = container.notifyOptions.hold;
    if (container.notifyOptions.sound !== undefined) payload.sound = container.notifyOptions.sound;
    if (container.notifyOptions.stack !== undefined) payload.stack = container.notifyOptions.stack;
    if (container.notifyOptions.wakeup !== undefined)
      payload.wakeup = container.notifyOptions.wakeup;
  }

  return payload;
}
