/** Crypto-random temporary passwords (staff reset and staff-created users). */
import { randomInt } from 'node:crypto'

/** No 0/O, 1/l/I, so it can be read out over the phone. */
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
export const TEMP_PASSWORD_LENGTH = 12

export function generateTempPassword(): string {
  let out = ''
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]
  return out
}
