import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";

/**
 * Brings Narada's window to the front and bounces its Dock icon. Used when an agent waits for
 * the user's approval: agents give up after about a minute, and on macOS the first click on an
 * inactive window only activates it, so an "Apply" clicked there would otherwise do nothing.
 */
export async function drawAttention(): Promise<void> {
  if (!isTauri()) return;
  const window = getCurrentWindow();
  try {
    await window.unminimize();
    await window.show();
    await window.setFocus();
    await window.requestUserAttention(UserAttentionType.Informational);
  } catch {
    // Best effort: the dialog is still there when the user switches to Narada.
  }
}
