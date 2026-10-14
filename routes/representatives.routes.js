const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const {
  DATA_DIR,
  readRepresentatives,
  writeRepresentatives,
  readRepresentativeNotes,
  writeRepresentativeNotes,
} = require('../helpers/jsonStorage');

const {
  normalizeValue,
  createRandomId,
} = require('../helpers/values');

const router = express.Router();

const REPRESENTATIVES_DIR = path.join(
  DATA_DIR,
  'representatives',
);

function requireAdmin(req, res, next) {
  const authorization = String(
    req.headers.authorization || '',
  );

  const match = authorization.match(
    /^Bearer\s+(.+)$/i,
  );

  if (!match) {
    return res.status(401).json({
      success: false,
      error: 'ابتدا وارد حساب ادمین شوید.',
    });
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error(
      'JWT_SECRET در بک‌اند تنظیم نشده است.',
    );

    return res.status(500).json({
      success: false,
      error: 'تنظیمات احراز هویت سرور ناقص است.',
    });
  }

  try {
    const payload = jwt.verify(match[1], secret);

    if (!payload || typeof payload !== 'object') {
      return res.status(401).json({
        success: false,
        error: 'نشست کاربری نامعتبر است.',
      });
    }

    if (payload.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'این بخش فقط برای ادمین مجاز است.',
      });
    }

    req.authUser = payload;
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      error:
        'نشست شما منقضی یا نامعتبر است؛ دوباره وارد شوید.',
    });
  }
}

function sameId(first, second) {
  const a = normalizeValue(first);
  const b = normalizeValue(second);

  return Boolean(a && b && a === b);
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function toNonNegativeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) && number >= 0
    ? number
    : 0;
}

function publicRepresentative(representative) {
  const {
    password,
    passwordHash,
    token,
    ...safeRepresentative
  } = representative;

  return safeRepresentative;
}

function getValidFolderNumber(value) {
  const number = Number(value);

  return Number.isSafeInteger(number) && number > 0
    ? number
    : null;
}

function getFolderPath(folderNumber) {
  const validNumber =
    getValidFolderNumber(folderNumber);

  if (validNumber === null) {
    throw new Error(
      'شمارهٔ پوشهٔ نماینده نامعتبر است.',
    );
  }

  return path.join(
    REPRESENTATIVES_DIR,
    String(validNumber),
  );
}

function getNextFolderNumber(representatives) {
  const usedNumbers = new Set(
    representatives
      .map((representative) =>
        getValidFolderNumber(
          representative.folderNumber,
        ),
      )
      .filter((number) => number !== null),
  );

  let number = 1;

  while (
    usedNumbers.has(number) ||
    fs.existsSync(getFolderPath(number))
  ) {
    number += 1;
  }

  return number;
}

const editableFields = [
  'name',
  'province',
  'phone',
  'city',
  'code',
  'address',
  'description',
  'shopDescription',
  'startDate',
  'depositAmount',
  'guaranteeCheck',
  'totalFinancialCommitment',
];

const numericFields = [
  'orders',
  'shipmentsCount',
  'storeItemsCount',
  'storeItemsTotalValue',
  'returnRequestsCount',
  'last10DaysSales',
  'averageSales',
];

function getEditableData(body = {}) {
  const data = {};

  for (const field of editableFields) {
    if (
      Object.prototype.hasOwnProperty.call(
        body,
        field,
      )
    ) {
      data[field] = cleanText(body[field]);
    }
  }

  for (const field of numericFields) {
    if (
      Object.prototype.hasOwnProperty.call(
        body,
        field,
      )
    ) {
      data[field] = toNonNegativeNumber(
        body[field],
      );
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(
      body,
      'status',
    )
  ) {
    data.status =
      body.status === 'inactive'
        ? 'inactive'
        : 'active';
  }

  return data;
}

router.use(requireAdmin);

router.get('/', (_req, res) => {
  try {
    const representatives =
      readRepresentatives();

    return res.status(200).json({
      success: true,
      count: representatives.length,
      data: representatives.map(
        publicRepresentative,
      ),
    });
  } catch (error) {
    console.error(
      'خطا در دریافت نمایندگان:',
      error,
    );

    return res.status(500).json({
      success: false,
      error: 'دریافت نمایندگان ناموفق بود.',
    });
  }
});

router.post('/', (req, res) => {
  let createdFolder = null;

  try {
    const data = getEditableData(req.body);

    if (
      !data.name ||
      !data.phone ||
      !data.province ||
      !data.city ||
      !data.code
    ) {
      return res.status(400).json({
        success: false,
        error:
          'نام، تلفن، استان، شهر و کد نمایندگی الزامی است.',
      });
    }

    const representatives =
      readRepresentatives();

    const duplicateCode =
      representatives.some((representative) =>
        sameId(
          representative.code,
          data.code,
        ),
      );

    if (duplicateCode) {
      return res.status(409).json({
        success: false,
        error:
          'این کد نمایندگی قبلاً ثبت شده است.',
      });
    }

    const folderNumber =
      getNextFolderNumber(representatives);

    const now = new Date().toISOString();

    const newRepresentative = {
      id: createRandomId(),
      ...data,
      folderNumber,
      status: data.status || 'active',
      createdAt: now,
      updatedAt: now,
    };

    fs.mkdirSync(REPRESENTATIVES_DIR, {
      recursive: true,
    });

    const folderPath =
      getFolderPath(folderNumber);

    if (fs.existsSync(folderPath)) {
      return res.status(409).json({
        success: false,
        error:
          'پوشهٔ این شماره از قبل وجود دارد.',
      });
    }

    fs.mkdirSync(folderPath);
    createdFolder = folderPath;

    const saved = writeRepresentatives([
      ...representatives,
      newRepresentative,
    ]);

    if (!saved) {
      fs.rmSync(folderPath, {
        recursive: true,
        force: true,
      });

      createdFolder = null;

      return res.status(500).json({
        success: false,
        error: 'ذخیره نماینده ناموفق بود.',
      });
    }

    return res.status(201).json({
      success: true,
      data: publicRepresentative(
        newRepresentative,
      ),
    });
  } catch (error) {
    if (createdFolder) {
      try {
        fs.rmSync(createdFolder, {
          recursive: true,
          force: true,
        });
      } catch (cleanupError) {
        console.error(
          'پاک‌سازی پوشهٔ تازه‌ساخته‌شده ناموفق بود:',
          cleanupError,
        );
      }
    }

    console.error(
      'خطا در ثبت نماینده:',
      error,
    );

    return res.status(500).json({
      success: false,
      error: 'ثبت نماینده ناموفق بود.',
    });
  }
});

router.put('/:id', (req, res) => {
  try {
    const representatives =
      readRepresentatives();

    const index = representatives.findIndex(
      (representative) =>
        sameId(
          representative.id,
          req.params.id,
        ),
    );

    if (index < 0) {
      return res.status(404).json({
        success: false,
        error: 'نماینده پیدا نشد.',
      });
    }

    const data = getEditableData(req.body);
    const current = representatives[index];

    const updated = {
      ...current,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    if (
      !updated.name ||
      !updated.phone ||
      !updated.city ||
      !updated.code
    ) {
      return res.status(400).json({
        success: false,
        error:
          'نام، تلفن، شهر و کد نمایندگی الزامی است.',
      });
    }

    const duplicateCode =
      representatives.some(
        (
          representative,
          representativeIndex,
        ) =>
          representativeIndex !== index &&
          sameId(
            representative.code,
            updated.code,
          ),
      );

    if (duplicateCode) {
      return res.status(409).json({
        success: false,
        error:
          'این کد نمایندگی قبلاً ثبت شده است.',
      });
    }

    representatives[index] = updated;

    const saved =
      writeRepresentatives(representatives);

    if (!saved) {
      return res.status(500).json({
        success: false,
        error: 'ویرایش نماینده ذخیره نشد.',
      });
    }

    return res.status(200).json({
      success: true,
      data: publicRepresentative(updated),
    });
  } catch (error) {
    console.error(
      'خطا در ویرایش نماینده:',
      error,
    );

    return res.status(500).json({
      success: false,
      error: 'ویرایش نماینده ناموفق بود.',
    });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const representatives =
      readRepresentatives();

    const representative =
      representatives.find((item) =>
        sameId(item.id, req.params.id),
      );

    if (!representative) {
      return res.status(404).json({
        success: false,
        error: 'نماینده پیدا نشد.',
      });
    }

    const folderNumber =
      getValidFolderNumber(
        representative.folderNumber,
      );

    if (folderNumber === null) {
      return res.status(409).json({
        success: false,
        error:
          'شمارهٔ پوشهٔ این نماینده ثبت نشده است؛ برای جلوگیری از حذف اشتباه، عملیات متوقف شد.',
      });
    }

    const folderIsShared =
      representatives.some(
        (item) =>
          !sameId(
            item.id,
            representative.id,
          ) &&
          getValidFolderNumber(
            item.folderNumber,
          ) === folderNumber,
      );

    if (folderIsShared) {
      return res.status(409).json({
        success: false,
        error:
          'این شمارهٔ پوشه به نمایندهٔ دیگری هم اختصاص دارد؛ حذف متوقف شد.',
      });
    }

    const folderPath =
      getFolderPath(folderNumber);

    if (fs.existsSync(folderPath)) {
      const stats = fs.lstatSync(folderPath);

      if (
        !stats.isDirectory() ||
        stats.isSymbolicLink()
      ) {
        return res.status(409).json({
          success: false,
          error:
            'مسیر پوشهٔ نماینده معتبر نیست؛ حذف متوقف شد.',
        });
      }
    }

    const nextRepresentatives =
      representatives.filter(
        (item) =>
          !sameId(
            item.id,
            representative.id,
          ),
      );

    const saved = writeRepresentatives(
      nextRepresentatives,
    );

    if (!saved) {
      return res.status(500).json({
        success: false,
        error: 'حذف نماینده ذخیره نشد.',
      });
    }

    let folderDeleted = true;
    let folderError = null;

    if (fs.existsSync(folderPath)) {
      try {
        fs.rmSync(folderPath, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100,
        });
      } catch (deleteError) {
        folderDeleted = false;
        folderError = deleteError;

        console.error(
          'پوشهٔ نماینده حذف نشد، اما نماینده حذف شد:',
          deleteError,
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: folderDeleted
        ? 'نماینده و پوشهٔ پرونده‌های او حذف شدند.'
        : 'نماینده حذف شد، اما حذف پوشهٔ پرونده‌های او با خطای دسترسی ویندوز انجام نشد.',
      data: {
        id: representative.id,
        folderDeleted,
      },
      warning: folderDeleted
        ? undefined
        : 'پوشهٔ پرونده به‌دلیل قفل‌شدن فایل توسط ویندوز حذف نشد. بعداً می‌توانید آن را دستی حذف کنید.',
    });
  } catch (error) {
    console.error(
      'خطا در حذف نماینده:',
      error,
    );

    return res.status(500).json({
      success: false,
      error:
        'حذف کامل نماینده یا پوشهٔ او ناموفق بود؛ وضعیت داده‌ها را بررسی کنید.',
    });
  }
});

router.get('/:id/notes', (req, res) => {
  try {
    const representative =
      readRepresentatives().find((item) =>
        sameId(item.id, req.params.id),
      );

    if (!representative) {
      return res.status(404).json({
        success: false,
        error: 'نماینده پیدا نشد.',
      });
    }

    const notes = readRepresentativeNotes()
      .filter((note) =>
        sameId(
          note.representativeId,
          representative.id,
        ),
      )
      .sort(
        (first, second) =>
          new Date(
            second.createdAt || 0,
          ).getTime() -
          new Date(
            first.createdAt || 0,
          ).getTime(),
      );

    return res.status(200).json({
      success: true,
      data: notes,
    });
  } catch (error) {
    console.error(
      'خطا در دریافت یادداشت‌ها:',
      error,
    );

    return res.status(500).json({
      success: false,
      error: 'دریافت یادداشت‌ها ناموفق بود.',
    });
  }
});

router.post('/:id/notes', (req, res) => {
  try {
    const representative =
      readRepresentatives().find((item) =>
        sameId(item.id, req.params.id),
      );

    if (!representative) {
      return res.status(404).json({
        success: false,
        error: 'نماینده پیدا نشد.',
      });
    }

    const text = String(
      req.body?.text ?? '',
    ).trim();

    if (!text || text.length > 3000) {
      return res.status(400).json({
        success: false,
        error:
          'متن یادداشت باید بین ۱ تا ۳۰۰۰ نویسه باشد.',
      });
    }

    const note = {
      id: createRandomId(),
      representativeId: String(
        representative.id,
      ),
      text,
      createdAt: new Date().toISOString(),
    };

    const saved =
      writeRepresentativeNotes([
        note,
        ...readRepresentativeNotes(),
      ]);

    if (!saved) {
      return res.status(500).json({
        success: false,
        error: 'ذخیرهٔ یادداشت ناموفق بود.',
      });
    }

    return res.status(201).json({
      success: true,
      data: note,
    });
  } catch (error) {
    console.error(
      'خطا در ثبت یادداشت:',
      error,
    );

    return res.status(500).json({
      success: false,
      error: 'ثبت یادداشت ناموفق بود.',
    });
  }
});

module.exports = router;