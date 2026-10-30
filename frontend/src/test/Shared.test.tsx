import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Shared from "../pages/Shared";
import { api } from "../api";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
  },
  qs: () => "",
  errorMessage: (e: any) => e?.message || "Error",
}));

describe("Shared album public page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders album title and photos when the link is valid", async () => {
    (api.get as any).mockResolvedValueOnce({
      album: { title: "Vacation 2026", photoCount: 2 },
      photos: [
        {
          id: 1,
          filename: "beach.jpg",
          originalUrl: "/file/1",
          thumbUrl: "/thumb/1",
          width: 800,
          height: 600,
          size: 1024,
          mime: "image/jpeg",
          tags: ["beach"],
          uploadedAt: new Date().toISOString(),
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/s/valid-token-123"]}>
        <Routes>
          <Route path="/s/:token" element={<Shared />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Vacation 2026")).toBeInTheDocument();
    expect(screen.getByText(/Shared with you/i)).toBeInTheDocument();
    expect(screen.getByText(/Download all \(ZIP\)/i)).toBeInTheDocument();
  });

  it("renders locked state when link is invalid or revoked (404)", async () => {
    (api.get as any).mockRejectedValueOnce(new Error("This link isn't available"));

    render(
      <MemoryRouter initialEntries={["/s/revoked-token-456"]}>
        <Routes>
          <Route path="/s/:token" element={<Shared />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/This link isn't available/i)).toBeInTheDocument();
    expect(screen.getByText(/The album may have been made private/i)).toBeInTheDocument();
  });
});
