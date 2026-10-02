const express = require('express');
const fs = require('fs');
const path = require('path');

const {
  DATA_DIR,
  readRepresentatives,
} = require('../helpers/jsonStorage');

const {
  normalizeValue,
} = require('../helpers/values');

const router = express.Router();

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