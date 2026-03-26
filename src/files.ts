import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

/**
 * Downloads a Telegram file to a local tmp directory.
 * Returns the absolute path to the downloaded file.
 */
export async function downloadTelegramFile(
  botToken: string,
  filePath: string,
  fileName: string,
  tmpDir: string
): Promise<string> {
  mkdirSync(tmpDir, { recursive: true });

  const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const uniqueName = `${randomUUID().slice(0, 8)}-${fileName}`;
  const localPath = join(tmpDir, uniqueName);
  writeFileSync(localPath, buffer);

  return localPath;
}
