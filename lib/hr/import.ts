import * as XLSX from "xlsx";
import { lineOfCode, splitDepartment, type PayType } from "@/lib/hr/model";

/**
 * Reading the Paychex "Employee Listings" export.
 *
 * Checked against the real file of 2026-09-03: two sheets, Header and Data,
 * the Data sheet's first row is the headers. Columns are matched by name
 * rather than position, so a re-export with columns added or moved still
 * reads. When Paychex renames one, the fix is a line in FIELDS.
 *
 * Nothing is invented. A row with no employee id is skipped and reported, not
 * given a made-up one - the id is what a re-import matches on.
 *
 * Never read: SSN, birth date, sex, home address. They stay in Paychex.
 */

export type ImportedEmployee = {
  paychexId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  personalEmail: string | null;
  phone: string | null;
  /** Department name without its code, e.g. "Bettr Assembly". */
  department: string | null;
  departmentCode: string | null;
  line: string | null;
  payType: PayType;
  payRate: number | null;
  isSupervisor: boolean;
  employeeType: "employee" | "contractor";
  fullTime: boolean;
  paychexSupervisorId: string | null;
  hiredOn: string | null;
  active: boolean;
};

export type ImportPreview = {
  employees: ImportedEmployee[];
  /** Department name -> code, line. */
  departments: { name: string; code: string | null; line: string | null; people: number }[];
  /** Headers the file had, so an unrecognised one can be pointed at. */
  headers: string[];
  /** Rows that could not be used, and why. */
  skipped: { row: number; reason: string }[];
  /** Fields nothing in the file matched. */
  missing: string[];
};

/**
 * Names Paychex has used for each field. Order matters twice: first match
 * wins within a field, and fields claim columns in this order, so a column
 * already taken by one field is not offered to the next. That is what stops
 * "First name they go by" being read as the first name.
 */
const FIELDS: Record<string, string[]> = {
  paychexId: ["employee id", "employee number", "emp id", "emp #", "worker id", "employee #", "id"],
  preferredName: ["first name they go by", "preferred name", "goes by", "nickname"],
  fullName: ["full name", "employee name", "worker name", "name"],
  firstName: ["first name", "legal first name", "given name", "first"],
  lastName: ["last name", "legal last name", "surname", "family name", "last"],
  email: ["work email", "email", "email address"],
  personalEmail: ["personal email", "home email"],
  phone: ["cell phone", "mobile phone", "mobile", "cell", "phone number", "home phone", "phone"],
  department: ["organization level 1", "organization", "home department", "department name", "department", "dept", "org unit", "location"],
  departmentCode: ["department code", "dept code", "department id", "department number"],
  salaryIndicator: ["salary indicator", "salaried"],
  exempt: ["exempt non exempt", "exempt", "flsa status"],
  payType: ["pay type", "salary or hourly", "compensation type", "pay basis"],
  payRate: ["pay rate 1", "pay rate", "hourly rate", "base rate", "annual salary", "salary", "wage", "rate 1", "rate"],
  status: ["status", "employment status", "employee status"],
  employeeType: ["employee type", "worker type"],
  fullTime: ["full time part time", "full time part time description", "fte"],
  supervisorId: ["supervisor id", "manager id"],
  supervisor: ["supervisor", "manager", "reports to"],
  hiredOn: ["most recent hire date", "hire date", "hired", "date of hire", "original hire date", "start date"],
  title: ["job title", "position", "title"],
};

function normalise(header: unknown): string {
  return String(header ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, " ")
    .trim();
}

function findColumn(headers: string[], candidates: string[], taken: Set<number>): number {
  const normalised = headers.map(normalise);
  for (const candidate of candidates) {
    const index = normalised.findIndex((h, i) => !taken.has(i) && h === candidate);
    if (index >= 0) return index;
  }
  // Second pass: a header that merely contains the candidate.
  for (const candidate of candidates) {
    const index = normalised.findIndex((h, i) => !taken.has(i) && h.includes(candidate));
    if (index >= 0) return index;
  }
  return -1;
}

function text(value: unknown): string | null {
  const out = String(value ?? "").trim();
  return out ? out : null;
}

function yes(value: unknown): boolean {
  return /^(y|yes|true|1)$/i.test(String(value ?? "").trim());
}

/**
 * Salaried or hourly.
 *
 * Paychex says it two ways in the same file: Salary indicator Y/N, and
 * Exempt/Non-Exempt. The indicator is the one that matches how people are
 * paid - two people are exempt but 26 are salaried - so it wins, then exempt,
 * then a plain pay type column if a different report has one.
 */
function readPayType(indicator: unknown, exempt: unknown, payType: unknown): PayType {
  if (indicator !== undefined && indicator !== null && indicator !== "") {
    return yes(indicator) ? "salary" : "hourly";
  }
  const e = normalise(exempt);
  if (e) return /^exempt/.test(e) ? "salary" : "hourly";
  const p = normalise(payType);
  if (/salar|exempt|^s$/.test(p) && !/non ?exempt|hourly/.test(p)) return "salary";
  return "hourly";
}

function readRate(value: unknown, payType: PayType): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(number) || number <= 0) return null;
  // Salaried people are exported as an annual figure - 65,000, not 1,250.
  // Anything over $10,000 for a salaried person is a year, so divide by 52.
  if (payType === "salary" && number > 10_000) return number / 52;
  return number;
}

function readDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const asDate = new Date(String(value));
  return Number.isNaN(asDate.getTime()) ? null : asDate.toISOString().slice(0, 10);
}

function readActive(value: unknown): boolean {
  const v = normalise(value);
  if (!v) return true;
  return !/term|inactive|separat|leave|^no$|false|^0$/.test(v);
}

/** Splits "Hernandez Alcuria, Alejandro" or "Alejandro Hernandez Alcuria". */
function splitName(full: string): { first: string; last: string } {
  if (full.includes(",")) {
    const [last, first] = full.split(",").map((part) => part.trim());
    // "Abat, Natasha R" - the trailing initial stays with the first name.
    return { first: first ?? "", last: last ?? "" };
  }
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/**
 * Parses the file into what would be imported, without importing anything.
 *
 * The preview is the point: a hundred and fifty rows are checked by eye
 * before they are written, not after.
 */
export function previewImport(buffer: ArrayBuffer): ImportPreview {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  // The Employee Listings export has a Header sheet with the report name and
  // a Data sheet with the people. Prefer Data; otherwise the first sheet.
  const sheetName =
    workbook.SheetNames.find((name) => /^data$/i.test(name)) ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    raw: true,
  });

  if (rows.length === 0) {
    return { employees: [], departments: [], headers: [], skipped: [], missing: [] };
  }

  // The header row is the first one with at least three text cells.
  const headerIndex = Math.max(
    0,
    rows.findIndex(
      (row) => row.filter((cell) => typeof cell === "string" && cell.trim()).length >= 3
    )
  );
  const headers = (rows[headerIndex] ?? []).map((cell) => String(cell ?? ""));

  const taken = new Set<number>();
  const col: Record<string, number> = {};
  for (const [field, names] of Object.entries(FIELDS)) {
    const index = findColumn(headers, names, taken);
    col[field] = index;
    if (index >= 0) taken.add(index);
  }

  const missing: string[] = [];
  if (col.paychexId < 0) missing.push("employee id");
  if (col.firstName < 0 && col.fullName < 0) missing.push("name");
  if (col.department < 0) missing.push("department");
  if (col.salaryIndicator < 0 && col.exempt < 0 && col.payType < 0) {
    missing.push("pay type (salary indicator)");
  }
  if (col.payRate < 0) missing.push("pay rate");

  const employees: ImportedEmployee[] = [];
  const skipped: ImportPreview["skipped"] = [];
  const departments = new Map<string, { code: string | null; line: string | null; people: number }>();

  // Who is somebody's supervisor, by Paychex id, for the supervisor flag.
  const supervisorIds = new Set<string>();
  if (col.supervisorId >= 0) {
    for (const row of rows.slice(headerIndex + 1)) {
      const id = text(row[col.supervisorId]);
      if (id) supervisorIds.add(id);
    }
  }

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const cell = (field: string) => (col[field] >= 0 ? row[col[field]] : undefined);

    const paychexId = text(cell("paychexId"));
    if (!paychexId) {
      skipped.push({ row: index + 1, reason: "No employee id" });
      continue;
    }

    let firstName = text(cell("firstName")) ?? "";
    let lastName = text(cell("lastName")) ?? "";
    if (!firstName && !lastName) {
      const full = text(cell("fullName"));
      if (!full) {
        skipped.push({ row: index + 1, reason: "No name" });
        continue;
      }
      ({ first: firstName, last: lastName } = splitName(full));
    }

    const payType = readPayType(cell("salaryIndicator"), cell("exempt"), cell("payType"));

    const rawDepartment = text(cell("department"));
    let department: string | null = null;
    let departmentCode: string | null = text(cell("departmentCode"));
    let line: string | null = null;
    if (rawDepartment) {
      const split = splitDepartment(rawDepartment);
      department = split.name;
      departmentCode = departmentCode ?? split.code;
      line = lineOfCode(departmentCode);
      const entry = departments.get(department) ?? { code: departmentCode, line, people: 0 };
      entry.people += 1;
      departments.set(department, entry);
    }

    const employeeType = /contractor|1099/i.test(String(cell("employeeType") ?? ""))
      ? "contractor"
      : "employee";

    employees.push({
      paychexId,
      firstName,
      lastName,
      preferredName: text(cell("preferredName")),
      email: text(cell("email")),
      personalEmail: text(cell("personalEmail")),
      phone: text(cell("phone")),
      department,
      departmentCode,
      line,
      payType,
      payRate: readRate(cell("payRate"), payType),
      isSupervisor:
        supervisorIds.has(paychexId) ||
        /supervisor|lead|manager|foreman/i.test(String(cell("title") ?? "")),
      employeeType,
      fullTime: !/part/i.test(String(cell("fullTime") ?? "")),
      paychexSupervisorId: text(cell("supervisorId")),
      hiredOn: readDate(cell("hiredOn")),
      active: readActive(cell("status")),
    });
  }

  return {
    employees,
    departments: [...departments.entries()]
      .map(([name, info]) => ({ name, ...info }))
      .sort((a, b) => (a.line ?? "zz").localeCompare(b.line ?? "zz") || a.name.localeCompare(b.name)),
    headers,
    skipped,
    missing,
  };
}
