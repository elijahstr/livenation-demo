/** Synthetic company labels and artist references for the Premium demonstration. */
const COMPANY_ROOTS = [
  "Alder Crest", "Beacon Ridge", "Cedar Harbor", "Dovetail", "Elmstone", "Fairwind",
  "Granite Peak", "Harborline", "Ironwood", "Juniper Hill", "Kingswell", "Larkspur",
  "Morrow Bay", "Northstar", "Oakwell", "Peregrine", "Quarry Lane", "Redwood",
  "Silver Fern", "Tideland", "Umber Coast", "Valley Forge", "Westward",
] as const;

const COMPANY_ENDINGS = [
  "Partners", "Holdings", "Collective", "Ventures", "Works", "Group", "Services",
  "Industries", "Capital", "Logistics", "Studios", "Enterprises", "Company",
] as const;

/** These names identify artists only. They do not imply endorsement or participation. */
export const ARTIST_NAMES = [
  "Beyoncé", "Taylor Swift", "Bad Bunny", "Kendrick Lamar", "SZA", "Billie Eilish",
  "Charli xcx", "The Weeknd", "Chappell Roan", "Doja Cat", "Olivia Rodrigo", "Sabrina Carpenter",
  "Tyler, The Creator", "Lady Gaga", "Bruno Mars", "Post Malone", "Hozier", "Mitski",
  "Tame Impala", "The National", "Kacey Musgraves", "St. Vincent", "Phoebe Bridgers", "Noah Kahan",
  "Vampire Weekend", "The War on Drugs", "Khruangbin", "Big Thief", "Jason Isbell", "Maggie Rogers",
] as const;

const SCALE_ACCOUNT_COUNT = 277;

function ordinalIndex(ordinal: number): number {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > SCALE_ACCOUNT_COUNT) throw new Error("Premium name ordinal is outside the approved range");
  return ordinal - 1;
}

export function companyName(ordinal: number): string {
  const index = ordinalIndex(ordinal);
  return `${COMPANY_ROOTS[index % COMPANY_ROOTS.length]} ${COMPANY_ENDINGS[Math.floor(index / COMPANY_ROOTS.length)]}`;
}

export function artistName(ordinal: number, slot: 1 | 2): string {
  const index = ordinalIndex(ordinal);
  const offset = slot === 1 ? 0 : ARTIST_NAMES.length / 2;
  return ARTIST_NAMES[(index + offset) % ARTIST_NAMES.length]!;
}
