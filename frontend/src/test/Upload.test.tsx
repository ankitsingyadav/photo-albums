import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UploadPanel, UploadProgress } from "../Upload";

describe("Upload Component", () => {
  it("renders upload dropzone and handles file selection", () => {
    const mockUpload = vi.fn().mockResolvedValue(true);
    render(<UploadPanel upload={mockUpload} busy={false} />);

    expect(screen.getByText(/Drop photos here/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Choose photos/i })).toBeInTheDocument();

    const fileInput = screen.getByLabelText(/Choose photos/i);
    const testFile = new File(["dummy content"], "test-photo.jpg", { type: "image/jpeg" });

    fireEvent.change(fileInput, { target: { files: [testFile] } });

    expect(screen.getByText(/1 photo ready/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Tag all of these/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload 1/i })).toBeInTheDocument();
  });

  it("calls upload with files and tags when submitted", async () => {
    const mockUpload = vi.fn().mockResolvedValue(true);
    render(<UploadPanel upload={mockUpload} busy={false} />);

    const fileInput = screen.getByLabelText(/Choose photos/i);
    const testFile = new File(["dummy content"], "sample.png", { type: "image/png" });

    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const tagInput = screen.getByPlaceholderText(/Tag all of these/i);
    fireEvent.change(tagInput, { target: { value: "vacation, summer" } });

    const uploadButton = screen.getByRole("button", { name: /Upload 1/i });
    fireEvent.click(uploadButton);

    expect(mockUpload).toHaveBeenCalledWith([testFile], "vacation, summer");
  });

  it("renders upload progress bar with percentage", () => {
    render(<UploadProgress state={{ count: 3, percent: 65 }} />);

    expect(screen.getByText(/Uploading 3 photos/i)).toBeInTheDocument();
    expect(screen.getByText(/65%/i)).toBeInTheDocument();
  });
});
