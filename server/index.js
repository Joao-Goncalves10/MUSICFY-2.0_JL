const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
<<<<<<< HEAD
const mysql = require('mysql2/promise');
=======
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
>>>>>>> 85249e7c79ea5077a41f97740c6d34c51c5f783c
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET;

<<<<<<< HEAD
const requiredTidbSettings = ['TIDB_HOST', 'TIDB_USER', 'TIDB_PASSWORD', 'TIDB_DATABASE', 'JWT_SECRET'];
const missingTidbSettings = requiredTidbSettings.filter((setting) => !process.env[setting]);
if (missingTidbSettings.length) {
  throw new Error(`Missing configuration: ${missingTidbSettings.join(', ')}. Configure these values in .env.`);
}
if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long.');
}
=======
const dbDir = path.join(__dirname, 'data');
fs.mkdirSync(dbDir, { recursive: true });
const db = new sqlite3.Database(path.join(dbDir, 'musicfy.db'));
const artistBannerUploadDir = path.join(__dirname, 'uploads', 'artist-banners');
fs.mkdirSync(artistBannerUploadDir, { recursive: true });
const artistBannerUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, callback) => callback(null, file.mimetype === 'image/gif'),
  limits: { fileSize: 10 * 1024 * 1024 },
});
>>>>>>> 85249e7c79ea5077a41f97740c6d34c51c5f783c

const tidbPort = Number(process.env.TIDB_PORT || 4000);
if (!Number.isInteger(tidbPort) || tidbPort < 1 || tidbPort > 65535) {
  throw new Error('TIDB_PORT must be a valid TCP port.');
}

const tlsOptions = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
if (process.env.TIDB_CA_PATH) {
  tlsOptions.ca = fs.readFileSync(path.resolve(process.env.TIDB_CA_PATH), 'utf8');
}

const db = mysql.createPool({
  host: process.env.TIDB_HOST,
  port: tidbPort,
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE,
  ssl: tlsOptions,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 10000,
  dateStrings: true,
});

const runDb = async (sql, params = []) => {
  const [result] = await db.execute(sql, params);
  return {
    id: Number(result.insertId || 0),
    changes: Number(result.affectedRows || 0),
  };
};

const execDb = async (sql) => {
  const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) {
    await db.query(statement);
  }
};

const getDb = async (sql, params = []) => {
  const [rows] = await db.execute(sql, params);
  return rows[0];
};

const allDb = async (sql, params = []) => {
  const [rows] = await db.execute(sql, params);
  return rows;
};

const saveLegacyTrackContent = async (trackId, track) => {
  if (track.youtube_url) {
    await runDb(
      `INSERT IGNORE INTO track_links (track_id, platform, url, link_type) VALUES (?, 'YouTube', ?, 'streaming')`,
      [trackId, track.youtube_url]
    );
  }
  if (track.lyrics) {
    await runDb(
      `INSERT IGNORE INTO track_texts (track_id, content_type, language_code, content) VALUES (?, 'lyrics', 'und', ?)`,
      [trackId, track.lyrics]
    );
  }
  if (track.translation) {
    await runDb(
      `INSERT IGNORE INTO track_texts (track_id, content_type, language_code, content) VALUES (?, 'translation', 'und', ?)`,
      [trackId, track.translation]
    );
  }
};

const migrateLegacyTrackContent = async () => {
  await runDb(`
    INSERT IGNORE INTO track_links (track_id, platform, url, link_type)
    SELECT id, 'YouTube', youtube_url, 'streaming'
    FROM tracks
    WHERE TRIM(COALESCE(youtube_url, '')) <> ''
  `);
  await runDb(`
    INSERT IGNORE INTO track_texts (track_id, content_type, language_code, content)
    SELECT id, 'lyrics', 'und', lyrics
    FROM tracks
    WHERE TRIM(COALESCE(lyrics, '')) <> ''
  `);
  await runDb(`
    INSERT IGNORE INTO track_texts (track_id, content_type, language_code, content)
    SELECT id, 'translation', 'und', translation
    FROM tracks
    WHERE TRIM(COALESCE(translation, '')) <> ''
  `);
};

const normalizeUser = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    avatar_url: user.avatar_url,
    banner_url: user.banner_url,
    bio: user.bio,
    role: user.role || 'USER',
    created_at: user.created_at,
  };
};

const isFutureReleaseDate = (dateString) => {
  if (!dateString) return false;
  const releaseDate = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return releaseDate > today;
};

const sendToken = (user) => jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.substring(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }
  next();
};

async function initializeDatabase() {
  await execDb(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  const rolesRow = await getDb('SELECT COUNT(*) AS count FROM roles');
  if (Number(rolesRow?.count || 0) === 0) {
    await runDb("INSERT INTO roles (name, description) VALUES ('ADMIN', 'Administrator access');");
    await runDb("INSERT INTO roles (name, description) VALUES ('USER', 'Standard member access');");
  }

  const userCount = await getDb('SELECT COUNT(*) AS count FROM users');
  if (Number(userCount?.count || 0) === 0) {
    const adminUsername = process.env.MUSICFY_ADMIN_USERNAME || 'admin';
    const adminName = process.env.MUSICFY_ADMIN_NAME || 'Musicfy Admin';
    const adminEmail = process.env.MUSICFY_ADMIN_EMAIL || 'admin@musicfy.dev';
    const adminPassword = process.env.MUSICFY_ADMIN_PASSWORD;
    if (!adminPassword || adminPassword.length < 12) {
      throw new Error('Set MUSICFY_ADMIN_PASSWORD to at least 12 characters before initializing an empty database.');
    }

    const adminHash = bcrypt.hashSync(adminPassword, 10);
    await runDb(
      `INSERT INTO users (username, full_name, email, password_hash, avatar_url, banner_url, bio, \`role\`) VALUES (?, ?, ?, ?, ?, ?, ?, 'ADMIN')`,
      [adminUsername, adminName, adminEmail, adminHash, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1200&q=80', 'Managing the platform and catalog.']
    );

    const userHash = bcrypt.hashSync('User123!', 10);
    await runDb(
      `INSERT INTO users (username, full_name, email, password_hash, avatar_url, banner_url, bio, \`role\`) VALUES (?, ?, ?, ?, ?, ?, ?, 'USER')`,
      ['dayana', 'Dayana Costa', 'dayana@example.com', userHash, 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80', 'Taste-maker and playlist curator.']
    );
  }

  const genreCount = await getDb('SELECT COUNT(*) AS count FROM genres');
  if (Number(genreCount?.count || 0) === 0) {
    const genres = ['Pop', 'K-pop', 'R&B', 'Hip-Hop', 'Rap', 'Rock', 'Indie', 'Alternative', 'Electronic', 'Funk', 'MPB', 'Jazz', 'Classical', 'Country'];
    for (const genre of genres) {
      await runDb('INSERT INTO genres (name) VALUES (?)', [genre]);
    }
  }

  const artistCount = await getDb('SELECT COUNT(*) AS count FROM artists');
  if (Number(artistCount?.count || 0) === 0) {
    const firstArtist = await runDb(
      `INSERT INTO artists (name, bio, image_url, banner_url, genre) VALUES (?, ?, ?, ?, ?)`,
      ['Solar Tide', 'A luminous synth-pop project with cinematic hooks and club-ready textures.', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80', 'Pop']
    );

    const secondArtist = await runDb(
      `INSERT INTO artists (name, bio, image_url, banner_url, genre) VALUES (?, ?, ?, ?, ?)`,
      ['Nova Bloom', 'R&B and alt-pop storytelling wrapped in lush production and warm vocal textures.', 'https://images.unsplash.com/photo-1521119989659-a83eee488004?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80', 'R&B']
    );

    const thirdArtist = await runDb(
      `INSERT INTO artists (name, bio, image_url, banner_url, genre) VALUES (?, ?, ?, ?, ?)`,
      ['Glass Harbor', 'Electro-funk innovators creating immersive live energy and melodic basslines.', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1200&q=80', 'Electronic']
    );

    const genreMap = await allDb('SELECT id, name FROM genres');
    const map = Object.fromEntries(genreMap.map((row) => [row.name, row.id]));

    await runDb('INSERT IGNORE INTO artist_genres (artist_id, genre_id) VALUES (?, ?)', [firstArtist.id, map['Pop'] || 1]);
    await runDb('INSERT IGNORE INTO artist_genres (artist_id, genre_id) VALUES (?, ?)', [firstArtist.id, map['Electronic'] || 9]);
    await runDb('INSERT IGNORE INTO artist_genres (artist_id, genre_id) VALUES (?, ?)', [secondArtist.id, map['R&B'] || 3]);
    await runDb('INSERT IGNORE INTO artist_genres (artist_id, genre_id) VALUES (?, ?)', [secondArtist.id, map['Indie'] || 7]);
    await runDb('INSERT IGNORE INTO artist_genres (artist_id, genre_id) VALUES (?, ?)', [thirdArtist.id, map['Funk'] || 10]);
    await runDb('INSERT IGNORE INTO artist_genres (artist_id, genre_id) VALUES (?, ?)', [thirdArtist.id, map['Electronic'] || 9]);

    const release1 = await runDb(
      `INSERT INTO releases (title, artist_id, cover_url, release_type, release_date, genre, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      ['Velvet Static', firstArtist.id, 'https://images.unsplash.com/photo-1525201548942-d8732f6617a0?auto=format&fit=crop&w=800&q=80', 'Album', '2025-10-18', 'Pop', 'A neon-lit album about the afterglow of midnight drives and fresh starts.']
    );
    const release2 = await runDb(
      `INSERT INTO releases (title, artist_id, cover_url, release_type, release_date, genre, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      ['Horizon Bloom', secondArtist.id, 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=800&q=80', 'EP', '2025-08-04', 'R&B', 'A warm, emotional EP built on longing, reinvention and soft beats.']
    );
    const release3 = await runDb(
      `INSERT INTO releases (title, artist_id, cover_url, release_type, release_date, genre, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'PREVIEW')`,
      ['Mirage Run', thirdArtist.id, 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=800&q=80', 'Single', '2026-01-12', 'Electronic', 'A future-facing single designed for a sunrise drive across the city lights.']
    );

    await runDb(`INSERT INTO tracks (release_id, title, duration, explicit, youtube_url, lyrics, translation, track_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [release1.id, 'Velvet Static', '3:42', 0, 'https://www.youtube.com/watch?v=ScMzIvxBSi4', 'You were the color in my winter sky', 'You were the color in my winter sky', 1]);
    await runDb(`INSERT INTO tracks (release_id, title, duration, explicit, youtube_url, lyrics, translation, track_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [release1.id, 'Street Glow', '4:08', 0, 'https://www.youtube.com/watch?v=ScMzIvxBSi4', 'We kept the city warm with our voices', 'We kept the city warm with our voices', 2]);
    await runDb(`INSERT INTO tracks (release_id, title, duration, explicit, youtube_url, lyrics, translation, track_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [release2.id, 'Night Bloom', '3:15', 0, 'https://www.youtube.com/watch?v=ScMzIvxBSi4', 'The moon kept a secret in my pocket', 'The moon kept a secret in my pocket', 1]);
    await runDb(`INSERT INTO tracks (release_id, title, duration, explicit, youtube_url, lyrics, translation, track_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [release3.id, 'Mirage Run', '3:33', 0, 'https://www.youtube.com/watch?v=ScMzIvxBSi4', 'I chase the signal through the static glow', 'I chase the signal through the static glow', 1]);

    const sampleUser = await getDb("SELECT id FROM users WHERE username = 'dayana'");
    await runDb('INSERT INTO reviews (user_id, release_id, rating, review_text) VALUES (?, ?, ?, ?)', [sampleUser.id, release1.id, 9, 'A gorgeous emotional ride with peaks and textures that stick with you.']);
    await runDb('INSERT INTO reviews (user_id, release_id, rating, review_text) VALUES (?, ?, ?, ?)', [sampleUser.id, release2.id, 8, 'Lush vocals and precise production — definitely a release worth replaying.']);
    await runDb('INSERT INTO review_likes (review_id, user_id) VALUES (?, ?)', [1, 1]);

    await runDb('INSERT INTO playlists (user_id, name, description, cover_url) VALUES (?, ?, ?, ?)', [sampleUser.id, 'Late-Night Drive', 'Soft neon and warm synths for the city after dark.', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=800&q=80']);
    const playlist = await getDb('SELECT id FROM playlists WHERE user_id = ? ORDER BY id DESC LIMIT 1', [sampleUser.id]);
    const firstTrack = await getDb('SELECT id FROM tracks WHERE release_id = ? ORDER BY id LIMIT 1', [release1.id]);
    await runDb('INSERT INTO playlist_tracks (playlist_id, track_id) VALUES (?, ?)', [playlist.id, firstTrack.id]);

    await runDb('INSERT INTO pre_saves (user_id, release_id) VALUES (?, ?)', [sampleUser.id, release3.id]);
    await runDb('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [sampleUser.id, 'Mirage Run is now live.']);
    await runDb('INSERT INTO featured_releases (release_id, sort_order) VALUES (?, ?)', [release1.id, 1]);
    await runDb('INSERT INTO featured_releases (release_id, sort_order) VALUES (?, ?)', [release2.id, 2]);
  }

  await migrateLegacyTrackContent();
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads/artist-banners', express.static(artistBannerUploadDir));

app.get('/api/health', (req, res) => res.json({ ok: true, message: 'Musicfy API running.' }));

<<<<<<< HEAD
const linkEntityConfig = {
  artist: { table: 'artist_links', foreignKey: 'artist_id', sourceTable: 'artists' },
  release: { table: 'release_links', foreignKey: 'release_id', sourceTable: 'releases' },
  track: { table: 'track_links', foreignKey: 'track_id', sourceTable: 'tracks' },
};

app.get('/api/content/:entityType/:id/links', async (req, res) => {
  const config = Object.prototype.hasOwnProperty.call(linkEntityConfig, req.params.entityType)
    ? linkEntityConfig[req.params.entityType]
    : null;
  const entityId = Number(req.params.id);
  if (!config) return res.status(404).json({ error: 'Content type not found.' });
  if (!Number.isSafeInteger(entityId) || entityId < 1) return res.status(400).json({ error: 'Invalid content ID.' });

  const entity = await getDb(`SELECT id FROM ${config.sourceTable} WHERE id = ?`, [entityId]);
  if (!entity) return res.status(404).json({ error: 'Content not found.' });

  const links = await allDb(
    `SELECT id, platform, url, link_type, created_at FROM ${config.table} WHERE ${config.foreignKey} = ? ORDER BY id`,
    [entityId]
  );
  return res.json(links);
});

app.post('/api/content/:entityType/:id/links', requireAuth, requireAdmin, async (req, res) => {
  const config = Object.prototype.hasOwnProperty.call(linkEntityConfig, req.params.entityType)
    ? linkEntityConfig[req.params.entityType]
    : null;
  const entityId = Number(req.params.id);
  if (!config) return res.status(404).json({ error: 'Content type not found.' });
  if (!Number.isSafeInteger(entityId) || entityId < 1) return res.status(400).json({ error: 'Invalid content ID.' });

  const { platform, url, link_type } = req.body;
  if (typeof platform !== 'string' || !platform.trim() || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'Platform and URL are required.' });
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
  } catch (error) {
    return res.status(400).json({ error: 'Enter a valid HTTP or HTTPS URL.' });
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: 'Links must use HTTP or HTTPS.' });
  }

  const entity = await getDb(`SELECT id FROM ${config.sourceTable} WHERE id = ?`, [entityId]);
  if (!entity) return res.status(404).json({ error: 'Content not found.' });

  const defaultLinkType = req.params.entityType === 'artist' ? 'official' : 'streaming';
  await runDb(
    `INSERT IGNORE INTO ${config.table} (${config.foreignKey}, platform, url, link_type) VALUES (?, ?, ?, ?)`,
    [entityId, platform.trim(), parsedUrl.toString(), typeof link_type === 'string' && link_type.trim() ? link_type.trim() : defaultLinkType]
  );
  const link = await getDb(
    `SELECT id, platform, url, link_type, created_at FROM ${config.table} WHERE ${config.foreignKey} = ? AND platform = ? AND url = ?`,
    [entityId, platform.trim(), parsedUrl.toString()]
  );
  return res.status(201).json(link);
});

app.delete('/api/content/:entityType/:id/links/:linkId', requireAuth, requireAdmin, async (req, res) => {
  const config = Object.prototype.hasOwnProperty.call(linkEntityConfig, req.params.entityType)
    ? linkEntityConfig[req.params.entityType]
    : null;
  const entityId = Number(req.params.id);
  const linkId = Number(req.params.linkId);
  if (!config) return res.status(404).json({ error: 'Content type not found.' });
  if (!Number.isSafeInteger(entityId) || entityId < 1 || !Number.isSafeInteger(linkId) || linkId < 1) {
    return res.status(400).json({ error: 'Invalid content or link ID.' });
  }

  const result = await runDb(
    `DELETE FROM ${config.table} WHERE id = ? AND ${config.foreignKey} = ?`,
    [linkId, entityId]
  );
  if (!result.changes) return res.status(404).json({ error: 'Link not found.' });
  return res.json({ deleted: true });
});

app.get('/api/tracks/:id/texts', async (req, res) => {
  const trackId = Number(req.params.id);
  if (!Number.isSafeInteger(trackId) || trackId < 1) return res.status(400).json({ error: 'Invalid track ID.' });
  const track = await getDb('SELECT id FROM tracks WHERE id = ?', [trackId]);
  if (!track) return res.status(404).json({ error: 'Track not found.' });

  const texts = await allDb(
    `SELECT content_type, language_code, source_language_code, content, source_url, updated_at
    FROM track_texts WHERE track_id = ? ORDER BY content_type, language_code`,
    [trackId]
  );
  return res.json(texts);
});

app.put('/api/tracks/:id/texts', requireAuth, requireAdmin, async (req, res) => {
  const trackId = Number(req.params.id);
  if (!Number.isSafeInteger(trackId) || trackId < 1) return res.status(400).json({ error: 'Invalid track ID.' });
  const track = await getDb('SELECT id FROM tracks WHERE id = ?', [trackId]);
  if (!track) return res.status(404).json({ error: 'Track not found.' });

  const { content_type, language_code, source_language_code, content, source_url } = req.body;
  const isLanguageCode = (value) => typeof value === 'string' && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value);
  if (!['lyrics', 'translation'].includes(content_type) || !isLanguageCode(language_code) || typeof content !== 'string') {
    return res.status(400).json({ error: 'Provide a valid content type, language code, and text.' });
  }
  if (source_language_code != null && !isLanguageCode(source_language_code)) {
    return res.status(400).json({ error: 'Invalid source language code.' });
  }
  if (source_url != null && typeof source_url !== 'string') {
    return res.status(400).json({ error: 'Invalid source URL.' });
  }

  await runDb(`
    INSERT INTO track_texts (track_id, content_type, language_code, source_language_code, content, source_url)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      source_language_code = VALUES(source_language_code),
      content = VALUES(content),
      source_url = VALUES(source_url),
      updated_at = CURRENT_TIMESTAMP
  `, [trackId, content_type, language_code, source_language_code || null, content, source_url || null]);

  return res.json({ saved: true });
});

app.delete('/api/tracks/:id/texts/:contentType/:languageCode', requireAuth, requireAdmin, async (req, res) => {
  const trackId = Number(req.params.id);
  if (!Number.isSafeInteger(trackId) || trackId < 1) return res.status(400).json({ error: 'Invalid track ID.' });
  if (!['lyrics', 'translation'].includes(req.params.contentType)) {
    return res.status(400).json({ error: 'Invalid content type.' });
  }

  const result = await runDb(
    'DELETE FROM track_texts WHERE track_id = ? AND content_type = ? AND language_code = ?',
    [trackId, req.params.contentType, req.params.languageCode]
  );
  if (!result.changes) return res.status(404).json({ error: 'Track text not found.' });
  return res.json({ deleted: true });
=======
app.post('/api/uploads/artist-banner', requireAuth, requireAdmin, (req, res, next) => {
  artistBannerUpload.single('banner')(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'O GIF deve ter no máximo 10 MB.' });
      }
      return res.status(400).json({ error: 'Não foi possível enviar o GIF.' });
    }
    if (error) return next(error);
    return next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Selecione um arquivo GIF válido.' });
  }

  const signature = req.file.buffer.subarray(0, 6).toString('ascii');
  if (signature !== 'GIF87a' && signature !== 'GIF89a') {
    return res.status(415).json({ error: 'O arquivo enviado não é um GIF válido.' });
  }

  const filename = `${crypto.randomBytes(16).toString('hex')}.gif`;
  await fs.promises.writeFile(path.join(artistBannerUploadDir, filename), req.file.buffer, { flag: 'wx' });
  return res.status(201).json({ url: `/uploads/artist-banners/${filename}` });
>>>>>>> 85249e7c79ea5077a41f97740c6d34c51c5f783c
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, full_name, email, password, confirmPassword } = req.body;
    if (!username || !full_name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const existing = await getDb('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) {
      return res.status(409).json({ error: 'Username or email already in use.' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const result = await runDb(
      `INSERT INTO users (username, full_name, email, password_hash, avatar_url, bio, \`role\`) VALUES (?, ?, ?, ?, ?, ?, 'USER')`,
      [username, full_name, email, passwordHash, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80', 'New to Musicfy.']
    );

    const user = await getDb('SELECT * FROM users WHERE id = ?', [result.id]);
    const token = sendToken(user);
    return res.status(201).json({ token, user: normalizeUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await getDb('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = sendToken(user);
    return res.json({ token, user: normalizeUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Login failed.' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const user = await getDb('SELECT * FROM users WHERE id = ?', [req.user.id]);
  return res.json({ user: normalizeUser(user) });
});

app.get('/api/artists', async (req, res) => {
  const rows = await allDb(`
    SELECT a.*, COUNT(r.id) AS release_count,
      GROUP_CONCAT(g.name SEPARATOR ', ') AS genre_names
    FROM artists a
    LEFT JOIN releases r ON r.artist_id = a.id
    LEFT JOIN artist_genres ag ON ag.artist_id = a.id
    LEFT JOIN genres g ON g.id = ag.genre_id
    GROUP BY a.id
    ORDER BY a.name ASC
  `);

  return res.json(rows.map((artist) => ({ ...artist, genre_names: artist.genre_names || '' })));
});

app.get('/api/artists/:id', async (req, res) => {
  const artist = await getDb('SELECT * FROM artists WHERE id = ?', [req.params.id]);
  if (!artist) return res.status(404).json({ error: 'Artist not found.' });

  const genres = await allDb(`
    SELECT g.name FROM artist_genres ag
    JOIN genres g ON g.id = ag.genre_id
    WHERE ag.artist_id = ?
  `, [req.params.id]);

  const releases = await allDb(`
    SELECT r.*, a.name AS artist_name
    FROM releases r
    JOIN artists a ON a.id = r.artist_id
    WHERE r.artist_id = ?
    ORDER BY r.release_date DESC
  `, [req.params.id]);

  return res.json({ artist, genres: genres.map((g) => g.name), releases });
});

app.post('/api/artists', requireAuth, requireAdmin, async (req, res) => {
  const { name, bio, image_url, banner_url, genres = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'Artist name is required.' });

  const artist = await runDb(
    `INSERT INTO artists (name, bio, image_url, banner_url, genre) VALUES (?, ?, ?, ?, ?)`,
    [name, bio || '', image_url || '', banner_url || '', genres[0] || '']
  );

  for (const genreName of genres) {
    const found = await getDb('SELECT id FROM genres WHERE name = ?', [genreName]);
    if (found) {
      await runDb('INSERT IGNORE INTO artist_genres (artist_id, genre_id) VALUES (?, ?)', [artist.id, found.id]);
    }
  }

  return res.status(201).json({ message: 'Artist created.', artistId: artist.id });
});

app.put('/api/artists/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, bio, image_url, banner_url, genres = [] } = req.body;

  const existingArtist = await getDb('SELECT id FROM artists WHERE id = ?', [id]);
  if (!existingArtist) return res.status(404).json({ error: 'Artist not found.' });
  if (!name) return res.status(400).json({ error: 'Artist name is required.' });

  await runDb(
    `UPDATE artists SET name = ?, bio = ?, image_url = ?, banner_url = ?, genre = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [name, bio || '', image_url || '', banner_url || '', genres[0] || '', id]
  );

  await runDb('DELETE FROM artist_genres WHERE artist_id = ?', [id]);
  for (const genreName of genres) {
    const found = await getDb('SELECT id FROM genres WHERE name = ?', [genreName]);
    if (found) {
      await runDb('INSERT IGNORE INTO artist_genres (artist_id, genre_id) VALUES (?, ?)', [id, found.id]);
    }
  }

  return res.json({ message: 'Artist updated.' });
});

app.delete('/api/artists/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const releaseRows = await allDb('SELECT id FROM releases WHERE artist_id = ?', [id]);

  for (const release of releaseRows) {
    const trackRows = await allDb('SELECT id FROM tracks WHERE release_id = ?', [release.id]);
    const trackIds = trackRows.map((item) => item.id);

    if (trackIds.length) {
      await runDb('DELETE FROM playlist_tracks WHERE track_id IN (' + trackIds.map(() => '?').join(',') + ')', trackIds);
      await runDb('DELETE FROM favorites WHERE track_id IN (' + trackIds.map(() => '?').join(',') + ')', trackIds);
    }

    await runDb('DELETE FROM review_likes WHERE review_id IN (SELECT id FROM reviews WHERE release_id = ?)', [release.id]);
    await runDb('DELETE FROM pre_saves WHERE release_id = ?', [release.id]);
    await runDb('DELETE FROM featured_releases WHERE release_id = ?', [release.id]);
    await runDb('DELETE FROM reviews WHERE release_id = ?', [release.id]);
    await runDb('DELETE FROM tracks WHERE release_id = ?', [release.id]);
    await runDb('DELETE FROM releases WHERE id = ?', [release.id]);
  }

  await runDb('DELETE FROM artist_genres WHERE artist_id = ?', [id]);
  await runDb('DELETE FROM artists WHERE id = ?', [id]);

  return res.json({ message: 'Artist deleted.' });
});

app.get('/api/releases', async (req, res) => {
  const rows = await allDb(`
    SELECT r.*, a.name AS artist_name, a.image_url AS artist_image,
      ROUND(AVG(rv.rating), 1) AS avg_rating,
      COUNT(rv.id) AS review_count
    FROM releases r
    JOIN artists a ON a.id = r.artist_id
    LEFT JOIN reviews rv ON rv.release_id = r.id
    GROUP BY r.id
    ORDER BY r.release_date DESC
  `);

  return res.json(rows);
});

app.get('/api/releases/:id', async (req, res) => {
  const release = await getDb(`
    SELECT r.*, a.name AS artist_name,
      ROUND(AVG(rv.rating), 1) AS avg_rating,
      COUNT(rv.id) AS review_count
    FROM releases r
    JOIN artists a ON a.id = r.artist_id
    LEFT JOIN reviews rv ON rv.release_id = r.id
    WHERE r.id = ?
    GROUP BY r.id
  `, [req.params.id]);

  if (!release) return res.status(404).json({ error: 'Release not found.' });

  let currentUserId = null;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      currentUserId = decoded.id;
    } catch (error) {
      currentUserId = null;
    }
  }

  const tracks = await allDb('SELECT * FROM tracks WHERE release_id = ? ORDER BY track_number ASC', [req.params.id]);
  const trackIds = tracks.map((track) => track.id);
  let trackTexts = [];
  let trackLinks = [];
  if (trackIds.length) {
    const placeholders = trackIds.map(() => '?').join(', ');
    trackTexts = await allDb(
      `SELECT track_id, content_type, language_code, source_language_code, content, source_url
      FROM track_texts WHERE track_id IN (${placeholders}) ORDER BY content_type, language_code`,
      trackIds
    );
    trackLinks = await allDb(
      `SELECT id, track_id, platform, url, link_type FROM track_links
      WHERE track_id IN (${placeholders}) ORDER BY id`,
      trackIds
    );
  }
  const enrichedTracks = tracks.map((track) => ({
    ...track,
    texts: trackTexts.filter((text) => text.track_id === track.id),
    links: trackLinks.filter((link) => link.track_id === track.id),
  }));
  const reviews = await allDb(`
    SELECT rv.*, u.username, u.avatar_url,
      (SELECT COUNT(*) FROM review_likes rl WHERE rl.review_id = rv.id) AS like_count,
      EXISTS (
        SELECT 1 FROM review_likes rl WHERE rl.review_id = rv.id AND rl.user_id = ?
      ) AS liked_by_user
    FROM reviews rv
    JOIN users u ON u.id = rv.user_id
    WHERE rv.release_id = ?
    ORDER BY rv.created_at DESC
  `, [currentUserId || 0, req.params.id]);

  return res.json({ release, tracks: enrichedTracks, reviews });
});

app.post('/api/releases', requireAuth, requireAdmin, async (req, res) => {
  const {
    title,
    artist_id,
    artist_name,
    cover_url,
    release_type,
    release_date,
    genre,
    description,
    tracks = [],
  } = req.body;

  if (!title || !release_type || !release_date) {
    return res.status(400).json({ error: 'Título, tipo e data de lançamento são obrigatórios.' });
  }

  let resolvedArtistId = artist_id ? Number(artist_id) : null;
  if (!resolvedArtistId && artist_name) {
    const existingArtist = await getDb('SELECT id FROM artists WHERE name = ?', [artist_name]);
    if (existingArtist) {
      resolvedArtistId = existingArtist.id;
    } else {
      const createdArtist = await runDb(
        `INSERT INTO artists (name, bio, image_url, banner_url, genre) VALUES (?, ?, ?, ?, ?)`,
        [artist_name, 'Artista cadastrado via painel administrativo.', '', '', genre || '']
      );
      resolvedArtistId = createdArtist.id;
    }
  }

  if (!resolvedArtistId) {
    return res.status(400).json({ error: 'Selecione um artista ou informe o nome do artista.' });
  }

  const isFuture = isFutureReleaseDate(release_date);
  const release = await runDb(
    `INSERT INTO releases (title, artist_id, cover_url, release_type, release_date, genre, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, resolvedArtistId, cover_url || '', release_type, release_date, genre || '', description || '', isFuture ? 'PREVIEW' : 'ACTIVE']
  );

  for (const [index, track] of tracks.entries()) {
    const createdTrack = await runDb(
      `INSERT INTO tracks (release_id, title, duration, explicit, youtube_url, lyrics, translation, track_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [release.id, track.title || `Faixa ${index + 1}`, track.duration || '3:00', track.explicit ? 1 : 0, track.youtube_url || '', track.lyrics || '', track.translation || '', index + 1]
    );
    await saveLegacyTrackContent(createdTrack.id, track);
  }

  if (!isFuture) {
    const preSaves = await allDb('SELECT user_id FROM pre_saves WHERE release_id = ?', [release.id]);
    for (const saved of preSaves) {
      const notification = await getDb('SELECT id FROM notifications WHERE user_id = ? AND message = ?', [saved.user_id, `${title} foi lançado.`]);
      if (!notification) {
        await runDb('INSERT INTO notifications (user_id, message, read_status) VALUES (?, ?, 0)', [saved.user_id, `${title} foi lançado.`]);
      }
    }
  }

  return res.status(201).json({ message: 'Release created.', releaseId: release.id, status: isFuture ? 'PREVIEW' : 'ACTIVE' });
});

app.put('/api/releases/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { title, artist_id, artist_name, cover_url, release_type, release_date, genre, description, tracks = [] } = req.body;

  const existingRelease = await getDb('SELECT * FROM releases WHERE id = ?', [id]);
  if (!existingRelease) return res.status(404).json({ error: 'Release not found.' });
  if (!Array.isArray(tracks)) return res.status(400).json({ error: 'Tracks must be an array.' });

  const existingTracks = await allDb('SELECT id FROM tracks WHERE release_id = ?', [id]);
  const existingTrackIds = new Set(existingTracks.map((track) => track.id));
  const retainedTrackIds = new Set();
  for (const track of tracks) {
    if (track.id == null) continue;
    const trackId = Number(track.id);
    if (!Number.isSafeInteger(trackId) || !existingTrackIds.has(trackId) || retainedTrackIds.has(trackId)) {
      return res.status(400).json({ error: 'Track ID does not belong to this release or is duplicated.' });
    }
    retainedTrackIds.add(trackId);
  }

  let resolvedArtistId = artist_id ? Number(artist_id) : existingRelease.artist_id;
  if (!resolvedArtistId && artist_name) {
    const existingArtist = await getDb('SELECT id FROM artists WHERE name = ?', [artist_name]);
    if (existingArtist) {
      resolvedArtistId = existingArtist.id;
    } else {
      const createdArtist = await runDb(
        `INSERT INTO artists (name, bio, image_url, banner_url, genre) VALUES (?, ?, ?, ?, ?)`,
        [artist_name, 'Artista cadastrado via painel administrativo.', '', '', genre || '']
      );
      resolvedArtistId = createdArtist.id;
    }
  }

  const isFuture = isFutureReleaseDate(release_date || existingRelease.release_date);
  await runDb(
    `UPDATE releases SET title = ?, artist_id = ?, cover_url = ?, release_type = ?, release_date = ?, genre = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [title || existingRelease.title, resolvedArtistId, cover_url || existingRelease.cover_url, release_type || existingRelease.release_type, release_date || existingRelease.release_date, genre || existingRelease.genre, description || existingRelease.description, isFuture ? 'PREVIEW' : 'ACTIVE', id]
  );

<<<<<<< HEAD
  const removedTrackIds = [...existingTrackIds].filter((trackId) => !retainedTrackIds.has(trackId));
  if (removedTrackIds.length) {
    const placeholders = removedTrackIds.map(() => '?').join(', ');
    await runDb(`DELETE FROM playlist_tracks WHERE track_id IN (${placeholders})`, removedTrackIds);
    await runDb(`DELETE FROM favorites WHERE track_id IN (${placeholders})`, removedTrackIds);
    await runDb(`DELETE FROM tracks WHERE id IN (${placeholders})`, removedTrackIds);
  }
  for (const [index, track] of tracks.entries()) {
    const values = [track.title || `Faixa ${index + 1}`, track.duration || '3:00', track.explicit ? 1 : 0, track.youtube_url || '', track.lyrics || '', track.translation || '', index + 1];
    let trackId = Number(track.id);
    if (track.id != null) {
      await runDb(
        `UPDATE tracks SET title = ?, duration = ?, explicit = ?, youtube_url = ?, lyrics = ?, translation = ?, track_number = ? WHERE id = ? AND release_id = ?`,
        [...values, trackId, id]
      );
    } else {
      const createdTrack = await runDb(
        `INSERT INTO tracks (release_id, title, duration, explicit, youtube_url, lyrics, translation, track_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, ...values]
      );
      trackId = createdTrack.id;
    }
    await runDb('DELETE FROM track_links WHERE track_id = ? AND platform = ?', [trackId, 'YouTube']);
    await runDb(
      `DELETE FROM track_texts WHERE track_id = ? AND language_code = 'und'`,
      [trackId]
    );
    await saveLegacyTrackContent(trackId, track);
=======
  const existingTracks = await allDb('SELECT id FROM tracks WHERE release_id = ? ORDER BY track_number ASC, id ASC', [id]);
  for (const [index, track] of tracks.entries()) {
    const values = [
      track.title || `Faixa ${index + 1}`,
      track.duration || '3:00',
      track.explicit ? 1 : 0,
      track.youtube_url || '',
      track.lyrics || '',
      track.translation || '',
      index + 1,
    ];

    if (existingTracks[index]) {
      await runDb(
        'UPDATE tracks SET title = ?, duration = ?, explicit = ?, youtube_url = ?, lyrics = ?, translation = ?, track_number = ? WHERE id = ?',
        [...values, existingTracks[index].id]
      );
    } else {
      await runDb(
        `INSERT INTO tracks (release_id, title, duration, explicit, youtube_url, lyrics, translation, track_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, ...values]
      );
    }
  }

  const removedTrackIds = existingTracks.slice(tracks.length).map((track) => track.id);
  if (removedTrackIds.length) {
    const placeholders = removedTrackIds.map(() => '?').join(',');
    await runDb(`DELETE FROM playlist_tracks WHERE track_id IN (${placeholders})`, removedTrackIds);
    await runDb(`DELETE FROM favorites WHERE track_id IN (${placeholders})`, removedTrackIds);
    await runDb(`DELETE FROM tracks WHERE id IN (${placeholders})`, removedTrackIds);
>>>>>>> 85249e7c79ea5077a41f97740c6d34c51c5f783c
  }

  return res.json({ message: 'Release updated.' });
});

app.delete('/api/releases/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const release = await getDb('SELECT * FROM releases WHERE id = ?', [id]);
  if (!release) return res.status(404).json({ error: 'Release not found.' });

  const trackRows = await allDb('SELECT id FROM tracks WHERE release_id = ?', [id]);
  const trackIds = trackRows.map((item) => item.id);

  if (trackIds.length) {
    await runDb('DELETE FROM playlist_tracks WHERE track_id IN (' + trackIds.map(() => '?').join(',') + ')', trackIds);
    await runDb('DELETE FROM favorites WHERE track_id IN (' + trackIds.map(() => '?').join(',') + ')', trackIds);
  }

  await runDb('DELETE FROM review_likes WHERE review_id IN (SELECT id FROM reviews WHERE release_id = ?)', [id]);
  await runDb('DELETE FROM pre_saves WHERE release_id = ?', [id]);
  await runDb('DELETE FROM featured_releases WHERE release_id = ?', [id]);
  await runDb('DELETE FROM reviews WHERE release_id = ?', [id]);
  await runDb('DELETE FROM tracks WHERE release_id = ?', [id]);
  await runDb('DELETE FROM releases WHERE id = ?', [id]);

  return res.json({ message: 'Release deleted.' });
});

app.post('/api/reviews', requireAuth, async (req, res) => {
  const { release_id, rating, review_text } = req.body;
  if (!release_id || !rating) {
    return res.status(400).json({ error: 'Release and rating are required.' });
  }

  const existing = await getDb('SELECT id FROM reviews WHERE user_id = ? AND release_id = ?', [req.user.id, release_id]);
  if (existing) {
    await runDb(`UPDATE reviews SET rating = ?, review_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [rating, review_text || '', existing.id]);
    return res.json({ message: 'Review updated.', reviewId: existing.id });
  }

  const review = await runDb(
    `INSERT INTO reviews (user_id, release_id, rating, review_text) VALUES (?, ?, ?, ?)`,
    [req.user.id, release_id, rating, review_text || '']
  );

  return res.status(201).json({ message: 'Review created.', reviewId: review.id });
});

app.put('/api/reviews/:id', requireAuth, async (req, res) => {
  const review = await getDb('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
  if (!review) return res.status(404).json({ error: 'Review not found.' });
  if (review.user_id !== req.user.id && req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'You can only update your own review.' });
  }

  const { rating, review_text } = req.body;
  await runDb(`UPDATE reviews SET rating = ?, review_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [rating, review_text || '', req.params.id]);
  return res.json({ message: 'Review updated.' });
});

app.delete('/api/reviews/:id', requireAuth, async (req, res) => {
  const review = await getDb('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
  if (!review) return res.status(404).json({ error: 'Review not found.' });
  if (review.user_id !== req.user.id && req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'You can only delete your own review.' });
  }

  await runDb('DELETE FROM review_likes WHERE review_id = ?', [req.params.id]);
  await runDb('DELETE FROM reviews WHERE id = ?', [req.params.id]);
  return res.json({ message: 'Review deleted.' });
});

app.post('/api/reviews/:id/like', requireAuth, async (req, res) => {
  const review = await getDb('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
  if (!review) return res.status(404).json({ error: 'Review not found.' });

  const existing = await getDb('SELECT id FROM review_likes WHERE review_id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (existing) {
    await runDb('DELETE FROM review_likes WHERE id = ?', [existing.id]);
    return res.json({ liked: false });
  }

  await runDb('INSERT INTO review_likes (review_id, user_id) VALUES (?, ?)', [req.params.id, req.user.id]);
  return res.json({ liked: true });
});

app.get('/api/pre-saves/:releaseId', requireAuth, async (req, res) => {
  const existing = await getDb('SELECT id FROM pre_saves WHERE user_id = ? AND release_id = ?', [req.user.id, req.params.releaseId]);
  return res.json({ saved: Boolean(existing) });
});

app.post('/api/pre-saves/:releaseId', requireAuth, async (req, res) => {
  const release = await getDb('SELECT id FROM releases WHERE id = ?', [req.params.releaseId]);
  if (!release) return res.status(404).json({ error: 'Release not found.' });

  const existing = await getDb('SELECT id FROM pre_saves WHERE user_id = ? AND release_id = ?', [req.user.id, req.params.releaseId]);
  if (existing) {
    await runDb('DELETE FROM pre_saves WHERE id = ?', [existing.id]);
    return res.json({ saved: false });
  }

  await runDb('INSERT INTO pre_saves (user_id, release_id) VALUES (?, ?)', [req.user.id, req.params.releaseId]);
  return res.json({ saved: true });
});

app.get('/api/notifications', requireAuth, async (req, res) => {
  const notifications = await allDb('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
  return res.json(notifications);
});

app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
  await runDb('UPDATE notifications SET read_status = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  return res.json({ message: 'Notification marked as read.' });
});

app.get('/api/profile/:userId', async (req, res) => {
  const user = await getDb('SELECT * FROM users WHERE id = ?', [req.params.userId]);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const reviews = await allDb(`
    SELECT rv.*, r.title AS release_title, r.cover_url AS release_cover, a.name AS artist_name
    FROM reviews rv
    JOIN releases r ON r.id = rv.release_id
    JOIN artists a ON a.id = r.artist_id
    WHERE rv.user_id = ?
    ORDER BY rv.created_at DESC
  `, [req.params.userId]);

  const playlists = await allDb('SELECT * FROM playlists WHERE user_id = ? ORDER BY created_at DESC', [req.params.userId]);
  const favorites = await allDb(`
    SELECT f.*, t.title AS track_title, r.title AS release_title, a.name AS artist_name
    FROM favorites f
    JOIN tracks t ON t.id = f.track_id
    JOIN releases r ON r.id = t.release_id
    JOIN artists a ON a.id = r.artist_id
    WHERE f.user_id = ?
  `, [req.params.userId]);

  return res.json({ user: normalizeUser(user), reviews, playlists, favorites });
});

app.put('/api/users/me', requireAuth, async (req, res) => {
  const { username, full_name, bio, avatar_url, banner_url } = req.body;
  await runDb(
    `UPDATE users SET username = ?, full_name = ?, bio = ?, avatar_url = ?, banner_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [username || '', full_name || '', bio || '', avatar_url || '', banner_url || '', req.user.id]
  );
  const user = await getDb('SELECT * FROM users WHERE id = ?', [req.user.id]);
  return res.json({ user: normalizeUser(user) });
});

app.get('/api/explore', async (req, res) => {
  const featured = await allDb(`
    SELECT fr.sort_order, r.*, a.name as artist_name
    FROM featured_releases fr
    JOIN releases r ON r.id = fr.release_id
    JOIN artists a ON a.id = r.artist_id
    ORDER BY fr.sort_order ASC
  `);

  const recent = await allDb(`
    SELECT r.*, a.name AS artist_name
    FROM releases r
    JOIN artists a ON a.id = r.artist_id
    ORDER BY r.release_date DESC
    LIMIT 6
  `);

  const artists = await allDb(`
    SELECT a.*, COUNT(r.id) AS release_count
    FROM artists a
    LEFT JOIN releases r ON r.artist_id = a.id
    GROUP BY a.id
    ORDER BY release_count DESC
    LIMIT 5
  `);

  const reviews = await allDb(`
    SELECT rv.*, u.username, u.avatar_url, r.title AS release_title, a.name AS artist_name, r.cover_url AS cover_url 
    FROM reviews rv
    JOIN users u ON u.id = rv.user_id
    JOIN releases r ON r.id = rv.release_id
    JOIN artists a ON a.id = r.artist_id
    ORDER BY rv.created_at DESC
    LIMIT 6
  `);

  return res.json({ featured, recent, artists, reviews });
});

app.get('/api/genres', async (req, res) => {
  const genres = await allDb('SELECT * FROM genres ORDER BY name ASC');
  return res.json(genres);
});

app.get('/api/playlists', requireAuth, async (req, res) => {
  const playlists = await allDb('SELECT * FROM playlists WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
  return res.json(playlists);
});

app.post('/api/playlists', requireAuth, async (req, res) => {
  const { name, description, cover_url } = req.body;
  if (!name) return res.status(400).json({ error: 'Playlist name is required.' });

  const playlist = await runDb(
    `INSERT INTO playlists (user_id, name, description, cover_url) VALUES (?, ?, ?, ?)`,
    [req.user.id, name, description || '', cover_url || '']
  );
  return res.status(201).json({ message: 'Playlist created.', playlistId: playlist.id });
});

app.post('/api/playlists/:playlistId/tracks', requireAuth, async (req, res) => {
  const { track_id } = req.body;
  if (!track_id) return res.status(400).json({ error: 'Track is required.' });

  const playlist = await getDb('SELECT id FROM playlists WHERE id = ? AND user_id = ?', [req.params.playlistId, req.user.id]);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found.' });

  const existingTrack = await getDb('SELECT id FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?', [req.params.playlistId, track_id]);
  if (existingTrack) {
    return res.json({ added: false });
  }

  await runDb('INSERT INTO playlist_tracks (playlist_id, track_id) VALUES (?, ?)', [req.params.playlistId, track_id]);
  return res.status(201).json({ added: true });
});

app.post('/api/favorites/:trackId', requireAuth, async (req, res) => {
  const existing = await getDb('SELECT id FROM favorites WHERE user_id = ? AND track_id = ?', [req.user.id, req.params.trackId]);
  if (existing) {
    await runDb('DELETE FROM favorites WHERE id = ?', [existing.id]);
    return res.json({ favorite: false });
  }

  await runDb('INSERT INTO favorites (user_id, track_id) VALUES (?, ?)', [req.user.id, req.params.trackId]);
  return res.json({ favorite: true });
});

const resetCatalogHandler = async (req, res) => {
  try {
    await runDb('DELETE FROM review_likes');
    await runDb('DELETE FROM playlist_tracks');
    await runDb('DELETE FROM favorites');
    await runDb('DELETE FROM pre_saves');
    await runDb('DELETE FROM notifications');
    await runDb('DELETE FROM featured_releases');
    await runDb('DELETE FROM reviews');
    await runDb('DELETE FROM tracks');
    await runDb('DELETE FROM releases');
    await runDb('DELETE FROM artist_genres');
    await runDb('DELETE FROM artists');

    return res.json({ message: 'Catálogo zerado com sucesso.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Não foi possível limpar o catálogo.' });
  }
};

app.post('/api/admin/reset-catalog', requireAuth, requireAdmin, resetCatalogHandler);
app.post('/api/admin/reset', requireAuth, requireAdmin, resetCatalogHandler);
app.post('/api/admin/catalog/reset', requireAuth, requireAdmin, resetCatalogHandler);

app.post('/api/admin/featured', requireAuth, requireAdmin, async (req, res) => {
  const { release_id, sort_order } = req.body;

  if (!release_id) {
    return res.status(400).json({ error: 'Selecione um lançamento para destacar.' });
  }

  const release = await getDb('SELECT id FROM releases WHERE id = ?', [release_id]);
  if (!release) {
    return res.status(404).json({ error: 'Lançamento não encontrado.' });
  }

  const order = Number(sort_order || 1);
  const existing = await getDb('SELECT id FROM featured_releases WHERE release_id = ?', [release_id]);

  if (existing) {
    await runDb('UPDATE featured_releases SET sort_order = ? WHERE id = ?', [order, existing.id]);
    return res.json({ message: 'Destaque atualizado.' });
  }

  await runDb('INSERT INTO featured_releases (release_id, sort_order) VALUES (?, ?)', [release_id, order]);
  return res.status(201).json({ message: 'Destaque criado.' });
});

app.get('/api/dashboard', requireAuth, requireAdmin, async (req, res) => {
  const stats = {
    artists: await getDb('SELECT COUNT(*) AS count FROM artists'),
    releases: await getDb('SELECT COUNT(*) AS count FROM releases'),
    users: await getDb('SELECT COUNT(*) AS count FROM users'),
    reviews: await getDb('SELECT COUNT(*) AS count FROM reviews'),
  };
  return res.json(stats);
});

app.use((req, res) => {
  const distPath = path.join(__dirname, '..', 'dist');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(distPath)) {
    return res.sendFile(path.join(distPath, 'index.html'));
  }
  return res.status(404).json({ error: 'Route not found.' });
});

async function startServer() {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`Musicfy API listening on http://localhost:${PORT}`);
  });
}

startServer();
