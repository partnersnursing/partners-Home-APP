/**
 * Parse a date-only string (YYYY-MM-DD) as LOCAL midnight, not UTC.
 *
 * Problem: `new Date("2024-10-08")` is parsed as UTC midnight.
 * In EST (UTC-5) that becomes Oct 7 at 7pm — one day off.
 *
 * Fix: split and pass year/month/day to the Date constructor,
 * which uses the local timezone and avoids the off-by-one.
 *
 * Use ONLY for date-only database fields (dob, mds_date, start_of_service,
 * last_annual_physical, last_semi_annual_report, last_monthly_visit, etc.).
 * Leave timestamp fields (created_at, scheduled_at) as-is — they include
 * timezone info and parse correctly with new Date().
 */
export function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
}