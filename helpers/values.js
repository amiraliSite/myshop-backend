function toEnglishDigits(value = '') {
  return String(value)
    .replace(/[۰-۹]/g, (digit) => {
      return '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit);
    })
    .replace(/[٠-٩]/g, (digit) => {
      return '٠١٢٣٤٥٦٧٨٩'.indexOf(digit);
    });
}

function normalizeValue(value = '') {
  return toEnglishDigits(value)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function createRandomId() {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

module.exports = {
  toEnglishDigits,
  normalizeValue,
  createRandomId,
};