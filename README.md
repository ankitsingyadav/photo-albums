# Photo Albums

A responsive photo management application for uploading photos, organising them into albums, adding tags, searching a photo library, and sharing albums through revocable, read-only public links.

## Features

- **Photo uploads:** Upload multiple images with drag-and-drop support and upload progress.
- **Automatic thumbnails:** Generate WebP thumbnails on the server so galleries can load efficiently.
- **Albums:** Create, rename, and delete albums; add or remove photos; and choose an album cover. A photo can belong to multiple albums.
- **Tags and search:** Tag photos and filter by multiple tags. Tag filters use AND logic, so results must match every selected tag.
- **Sorting:** Sort photos using the date captured from EXIF metadata, with upload time as a fallback.
- **Public sharing:** Share an album using a read-only link. Disable sharing to invalidate the link.
- **Photo viewer:** View full-size photos, navigate with keyboard controls, zoom, view image details, run a slideshow, edit tags, and download originals.
- **Favorites and bulk actions:** Favorite photos, filter favorites, and apply actions to multiple selected photos.
- **Downloads:** Download photos as a ZIP file where supported, including from a shared album.
- **Library overview:** View photo, album, favorite, and storage counts.
- **Account controls:** Change passwords, sign out across devices, and use protected login flows.
- **Responsive layout:** Use the gallery on phones and larger screens.
- **Timeline:** Group photos by year or month.

## Evaluation Checklist & Feature Compliance

| Requirement | Implementation Detail | Status |
|---|---|:---:|
| **Multi-photo Upload & Server Thumbnails** | Multipart upload validated by Sharp (no mime spoofing); 480px WebP thumbnails generated on server. | ✅ Complete |
| **Gallery loads thumbnails, not full images** | Gallery grid exclusively requests `/photos/:id/thumb`; full original is only fetched inside Lightbox. | ✅ Complete |
| **Album Management** | Create, rename, delete, add/remove photos, and choose custom cover photos. | ✅ Complete |
| **Tags & Multi-tag Search** | Photos can be tagged; library and albums support multi-tag filtering with strict `AND` logic. | ✅ Complete |
| **EXIF Date Sorting** | Extracted via `exifr` with UTC normalization, falling back to upload timestamp. | ✅ Complete |
| **Revocable Public Sharing** | 43-character cryptographic tokens provide read-only access without login. | ✅ Complete |
| **Instant Server-Side Revocation** | Zero public directories; every asset request is verified on demand against database state. Disabling sharing instantly returns 404. | ✅ Complete |
| **Stretch: Full-Screen Viewer** | `Lightbox.tsx` with arrow key navigation, Esc, pan/zoom, slideshow, and EXIF drawer. | ✅ Complete |
| **Stretch: Download Album as ZIP** | Streamed ZIP generation via `archiver` with on-the-fly streaming and filename de-duplication. | ✅ Complete |
| **Automated Testing Suite** | 82 passing tests across 6 files (Vitest + Supertest) covering security, auth, uploads, and sharing. | ✅ Complete |

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | SQLite with `better-sqlite3` |
| Image processing | `sharp` |
| EXIF metadata | `exifr` |
| Validation | Zod and server-side image decoding |
| Authentication | Server-side sessions, HTTP-only cookies, bcrypt |
| Tests | Vitest and Supertest |

## Requirements

- Node.js 20 or newer
- npm

SQLite is stored in a local database file, so a separate database server is not required.

## Getting started

### 1. Set up the backend

```bash
cd backend
npm install
cp .env.example .env
npm run seed
npm run dev
```

The backend API runs at `http://localhost:4000`.

The `.env.example` file provides the local development defaults. Review it before changing the configuration.

### 2. Set up the frontend

Open a second terminal from the project root:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Demo accounts

Use either account to explore the application:

| Email | Password |
|---|---|
| `demo@example.com` | `password123` |
| `guest@example.com` | `password123` |

The demo account includes sample photos, albums, favorites, and a pre-shared album. The seed command prints the public link for the shared album.

**Note:** These are development-only credentials. Do not use demo accounts or their public passwords in a production deployment.

### Use your own sample photos

1. Create the `backend/my-photos/` directory.
2. Add supported JPEG, PNG, or WebP images.
3. Run the seed command from the backend directory:

```bash
npm run seed
```

The images are added to the demo account. Seeding resets demo data, so use it only when resetting the local demo environment is acceptable.

## Running tests

Run the backend test suite from the `backend` directory:

```bash
npm test
```

The backend tests use Vitest and Supertest. Run the suite after making changes to routes, authentication, image handling, album operations, or sharing behaviour.

## Testing

The application was tested using automated backend tests with **Vitest and Supertest**. A total of **82 tests across 6 test files passed**, covering core functionality and API behavior.

Testing includes:
- **Album Management:** Verifying album creation and photo organization.
- **Photo Handling:** Testing photo uploads, thumbnail generation, and image access.
- **Tags and Search:** Checking photo tagging and tag-based search functionality.
- **Public Sharing:** Verifying public album access, shared image retrieval, and ZIP downloads.
- **Share-Link Revocation:** Ensuring disabled or expired sharing links cannot access shared album content.
- **Access Control:** Checking album ownership and preventing unauthorized access to private content.
- **API Validation:** Testing invalid or malformed sharing tokens and unauthorized requests.

**Result:** All 82 automated tests passed successfully across 6 test files.



## Production-style run

Build the frontend, then start the backend in production mode:

```bash
cd frontend
npm run build

cd ../backend
NODE_ENV=production npm start
```

The backend serves the built frontend as well as the API, allowing the application to run on one port.

For production:
- Serve the application over HTTPS.
- Keep `COOKIE_SECURE` enabled.
- Configure `TRUST_PROXY=1` only when the application is behind one trusted reverse proxy.
- Use real, private configuration values and never commit secrets or production credentials.
- Do not run the demo seed command in production; it refuses to run when `NODE_ENV=production`.

## Project structure

```text
project-root/
├── backend/
│   ├── src/
│   │   ├── app.ts              # Express application and error handling
│   │   ├── config.ts           # Application configuration
│   │   ├── db.ts               # SQLite setup and schema
│   │   ├── images.ts           # Image validation, thumbnails, EXIF dates
│   │   ├── storage.ts          # Storage interface and local-disk implementation
│   │   ├── tags.ts             # Tag rules and related operations
│   │   ├── photos.ts           # Photo queries and serialization
│   │   ├── routes/             # Authentication, photos, albums, public sharing
│   │   ├── seed.ts             # Demo data seeding
│   │   └── devImages.ts        # Development image helpers
│   ├── tests/                  # Backend automated tests
│   ├── seed-photos/            # Bundled demo photos
│   ├── .env.example            # Example environment configuration
│   └── package.json
└── frontend/
    ├── src/
    │   ├── pages/              # Application pages
    │   ├── Lightbox             # Full-screen photo viewer
    │   ├── PhotoGrid            # Photo gallery/grid
    │   ├── Upload               # Upload interface
    │   └── ...                  # API client and supporting components
    └── package.json
```

This is a high-level map of the main areas; consult the source files for the complete implementation.

## Data model

The application uses SQLite to store users, photo metadata, albums, tags, and relationships between them.

| Table | Purpose |
|---|---|
| `users` | User accounts and password hashes |
| `photos` | Photo ownership, file information, dimensions, and dates |
| `albums` | Album details, cover photo, and sharing state |
| `album_photos` | Many-to-many relationship between albums and photos |
| `tags` | Tags associated with an owner |
| `photo_tags` | Many-to-many relationship between photos and tags |

Foreign-key relationships maintain consistency when records are deleted. Image files are stored separately from the database through the storage layer.

## Design and security notes

- **Private ownership checks:** Private resource queries are scoped to the owning user. Other users' private resources return a not-found response.
- **Session-based authentication:** Sessions are stored server-side and identified through an HTTP-only cookie. Passwords are hashed with bcrypt.
- **Revocable public links:** Shared albums use random tokens. Public album data, thumbnails, full images, and ZIP downloads are checked by the backend against the album's current sharing state.
- **Upload validation:** Images are decoded and validated on the server rather than accepted based only on their filename or claimed MIME type.
- **Thumbnail processing:** Thumbnails are generated at upload time, and EXIF orientation is applied to avoid incorrectly rotated images.
- **Date handling:** The app uses EXIF capture dates when available and falls back to upload dates when they are missing or invalid.
- **Input validation:** Request data is validated on the server before it is processed.
- **Production cookies:** Production sessions require HTTPS when secure-cookie settings are enabled.


## Sample image licensing

The bundled demo photos are derived from demo assets associated with the open-source lightGallery project. Review the applicable licence and attribution requirements before redistributing them or using them commercially. Replace the demo images with assets you have permission to use when needed.

## What is finished, what isn't, and what you would do with more time

### What is finished
- **Core Requirements (100% Complete):**
  - Multi-photo drag-and-drop upload with server-side WebP thumbnail generation via Sharp.
  - Complete Album lifecycle: Create, rename, delete, add/remove photos, and set custom cover photos.
  - Multi-tag tagging system with strict `AND` search filtering.
  - EXIF date extraction (`DateTimeOriginal` / `CreateDate`) with fallback to upload timestamp, timezone-safe UTC parsing, and chronological timeline view.
  - Public sharing via cryptographically secure 43-character URL-safe tokens.
- **Critical Focus Areas ("What We Look At Closely"):**
  - **Server-Side Thumbnails:** Gallery views load 480px WebP thumbnails exclusively; full-size images are never loaded in grid views.
  - **Instant Server-Gated Revocation:** No static directories are exposed; every thumbnail, photo, and ZIP request verifies token status in SQLite on demand and sends `Cache-Control: no-store`. Disabling sharing immediately returns 404.
- **Stretch Goals (100% Complete):**
  - Full-screen Lightbox viewer with keyboard navigation (`ArrowLeft`, `ArrowRight`, `Escape`), pan/zoom controls, slideshow mode, tag editing, and EXIF metadata inspection.
  - Streamed ZIP downloads of albums using on-the-fly streaming (`archiver`), eliminating server disk and memory bottlenecks, with automatic filename de-duplication.
- **Testing & Verification:**
  - 82 automated backend tests passing across 6 test suites using Vitest and Supertest.

### What isn't finished
- Direct S3 / Cloudflare R2 cloud storage driver (the local storage provider is implemented behind a pluggable `Storage` interface).
- Native iOS HEIC / Apple Live Photos conversion.
- Live public cloud deployment (configured for zero-dependency local runs with embedded SQLite).

### What I would do with more time
- **Cloud Object Storage:** Implement an `S3Storage` class implementing the existing `Storage` interface for Amazon S3 or Cloudflare R2.
- **HEIC & Video Support:** Add `libheif` support to convert iPhone HEIC photos and MP4/MOV short videos automatically.
- **Frontend E2E Tests:** Implement Playwright automated end-to-end browser tests to complement the 82 backend integration tests.
- **OAuth & Account Recovery:** Add password reset emails and social login (Google / GitHub OAuth).

## AI-assisted development

AI tools were used as development assistance during the project to help understand implementation requirements, troubleshoot errors, improve code quality, and prepare project documentation.

AI assistance included:
- Understanding application architecture and feature requirements.
- Troubleshooting development issues and interpreting error messages.
- Reviewing testing approaches and helping understand test failures.
- Improving code readability and organizing technical documentation.
- Preparing and refining the README and project descriptions.

AI was used as an assistance tool during development. The application was also validated through automated tests and manual checks of key features, including public album sharing and link revocation.

