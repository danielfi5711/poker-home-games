/** "0501234567" -> "050-123-4567" for display. */
export function formatPhone(phone: string): string {
  return /^05\d{8}$/.test(phone) ? `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}` : phone;
}
