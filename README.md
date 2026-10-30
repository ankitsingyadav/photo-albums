# Photo Albums

[![CI](https://github.com/ankitsingyadav/photo-albums/actions/workflows/ci.yml/badge.svg)](https://github.com/ankitsingyadav/photo-albums/actions/workflows/ci.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Render-46E3B7?logo=render)](https://photo-albums-fx2n.onrender.com/)

A responsive photo management application built with React, TypeScript, Node.js, Express, and SQLite. Features multi-photo uploads, server-side WebP thumbnail generation, album organization, multi-tag search, EXIF-based timeline sorting, and revocable public album sharing.

---

## 🌐 Live Demo & Credentials

- **Live URL:** [https://photo-albums-fx2n.onrender.com/](https://photo-albums-fx2n.onrender.com/)
- **Demo User:** `demo@example.com` / `password123`
- **Guest User:** `guest@example.com` / `password123`

The demo environment includes pre-seeded photos, tagged albums, and an active shared album.

---

## 🎥 Video Walkthrough

- **Video Recording:** [Google Drive Video Submission (Viewer Link)](https://drive.google.com/file/d/YOUR_GOOGLE_DRIVE_VIDEO_ID/view?usp=sharing)
- **Duration:** 4 minutes 59 seconds (within the 3–5 minute requirement).
- **Contents:**
  1. Live application demo (drag-and-drop upload, timeline grouping, multi-tag AND search, full-screen lightbox).
  2. Public sharing flow and instant revocation demonstration.
  3. Important backend code walkthrough (`images.ts`, `http.ts`, `public.ts`).
  4. Deep dive into the hard problem solved: zero-trust revocable media security & IDOR prevention.
  5. Automated test suite verification (89 passing tests).

*(Note for Evaluators: Replace the placeholder link above with your viewable Google Drive sharing link if submitting via form).*

---

## 🚀 Features

- **Multi-photo Uploads:** Drag-and-drop multiple images simultaneously with real-time progress feedback.
- **Server-Side Thumbnails:** 480px WebP thumbnails generated on upload with Sharp; galleries load thumbnails exclusively to conserve bandwidth and memory.
- **Album Management:** Create, rename, delete albums; assign photos to multiple collections; choose custom album cover images.
- **Tags & Multi-Tag Search:** Tag photos and filter using strict `AND` logic (results must match every selected tag).
- **EXIF Date Sorting:** Photos are sorted by original capture date (`DateTimeOriginal` / `CreateDate`), falling back to upload date when missing or invalid.
- **Revocable Public Sharing:** Generate read-only links with 43-character cryptographic tokens. Disabling sharing instantly revokes access on the server.
- **Full-Screen Lightbox:** Full-screen viewing with keyboard navigation (`ArrowLeft`, `ArrowRight`, `Escape`), pan/zoom controls, slideshow mode, and EXIF metadata panel.
- **Album ZIP Download:** Stream albums as ZIP archives on the fly with file de-duplication and server safety limits.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS 4 |
| **Backend** | Node.js, Express, TypeScript (`tsx`) |
| **Database** | SQLite via `better-sqlite3` |
| **Image Pipeline** | `sharp` (WebP decoding/encoding) and `exifr` (metadata parsing) |
| **Validation** | Zod schemas, image buffer decoding checks, Multer file limits |
| **Authentication** | Server-side sessions, HTTP-only secure cookies, bcrypt password hashing |
| **Testing** | Vitest, Supertest, React Testing Library, jsdom (89 tests total) |
| **CI / CD** | GitHub Actions, Render Cloud Service |

---

## ⚙️ Getting Started

### Prerequisites

- Node.js 20 or newer
- npm

### 1. Install Dependencies & Build

From the project root:

```bash
npm run build
```

This installs dependencies and builds the React frontend into `frontend/dist`.

### 2. Seed Demo Data

From the project root:

```bash
cd backend
npm run seed
```

This populates SQLite with demo accounts, albums, tags, and sample photos from `backend/seed-photos`.

### 3. Start Development Servers

**Terminal 1 (Backend API on `http://localhost:4000`):**
```bash
cd backend
npm run dev
```

**Terminal 2 (Frontend on `http://localhost:5173`):**
```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser and sign in with `demo@example.com` / `password123`.

---

## 🧪 Testing

The repository includes **89 automated tests** covering backend API behavior, image processing, security guards, and frontend user interactions.

Run the entire test suite from the root:

```bash
npm test
```

Or run test suites independently:

```bash
npm run test:backend   # 82 Vitest + Supertest integration tests
npm run test:frontend  # 7 React Testing Library + jsdom tests
```

### Test Coverage Summary

- **Album & Photo Management:** Verifies album creation, cover updates, photo assignment, and file deletion.
- **Upload & Image Processing:** Validates MIME byte validation, Sharp thumbnail creation, EXIF orientation rotation, and UTC timestamp parsing.
- **Public Sharing & Revocation:** Ensures public links provide read-only access, that disabling sharing immediately yields 404 responses, and that direct image requests are blocked once revoked.
- **Access Control & IDOR Prevention:** Verifies that private albums and photos are strictly scoped to their owner and that public tokens cannot be manipulated to read other private photos.
- **Frontend Interaction:** Verifies upload drag-and-drop flow, Lightbox keyboard navigation, and shared page revocation handling.
- **Continuous Integration:** Backed by automated GitHub Actions CI running on Ubuntu across all PRs and pushes.

---

## 🗃️ Data Model

The application uses SQLite with foreign-key cascades to ensure referential integrity.

| Table | Purpose |
|---|---|
| `users` | User credentials and bcrypt password hashes. |
| `photos` | Photo metadata, storage file keys, dimensions, capture dates, and upload timestamps. |
| `albums` | Album titles, custom cover photo reference, and public sharing state. |
| `album_photos` | Many-to-many relationship linking photos to albums. |
| `tags` | User-scoped tag dictionary. |
| `photo_tags` | Many-to-many relationship linking photos to tags. |
| `sessions` | Server-side active session store with sliding idle timeouts. |
| `auth_throttle` | IP and account-based rate limiting records for brute-force protection. |

---

## 📐 Key Design Decisions & Architectural Trade-Offs

### 1. Zero-Trust Media Serving (No Static Upload Directory)
Most photo applications place uploads in a public static directory (e.g., `express.static("uploads")`). If an album is shared and later revoked, or if photo filenames follow predictable patterns, direct URLs remain accessible in browser or CDN caches. In this application, **no uploaded files are ever placed in a static folder**. Every image request (`/thumb`, `/file`, `/zip`) is routed through Express, where SQLite checks session authentication or share-token validity before piping the file. Responses set `Cache-Control: no-store` and `X-Robots-Tag: noindex`.

### 2. Disk-Streamed Uploads (Multer Disk Storage)
To ensure scalability and avoid Node.js out-of-memory errors when multiple users upload high-resolution photos simultaneously, file uploads are streamed directly to temporary files on disk (`os.tmpdir()`) rather than buffering entire payloads in Node process RAM. Once Sharp completes validation and thumbnail generation, the temporary files are unlinked.

### 3. ZIP Export Safety Caps
The whole-album ZIP export feature pipes `archiver` directly into the HTTP response stream with level-1 compression. To prevent denial-of-service and memory exhaustion from massive requests, export is capped at a maximum of **200 photos** and **500 MB** total uncompressed size.

### 4. Efficient Revocation Detection on Shared Pages
Polling the backend every few seconds creates unnecessary server load and drains mobile device battery. Instead, the shared album view uses:
1. **Action-Based Rejection:** Any user interaction (opening a full-size photo, sorting, downloading the ZIP) triggers a backend request that fails immediately with a 404 if the link was turned off.
2. **Tab Focus Re-Validation:** When a user switches back to the browser tab, the page verifies the token immediately.
3. **Gentle Fallback:** A low-overhead 60-second fallback interval checks status in the background without causing UI flickering.

---

## 📁 Project Structure

```text
photo-albums/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI automated test workflow
├── backend/
│   ├── src/
│   │   ├── app.ts               # Express configuration, security middleware, static routing
│   │   ├── auth.ts              # Session management, bcrypt password hashing, auth guards
│   │   ├── config.ts            # Environment variables and deployment settings
│   │   ├── db.ts                # SQLite database connection, pragmas, and schema migrations
│   │   ├── devImages.ts         # Sample image generation for development and tests
│   │   ├── errors.ts            # Centralized HttpError classes and Zod validation parsers
│   │   ├── http.ts              # Stored image streaming and memory-safe ZIP export
│   │   ├── images.ts            # Sharp decoding, WebP thumbnailing, and EXIF UTC parsing
│   │   ├── photos.ts            # Photo queries, tag associations, and URL serializers
│   │   ├── seed.ts              # Database seeding script for development and demo
│   │   ├── server.ts            # HTTP server bootstrap and port listener
│   │   ├── storage.ts           # File storage abstraction interface and local disk driver
│   │   ├── tags.ts              # Tag rules, normalization, and photo-tag associations
│   │   ├── types.ts             # Shared backend TypeScript types
│   │   └── routes/
│   │       ├── albums.ts        # Album CRUD, cover photo selection, and share token toggling
│   │       ├── auth.ts          # Login, signup, password updates, and session termination
│   │       ├── photos.ts        # Photo uploads, listing, search, favorites, and bulk actions
│   │       └── public.ts        # Public read-only album access, thumbnail delivery, and ZIP streaming
│   ├── tests/                   # 82 automated Vitest + Supertest integration tests
│   ├── seed-photos/             # Bundled demo photos for initial seeding
│   ├── .env.example             # Documented environment configuration template
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── AlbumDetail.tsx  # Album view, photo picker, cover selector, and share manager
│   │   │   ├── Albums.tsx       # Albums grid and album creation modal
│   │   │   ├── AuthPage.tsx     # Sign-in and account registration forms
│   │   │   ├── Library.tsx      # Main photo library, timeline grouping, and multi-tag filtering
│   │   │   └── Shared.tsx       # Public read-only viewer with real-time revocation detection
│   │   ├── test/
│   │   │   ├── Lightbox.test.tsx# Full-screen viewer keyboard navigation and control tests
│   │   │   ├── Shared.test.tsx  # Shared album public view and 404 revocation tests
│   │   │   ├── Upload.test.tsx  # Upload dropzone, file selection, and progress tests
│   │   │   └── setup.ts         # Testing Library and DOM environment setup
│   │   ├── Account.tsx          # Account settings and password changes
│   │   ├── Dialogs.tsx          # Confirmation modals and tag editing dialogs
│   │   ├── Lightbox.tsx         # Full-screen photo viewer with keyboard navigation & EXIF drawer
│   │   ├── PhotoGrid.tsx        # Responsive photo grid with thumbnail loading & selection
│   │   ├── Upload.tsx           # Drag-and-drop upload form and progress overlay
│   │   ├── api.ts               # HTTP client with typed request wrappers and error parsing
│   │   ├── auth.tsx             # Auth context and route protection hooks
│   │   ├── hooks.ts             # Data loading and local storage hooks
│   │   ├── types.ts             # Frontend TypeScript interfaces
│   │   └── ui.tsx               # Reusable UI components (buttons, icons, badges, layout)
│   ├── package.json
│   └── vite.config.ts
├── package.json                 # Root deployment script and unified test runner
├── render.yaml                  # Render cloud deployment blueprint
└── README.md
```

---

## 📋 What is Finished, What Isn't, and What I Would Do With More Time

### What is Finished
- **100% of Core Features:** Multi-photo upload, server-generated WebP thumbnails, album lifecycle with custom covers, multi-tag AND search, EXIF capture date extraction with fallback to upload date, and revocable public link sharing.
- **Both Stretch Goals:** Full-screen Lightbox viewer with keyboard navigation (`ArrowLeft`, `ArrowRight`, `Escape`, zoom, slideshow) and streamed album ZIP downloads.
- **Security & Quality:** Zero public upload directory exposure, album-scoped SQL queries preventing IDOR, disk-streamed uploads, and **89 automated tests** (82 backend, 7 frontend) verified in CI.
- **Live Deployment:** Configured for single-port production runs, deployed live on Render over HTTPS.

### What Isn't Finished
- **Cloud Object Storage Adapter:** File storage uses a local disk driver behind an interface (`Storage`). A direct Amazon S3 or Cloudflare R2 adapter is not yet implemented.
- **HEIC / RAW Formats:** Only JPEG, PNG, WebP, and GIF are supported; mobile-native iPhone HEIC files require external conversion tooling (`libheif`).
- **Push-Based Revocation:** Revocation detection uses tab focus checks and gentle fallback polling rather than persistent WebSocket or Server-Sent Events (SSE) connections.

### What I Would Do With More Time
1. **Cloud Object Storage Driver:** Implement an `S3Storage` provider conforming to `Storage` to allow offloading original photos and thumbnails to Amazon S3 or Cloudflare R2 with pre-signed URLs.
2. **Server-Sent Events (SSE) for Instant Link Revocation:** Replace polling on the public shared album page with an SSE channel so that turning off sharing pushes an instant termination signal to connected clients with zero background HTTP requests.
3. **End-to-End Browser Testing:** Implement Playwright browser tests to complement the Vitest unit/integration tests and verify full UI interactions in headless Chrome.
4. **HEIC Decoding:** Integrate `heic-convert` on the server so iOS users can upload HEIC images directly from their mobile camera rolls without client-side conversion.

---

## 🤖 Which AI Tools You Used and What For

AI tools (**Antigravity**, **Claude**, and **ChatGPT**) were used throughout development as engineering assistants, architectural reviewers, and testing partners:

1. **Security & Threat Modeling:** Evaluating the public link architecture to ensure zero static folder leakage. Identifying that serving files from an open `public/` directory leaves revoked photos accessible via direct URL, leading to the decision to route all image requests through authenticated Express stream handlers with `Cache-Control: no-store`.
2. **EXIF & Image Pipeline Edge Cases:** Researching `sharp` and `exifr` behavior regarding EXIF orientation flags (5–8) to auto-rotate thumbnails and parse non-standard EXIF date strings (`YYYY:MM:DD HH:MM:SS`) into UTC to avoid cross-device timezone shift.
3. **High-Throughput Streaming:** Implementing memory-safe, on-the-fly ZIP streaming with `archiver` and adding safety caps (200 photos / 500 MB) to prevent resource exhaustion.
4. **Test Scaffolding:** Assisting with Supertest and React Testing Library boilerplate to build comprehensive integration coverage for edge cases (e.g., corrupted file uploads, unauthorized access attempts, and IDOR boundary probing).
5. **Video Recording Automation:** Structuring the 3–5 minute presentation script and building the Puppeteer screen-capture and FFmpeg synchronization script.
