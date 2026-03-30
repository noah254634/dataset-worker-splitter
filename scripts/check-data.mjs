import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.dirname(__dirname);

const DB_PATH = path.join(
  PROJECT_ROOT,
  ".wrangler/state/v3/r2/miniflare-R2BucketObject/807c4e6b8ba738fbb9fba29fbd902c98d3d285369d224cb9f5149a38295b779a.sqlite"
);
const BLOBS_DIR = path.join(PROJECT_ROOT, ".wrangler/state/v3/r2/veralabel-datasets/blobs");

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  }
});

const query = "SELECT key, blob_id, custom_metadata FROM _mf_objects";

db.all(query, [], (err, rows) => {
  if (err) throw err;

  rows.forEach((row) => {
    const metadata = JSON.parse(row.custom_metadata);
    const blobPath = path.join(BLOBS_DIR, row.blob_id);

    if (fs.existsSync(blobPath)) {
      const content = fs.readFileSync(blobPath, "utf8");

      console.log("-----------------------------------");
      console.log(`FILE: ${row.key}`);
      console.log(`SPLIT: ${metadata["vera-split"] || "N/A"}`);
      console.log(`CONTENT: ${content.substring(0, 100)}${content.length > 100 ? "..." : ""}`);
    }
  });

  db.close();
});
