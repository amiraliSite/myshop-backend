const fs = require('fs');
const path = require('path');

const {
  DATA_DIR,
  readRepresentativeFiles,
  writeRepresentativeFiles,
} = require('./jsonStorage');

// پوشه‌ی ریشه‌ی آپلودها
// قابل تنظیم با متغیر محیطی UPLOADS_DIR
const UPLOADS_DIR =
  process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(process.cwd(), 'uploads');

const FILES_DIR = path.join(
  UPLOADS_DIR,
  'representatives',
);

// فقط عکس و PDF مجاز است
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
];

const ALLOWED_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'svg',
  'pdf',
];

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

function ensureDirectoryExists(directoryPath) {
  try {
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, {
        recursive: true,
      });
    }

    return true;
  } catch (error) {
    console.error(
      'خطا در ساخت پوشه:',
      directoryPath,
      error,
    );

    return false;
  }
}

function getExtension(filename) {
  return String(filename || '')
    .split('.')
    .pop()
    ?.toLowerCase()
    ?.trim();
}

function isAllowedFile(file) {
  if (!file) {
    return false;
  }

  const mimeType = String(
    file.mimetype || '',
  ).toLowerCase();

  const extension = getExtension(
    file.originalname,
  );

  const extAllowed =
    ALLOWED_EXTENSIONS.includes(extension);

  // اگر mime type داشتیم، هر دو رو چک می‌کنیم
  if (mimeType) {
    const mimeAllowed =
      ALLOWED_MIME_TYPES.includes(mimeType);

    return mimeAllowed && extAllowed;
  }

  return extAllowed;
}

function isFileSizeAllowed(file) {
  if (!file) {
    return false;
  }

  const size = Number(file.size || 0);

  return (
    Number.isFinite(size) &&
    size > 0 &&
    size <= MAX_FILE_SIZE
  );
}

// نام پوشه‌ی امن برای هر نماینده
// هر کاراکتری به جز حروف/اعداد/خط‌تیره/زیرخط رو با _ جایگزین می‌کنه
function getRepresentativeUploadDir(representativeId) {
  const safeId = String(
    representativeId || '',
  )
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, '_');

  if (!safeId) {
    return null;
  }

  return path.join(FILES_DIR, safeId);
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);

  if (!Number.isFinite(size) || size <= 0) {
    return '—';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// ساخت رکورد metadata برای ذخیره در JSON
function buildFileRecord(params) {
  const {
    representativeId,
    file,
    uploadedBy,
  } = params;

  const now = new Date().toISOString();

  return {
    id: `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`,
    representativeId: String(
      representativeId || '',
    ).trim(),
    name: String(
      file.originalname || '',
    ).trim(),
    mimeType: String(
      file.mimetype || '',
    ).trim(),
    size: Number(file.size || 0),
    sizeLabel: formatFileSize(
      file.size || 0,
    ),
    // مسیر نسبی از ریشه‌ی پروژه - برای ذخیره در JSON
    path: String(file.path || '').trim(),
    uploadedBy: String(
      uploadedBy || 'admin',
    ).trim(),
    uploadedAt: now,
  };
}

// جستجوی فایل با ID
function findFileById(files, fileId) {
  return files.find(
    (item) =>
      String(item?.id) === String(fileId),
  );
}

// جستجوی فایل با نام (داخل فایل‌های یک نماینده)
function findFileByName(
  files,
  representativeId,
  filename,
) {
  return files.find(
    (item) =>
      String(item?.representativeId) ===
        String(representativeId) &&
      String(item?.name) === String(filename),
  );
}

// لیست فایل‌های یک نماینده، مرتب‌شده بر اساس جدیدترین
function getFilesForRepresentative(representativeId) {
  return readRepresentativeFiles()
    .filter(
      (item) =>
        String(item?.representativeId) ===
        String(representativeId),
    )
    .sort((first, second) => {
      return (
        new Date(
          second.uploadedAt || 0,
        ).getTime() -
        new Date(
          first.uploadedAt || 0,
        ).getTime()
      );
    });
}

// حذف فایل فیزیکی از دیسک (_metadata باید جداگانه حذف شه)
function deleteFileFromDisk(filePath) {
  try {
    if (!filePath) {
      return true;
    }

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return true;
  } catch (error) {
    console.error(
      'خطا در حذف فایل از دیسک:',
      filePath,
      error,
    );

    return false;
  }
}

module.exports = {
  UPLOADS_DIR,
  FILES_DIR,
  DATA_DIR,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  ensureDirectoryExists,
  isAllowedFile,
  isFileSizeAllowed,
  getRepresentativeUploadDir,
  formatFileSize,
  buildFileRecord,
  findFileById,
  findFileByName,
  getFilesForRepresentative,
  deleteFileFromDisk,
  // re-export توابع JSON برای راحتی استفاده در route
  readRepresentativeFiles,
  writeRepresentativeFiles,
};
