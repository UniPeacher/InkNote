import { dirOf } from "./paths";
import { extractManagedImageReferences } from "./imageAssets";
import { removePath, writeBinary } from "./tauri";

/**
 * 文档还没保存时粘贴进来的图片。
 *
 * 不能因为「还不知道该存哪」就弹保存框打断书写：先把字节留在内存、
 * 用 blob URL 立刻回显，等文档拿到真实路径时再统一落盘到 .inknote-assets/。
 *
 * 多标签下图片按「归属文档」隔离：保存/关闭某个标签只影响它自己的
 * 未落盘图片，不会误清其它标签正在回显的内容。
 */
interface PendingImage {
  bytes: Uint8Array;
  mime: string;
  url: string;
}

/** 归属文档 id -> (Markdown 里的相对路径 -> 图片) */
const pending = new Map<string, Map<string, PendingImage>>();

/**
 * 当前正在编辑的文档 id。编辑器内部（粘贴、图片 Widget 回显）没有
 * 文档上下文，统一落到这个「活动归属」上；由 Editor 在渲染期同步，
 * 保证装饰构建时读到的归属已经切换完毕。
 */
let activeOwner = "";

export function setPendingImagesOwner(owner: string): void {
  activeOwner = owner;
}

function ownerImages(owner: string, create: boolean): Map<string, PendingImage> | null {
  let images = pending.get(owner);
  if (!images && create) {
    images = new Map();
    pending.set(owner, images);
  }
  return images ?? null;
}

/** 暂存并返回可立即用于 <img> 的 URL；key 是插入到 Markdown 里的相对路径 */
export function addPendingImage(relPath: string, bytes: Uint8Array, mime: string): string {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const images = ownerImages(activeOwner, true)!;
  const previous = images.get(relPath);
  if (previous) URL.revokeObjectURL(previous.url);
  images.set(relPath, { bytes, mime, url });
  return url;
}

export function pendingImageUrl(relPath: string): string | null {
  return pending.get(activeOwner)?.get(relPath)?.url ?? null;
}

export function clearPendingImages(owner: string): void {
  const images = pending.get(owner);
  if (!images) return;
  for (const item of images.values()) URL.revokeObjectURL(item.url);
  pending.delete(owner);
}

export interface PendingImageSnapshot {
  relPath: string;
  bytes: Uint8Array;
  mime: string;
}

/** 保存“重新打开已关闭文档”所需的数据，不复用即将失效的 blob URL。 */
export function snapshotPendingImages(owner: string): PendingImageSnapshot[] {
  return [...(pending.get(owner)?.entries() ?? [])].map(([relPath, item]) => ({
    relPath,
    bytes: item.bytes.slice(),
    mime: item.mime,
  }));
}

/** 导出 HTML/PDF 时把尚未落盘的图片内联，避免新文档或未保存图片出现断图。 */
export async function pendingImageDataUrls(owner: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const [relPath, item] of pending.get(owner)?.entries() ?? []) {
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(new Blob([item.bytes as BlobPart], { type: item.mime }));
    });
    if (dataUrl) result.set(relPath, dataUrl);
  }
  return result;
}

/** 恢复关闭文档随附的内存图片，并重新创建可显示的 blob URL。 */
export function restorePendingImages(owner: string, snapshot: PendingImageSnapshot[]): void {
  clearPendingImages(owner);
  const images = ownerImages(owner, true)!;
  for (const item of snapshot) {
    const url = URL.createObjectURL(new Blob([item.bytes as BlobPart], { type: item.mime }));
    images.set(item.relPath, { bytes: item.bytes, mime: item.mime, url });
  }
}

export interface PreparedPendingImage {
  relPath: string;
  url: string;
  absPath: string;
}

/**
 * 先把图片写到文档目录，但暂不释放内存副本。
 * 只有文档本身也成功写入后，调用方才能 commit；这样另存失败后仍可换目录重试。
 */
export async function preparePendingImages(
  owner: string,
  docPath: string,
  content: string,
): Promise<PreparedPendingImage[]> {
  const images = pending.get(owner);
  if (!images || !images.size) return [];
  const referencedNames = new Set(
    extractManagedImageReferences(content).map((reference) => reference.fileName.toLowerCase()),
  );
  for (const [relPath, item] of [...images.entries()]) {
    const fileName = relPath.split(/[\\/]/).pop()?.toLowerCase() ?? "";
    if (referencedNames.has(fileName)) continue;
    URL.revokeObjectURL(item.url);
    images.delete(relPath);
  }

  const dir = dirOf(docPath);
  const prepared: PreparedPendingImage[] = [];
  try {
    for (const [relPath, item] of [...images.entries()]) {
      const absPath = `${dir}/${relPath}`.replace(/\\/g, "/");
      await writeBinary(absPath, Array.from(item.bytes));
      prepared.push({ relPath, url: item.url, absPath });
    }
  } catch (error) {
    await rollbackPendingImages(prepared);
    throw error;
  }
  return prepared;
}

/** 文档写入失败时删除本次创建的附件，但保留内存副本以便重试。 */
export async function rollbackPendingImages(prepared: PreparedPendingImage[]): Promise<void> {
  for (const item of [...prepared].reverse()) {
    try { await removePath(item.absPath); } catch { /* keep the original save error */ }
  }
}

/** 文档写入成功后提交对应图片，避免部分成功造成永久断图。 */
export function commitPendingImages(owner: string, prepared: PreparedPendingImage[]): void {
  const images = pending.get(owner);
  if (!images) return;
  for (const item of prepared) {
    const current = images.get(item.relPath);
    if (!current || current.url !== item.url) continue;
    URL.revokeObjectURL(current.url);
    images.delete(item.relPath);
  }
}
