const express = require('express');
const jwt = require('jsonwebtoken');

const {
  readRepresentatives,
  readRepresentativeWarehouses,
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

  if (!normalized) return fallback;

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function requireRepresentative(req, res, next) {
  const authorization = String(
    req.headers.authorization || '',
  );

  const match = authorization.match(
    /^Bearer\s+(.+)$/i,
  );

  if (!match) {
    return res.status(401).json({
      success: false,
      error: 'ابتدا وارد حساب نمایندگی شوید.',
    });
  }

  try {
    const decoded = jwt.verify(
      match[1],
      JWT_SECRET,
    );

    if (
      !decoded ||
      typeof decoded !== 'object' ||
      decoded.role !== 'representative'
    ) {
      return res.status(403).json({
        success: false,
        error: 'این بخش مخصوص نمایندگان است.',
      });
    }

    const representativeId = String(
      decoded.representativeId || '',
    ).trim();

    if (!representativeId) {
      return res.status(401).json({
        success: false,
        error: 'شناسهٔ نماینده در نشست معتبر نیست.',
      });
    }

    req.representativeId = representativeId;
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      error: 'نشست شما معتبر نیست؛ دوباره وارد شوید.',
    });
  }
}

/*
 * GET /api/representative/dashboard
 */
router.get(
  '/dashboard',
  requireRepresentative,
  (req, res) => {
    try {
      const representatives =
        readRepresentatives();

      const representative =
        representatives.find((item) =>
          sameValue(
            item.id,
            req.representativeId,
          ),
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
          error: 'حساب نماینده غیرفعال است.',
        });
      }

      const warehouseRecord =
        readRepresentativeWarehouses().find(
          (item) =>
            sameValue(
              item.representativeId,
              representative.id,
            ),
        );

      const items = Array.isArray(
        warehouseRecord?.items,
      )
        ? warehouseRecord.items.map(
            (item) => {
              const quantity = Math.max(
                0,
                toNumber(
                  item.quantity,
                ),
              );

              const unitPrice = Math.max(
                0,
                toNumber(
                  item.unitPrice,
                ),
              );

              return {
                ...item,
                productName: String(
                  item.productName ??
                    item.name ??
                    '',
                ).trim(),
                quantity,
                unitPrice,
                totalPrice: Math.max(
                  0,
                  toNumber(
                    item.totalPrice,
                    quantity *
                      unitPrice,
                  ),
                ),
              };
            },
          )
        : [];

      const movements = Array.isArray(
        warehouseRecord?.movements,
      )
        ? warehouseRecord.movements
        : [];

      const shipments =
        readShipments()
          .filter((shipment) =>
            sameValue(
              shipment.representativeId,
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

      const storeItemsCount =
        items.reduce(
          (sum, item) =>
            sum +
            item.quantity,
          0,
        );

      const storeItemsTotalValue =
        items.reduce(
          (sum, item) =>
            sum +
            item.totalPrice,
          0,
        );

      const {
        password,
        passwordHash,
        token,
        ...safeRepresentative
      } = representative;

      return res.status(200).json({
        success: true,
        data: {
          representative: {
            ...safeRepresentative,
            storeItemsCount,
            storeItemsTotalValue,
          },
          shipments,
          warehouse: {
            representativeId:
              representative.id,
            items,
            movements,
          },
        },
      });
    } catch (error) {
      console.error(
        'خطا در داشبورد نماینده:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          'خطا در دریافت اطلاعات داشبورد نمایندگی.',
      });
    }
  },
);

module.exports = router;