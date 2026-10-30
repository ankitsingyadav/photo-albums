import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Lightbox } from "../Lightbox";
import type { Photo } from "../types";

const mockPhotos: Photo[] = [
  {
    id: 1,
    filename: "first.jpg",
    fileUrl: "/file/1",
    thumbUrl: "/thumb/1",
    width: 1920,
    height: 1080,
    size: 2048,
    takenAt: null,
    uploadedAt: new Date().toISOString(),
    sortDate: new Date().toISOString(),
    dateSource: "upload",
    tags: ["nature"],
  },
  {
    id: 2,
    filename: "second.jpg",
    fileUrl: "/file/2",
    thumbUrl: "/thumb/2",
    width: 1920,
    height: 1080,
    size: 4096,
    takenAt: null,
    uploadedAt: new Date().toISOString(),
    sortDate: new Date().toISOString(),
    dateSource: "upload",
    tags: ["city"],
  },
];

describe("Lightbox Viewer", () => {
  it("renders active photo and controls", () => {
    const handleClose = vi.fn();
    const handleIndex = vi.fn();

    render(
      <Lightbox
        photos={mockPhotos}
        index={0}
        onIndex={handleIndex}
        onClose={handleClose}
      />
    );

    expect(screen.getByText("first.jpg")).toBeInTheDocument();
    expect(screen.getByText(/1\s+of\s+2/)).toBeInTheDocument();
  });

  it("handles keyboard navigation: ArrowRight advances, Escape closes", () => {
    const handleClose = vi.fn();
    const handleIndex = vi.fn();

    render(
      <Lightbox
        photos={mockPhotos}
        index={0}
        onIndex={handleIndex}
        onClose={handleClose}
      />
    );

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(handleIndex).toHaveBeenCalledWith(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalled();
  });
});
