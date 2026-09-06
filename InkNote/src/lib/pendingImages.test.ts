import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  writeBinary: vi.fn(),
  removePath: vi.fn(),
}));

vi.mock("./tauri", () => mocks);

import {
  addPendingImage,
  clearPendingImages,
  commitPendingImages,
  pendingImageUrl,
  preparePendingImages,
  restorePendingImages,
  rollbackPendingImages,
  setPendingImagesOwner,
  snapshotPendingImages,
} from "./pendingImages";

const DOC_A = "doc-a";
const DOC_B = "doc-b";

describe("pending images", () => {
  beforeEach(() => {
    clearPendingImages(DOC_A);
    clearPendingImages(DOC_B);
    setPendingImagesOwner(DOC_A);
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:restored");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    mocks.writeBinary.mockReset();
    mocks.removePath.mockReset();
    mocks.writeBinary.mockResolvedValue(undefined);
    mocks.removePath.mockResolvedValue(undefined);
  });

  afterEach(() => {
    clearPendingImages(DOC_A);
    clearPendingImages(DOC_B);
    vi.restoreAllMocks();
  });

  it("restores an unsaved document image with a fresh blob URL", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    addPendingImage(".inknote-assets/picture.png", bytes, "image/png");

    const snapshot = snapshotPendingImages(DOC_A);
    bytes[0] = 9;
    clearPendingImages(DOC_A);
    restorePendingImages(DOC_A, snapshot);

    expect(snapshot[0].bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(pendingImageUrl(".inknote-assets/picture.png")).toBe("blob:restored");
  });

  it("writes only images still referenced by the document", async () => {
    vi.mocked(URL.createObjectURL)
      .mockReset()
      .mockReturnValueOnce("blob:kept")
      .mockReturnValueOnce("blob:removed");
    addPendingImage(".inknote-assets/kept.png", new Uint8Array([1]), "image/png");
    addPendingImage(".inknote-assets/removed.png", new Uint8Array([2]), "image/png");

    const prepared = await preparePendingImages(
      DOC_A,
      "D:\\notes\\note.md",
      "![](.inknote-assets/kept.png)",
    );

    expect(mocks.writeBinary).toHaveBeenCalledTimes(1);
    expect(mocks.writeBinary).toHaveBeenCalledWith(
      "D:/notes/.inknote-assets/kept.png",
      [1],
    );
    expect(pendingImageUrl(".inknote-assets/removed.png")).toBeNull();
    commitPendingImages(DOC_A, prepared);
    expect(pendingImageUrl(".inknote-assets/kept.png")).toBeNull();
  });

  it("rolls back created files while retaining the in-memory image for retry", async () => {
    vi.mocked(URL.createObjectURL).mockReset().mockReturnValue("blob:retry");
    addPendingImage(".inknote-assets/retry.png", new Uint8Array([3]), "image/png");
    const prepared = await preparePendingImages(
      DOC_A,
      "D:\\notes\\note.md",
      "![](.inknote-assets/retry.png)",
    );

    await rollbackPendingImages(prepared);

    expect(mocks.removePath).toHaveBeenCalledWith("D:/notes/.inknote-assets/retry.png");
    expect(pendingImageUrl(".inknote-assets/retry.png")).toBe("blob:retry");
  });

  it("keeps images isolated per owning document", async () => {
    vi.mocked(URL.createObjectURL).mockReset().mockReturnValue("blob:shared");
    setPendingImagesOwner(DOC_A);
    addPendingImage(".inknote-assets/from-a.png", new Uint8Array([1]), "image/png");
    setPendingImagesOwner(DOC_B);
    addPendingImage(".inknote-assets/from-b.png", new Uint8Array([2]), "image/png");

    // 保存文档 B 时清掉它自己的图片，绝不能动到文档 A 的
    const prepared = await preparePendingImages(
      DOC_B,
      "D:\\notes\\other.md",
      "no images referenced",
    );
    commitPendingImages(DOC_B, prepared);

    setPendingImagesOwner(DOC_A);
    expect(pendingImageUrl(".inknote-assets/from-a.png")).toBe("blob:shared");
    setPendingImagesOwner(DOC_B);
    expect(pendingImageUrl(".inknote-assets/from-b.png")).toBeNull();
  });
});
