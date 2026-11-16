const fs = require('fs');
const path = require('path');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  throw new Error('Catalog import requires Node.js 22.12 or newer.');
}

function readSourceDatabase(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`SQLite database not found: ${sourcePath}`);
  }

  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    const tableNames = new Set(
      source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name)
    );
    for (const table of ['artists', 'releases', 'tracks']) {
      if (!tableNames.has(table)) {
        throw new Error(`SQLite database is missing the required "${table}" table.`);
      }
    }

    const artists = source.prepare(`
      SELECT id, name, bio, image_url, banner_url, genre
      FROM artists ORDER BY id
    `).all();
    const releases = source.prepare(`
      SELECT id, title, artist_id, cover_url, release_type, release_date, genre, description, status, featured_order
      FROM releases ORDER BY id
    `).all();
    const tracks = source.prepare(`
      SELECT id, release_id, title, duration, explicit, youtube_url, lyrics, translation, track_number
      FROM tracks ORDER BY release_id, track_number, id
    `).all();
    const genres = tableNames.has('genres')
      ? source.prepare('SELECT id, name FROM genres').all()
      : [];
    const artistGenres = tableNames.has('artist_genres')
      ? source.prepare('SELECT artist_id, genre_id FROM artist_genres').all()
      : [];

    const artistIds = new Set(artists.map((artist) => String(artist.id)));
    const releaseIds = new Set(releases.map((release) => String(release.id)));
    if (releases.some((release) => !artistIds.has(String(release.artist_id)))) {
      throw new Error('SQLite database contains a release without a matching artist.');
    }
    if (tracks.some((track) => !releaseIds.has(String(track.release_id)))) {
      throw new Error('SQLite database contains a track without a matching release.');
    }

    return { artists, releases, tracks, genres, artistGenres };
  } finally {
    source.close();
  }
}

async function importCatalog(catalog) {
  require('dotenv').config();

  const requiredSettings = ['TIDB_HOST', 'TIDB_USER', 'TIDB_PASSWORD', 'TIDB_DATABASE'];
  const missingSettings = requiredSettings.filter((setting) => !process.env[setting]);
  if (missingSettings.length) {
    throw new Error(`Missing database configuration: ${missingSettings.join(', ')}. Configure these values in .env.`);
  }

  const port = Number(process.env.TIDB_PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('TIDB_PORT must be a valid TCP port.');
  }

  const ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
  if (process.env.TIDB_CA_PATH) {
    ssl.ca = fs.readFileSync(path.resolve(process.env.TIDB_CA_PATH), 'utf8');
  }

  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl,
    connectTimeout: 10000,
  });

  const counts = { artistsAdded: 0, artistsMatched: 0, releasesAdded: 0, releasesMatched: 0, tracksAdded: 0, tracksSkipped: 0 };
  try {
    await connection.beginTransaction();

    const artistIdMap = new Map();
    for (const artist of catalog.artists) {
      const [existingRows] = await connection.execute(
        'SELECT id FROM artists WHERE name = ? ORDER BY id LIMIT 1',
        [artist.name]
      );
      if (existingRows.length) {
        artistIdMap.set(String(artist.id), existingRows[0].id);
        counts.artistsMatched += 1;
        continue;
      }

      const [result] = await connection.execute(
        'INSERT INTO artists (name, bio, image_url, banner_url, genre) VALUES (?, ?, ?, ?, ?)',
        [artist.name, artist.bio || '', artist.image_url || '', artist.banner_url || '', artist.genre || '']
      );
      artistIdMap.set(String(artist.id), result.insertId);
      counts.artistsAdded += 1;
    }

    const genreIdMap = new Map();
    for (const genre of catalog.genres) {
      const [existingRows] = await connection.execute(
        'SELECT id FROM genres WHERE name = ? LIMIT 1',
        [genre.name]
      );
      if (existingRows.length) {
        genreIdMap.set(String(genre.id), existingRows[0].id);
        continue;
      }

      const [result] = await connection.execute('INSERT INTO genres (name) VALUES (?)', [genre.name]);
      genreIdMap.set(String(genre.id), result.insertId);
    }

    for (const link of catalog.artistGenres) {
      const artistId = artistIdMap.get(String(link.artist_id));
      const genreId = genreIdMap.get(String(link.genre_id));
      if (artistId == null || genreId == null) continue;
      await connection.execute(
        'INSERT IGNORE INTO artist_genres (artist_id, genre_id) VALUES (?, ?)',
        [artistId, genreId]
      );
    }

    const releaseIdMap = new Map();
    for (const release of catalog.releases) {
      const artistId = artistIdMap.get(String(release.artist_id));
      const [existingRows] = await connection.execute(
        'SELECT id FROM releases WHERE artist_id = ? AND title = ? AND release_date = ? ORDER BY id LIMIT 1',
        [artistId, release.title, release.release_date]
      );
      if (existingRows.length) {
        releaseIdMap.set(String(release.id), existingRows[0].id);
        counts.releasesMatched += 1;
        continue;
      }

      const [result] = await connection.execute(
        `INSERT INTO releases
          (title, artist_id, cover_url, release_type, release_date, genre, description, status, featured_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          release.title,
          artistId,
          release.cover_url || '',
          release.release_type || 'Album',
          release.release_date,
          release.genre || '',
          release.description || '',
          release.status || 'ACTIVE',
          release.featured_order ?? null,
        ]
      );
      releaseIdMap.set(String(release.id), result.insertId);
      counts.releasesAdded += 1;
    }

    for (const track of catalog.tracks) {
      const releaseId = releaseIdMap.get(String(track.release_id));
      const [existingRows] = await connection.execute(
        'SELECT id FROM tracks WHERE release_id = ? AND track_number = ? LIMIT 1',
        [releaseId, track.track_number]
      );
      if (existingRows.length) {
        counts.tracksSkipped += 1;
        continue;
      }

      await connection.execute(
        `INSERT INTO tracks
          (release_id, title, duration, explicit, youtube_url, lyrics, translation, track_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          releaseId,
          track.title || '',
          track.duration || '',
          track.explicit ? 1 : 0,
          track.youtube_url || '',
          track.lyrics || '',
          track.translation || '',
          track.track_number,
        ]
      );
      counts.tracksAdded += 1;
    }

    await connection.commit();
    console.log('Catalog import completed:', counts);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const sourceArgument = args.find((argument) => argument !== '--apply');
  const sourcePath = path.resolve(sourceArgument || path.join(__dirname, 'data', 'musicfy.db'));
  const catalog = readSourceDatabase(sourcePath);

  console.log(`Source: ${sourcePath}`);
  console.log(`Catalog rows: ${catalog.artists.length} artists, ${catalog.releases.length} releases, ${catalog.tracks.length} tracks.`);
  console.log('Users, passwords, reviews, playlists, favorites, and notifications are not imported.');
  console.log('The source SQLite file is opened read-only.');

  if (!apply) {
    console.log('Preview only; no TiDB connection or writes were made. Add --apply after allowing your IP in TiDB Cloud.');
    return;
  }

  await importCatalog(catalog);
}

main().catch((error) => {
  console.error(`Catalog import failed: ${error.message}`);
  process.exitCode = 1;
});
