/**
 * Phone contacts for students, named "<prefix> <roll> <Name>" with the business as company, e.g.
 * "Lb. 001 Aakash Mishra · MSS". Saved through one .vcf file that the phone's Contacts app imports.
 */

export type StudentContact = {
  id: string;
  roll: string | null;
  name: string | null;
  phone: string | null;
  /** For SMS placeholders: subscription end date and course name. */
  endDate?: string | null;
  course?: string | null;
};

/** "+91XXXXXXXXXX" for Indian mobile numbers (10 digits, or 11 with a leading 0); null if unusable. */
export function contactPhone(phone: string | null | undefined) {
  let digits = phone?.replace(/\D/g, "") ?? "";
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return digits.length >= 11 ? `+${digits}` : null;
}

/** Numeric rolls are padded to 3 digits ("1" → "001") so contacts sort by roll. */
export function contactRoll(roll: string | null | undefined) {
  const value = roll?.trim() ?? "";
  return /^\d+$/.test(value) ? value.padStart(3, "0") : value;
}

function titleCase(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN")
    .replace(/(^|[\s.'-])(\p{L})/gu, (_, separator: string, letter: string) => `${separator}${letter.toLocaleUpperCase("en-IN")}`);
}

/** Default course prefix: the course's first word with a dot ("BPSC Batch" → "Bpsc."). */
export function defaultCoursePrefix(courseName: string) {
  const word = courseName.trim().split(/\s+/)[0] ?? "";
  return word ? `${titleCase(word).replace(/\.$/, "")}.` : "";
}

/** Prefix, padded roll, then the name split into given / family (last word). */
export function studentContactName(prefix: string, student: Pick<StudentContact, "roll" | "name">) {
  const words = titleCase(student.name ?? "").split(" ").filter(Boolean);
  const familyName = words.length > 1 ? words.pop() ?? "" : "";
  const givenName = [contactRoll(student.roll), ...words].filter(Boolean).join(" ");
  return {
    prefix: prefix.trim(),
    givenName,
    familyName,
    displayName: [prefix.trim(), givenName, familyName].filter(Boolean).join(" "),
  };
}

function vCardText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
}

/** One vCard 3.0 file holding every student that has a usable phone number. */
export function studentContactsVCard(students: StudentContact[], prefix: string, company: string) {
  return students.flatMap((student) => {
    const phone = contactPhone(student.phone);
    if (!phone) return [];
    const name = studentContactName(prefix, student);
    return [[
      "BEGIN:VCARD",
      "VERSION:3.0",
      `N:${vCardText(name.familyName)};${vCardText(name.givenName)};;${vCardText(name.prefix)};`,
      `FN:${vCardText(name.displayName)}`,
      ...(company.trim() ? [`ORG:${vCardText(company.trim())}`] : []),
      `TEL;TYPE=CELL:${phone}`,
      "END:VCARD",
    ].join("\r\n")];
  }).join("\r\n");
}

/**
 * Hands the contacts file to the phone: the share sheet (pick Contacts → Add all) where files can be
 * shared, else a download that the Contacts app opens. Returns false when the person cancelled.
 */
export async function shareContactsFile(vcard: string, fileName: string) {
  const file = new File([vcard], fileName, { type: "text/vcard" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}

function isApplePhone() {
  return typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent)
    || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
}

/** Opens the phone's SMS app to one number with the text filled in (iPhone uses "&body", others "?body"). */
export function smsHref(phone: string, body: string) {
  return `sms:${phone}${isApplePhone() ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

/**
 * Opens the SMS app with many numbers and one text. With the phone's "mass text" setting on, each
 * number gets its own SMS, so students never see each other's numbers. Samsung Messages separates
 * numbers with ";", other Android apps and iPhone with ",".
 */
export function bulkSmsHref(phones: string[], body: string) {
  if (isApplePhone()) return `sms:/open?addresses=${phones.join(",")}&body=${encodeURIComponent(body)}`;
  const separator = typeof navigator !== "undefined" && /SAMSUNG|SM-[A-Z]/i.test(navigator.userAgent) ? ";" : ",";
  return `sms:${phones.join(separator)}?body=${encodeURIComponent(body)}`;
}
