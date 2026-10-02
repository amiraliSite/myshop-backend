const express = require('express');
const { randomUUID } = require('node:crypto');

const {
  requireRepresentative,
} = require('../middleware/auth.middleware');

const {
  readRequests,
  writeRequests,
  serialized,
} = require('../helpers/supportRequestsStorage');

const router = express.Router();

const TYPES = new Set([
  'warranty',
  'business-card',
  'banner',
  'new-shipment',
  'visit',
  'urgent-call',
  'meeting',
]);

function isValidText(value, maxLength, required = true) {
  if (typeof value !== 'string') {
    return false;
  }

  const length = value.trim().length;

  return required
    ? length > 0 && length <= maxLength
    : length <= maxLength;
}

router.get(
  '/mine',
  requireRepresentative,
  async (req, res) => {
    try {
      const requests = await serialized(readRequests);
      const representativeId = String(
        req.user.representativeId || req.user.id,
      );

      const mine = requests
        .filter(
          (item) =>
            String(item.representativeId) ===
            representativeId,
        )
        .sort((a, b) =>
          String(b.createdAt).localeCompare(
            String(a.createdAt),
          ),
        );

      return res.status(200).json({
        success: true,
        data: mine,
      });
    } catch (error) {
      console.error(
        'خطا در دریافت درخواست‌های پشتیبانی نماینده:',
        error,
      );

      return res.status(500).json({
        success: false,
        error: 'دریافت درخواست‌ها ناموفق بود.',
      });
    }
  },
);

router.post(
  '/',
  requireRepresentative,
  async (req, res) => {
    const {
      type,
      subject,
      description,
      preferredTime,
    } = req.body ?? {};

    if (!TYPES.has(type)) {
      return res.status(400).json({
        success: false,
        error: 'نوع درخواست معتبر نیست.',
      });
    }

    if (
      !isValidText(subject, 120) ||
      !isValidText(description, 2000) ||
      (
        preferredTime !== undefined &&
        !isValidText(preferredTime, 120, false)
      )
    ) {
      return res.status(400).json({
        success: false,
        error:
          'عنوان، توضیحات یا زمان پیشنهادی معتبر نیست.',
      });
    }

    if (
      type === 'meeting' &&
      !isValidText(preferredTime, 120)
    ) {
      return res.status(400).json({
        success: false,
        error:
          'برای جلسه، زمان پیشنهادی را وارد کنید.',
      });
    }

    const now = new Date().toISOString();

    const request = {
      id: randomUUID(),
      representativeId: String(
        req.user.representativeId || req.user.id,
      ),
      type,
      subject: subject.trim(),
      description: description.trim(),
      preferredTime: (preferredTime ?? '').trim(),
      status: 'pending',
      adminNote: '',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await serialized(async () => {
        const requests = await readRequests();
        requests.push(request);
        await writeRequests(requests);
      });

      return res.status(201).json({
        success: true,
        message: 'درخواست پشتیبانی ثبت شد.',
        data: request,
      });
    } catch (error) {
      console.error(
        'خطا در ثبت درخواست پشتیبانی:',
        error,
      );

      return res.status(500).json({
        success: false,
        error: 'ثبت درخواست ناموفق بود.',
      });
    }
  },
);

module.exports = router;