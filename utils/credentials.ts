import fs from 'fs';
import path from 'path';

export interface Credentials {
  username: string;
  password: string;
}

export function readCredentials(): Credentials {
  const filePath = path.join(__dirname, '..', 'test', 'resources', 'credential.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}
