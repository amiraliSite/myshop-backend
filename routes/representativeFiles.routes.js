const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const jwt = require('jsonwebtoken');

const {
  DATA_DIR,
  readRepresentatives,
} = require('../helpers/jsonStorage');

const {
  normalizeValue,
} = require('../helpers/values');

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'company-panel-secret-change-this-in-production';

const REPRESENTATIVES_DIR = path.join(
  DATA_DIR,
  'representatives',
);

const invalidFiles = [
  'favicon.svg',
  'favicon.ico',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
];

const allowedExtensions = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'zip',
  'rar',
];

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const MAX_FILES_PER_UPLOAD = 10;

function getFileIcon(fileName) {
  const extension = path.extname(
    String(fileName),
  )
    .slice(1)
    .toLowerCase();

  if (
    ['jpg', 'jpeg', 'png', 'gif', 'webp']
      .includes(extension)
  ) {
    return '🖼️';
  }

  if (extension === 'pdf') return '📕';

  if (
    ['doc', 'docx'].includes(extension)
  ) {
    return '📘';
  }

  if (
    ['xls', 'xlsx'].includes(extension)
  ) {
    return '📗';
  }

  if (
    ['zip', 'rar'].includes(extension)
  ) {
    return '🗜️';
  }

  return '📄';
}

function getRepresentativeDirectory(
  representativeId,
) {
  const normalizedId = normalizeValue(
    representativeId,
  );

  const representative =
    readRepresentatives().find((item) => {
      return (
        normalizeValue(item.id) === normalizedId
      );
    });

  if (!normalizedId || !representative) {
    return null;
  }

  const folderNumber = Number(
    representative.folderNumber,
  );

  if (
    !Number.isSafeInteger(folderNumber) ||
    folderNumber <= 0
  ) {
    return null;
  }

  return path.join(
    REPRESENTATIVES_DIR,
    String(folderNumber),
  );
}

function getRepresentativeFilePath(
  representativeId,
  fileName,
) {
  const directory =
    getRepresentativeDirectory(
      representativeId,
    );

  if (!directory) return null;

  const name = String(fileName || '');

  if (
    !name ||
    name === '.' ||
    name === '..' ||
    path.basename(name) !== name ||
    name.includes('/') ||
    name.includes('\\')
  ) {
    return null;
  }

  return path.join(directory, name);
}

// ===== Auth middleware (همانند representatives.js) =====

function authenticateToken(req, res, next) {
  const authorization = String(
    req.headers.authorization || '',
  );

  const match = authorization.match(
    /^Bearer\s+(.+)$/i,
  );

  if (!match) {
    return res.status(401).json({
      success: false,
      error:
        'توکن ورود ارسال نشده است. لطفاً دوباره وارد حساب شوید.',
    });
  }

  try {
    const decoded = jwt.verify(
      match[1].trim(),
      JWT_SECRET,
    );

    if (
      !decoded ||
      typeof decoded !== 'object'
    ) {
      return res.status(401).json({
        success: false,
        error: 'توکن ورود نامعتبر است.',
      });
    }

    req.user = decoded;

    return next();
  } catch {
    return res.status(401).json({
      success: false,
      error:
        'توکن ورود نامعتبر یا منقضی شده است.',
    });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error:
        'فقط ادمین اجازه دسترسی به این بخش را دارد.',
    });
  }

  return next();
}

// تابع کمکی برای نمایش اعداد فارسی در پاسخ
function toPersianNumber(value) {
  return new Intl.NumberFormat('fa-IR').format(
    Number(value || 0),
  );
}

// ===== Multer config برای آپلود =====

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const representativeId = String(
      req.params.id || '',
    ).trim();

    const directory =
      getRepresentativeDirectory(
        representativeId,
      );

    if (!directory) {
      return cb(
        new Error(
          'نماینده یا شمارهٔ پوشهٔ او پیدا نشد.',
        ),
      );
    }

    // ساخت پوشه در صورت عدم وجود
    fs.mkdirSync(directory, {
      recursive: true,
    });

    return cb(null, directory);
  },

  filename: (req, file, cb) => {
    // مدیریت encoding نام فایل (برای فارسی/یونیکد)
    const originalName = Buffer.isBuffer(
      file.originalname,
    )
      ? file.originalname.toString('utf8')
      : file.originalname;

    let safeName = path.basename(
      String(originalName || ''),
    );

    if (!safeName) {
      safeName = `file-${Date.now()}`;
    }

    // اگر فایل با همین نام وجود داشت، یک پسوند عددی اضافه کن
    const representativeId = String(
      req.params.id || '',
    ).trim();

    const directory =
      getRepresentativeDirectory(
        representativeId,
      );

    if (
      directory &&
      fs.existsSync(
        path.join(directory, safeName),
      )
    ) {
      const ext = path.extname(safeName);
      const base = path.basename(safeName, ext);
      let counter = 1;

      while (
        fs.existsSync(
          path.join(
            directory,
            `${base}_${counter}${ext}`,
          ),
        )
      ) {
        counter += 1;
      }

      safeName = `${base}_${counter}${ext}`;
    }

    return cb(null, safeName);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES_PER_UPLOAD,
  },
  fileFilter: (req, file, cb) => {
    // نرمال‌سازی نام فایل برای بررسی extension
    const originalName = Buffer.isBuffer(
      file.originalname,
    )
      ? file.originalname.toString('utf8')
      : file.originalname;

    const extension = path
      .extname(String(originalName || ''))
      .slice(1)
      .toLowerCase();

    if (
      allowedExtensions.includes(extension)
    ) {
      return cb(null, true);
    }

    return cb(
      new Error(
        `نوع فایل "${file.originalname}" مجاز نیست. فقط: ${allowedExtensions.join(', ')}`,
      ),
    );
  },
});

// ===== Routes =====

/*
  GET /api/representatives/:id/files

  دریافت لیست فایل‌های یک نماینده
*/
router.get('/:id/files', (req, res) => {
  try {
    const representativeId = String(
      req.params.id || '',
    ).trim();

    const directory =
      getRepresentativeDirectory(
        representativeId,
      );

    if (!directory) {
      return res.status(404).json({
        success: false,
        error:
          'نماینده یا شمارهٔ پوشهٔ او پیدا نشد.',
      });
    }

    fs.mkdirSync(directory, {
      recursive: true,
    });

    const files = fs
      .readdirSync(directory, {
        withFileTypes: true,
      })
      .filter((entry) => {
        const extension = path.extname(
          entry.name,
        )
          .slice(1)
          .toLowerCase();

        return (
          entry.isFile() &&
          !entry.name.startsWith('.') &&
          !entry.name.endsWith('.tmp') &&
          !invalidFiles.includes(
            entry.name,
          ) &&
          allowedExtensions.includes(
            extension,
          )
        );
      })
      .map((entry) => {
        const stats = fs.statSync(
          path.join(
            directory,
            entry.name,
          ),
        );

        return {
          id: `${representativeId}-${entry.name}`,
          name: entry.name,
          size: `${(
            stats.size / 1024
          ).toFixed(1)} KB`,
          uploadedAt: stats.mtime
            .toLocaleDateString('fa-IR'),
          representativeId,
          icon: getFileIcon(entry.name),
        };
      })
      .sort((first, second) =>
        first.name.localeCompare(
          second.name,
          'fa',
        ),
      );

    return res.json({
      success: true,
      files,
    });
  } catch (error) {
    console.error(
      'خطا در دریافت پرونده‌ها:',
      error,
    );

    return res.status(500).json({
      success: false,
      error:
        'خطا در دریافت پرونده‌ها.',
    });
  }
});

/*
  POST /api/representatives/:id/files

  آپلود فایل‌های جدید برای یک نماینده (فقط ادمین)
  فرمت مورد انتظار در فرانت: multipart/form-data
  فیلد فایل‌ها: files (می‌تواند چندتایی باشد)
*/
router.post(
  '/:id/files',
  authenticateToken,
  requireAdmin,
  upload.array('files', MAX_FILES_PER_UPLOAD),
  (req, res) => {
    try {
      const representativeId = String(
        req.params.id || '',
      ).trim();

      const directory =
        getRepresentativeDirectory(
          representativeId,
        );

      if (!directory) {
        return res.status(404).json({
          success: false,
          error:
            'نماینده یا شمارهٔ پوشهٔ او پیدا نشد.',
        });
      }

      const uploadedFiles = Array.isArray(
        req.files,
      )
        ? req.files
        : [];

      if (uploadedFiles.length === 0) {
        return res.status(400).json({
          success: false,
          error:
            'هیچ فایلی برای آپلود ارسال نشده است.',
        });
      }

      const files = uploadedFiles.map((file) => {
        const stats = fs.statSync(file.path);

        return {
          id: `${representativeId}-${file.filename}`,
          name: file.filename,
          size: `${(
            stats.size / 1024
          ).toFixed(1)} KB`,
          uploadedAt: stats.mtime
            .toLocaleDateString('fa-IR'),
          representativeId,
          icon: getFileIcon(file.filename),
        };
      });

      return res.status(201).json({
        success: true,
        message: `${toPersianNumber(
          files.length,
        )} فایل با موفقیت آپلود شد.`,
        files,
      });
    } catch (error) {
      console.error(
        'خطا در آپلود فایل‌ها:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error &&
          error.message
            ? error.message
            : 'خطا در آپلود فایل‌ها.',
      });
    }
  },
);

/*
  GET /api/representatives/:repId/files/:fileName/view

  مشاهدهٔ فایل (inline)
*/
router.get(
  '/:repId/files/:fileName/view',
  (req, res) => {
    const filePath =
      getRepresentativeFilePath(
        req.params.repId,
        req.params.fileName,
      );

    if (!filePath) {
      return res.status(404).json({
        success: false,
        error:
          'نماینده یا مسیر فایل پیدا نشد.',
      });
    }

    if (
      !fs.existsSync(filePath) ||
      !fs.statSync(filePath).isFile()
    ) {
      return res.status(404).json({
        success: false,
        error: 'فایل پیدا نشد.',
      });
    }

    return res.sendFile(filePath);
  },
);

/*
  GET /api/representatives/:repId/files/:fileName/download

  دانلود فایل (attachment)
*/
router.get(
  '/:repId/files/:fileName/download',
  (req, res) => {
    const filePath =
      getRepresentativeFilePath(
        req.params.repId,
        req.params.fileName,
      );

    if (!filePath) {
      return res.status(404).json({
        success: false,
        error:
          'نماینده یا مسیر فایل پیدا نشد.',
      });
    }

    if (
      !fs.existsSync(filePath) ||
      !fs.statSync(filePath).isFile()
    ) {
      return res.status(404).json({
        success: false,
        error: 'فایل پیدا نشد.',
      });
    }

    return res.download(
      filePath,
      path.basename(filePath),
    );
  },
);

/*
  DELETE /api/representatives/:repId/files/:fileName

  حذف یک فایل
*/
router.delete(
  '/:repId/files/:fileName',
  (req, res) => {
    try {
      const filePath =
        getRepresentativeFilePath(
          req.params.repId,
          req.params.fileName,
        );

      if (!filePath) {
        return res.status(404).json({
          success: false,
          error:
            'نماینده یا مسیر فایل پیدا نشد.',
        });
      }

      if (
        !fs.existsSync(filePath) ||
        !fs.statSync(filePath).isFile()
      ) {
        return res.status(404).json({
          success: false,
          error: 'فایل پیدا نشد.',
        });
      }

      fs.unlinkSync(filePath);

      return res.json({
        success: true,
        message:
          'فایل با موفقیت حذف شد.',
      });
    } catch (error) {
      console.error(
        'خطا در حذف فایل:',
        error,
      );

      return res.status(500).json({
        success: false,
        error: 'خطا در حذف فایل.',
      });
    }
  },
);

module.exports = router;