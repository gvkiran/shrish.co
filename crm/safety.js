(function exposeCrmSafety(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHRISH_CRM_SAFETY = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildCrmSafety() {
  'use strict';

  function normalizeUsPhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 10) return digits;
    if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
    return '';
  }

  function csvCell(value) {
    const text = String(value === null || value === undefined ? '' : value);
    const safe = typeof value === 'string' && /^[\t\r ]*[=+\-@]/.test(text)
      ? `'${text}`
      : text;
    return `"${safe.replace(/"/g, '""')}"`;
  }

  function isCompletePostalAddress(value) {
    const address = String(value || '').trim();
    return address.length >= 15
      && /\d/.test(address)
      && /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/i.test(address)
      && address.split(',').length >= 3;
  }

  function contactSuppressionReason(overlay = {}, profile = {}) {
    const tags = Array.isArray(overlay.tags) ? overlay.tags : [];
    if (tags.some((tag) => String(tag).trim().toLowerCase() === 'do not contact')) {
      return 'do_not_contact';
    }
    if (
      String(profile.status || '').trim().toLowerCase() === 'deletion_requested'
      || profile.deletionRequestedAt
    ) {
      return 'deletion_requested';
    }
    return '';
  }

  return Object.freeze({
    contactSuppressionReason,
    csvCell,
    isCompletePostalAddress,
    normalizeUsPhone
  });
}));
