import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function hashPassword(plainPassword: string): Promise<string> {
  if (!plainPassword) {
    throw new Error('Password must not be empty');
  }

  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function comparePassword(
  plainPassword: string,
  hashedPassword: string,
): Promise<boolean> {
  if (!plainPassword || !hashedPassword) {
    return false;
  }

  return bcrypt.compare(plainPassword, hashedPassword);
}
