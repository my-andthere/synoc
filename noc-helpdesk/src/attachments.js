/**
 * SYNOC — lampiran gambar pada catatan timeline.
 *
 * Menyediakan:
 *   - middleware multer (memoryStorage) untuk menerima multipart/form-data;
 *   - penyimpanan berkas ke disk dengan nama acak (nama asli tidak pernah
 *     dipakai sebagai path, sehingga path traversal tidak mungkin);
 *   - registrasi metadata lampiran ke tabel `ticket_event_attachments`;
 *   - pembacaan berkas untuk dikirim ulang ke browser.
 *
 * Berkas disimpan DI LUAR folder `public/` supaya tidak bisa diakses
 * langsung tanpa token —ONLY lewat endpoint yang memverifikasi JWT.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { query, queryOne, execute } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Folder penyimpanan lampiran (di luar `public/`). */
export const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'tickets');

/** MIME type gambar yang boleh diunggah. */
export const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/pjpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',
]);

/** Batas ukuran per berkas (5 MB) dan jumlah berkas per catatan. */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_FILES = 6;

/** Ensure the upload directory exists (called lazily). */
let dirReady = null;
async function ensureDir() {
  if (!dirReady) {
    dirReady = fs.mkdir(UPLOAD_DIR, { recursive: true }).catch((err) => {
      dirReady = null;
      throw err;
    });
  }
  return dirReady;
}

/**
 * Multer middleware. Memakai memoryStorage supaya validasi (tipe & ukuran)
 * selesai SEBELUM ada berkas yang menyentuh disk.
 */
export const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.has(String(file.mimetype || '').toLowerCase())) {
      const err = new Error(
        `Tipe berkas "${file.mimetype || 'tidak dikenal'}" tidak didukung. Gunakan gambar (JPG, PNG, GIF, WebP, BMP).`
      );
      err.status = 400;
      return cb(err);
    }
    return cb(null, true);
  },
});

/** Extension guessed from the MIME type. */
const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
};

/** Sanitize the original file name for display (never used as a path). */
function safeDisplayName(name) {
  const base = path.basename(String(name || 'gambar')).replace(/[^\w.\- ]+/g, '_');
  return base.slice(0, 200) || 'gambar';
}

/**
 * Simpan satu berkas lampiran.
 *
 * @param {object} opts
 * @param {number} opts.ticketId
 * @param {number} opts.eventId
 * @param {object} opts.file        multer file (buffer, originalname, mimetype, size)
 * @param {number} opts.userId
 * @returns {Promise<object>} baris lampiran yang tersimpan
 */
export async function saveAttachment({ ticketId, eventId, file, userId }) {
  await ensureDir();

  const mime = String(file.mimetype || '').toLowerCase();
  const ext = EXT_BY_MIME[mime] || path.extname(file.originalname || '').toLowerCase() || '.bin';
  const storedName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const target = path.join(UPLOAD_DIR, storedName);

  await fs.writeFile(target, file.buffer);

  const displayName = safeDisplayName(file.originalname);
  const result = await execute(
    `INSERT INTO ticket_event_attachments
       (event_id, ticket_id, file_name, stored_name, mime_type, size_bytes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [eventId, ticketId, displayName, storedName, mime, file.size ?? file.buffer.length, userId ?? null]
  );

  return {
    id: result.insertId,
    event_id: eventId,
    ticket_id: ticketId,
    file_name: displayName,
    mime_type: mime,
    size_bytes: file.size ?? file.buffer.length,
  };
}

/**
 * Ambil metadata lampiran beserta path berkas absolutnya.
 * @returns {Promise<object|null>}
 */
export async function findAttachment(attachmentId) {
  const row = await queryOne(
    'SELECT * FROM ticket_event_attachments WHERE id = ? LIMIT 1',
    [attachmentId]
  );
  if (!row) return null;
  return { ...row, absolutePath: path.join(UPLOAD_DIR, row.stored_name) };
}

/** Semua lampiran sebuah tiket (urutan lama -> baru). */
export async function listTicketAttachments(ticketId) {
  return query(
    `SELECT a.id, a.event_id, a.ticket_id, a.file_name, a.stored_name,
            a.mime_type, a.size_bytes, a.created_at
       FROM ticket_event_attachments a
      WHERE a.ticket_id = ?
      ORDER BY a.id ASC`,
    [ticketId]
  );
}

/** Hapus berkas fisik sebuah lampiran (best effort). */
export async function removeAttachmentFile(storedName) {
  if (!storedName) return;
  const target = path.join(UPLOAD_DIR, path.basename(storedName));
  try {
    await fs.unlink(target);
  } catch {
    /* berkas sudah hilang — abaikan */
  }
}

/** Hapus semua berkas lampiran milik sebuah tiket (saat tiket dihapus). */
export async function removeTicketAttachmentFiles(ticketId) {
  const rows = await query(
    'SELECT stored_name FROM ticket_event_attachments WHERE ticket_id = ?',
    [ticketId]
  );
  for (const row of rows) await removeAttachmentFile(row.stored_name);
}
