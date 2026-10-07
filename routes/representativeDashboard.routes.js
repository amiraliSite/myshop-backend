const express = require('express');
const jwt = require('jsonwebtoken');

const {
  readRepresentatives,
  readRepresentativeWarehouses,
  readRepresentativeNotes,
  writeRepresentativeNotes,
  readShipments,
} = require('../helpers/jsonStorage');

const {
  normalizeValue,
  toEnglishDigits,
} = require('../helpers/values');

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'company-panel-secret-change-this-in-production';

function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim();

  return text || fallback;
}

function getErrorMessage(error, fallback) {
  return error instanceof Error && error.message
    ? error.message
    : fallback;
}

function sameValue(first, second) {
  const a = normalizeValue(first);
  const b = normalizeValue(second);

  return Boolean(a && b && a === b);
}

function toNumber(value, fallback = 0) {
  const normalized = toEnglishDigits(value)
    .replace(/[,٬،\s]/g, '')
    .replace(/[^\d.-]/g, '')
    .trim();

  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function createRandomId() {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function normalizeRepresentativeLocation(
  representative,
) {
  const province = cleanText(
    representative?.province ||
      representative?.state ||
      representative?.provinceName,
  );

  const city = cleanText(
    representative?.city,
  );

  return {
    province,
    city,

    locationLabel:
      [province, city]
        .filter(Boolean)
        .join(' — ') || 'ثبت نشده',
  };
}

function normalizeNote(note) {
  const createdAt =
    note?.createdAt ||
    new Date().toISOString();

  return {
    id: String(note?.id || ''),
    representativeId: String(
      note?.representativeId || '',
    ),
    text: cleanText(note?.text),
    createdAt,
    updatedAt:
      note?.updatedAt || createdAt,
  };
}

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

function requireRepresentative(req, res, next) {
  if (req.user?.role !== 'representative') {
    return res.status(403).json({
      success: false,
      error: 'این بخش مخصوص نمایندگان است.',
    });
  }

  const representativeId = String(
    req.user.representativeId ||
      req.user.id ||
      '',
  ).trim();

  if (!representativeId) {
    return res.status(401).json({
      success: false,
      error:
        'شناسه نماینده در نشست معتبر نیست.',
    });
  }

  req.representativeId = representativeId;

  return next();
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

function findRepresentative(
  representatives,
  representativeId,
) {
  return representatives.find(
    (representative) =>
      sameValue(
        representative.id,
        representativeId,
      ),
  );
}

function getRepresentativeNotes(
  representativeId,
) {
  return readRepresentativeNotes()
    .filter((note) =>
      sameValue(
        note?.representativeId,
        representativeId,
      ),
    )
    .map(normalizeNote)
    .sort((first, second) => {
      return (
        new Date(second.createdAt).getTime() -
        new Date(first.createdAt).getTime()
      );
    });
}

function normalizeWarehouseItem(item) {
  const quantity = Math.max(
    0,
    toNumber(item?.quantity),
  );

  const unitPrice = Math.max(
    0,
    toNumber(
      item?.unitPrice ??
        item?.price,
    ),
  );

  const savedTotalPrice = Math.max(
    0,
    toNumber(item?.totalPrice),
  );

  const totalPrice =
    savedTotalPrice > 0
      ? savedTotalPrice
      : quantity * unitPrice;

  return {
    ...item,
    productName: String(
      item?.productName ??
        item?.name ??
        item?.title ??
        '',
    ).trim(),
    quantity,
    unitPrice,
    totalPrice,
  };
}

function calculateWarehouseSummary(items) {
  const safeItems = Array.isArray(items)
    ? items
    : [];

  const storeItemsCount = safeItems.reduce(
    (sum, item) =>
      sum +
      Math.max(
        0,
        toNumber(item.quantity),
      ),
    0,
  );

  const storeItemsTotalValue =
    safeItems.reduce(
      (sum, item) =>
        sum +
        Math.max(
          0,
          toNumber(item.totalPrice),
        ),
      0,
    );

  return {
    storeItemsCount,
    storeItemsTotalValue,
  };
}

function getWarehouseForRepresentative(
  representativeId,
) {
  const warehouseRecord =
    readRepresentativeWarehouses().find(
      (item) =>
        sameValue(
          item.representativeId,
          representativeId,
        ),
    );

  const items = Array.isArray(
    warehouseRecord?.items,
  )
    ? warehouseRecord.items.map(
        normalizeWarehouseItem,
      )
    : [];

  const movements = Array.isArray(
    warehouseRecord?.movements,
  )
    ? [...warehouseRecord.movements].sort(
        (first, second) => {
          return (
            new Date(
              second.createdAt || 0,
            ).getTime() -
            new Date(
              first.createdAt || 0,
            ).getTime()
          );
        },
      )
    : [];

  const summary =
    calculateWarehouseSummary(items);

  return {
    representativeId: String(
      representativeId,
    ).trim(),

    items,
    movements,

    importedFiles: Array.isArray(
      warehouseRecord?.importedFiles,
    )
      ? warehouseRecord.importedFiles
      : [],

    updatedAt:
      warehouseRecord?.updatedAt ||
      null,

    summary,
  };
}

function getSafeRepresentative(
  representative,
) {
  const {
    password,
    passwordHash,
    token,
    ...safeRepresentative
  } = representative;

  const location =
    normalizeRepresentativeLocation(
      representative,
    );

  return {
    ...safeRepresentative,

    province: location.province,
    city: location.city,
    locationLabel: location.locationLabel,
  };
}

/*
  GET /api/representative/dashboard

  داشبورد خود نماینده
*/
router.get(
  '/dashboard',
  authenticateToken,
  requireRepresentative,
  (req, res) => {
    try {
      const representatives =
        readRepresentatives();

      const representative =
        findRepresentative(
          representatives,
          req.representativeId,
        );

      if (!representative) {
        return res.status(404).json({
          success: false,
          error: 'نماینده پیدا نشد.',
        });
      }

      if (
        representative.status === 'inactive'
      ) {
        return res.status(403).json({
          success: false,
          error:
            'حساب نماینده غیرفعال است.',
        });
      }

      const warehouse =
        getWarehouseForRepresentative(
          representative.id,
        );

      const shipments = readShipments()
        .filter((shipment) =>
          sameValue(
            shipment.representativeId,
            representative.id,
          ),
        )
        .sort((first, second) => {
          return (
            new Date(
              second.createdAt || 0,
            ).getTime() -
            new Date(
              first.createdAt || 0,
            ).getTime()
          );
        });

      const safeRepresentative =
        getSafeRepresentative(
          representative,
        );

      return res.status(200).json({
        success: true,
        data: {
          representative: {
            ...safeRepresentative,

            storeItemsCount:
              warehouse.summary.storeItemsCount,

            storeItemsTotalValue:
              warehouse.summary
                .storeItemsTotalValue,
          },

          shipments,
          warehouse,
        },
      });
    } catch (error) {
      console.error(
        'خطا در داشبورد نماینده:',
        error,
      );

      return res.status(500).json({
        success: false,
        error: getErrorMessage(
          error,
          'خطا در دریافت اطلاعات داشبورد نمایندگی.',
        ),
      });
    }
  },
);

/*
  GET /api/representatives/:id/warehouse

  موجودی نماینده برای داشبورد نماینده
  در پنل ادمین
*/
router.get(
  '/:id/warehouse',
  authenticateToken,
  requireAdmin,
  (req, res) => {
    try {
      const representativeId = String(
        req.params.id || '',
      ).trim();

      if (!representativeId) {
        return res.status(400).json({
          success: false,
          error:
            'شناسه نماینده ارسال نشده است.',
        });
      }

      const representatives =
        readRepresentatives();

      const representative =
        findRepresentative(
          representatives,
          representativeId,
        );

      if (!representative) {
        return res.status(404).json({
          success: false,
          error:
            'نماینده موردنظر پیدا نشد.',
        });
      }

      const warehouse =
        getWarehouseForRepresentative(
          representative.id,
        );

      const safeRepresentative =
        getSafeRepresentative(
          representative,
        );

      return res.status(200).json({
        success: true,
        data: {
          representative: safeRepresentative,

          representativeId: String(
            representative.id,
          ).trim(),

          province:
            safeRepresentative.province,

          city: safeRepresentative.city,

          locationLabel:
            safeRepresentative.locationLabel,

          items: warehouse.items,
          movements: warehouse.movements,

          importedFiles:
            warehouse.importedFiles,

          updatedAt: warehouse.updatedAt,

          summary: warehouse.summary,
        },
      });
    } catch (error) {
      console.error(
        'خطا در دریافت انبار نماینده برای ادمین:',
        error,
      );

      return res.status(500).json({
        success: false,
        error: getErrorMessage(
          error,
          'خطا در دریافت انبار نماینده.',
        ),
      });
    }
  },
);

/*
  GET /api/representatives/:id/notes

  مشاهده یادداشت‌های نماینده توسط ادمین
*/
router.get(
  '/:id/notes',
  authenticateToken,
  requireAdmin,
  (req, res) => {
    try {
      const representativeId = String(
        req.params.id || '',
      ).trim();

      if (!representativeId) {
        return res.status(400).json({
          success: false,
          error:
            'شناسه نماینده ارسال نشده است.',
        });
      }

      const representatives =
        readRepresentatives();

      const representative =
        findRepresentative(
          representatives,
          representativeId,
        );

      if (!representative) {
        return res.status(404).json({
          success: false,
          error:
            'نماینده موردنظر پیدا نشد.',
        });
      }

      const notes = getRepresentativeNotes(
        representative.id,
      );

      return res.status(200).json({
        success: true,
        count: notes.length,
        data: notes,
      });
    } catch (error) {
      console.error(
        'خطا در دریافت یادداشت‌های نماینده:',
        error,
      );

      return res.status(500).json({
        success: false,
        error: getErrorMessage(
          error,
          'خطا در دریافت یادداشت‌های نماینده.',
        ),
      });
    }
  },
);

/*
  POST /api/representatives/:id/notes

  ثبت یادداشت جدید توسط ادمین
*/
router.post(
  '/:id/notes',
  authenticateToken,
  requireAdmin,
  (req, res) => {
    try {
      const representativeId = String(
        req.params.id || '',
      ).trim();

      const text = cleanText(
        req.body?.text,
      );

      if (!representativeId) {
        return res.status(400).json({
          success: false,
          error:
            'شناسه نماینده ارسال نشده است.',
        });
      }

      if (!text) {
        return res.status(400).json({
          success: false,
          error: 'متن یادداشت الزامی است.',
        });
      }

      if (text.length > 3000) {
        return res.status(400).json({
          success: false,
          error:
            'متن یادداشت نباید بیشتر از ۳۰۰۰ کاراکتر باشد.',
        });
      }

      const representatives =
        readRepresentatives();

      const representative =
        findRepresentative(
          representatives,
          representativeId,
        );

      if (!representative) {
        return res.status(404).json({
          success: false,
          error:
            'نماینده موردنظر پیدا نشد.',
        });
      }

      const notes =
        readRepresentativeNotes();

      const now = new Date().toISOString();

      const newNote = {
        id: createRandomId(),

        representativeId: String(
          representative.id,
        ).trim(),

        text,
        createdAt: now,
        updatedAt: now,
      };

      notes.unshift(newNote);

      const saved =
        writeRepresentativeNotes(notes);

      if (!saved) {
        return res.status(500).json({
          success: false,
          error:
            'ذخیره یادداشت نماینده ناموفق بود.',
        });
      }

      return res.status(201).json({
        success: true,
        message: 'یادداشت با موفقیت ثبت شد.',
        data: newNote,
      });
    } catch (error) {
      console.error(
        'خطا در ثبت یادداشت نماینده:',
        error,
      );

      return res.status(500).json({
        success: false,
        error: getErrorMessage(
          error,
          'خطا در ثبت یادداشت نماینده.',
        ),
      });
    }
  },
);

/*
  PATCH /api/representatives/:id/notes/:noteId

  ویرایش یادداشت توسط ادمین
*/
router.patch(
  '/:id/notes/:noteId',
  authenticateToken,
  requireAdmin,
  (req, res) => {
    try {
      const representativeId = String(
        req.params.id || '',
      ).trim();

      const noteId = String(
        req.params.noteId || '',
      ).trim();

      const text = cleanText(
        req.body?.text,
      );

      if (!representativeId || !noteId) {
        return res.status(400).json({
          success: false,
          error:
            'شناسه نماینده یا یادداشت ارسال نشده است.',
        });
      }

      if (!text) {
        return res.status(400).json({
          success: false,
          error:
            'متن جدید یادداشت الزامی است.',
        });
      }

      if (text.length > 3000) {
        return res.status(400).json({
          success: false,
          error:
            'متن یادداشت نباید بیشتر از ۳۰۰۰ کاراکتر باشد.',
        });
      }

      const representatives =
        readRepresentatives();

      const representative =
        findRepresentative(
          representatives,
          representativeId,
        );

      if (!representative) {
        return res.status(404).json({
          success: false,
          error:
            'نماینده موردنظر پیدا نشد.',
        });
      }

      const notes =
        readRepresentativeNotes();

      const noteIndex = notes.findIndex(
        (note) =>
          sameValue(note?.id, noteId) &&
          sameValue(
            note?.representativeId,
            representative.id,
          ),
      );

      if (noteIndex < 0) {
        return res.status(404).json({
          success: false,
          error:
            'یادداشت متعلق به این نماینده پیدا نشد.',
        });
      }

      const previousNote =
        normalizeNote(notes[noteIndex]);

      const updatedNote = {
        ...previousNote,
        text,
        updatedAt: new Date().toISOString(),
      };

      notes[noteIndex] = updatedNote;

      const saved =
        writeRepresentativeNotes(notes);

      if (!saved) {
        return res.status(500).json({
          success: false,
          error:
            'ذخیره ویرایش یادداشت ناموفق بود.',
        });
      }

      return res.status(200).json({
        success: true,
        message:
          'یادداشت با موفقیت ویرایش شد.',
        data: updatedNote,
      });
    } catch (error) {
      console.error(
        'خطا در ویرایش یادداشت نماینده:',
        error,
      );

      return res.status(500).json({
        success: false,
        error: getErrorMessage(
          error,
          'خطا در ویرایش یادداشت نماینده.',
        ),
      });
    }
  },
);

/*
  DELETE /api/representatives/:id/notes/:noteId

  حذف یادداشت توسط ادمین
*/
router.delete(
  '/:id/notes/:noteId',
  authenticateToken,
  requireAdmin,
  (req, res) => {
    try {
      const representativeId = String(
        req.params.id || '',
      ).trim();

      const noteId = String(
        req.params.noteId || '',
      ).trim();

      if (!representativeId || !noteId) {
        return res.status(400).json({
          success: false,
          error:
            'شناسه نماینده یا یادداشت ارسال نشده است.',
        });
      }

      const representatives =
        readRepresentatives();

      const representative =
        findRepresentative(
          representatives,
          representativeId,
        );

      if (!representative) {
        return res.status(404).json({
          success: false,
          error:
            'نماینده موردنظر پیدا نشد.',
        });
      }

      const notes =
        readRepresentativeNotes();

      const noteIndex = notes.findIndex(
        (note) =>
          sameValue(note?.id, noteId) &&
          sameValue(
            note?.representativeId,
            representative.id,
          ),
      );

      if (noteIndex < 0) {
        return res.status(404).json({
          success: false,
          error:
            'یادداشت متعلق به این نماینده پیدا نشد.',
        });
      }

      const deletedNote =
        normalizeNote(notes[noteIndex]);

      notes.splice(noteIndex, 1);

      const saved =
        writeRepresentativeNotes(notes);

      if (!saved) {
        return res.status(500).json({
          success: false,
          error:
            'حذف یادداشت نماینده ناموفق بود.',
        });
      }

      return res.status(200).json({
        success: true,
        message:
          'یادداشت با موفقیت حذف شد.',
        data: deletedNote,
      });
    } catch (error) {
      console.error(
        'خطا در حذف یادداشت نماینده:',
        error,
      );

      return res.status(500).json({
        success: false,
        error: getErrorMessage(
          error,
          'حذف یادداشت نماینده ناموفق بود.',
        ),
      });
    }
  },
);

module.exports = router;