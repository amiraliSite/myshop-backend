const moment = require('moment-jalaali');

moment.loadPersian({
  dialect: 'persian-modern',
  usePersianDigits: false,
});

const ALLOWED_JALALI_DAYS = [10, 20, 30];

function getJalaliToday(date = new Date()) {
  const jalaliDate = moment(date);

  return {
    year: Number(jalaliDate.format('jYYYY')),
    month: Number(jalaliDate.format('jM')),
    day: Number(jalaliDate.format('jD')),
    formatted: jalaliDate.format('jYYYY/jMM/jDD'),
  };
}

function canSellToday(date = new Date()) {
  const jalaliToday = getJalaliToday(date);

  return {
    allowed: ALLOWED_JALALI_DAYS.includes(jalaliToday.day),
    allowedDays: ALLOWED_JALALI_DAYS,
    ...jalaliToday,
  };
}

function getNextSaleDate(date = new Date()) {
  const current = moment(date).startOf('day');

  for (let offset = 0; offset <= 62; offset += 1) {
    const candidate = current.clone().add(offset, 'day');
    const jalaliDay = Number(candidate.format('jD'));

    if (ALLOWED_JALALI_DAYS.includes(jalaliDay)) {
      return {
        year: Number(candidate.format('jYYYY')),
        month: Number(candidate.format('jM')),
        day: jalaliDay,
        formatted: candidate.format('jYYYY/jMM/jDD'),
        offsetDays: offset,
      };
    }
  }

  throw new Error('تاریخ فروش بعدی پیدا نشد.');
}

function requireAllowedSaleDay(req, res, next) {
  const schedule = canSellToday();

  if (schedule.allowed) {
    return next();
  }

  const nextSaleDate = getNextSaleDate();

  return res.status(403).json({
    success: false,
    error: `ثبت فروش فقط در روزهای ۱۰، ۲۰ و ۳۰ هر ماه شمسی مجاز است. تاریخ امروز: ${schedule.formatted}. نوبت بعدی فروش: ${nextSaleDate.formatted}.`,
    code: 'SALE_NOT_ALLOWED_TODAY',
    schedule: {
      today: schedule.formatted,
      todayJalaliDay: schedule.day,
      allowedDays: schedule.allowedDays,
      nextSaleDate: nextSaleDate.formatted,
      daysRemaining: nextSaleDate.offsetDays,
    },
  });
}

module.exports = {
  ALLOWED_JALALI_DAYS,
  getJalaliToday,
  canSellToday,
  getNextSaleDate,
  requireAllowedSaleDay,
};