import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Lightbox } from "../Lightbox";
import type { Photo } from "../types";

const mockPhotos: Photo[] = [
  {
    id: 1,
    filename: "first.jpg",
    originalUrl: "/file/1",
    thumbUrl: "/thumb/1",
    width: 1920,
    height: 1080,
    size: 2048,
    mime: "image/jpeg",
    tags: ["nature"],
    uploadedAt: new Date().toISOString(),
  },
  {
    id: 2,
    filename: "second.jpg",
    originalUrl: "/file/2",
    thumbUrl: "/thumb/2",
    width: 1920,
    height: 1080,
    size: 4096,
    mime: "image/jpeg",
    tags: ["city"],
    uploadedAt: new Date().toISOString(),
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
