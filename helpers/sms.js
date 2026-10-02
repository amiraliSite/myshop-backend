// helpers/sms.js
const axios = require('axios');

const USERNAME = '0079412009';
const API_KEY = '1417c30b-9799-4993-bc6a-e602feca13c5';
const BODY_ID = 547695; // الگوی: {0} عزیز، بار شما {1} در وضعیت {2} قرار گرفت. پیامیتو payamito.com

const SMS_URL = 'https://api.payamak-panel.com/post/send.asmx';

function buildSendByBaseNumberXml({ username, password, bodyId, to, textArgs }) {
  // textArgs باید آرایه‌ای از رشته‌ها باشد: [نام, شماره بار, وضعیت]
  const textItemsXml = textArgs
    .map((arg) => `<string>${String(arg).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</string>`)
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

async function sendSms(to, messageArgs) {
  try {
    const normalizedTo = to.startsWith('98')
      ? to
      : `98${String(to).replace(/^0/, '')}`;

    const xml = buildSendByBaseNumberXml({
      username: USERNAME,
      password: API_KEY,
      bodyId: BODY_ID,
      to: normalizedTo,
      textArgs: Array.isArray(messageArgs) ? messageArgs : [messageArgs],
    });

    const response = await axios.post(SMS_URL, xml, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'http://tempuri.org/SendByBaseNumber',
      },
    });

    const match = response.data.match(
      /<SendByBaseNumberResult[^>]*>([^<]+)<\/SendByBaseNumberResult>/,
    );

    if (!match) {
      console.error('نتوانستم کد پاسخ پیامک را از XML بخوانم.');
      return {
        success: false,
        error: 'پاسخ نامعتبر از سامانه پیامک.',
      };
    }

    const codeStr = match[1].trim();
    const code = Number(codeStr);

    if (!Number.isNaN(code) && code > 0) {
      return {
        success: true,
        messageId: code,
      };
    } else {
      return {
        success: false,
        error: `کد خطای پیامک: ${codeStr}`,
      };
    }
  } catch (err) {
    console.error('خطا در ارسال پیامک:', err?.response?.data || err.message);
    return {
      success: false,
      error: err?.response?.data?.Message || err.message,
    };
  }
}

module.exports = {
  sendSms,
};