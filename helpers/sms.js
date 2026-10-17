// helpers/sms.js
// Improved SMS helper with better error handling and credit check

const axios = require('axios');

// Configuration from environment variables with fallback to hardcoded values
const USERNAME =
  process.env.PAYAMITO_USERNAME || '0079412009';
const API_KEY =
  process.env.PAYAMITO_PASSWORD ||
  process.env.PAYAMITO_API_KEY ||
  '1417c30b-9799-4993-bc6a-e602feca13c5';
const BODY_ID = Number(
  process.env.PAYAMITO_BODY_ID || 547695,
);

const SMS_URL = 'https://api.payamak-panel.com/post/send.asmx';

// Payamito error codes (from their documentation)
const ERROR_CODES = {
  '-1': 'نام کاربری یا رمز عبور اشتباه است',
  '-2': 'اعتبار حساب کافی نیست (شارژ کنید)',
  '-3': 'خط فرستنده نامعتبر است',
  '-4': 'محدودیت روزانه reached',
  '-5': 'شماره گیرنده نامعتبر است',
  '-6': 'شماره در فیلتر شما نیست',
  '-7': 'الگوی نامعتبر (bodyId اشتباه)',
  '-8': 'متن پیامک خیلی طولانی است',
  '-9': 'سرویس در حال بروزرسانی است',
  '-10': 'شماره در لیست سیاه است',
  '-11': 'الگو متعلق به حساب شما نیست',
  '-12': 'تعداد پارامترها اشتباه است',
  '-13': 'پارامترها خیلی طولانی هستند',
  '-14': 'فرمت شماره نامعتبر است',
  '-15': 'حساب تعلیق شده است',
  '-16': 'الگو هنوز تأیید نشده است',
  '-17': 'الگو رد شده است',
  '-18': 'الگو منقضی شده است',
  '-19': 'شماره برای این الگو مجاز نیست',
  '-20': 'فرمت شماره اشتباه است',
  '-21': 'گیرنده در لیست سیاه شماست',
  '-22': 'خط فرستنده مجاز نیست',
  '-23': 'الگو با خط فرستنده همخوانی ندارد',
  '-110': 'نام کاربری یا رمز عبور اشتباه است',
  '-120': 'اعتبار کافی نیست',
  '-130': 'شماره فرستنده (3000...) نامعتبر است',
  '-140': 'مشکل فیلتر الگو',
};

// Delivery status codes
const DELIVERY_CODES = {
  1: 'رسیده به گوشی',
  2: 'در انتظار',
  4: 'ناموفق/رد شده',
  5: 'ارسال به اپراتور',
  6: 'در صف ارسال',
  8: 'رد شده توسط اپراتور',
  10: 'رسیده به مرکز پیامک',
  11: 'شماره در لیست سیاه اپراتور',
  13: 'پیامک خیلی طولانی است',
  14: 'فرمت شماره نامعتبر است',
  50: 'الگو تأیید نشده',
  51: 'فرستنده برای این الگو مجاز نیست',
};

function buildSendByBaseNumberXml({ username, password, bodyId, to, textArgs }) {
  const textItemsXml = textArgs
    .map((arg) =>
      `<string>${String(arg)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</string>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <SendByBaseNumber xmlns="http://tempuri.org/">
      <username>${username}</username>
      <password>${password}</password>
      <text>
        ${textItemsXml}
      </text>
      <to>${to}</to>
      <bodyId>${bodyId}</bodyId>
    </SendByBaseNumber>
  </soap:Body>
</soap:Envelope>`;
}

async function checkCredit() {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetCredit xmlns="http://tempuri.org/">
      <username>${USERNAME}</username>
      <password>${API_KEY}</password>
    </GetCredit>
  </soap:Body>
</soap:Envelope>`;

  try {
    const response = await axios.post(SMS_URL, xml, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'http://tempuri.org/GetCredit',
      },
      timeout: 10000,
    });

    const match = response.data.match(
      /<GetCreditResult[^>]*>([^<]+)<\/GetCreditResult>/,
    );

    if (match) {
      const credit = Number(match[1].trim());
      return Number.isFinite(credit) ? credit : null;
    }
  } catch (err) {
    console.error('خطا در بررسی اعتبار پیامک:', err.message);
  }

  return null;
}

async function sendSms(to, messageArgs) {
  try {
    // Normalize phone number
    const normalizedTo = String(to || '')
      .replace(/\D/g, '')
      .replace(/^0/, '98');

    if (normalizedTo.length < 10) {
      return {
        success: false,
        error: 'شماره موبایل نامعتبر است',
      };
    }

    // اعتبار چک نمیشه چون پیامیتو حتی با اعتبار کم هم پیامک میفرسته
    // اگه اعتبار واقعا کم باشه، خود پیامیتو کد -2 برمی‌گردونه

    const xml = buildSendByBaseNumberXml({
      username: USERNAME,
      password: API_KEY,
      bodyId: BODY_ID,
      to: normalizedTo,
      textArgs: Array.isArray(messageArgs)
        ? messageArgs
        : [messageArgs],
    });

    console.log(
      `📱 ارسال پیامک به: ${normalizedTo}, الگو: ${BODY_ID}`,
    );

    const response = await axios.post(SMS_URL, xml, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'http://tempuri.org/SendByBaseNumber',
      },
      timeout: 15000,
    });

    const match = response.data.match(
      /<SendByBaseNumberResult[^>]*>([^<]+)<\/SendByBaseNumberResult>/,
    );

    if (!match) {
      console.error(
        'نتوانستم کد پاسخ پیامک را از XML بخوانم:',
        response.data,
      );
      return {
        success: false,
        error: 'پاسخ نامعتبر از سامانه پیامک',
      };
    }

    const codeStr = match[1].trim();

    // Use BigInt for large numbers to avoid precision issues
    const code = BigInt(codeStr);

    if (code > 0n) {
      console.log(
        `✅ پیامک با موفقیت ارسال شد. ID: ${codeStr}`,
      );
      return {
        success: true,
        messageId: codeStr,
        credit,
      };
    }

    const errorCode = codeStr;
    const errorMessage =
      ERROR_CODES[errorCode] ||
      `خطای پیامک: کد ${errorCode}`;

    console.error(`❌ خطای پیامک: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
      code: errorCode,
      credit,
    };
  } catch (err) {
    console.error(
      'خطا در ارسال پیامک:',
      err?.response?.data || err.message,
    );

    return {
      success: false,
      error:
        err?.response?.data?.Message ||
        err.message ||
        'خطای ناشناخته در ارسال پیامک',
    };
  }
}

module.exports = {
  sendSms,
  checkCredit,
};
