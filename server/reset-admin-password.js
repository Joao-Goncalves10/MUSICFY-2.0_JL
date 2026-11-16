const fs = require('fs');
const path = require('path');
const readline = require('readline');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

function promptSecret(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== 'function') {
      reject(new Error('Run this command from an interactive terminal so the password is not echoed.'));
      return;
    }

    let value = '';
    let settled = false;
    const previousRawMode = input.isRaw;

    const cleanup = () => {
      input.removeListener('keypress', onKeypress);
      input.removeListener('end', onEnd);
      input.setRawMode(previousRawMode);
      input.pause();
      process.stdout.write('\n');
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Input closed before the password was entered.'));
    };

    const onKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Password reset cancelled.'));
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
        return;
      }

      if (key.name === 'backspace') {
        value = value.slice(0, -1);
        return;
      }

      if (character && !key.ctrl && !key.meta) {
        value += character;
      }
    };

    readline.emitKeypressEvents(input);
    input.on('keypress', onKeypress);
    input.once('end', onEnd);
    input.setRawMode(true);
    input.resume();
    process.stdout.write(question);
  });
}

async function main() {
  const requiredSettings = ['TIDB_HOST', 'TIDB_USER', 'TIDB_PASSWORD', 'TIDB_DATABASE'];
  const missingSettings = requiredSettings.filter((setting) => !process.env[setting]);
  if (missingSettings.length) {
    throw new Error(`Missing database configuration: ${missingSettings.join(', ')}. Configure these values in .env.`);
  }

  const port = Number(process.env.TIDB_PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('TIDB_PORT must be a valid TCP port.');
  }

  const username = process.env.MUSICFY_ADMIN_USERNAME || 'admin';
  const password = await promptSecret('New admin password (minimum 12 characters): ');
  if (password.length < 12) {
    throw new Error('The admin password must be at least 12 characters long.');
  }

  const confirmation = await promptSecret('Confirm new admin password: ');
  if (password !== confirmation) {
    throw new Error('The passwords do not match.');
  }

  const ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
  if (process.env.TIDB_CA_PATH) {
    ssl.ca = fs.readFileSync(path.resolve(process.env.TIDB_CA_PATH), 'utf8');
  }

  const connection = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl,
    connectTimeout: 10000,
  });

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await connection.execute(
      'UPDATE users SET password_hash = ? WHERE username = ? AND `role` = ?',
      [passwordHash, username, 'ADMIN']
    );
    if (Number(result.affectedRows) !== 1) {
      throw new Error(`Expected one ADMIN account named "${username}", but no matching account was updated.`);
    }

    console.log(`Password reset for admin account "${username}".`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`Admin password reset failed: ${error.message}`);
  process.exitCode = 1;
});
