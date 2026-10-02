const express = require('express');

const {
  requireAdmin,
} = require('../middleware/auth.middleware');

const {
  readRepresentatives,
} = require('../helpers/jsonStorage');

const {
  readRequests,
  writeRequests,
  serialized,
} = require('../helpers/supportRequestsStorage');

const router = express.Router();

const ALLOWED_STATUSES = new Set([
  'pending',
  'in-progress',
  'resolved',
  'rejected',
]);

router.get('/', requireAdmin, async (_req, res) => {
  try {
    const requests = await serialized(readRequests);
    const representatives = readRepresentatives();

    const result = requests
      .map((request) => {
        const representative = representatives.find(
          (item) =>
            String(item.id) ===
            String(request.representativeId),
        );

        return {
          ...request,
          representativeName:
            representative?.name ||
            request.representativeName ||
            'نماینده حذف‌شده',
        };
      })
      .sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('خطا در دریافت درخواست‌های پشتیبانی:', error);

    return res.status(500).json({
      success: false,
      error: 'دریافت درخواست‌ها ناموفق بود.',
    });
  }
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const { status, adminNote } = req.body ?? {};

  if (!ALLOWED_STATUSES.has(status)) {
    return res.status(400).json({
      success: false,
      error: 'وضعیت درخواست معتبر نیست.',
    });
  }

  if (
    adminNote !== undefined &&
    (typeof adminNote !== 'string' ||
      adminNote.trim().length > 2000)
  ) {
    return res.status(400).json({
      success: false,
      error: 'یادداشت ادمین معتبر نیست.',
    });
  }

  try {
    const updated = await serialized(async () => {
      const requests = await readRequests();

      const index = requests.findIndex(
        (item) =>
          String(item.id) ===
          String(req.params.id),
      );

      if (index === -1) {
        return null;
      }

      const current = requests[index];

      const next = {
        ...current,
        status,
        adminNote:
          adminNote === undefined
            ? current.adminNote || ''
            : adminNote.trim(),
        updatedAt: new Date().toISOString(),
      };

      requests[index] = next;
      await writeRequests(requests);

      return next;
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'درخواست پشتیبانی پیدا نشد.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'درخواست به‌روزرسانی شد.',
      data: updated,
    });
  } catch (error) {
    console.error('خطا در به‌روزرسانی درخواست:', error);

    return res.status(500).json({
      success: false,
      error: 'ذخیرهٔ تغییرات ناموفق بود.',
    });
  }
});

module.exports = router;