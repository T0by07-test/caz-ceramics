export const ADMIN_WORKSHOP_LIST_END_ISO = "2026-12-19";

export function isInAdminWorkshopList(date: string) {
  return date <= ADMIN_WORKSHOP_LIST_END_ISO;
}
