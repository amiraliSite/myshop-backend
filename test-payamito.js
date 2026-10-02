// test-payamito.js
require('dotenv').config();
const axios = require('axios');

const USERNAME = process.env.PAYAMITO_USERNAME || '0079412009';
const PASSWORD = process.env.PAYAMITO_PASSWORD || '1417c30b-9799-4993-bc6a-e602feca13c5'; // یا API Key
const SENDER = process.env.PAYAMITO_SENDER || '30005050505000';
const TEST_NUMBER = process.env.TEST_PHONE_NUMBER || '09926225828';

const SOAP_URL = 'https://api.payamak-panel.com/post/send.asmx';

const message = `تست ارسال پیامک با پیامیتو
اگر این پیام را دریافت کردی، یعنی کد درست کار می‌کند.
زمان: ${new Date().toLocaleString('fa-IR')}`;

const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SendSms xmlns="http://tempuri.org/">
      <username>${USERNAME}</username>
      <password>${PASSWORD}</password>
      <from>${SENDER}</from>
      <to>${TEST_NUMBER}</to>
      <text>${escapeXml(message)}</text>
      <isFlash>false</isFlash>
      <udh>0</udh>
      <recId>0</recId>
      <status>0</status>
    </SendSms>
  </soap:Body>
</soap:Envelope>`;

async function testSms() {
  console.log('📩 در حال ارسال درخواست به پیامیتو...');
  console.log('👤 نام کاربری:', USERNAME);
  console.log('🔑 رمز عبور:', PASSWORD);
  console.log('📞 شمارهٔ تست:', TEST_NUMBER);
  console.log('📝 متن پیام:', message);
  console.log('');

  try {
    const response = await axios.post(SOAP_URL, xmlBody, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'http://tempuri.org/SendSms',
      },
      timeout: 8000,
    });

    const responseData = response.data;
    console.log('📥 پاسخ کامل SOAP:', responseData);

    const match = responseData.match(/<SendSmsResult[^>]*>(-?\d+)<\/SendSmsResult>/);

    if (match && match[1]) {
      const code = match[1];
      console.log('');
      if (code > 0) {
        console.log(`✅ کد پیامک دریافت شد: ${code}`);
        console.log('اگر SMS نیامد، چند دقیقه صبر کن و پنل پیامیتو را چک کن.');
      } else {
        console.log(`❌ خطا از سمت پیامیتو. کد خطا: ${code}`);
        console.log('کد خطای -110 یعنی نام کاربری یا رمز عبور اشتباه است.');
        console.log('کد خطای -120 یعنی موجودی کافی نیست.');
        console.log('کد خطای -130 یعنی شمارهٔ فرستنده (Sender) معتبر نیست.');
      }
    } else {
      console.log('❌ نتوانستم کد پیامک را از پاسخ استخراج کنم.');
    }
  } catch (err) {
    console.error('❌ خطا در ارتباط با پیامیتو:', err?.response?.data || err.message);
  }
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

testSms();