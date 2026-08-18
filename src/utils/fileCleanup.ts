import fs from 'fs';

export class FileCleanup {
  /**
   * Safely deletes a directory and all of its contents.
   */
  public static cleanDirectory(dirPath: string): void {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }

  /**
   * Safely deletes a specific file.
   */
  public static cleanFile(filePath: string): void {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
