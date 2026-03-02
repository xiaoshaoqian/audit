# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI辅助物理教辅审稿系统 (AI-assisted Physics Teaching Material Review System) - An intelligent review tool for high school physics teaching materials. Uses Qwen-VL (`qwen3-vl-plus` via DashScope API) for multimodal AI review and the Jiuzhang API for answer verification.

## Common Commands

### Setup
```bash
# Backend virtual environment
cd backend
python -m venv venv
source venv/bin/activate  # macOS/Linux
venv\Scripts\activate     # Windows
pip install -r requirements.txt

# Frontend dependencies
cd frontend
npm install
```

**External dependencies**:
- **Poppler** — required for PDF→PNG conversion. On macOS: `brew install poppler`. On Windows: install to `C:\poppler\` or `C:\poppler-25.12.0\`.
- **LibreOffice** — required for DOCX→PDF conversion. Must be installed and accessible via `soffice` CLI.

### Running the Application
```bash
# Terminal 1: Backend (port 8001)
cd backend && python main.py

# Terminal 2: Frontend (port 5173, proxies /api to :8001)
cd frontend && npm run dev
```

Access at http://localhost:5173. API docs at http://localhost:8001/docs.

### Build
```bash
cd frontend && npm run build
```

### Testing

There is no formal test framework (no pytest/Jest). Test manually via the UI or Swagger at `/docs`.

## Conventions

- **Chinese-first codebase**: comments, UI text, commit messages, and some variable names are in Chinese
- **No database**: all persistence is file-based (JSON + binary images under `backend/data/`)
- **Frontend state**: uses local `useState` hooks per page; no Redux or global state management

## Architecture

### Two Main Workflows

**1. Workbench (制作工作台) `/workbench`** — Content preparation:
- Upload DOCX → auto-convert to PNG pages (via LibreOffice + Poppler)
- Select documents → stitch pages into a tall canvas image (chunked at 30,000px for OpenCV limits)
- Draw cut lines on canvas to define content blocks (knowledge/example/answer types)
- Save slices → outputs PNG files to `backend/data/groups/{group_name}/`

**2. Review (审核) `/review/:docId`** — AI review:
- Select segments (page ranges) per document with type tags (knowledge/example/exercise)
- Trigger AI audit → Qwen-VL analyzes images and returns JSON with issues + bounding box coordinates
- Exercise-type segments also call the Jiuzhang API for answer verification
- Reviewers confirm/reject each flagged issue

### Backend (FastAPI, port 8001)

- **Entry**: [backend/main.py](backend/main.py) — registers all routers, mounts `/files` static at `backend/data/`, mounts `/static/images` at `backend/data/images/`
- **Config**: [backend/config.py](backend/config.py) — `Settings` (pydantic-settings), auto-discovers Poppler path

**API Routes** (`backend/api/`):
- `upload.py` — DOCX upload → convert → register in `doc_store`; list/delete documents
- `split.py` — CRUD for page-range segments on a document; serves page/thumbnail images
- `audit.py` — triggers `AuditService` for one or multiple segments
- `canvas.py` — stitch documents into canvas, save/load cut-line drafts, crop blocks
- `group.py` — list groups, get/rename/delete slices within a group

**Services** (`backend/services/`):
- `auditor.py` (`AuditService`) — calls `qwen3-vl-plus` via `dashscope.MultiModalConversation`; parses `<ref>…</ref><box>(x1,y1),(x2,y2)</box>` tags from model output; coordinates are 0–1000 normalized and scaled back to pixel space
- `canvas.py` (`CanvasService`) — stitches pages with top/bottom trim; chunks output into 30,000px-tall JPEGs; manages canvas index at `backend/data/canvas/index.json` and per-canvas JSON metadata
- `doc_store.py` (`DocumentStore`) — singleton; persists document index to `backend/data/documents.json`; stores relative paths, hydrates to absolute on load
- `converter.py` (`DocumentConverter`) — DOCX→PDF via LibreOffice, PDF→PNG via pdf2image/Poppler
- `splitter.py` (`ImageSplitter`) — manages segment definitions; stitches multi-page segment images
- `jiuzhang.py` (`JiuzhangService`) — sends image to Jiuzhang API for physics answer verification
- `group.py` (`GroupService`) — singleton; manages `backend/data/groups/` directory

**Models**: `backend/models.py` — Pydantic models (`DocumentInfo`, `Segment`, `CreateSegmentRequest`, etc.)

### Frontend (React + Vite + TypeScript + Ant Design)

- **Routing**: [frontend/src/App.tsx](frontend/src/App.tsx) — three routes: `/`, `/workbench`, `/review/:docId`
- **API client**: [frontend/src/services/api.ts](frontend/src/services/api.ts) — axios instance with 5-minute timeout; typed interfaces for all API responses
- Vite proxies `/api` to `http://localhost:8001`

**Pages**:
- `/` [HomePage](frontend/src/pages/HomePage.tsx) — document list, upload, navigate to review
- `/workbench` [WorkbenchPage](frontend/src/pages/WorkbenchPage.tsx) — canvas stitching, cut-line drawing, block slicing
- `/review/:docId` [AuditReviewPage](frontend/src/pages/AuditReviewPage.tsx) — segment management, AI audit trigger, issue review with coordinate overlay

### Data Layout

```
backend/data/
  documents.json          # Document index (relative paths)
  uploads/{doc_id}/       # Original DOCX files
  images/{doc_id}/        # Converted PNG pages + thumbnails/
  images/canvas/          # Canvas JPEGs (chunked) + metadata JSON
  canvas/index.json       # Canvas index
  groups/{group_name}/    # Sliced content blocks (PNG)
  splits/{doc_id}/        # Segment definitions JSON
  results/{doc_id}/       # Audit result JSON
```

### Environment Variables

Configure in `backend/.env`:
```
DASHSCOPE_API_KEY=       # Required for Qwen-VL
JIUZHANG_ACCESS_KEY=     # For answer verification
JIUZHANG_SECRET_KEY=
POPPLER_PATH=            # Override auto-detected path
OSS_ACCESS_KEY_ID=       # Aliyun OSS (optional)
OSS_ACCESS_KEY_SECRET=
OSS_ENDPOINT=
OSS_BUCKET_NAME=
```

### Key Patterns

- **Singleton services**: `doc_store`, `group_service`, `canvas_service` are module-level instances imported directly by routers
- **Path handling**: `doc_store` stores relative paths; always call `load_documents(hydrate=True)` when absolute paths are needed
- **Canvas coordinate system**: Cut lines and block coordinates are in absolute canvas pixels; Qwen-VL returns 0–1000 normalized coords that `auditor.py` scales back using `max(width, height)` as the normalization base with a `-15px` Y bias correction
- **Canvas chunking**: Canvases taller than 30,000px are split into multiple JPEG files (`{canvas_id}_part_{i}.jpg`); the frontend assembles them visually
