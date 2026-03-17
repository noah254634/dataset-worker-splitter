# VeraLabel Dataset Splitter Worker

A high-performance Cloudflare Worker designed for the atomic splitting and distribution of massive datasets. Built specifically for the **VeraLabel.ai** ecosystem to bridge the gap between raw data uploads and human-in-the-loop (HITL) annotation pipelines.

## 🚀 Core Features

* **Deterministic Splitting:** Uses SHA-256 hashing to ensure a stable 80/10/10 (Train/Val/Test) distribution. This ensures that the same data point always lands in the same bucket, preventing data leakage across model iterations.
* **Streaming Architecture:** Employs the WHATWG Streams API to process multi-gigabyte files (JSONL, CSV, ZIP) without exceeding Cloudflare’s 128MB memory limit.
* **Multi-Modal Support:** Custom splitters for Media (Images/Video), RLHF (Prompt/Response ranking), and raw Text datasets.
* **Stateless Scaling:** Operates on the Cloudflare Edge, allowing for global scalability without the need for a centralized coordination server.

## 📁 Project Structure & Definitions

### Root Files
- `.dev.vars`: **(Local Only)** Stores your `INTERNAL_SECRET` and `BACKEND_TOKEN`. This file is git-ignored to prevent credential leaks.
- `.gitignore`: Prevents secrets, `node_modules`, and build artifacts from being pushed to GitHub.
- `wrangler.toml`: The infrastructure configuration file for Cloudflare, defining R2 bucket bindings and worker routes.

### `src/` Directory
- `index.js`: **The Gatekeeper.** Handles routing and validates the `X-Vera-Signature` using the `INTERNAL_SECRET`.
- `r2Helpers.js`: **The Brain.** Contains the deterministic hashing logic and R2 upload functions.
- `constants.js`: **The Config.** Defines shared values like the 80/10/10 split ratios, supported MIME types, and project constraints.
- `nodeApi.js`: Polyfills and helpers for Node-specific features within the Worker environment.

### `src/splitters/`
- `mediaSplitter.js`: Unpacks ZIP archives and sorts images/video into project buckets.
- `rlhfSplitter.js`: Specifically designed for RLHF (Reinforcement Learning from Human Feedback). It keeps "Prompt-Response" triplets together as a single atomic task.
- `textSplitter.js`: A line-by-line processor for large-scale text datasets.

## 🛠️ Technical Workflow

1.  **Ingestion:** Data is POSTed to the worker with an `X-Vera-Signature`.
2.  **Streaming:** The worker reads the request body as a stream to keep memory usage low.
3.  **Hashing:** Each data point (image name or prompt text) is hashed to create a unique "Score" (0-99).
4.  **Routing:** - **0-79:** Sent to R2 `/train/`
    - **80-89:** Sent to R2 `/val/`
    - **90-99:** Sent to R2 `/test/`
5.  **Registration:** The worker fires a webhook to the Node.js API to register the new task in MongoDB.

## 🚦 Local Development

1. **Install Dependencies:**
   ```bash
   npm install

© 2026 VeraLabel.ai - AI Alignment for the Global South.