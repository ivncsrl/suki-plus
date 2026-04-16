export const peso = (n: number) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const genId = () => crypto.randomUUID();

/**
 * Get the "business day" start timestamp (3:00 AM today or yesterday if before 3 AM).
 * Returns an ISO string suitable for Supabase queries.
 */
export const getBusinessDayStart = (): string => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(3, 0, 0, 0);
  if (now < start) {
    start.setDate(start.getDate() - 1);
  }
  return start.toISOString();
};

/**
 * Get the "business day" date string (YYYY-MM-DD) that a given timestamp belongs to.
 * A timestamp before 3 AM belongs to the previous calendar day's business day.
 */
export const getBusinessDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  if (d.getHours() < 3) {
    d.setDate(d.getDate() - 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Get today's business date string (YYYY-MM-DD).
 */
export const getTodayBusinessDate = (): string => {
  return getBusinessDate(new Date().toISOString());
};
