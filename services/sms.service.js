const normalizeDigits = (value) =>
  String(value ?? '')
    .trim()
    .replace(/[۰-۹]/g, (digit) =>
      String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)),
    )
    .replace(/[٠-٩]/g, (digit) =>
      String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)),
    );

const cleanText = (value) =>
  String(value ?? '').trim();

const STATUS_LABELS = {
  registered: 'ثبت شده',
  confirmed: 'تأیید شده',
  preparing: 'در حال آماده‌سازی',
  loading: 'بارگیری',
  shipping: 'در حال ارسال',
  delivered: 'تحویل شده',
};

function normalizeIranPhone(value) {
  const digits = normalizeDigits(value)
    .replace(/[^\d+]/g, '')
    .replace(/^0098/, '+98');

  if (/^09\d{9}$/.test(digits)) {
    return `+98${digits.slice(1)}`;
  }

  if (/^\+989\d{9}$/.test(digits)) {
    return digits;
  }

  if (/^989\d{9}$/.test(digits)) {
    return `+${digits}`;
  }

  return '';
}

function getSmsConfig() {
  return {
    enabled: process.env.SMS_ENABLED === 'true',

    /*
     * پس از دریافت مستندات «چی‌پیام»، این مقادیر
     * مطابق قرارداد دقیق آن پنل استفاده می‌شوند.
     */
    provider: cleanText(
      process.env.SMS_PROVIDER ||
        'chipayam',
    ),

    apiUrl: cleanText(
      process.env.SMS_API_URL,
    ),

    apiKey: cleanText(
      process.env.SMS_API_KEY,
    ),

    username: cleanText(
      process.env.SMS_USERNAME,
    ),

    password: cleanText(
      process.env.SMS_PASSWORD,
    ),

    sender: cleanText(
      process.env.SMS_SENDER,
    ),

    patternCode: cleanText(
      process.env.SMS_PATTERN_CODE,
    ),

    timeoutMs: Number(
      process.env.SMS_TIMEOUT_MS ||
        10000,
    ),
  };
}

function buildShipmentStatusMessage(
  shipment,
  nextStatus,
) {
  const representativeName =
    cleanText(
      shipment.representativeName,
    ) || 'نماینده';

  const shipmentNumber =
    cleanText(
      shipment.shipmentNumber,
    ) ||
    cleanText(shipment.id) ||
    '—';

  const statusLabel =
    STATUS_LABELS[nextStatus] ||
    cleanText(nextStatus) ||
    'به‌روزرسانی شد';

  return [
    `${representativeName} گرامی،`,
    `وضعیت بار شماره ${shipmentNumber}`,
    `به «${statusLabel}» تغییر کرد.`,
  ].join(' ');
}

async function fetchWithTimeout(
  url,
  options,
  timeoutMs,
) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/*
 * این تابع فعلاً قالب عمومی REST دارد.
 * بعد از دریافت مستندات رسمی چی‌پیام، فقط همین بخش
 * با endpoint، header و body واقعی آن پنل جایگزین می‌شود.
 */
async function sendWithChipayam(
  config,
  receptor,
  message,
) {
  if (!config.apiUrl) {
    throw new Error(
      'SMS_API_URL در فایل .env تنظیم نشده است.',
    );
  }

  if (!config.apiKey) {
    throw new Error(
      'SMS_API_KEY در فایل .env تنظیم نشده است.',
    );
  }

  if (!config.sender) {
    throw new Error(
      'SMS_SENDER در فایل .env تنظیم نشده است.',
    );
  }

  const response = await fetchWithTimeout(
    config.apiUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',

        /*
         * این header نمونه است و باید پس از دریافت
         * مستندات چی‌پیام دقیق شود.
         */
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        from: config.sender,
        to: receptor,
        message,
      }),
    },
    config.timeoutMs,
  );

  const rawResponse = await response.text();

  let responseData = rawResponse;

  try {
    responseData = JSON.parse(rawResponse);
  } catch {
    // پاسخ متنی پنل همان‌طور ذخیره می‌شود.
  }

  if (!response.ok) {
    throw new Error(
      `پاسخ ناموفق پنل پیامک: ${response.status} - ${rawResponse}`,
    );
  }

  return {
    provider: config.provider,
    statusCode: response.status,
    response: responseData,
  };
}

async function sendShipmentStatusSms(
  shipment,
  nextStatus,
  representative,
) {
  const config = getSmsConfig();

  if (!config.enabled) {
    return {
      sent: false,
      skipped: true,
      reason:
        'ارسال پیامک در تنظیمات سرور غیرفعال است.',
      sentAt: null,
      provider: config.provider,
    };
  }

  const phone = normalizeIranPhone(
    representative?.phone ||
      shipment.representativePhone,
  );

  if (!phone) {
    return {
      sent: false,
      skipped: true,
      reason:
        'شمارهٔ موبایل معتبر برای نماینده ثبت نشده است.',
      sentAt: null,
      provider: config.provider,
    };
  }

  const message =
    buildShipmentStatusMessage(
      shipment,
      nextStatus,
    );

  try {
    const providerResult =
      await sendWithChipayam(
        config,
        phone,
        message,
      );

    return {
      sent: true,
      skipped: false,
      sentAt: new Date().toISOString(),
      provider: config.provider,
      receptor: phone,
      message,
      providerResult,
      error: null,
    };
  } catch (error) {
    console.error(
      'خطا در ارسال پیامک وضعیت بار:',
      error,
    );

    return {
      sent: false,
      skipped: false,
      sentAt: null,
      provider: config.provider,
      receptor: phone,
      message,
      providerResult: null,
      error:
        error instanceof Error
          ? error.message
          : 'خطای نامشخص در ارسال پیامک.',
    };
  }
}

module.exports = {
  sendShipmentStatusSms,
  normalizeIranPhone,
  buildShipmentStatusMessage,
};