export const ERP_BASE_IMAGE_URL = 'https://gietuerp.in/Student/GetStudentImage';
export const ERP_LOGIN_URL = 'https://gietuerp.in/';

export interface ParsedRollInfo {
  raw: string;
  batchYear: string | null;
  branch: string | null;
  serial: string | null;
}

export function normalizeRollNumber(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase().trim();
}

export function buildStudentImageUrl(rollNo: string, retrySeed = 0): string {
  const clean = normalizeRollNumber(rollNo);
  const base = `${ERP_BASE_IMAGE_URL}?rollno=${encodeURIComponent(clean)}`;
  return retrySeed > 0 ? `${base}&_r=${retrySeed}` : base;
}

export function buildProxyPhotoUrl(
  rollNo: string,
  sessionId: string,
  retrySeed = 0
): string {
  const clean = normalizeRollNumber(rollNo);
  const params = new URLSearchParams({
    rollno: clean,
    sid: sessionId,
  });
  if (retrySeed > 0) {
    params.set('_r', String(retrySeed));
  }
  return `/api/erp/photo?${params.toString()}`;
}

export function parseRollNumber(rollNo: string): ParsedRollInfo {
  const clean = normalizeRollNumber(rollNo);
  const match = clean.match(/^(\d{2})([A-Z]{2,6})(\d+)$/);
  if (!match) {
    return {
      raw: clean,
      batchYear: null,
      branch: null,
      serial: null,
    };
  }
  return {
    raw: clean,
    batchYear: `20${match[1]}`,
    branch: match[2],
    serial: match[3],
  };
}

export function stepRollNumber(rollNo: string, delta: number): string | null {
  const clean = normalizeRollNumber(rollNo);
  const match = clean.match(/^(.*?)(\d+)$/);
  if (!match) return null;

  const prefix = match[1];
  const digits = match[2];
  const currentNum = parseInt(digits, 10);
  const nextNum = currentNum + delta;

  if (Number.isNaN(nextNum) || nextNum < 1) return null;

  const padded = String(nextNum).padStart(digits.length, '0');
  return `${prefix}${padded}`;
}

export function generateRollRange(
  prefix: string,
  start: number,
  end: number,
  padLength = 3
): string[] {
  const cleanPrefix = normalizeRollNumber(prefix);
  if (!cleanPrefix) return [];

  const safeStart = Math.max(1, Math.floor(start));
  const safeEnd = Math.max(safeStart, Math.floor(end));
  const results: string[] = [];

  for (let i = safeStart; i <= safeEnd; i++) {
    results.push(`${cleanPrefix}${String(i).padStart(padLength, '0')}`);
  }
  return results;
}
