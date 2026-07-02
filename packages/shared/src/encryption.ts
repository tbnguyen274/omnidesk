import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts a string using AES-256-GCM.
 * @param text The plain text to encrypt.
 * @param key The encryption key (must be exactly 32 bytes).
 * @returns A base64 encoded string containing the IV, auth tag, and encrypted data.
 */
export function encrypt(text: string, key: string): string {
  if (key.length !== 32) {
    throw new Error('Encryption key must be exactly 32 bytes long');
  }

  const iv = crypto.randomBytes(12); // 96-bit IV is recommended for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key), iv);

  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  // Format: iv:authTag:encryptedData
  return `${iv.toString('base64')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a string previously encrypted with AES-256-GCM.
 * @param encryptedText The encrypted text (format: iv:authTag:encryptedData).
 * @param key The decryption key (must be exactly 32 bytes).
 * @returns The original plain text.
 */
export function decrypt(encryptedText: string, key: string): string {
  if (key.length !== 32) {
    throw new Error('Decryption key must be exactly 32 bytes long');
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
