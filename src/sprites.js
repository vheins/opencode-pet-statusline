/**
 * Pixel sprite system ported from review-agent
 * (packages/backend/src/tui/sprites) — plain JS, no build step.
 *
 * A sprite is an 8x8-ish bitmap of '#' (on) / '.' (off) cells plus per-mood
 * animation frames. `renderBitmap` turns a bitmap into terminal rows.
 */

function normalizeBitmap(rows) {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return rows.map((row) => row.padEnd(width, '.'));
}

export function bitmap(rows) {
  return normalizeBitmap(rows);
}

function clone(bitmapRows) {
  return [...bitmapRows];
}

function padBitmap(bitmapRows, horizontal = 0, vertical = 0) {
  const width = (bitmapRows[0]?.length ?? 0) + horizontal * 2;
  const emptyRow = '.'.repeat(width);
  const rows = bitmapRows.map((row) => `${'.'.repeat(horizontal)}${row}${'.'.repeat(horizontal)}`);
  return [
    ...Array.from({ length: vertical }, () => emptyRow),
    ...rows,
    ...Array.from({ length: vertical }, () => emptyRow),
  ];
}

function toMatrix(bitmapRows) {
  return bitmapRows.map((row) => row.split(''));
}

function fromMatrix(matrix) {
  return matrix.map((row) => row.join(''));
}

function findBounds(bitmapRows) {
  let minX = Number.MAX_SAFE_INTEGER;
  let maxX = -1;
  let minY = Number.MAX_SAFE_INTEGER;
  let maxY = -1;

  for (let y = 0; y < bitmapRows.length; y++) {
    const row = bitmapRows[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  return { minX, maxX, minY, maxY };
}

function setPixel(matrix, x, y, value) {
  if (y < 0 || y >= matrix.length) return;
  if (x < 0 || x >= matrix[y].length) return;
  matrix[y][x] = value;
}

function withSleepBubble(base, frame = 0) {
  const rows = clone(base);
  if (rows.length > 0) {
    const bubbleX = Math.max(0, rows[0].length - 2 - (frame % 3));
    const bubbleChar = (['z', 'Z', 'z', '*'])[frame % 4];
    rows[0] = rows[0].split('').map((cell, idx) => idx === bubbleX ? bubbleChar : cell).join('');
  }
  return rows;
}

function ensureTwinEyes(base) {
  const bounds = findBounds(base);
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;

  if (width < 5 || height < 4) {
    return base;
  }

  const matrix = toMatrix(base);
  const centerX = Math.floor((bounds.minX + bounds.maxX) / 2);
  const eyeY = Math.min(bounds.maxY - 2, Math.max(bounds.minY + 2, bounds.minY + Math.floor(height / 3)));
  const eyeOffset = width >= 8 ? 2 : 1;
  const leftEyeX = Math.max(bounds.minX + 1, centerX - eyeOffset);
  const rightEyeX = Math.min(bounds.maxX - 1, centerX + eyeOffset);

  setPixel(matrix, leftEyeX, eyeY, '.');
  setPixel(matrix, rightEyeX, eyeY, '.');
  // Keep a solid bridge between sockets so wide face cutouts read as two eyes, not one visor.
  if (rightEyeX - leftEyeX >= 2) {
    setPixel(matrix, centerX, eyeY, '#');
  }

  return fromMatrix(matrix);
}

function withProcessingArms(base, frame) {
  const padded = padBitmap(base, 2, 0);
  const bounds = findBounds(padded);
  const matrix = toMatrix(padded);
  const upperRow = Math.min(bounds.maxY, bounds.minY + 2);
  const lowerRow = Math.min(bounds.maxY, bounds.minY + 4);
  const leftX = Math.max(0, bounds.minX - 1);
  const rightX = Math.min(matrix[0].length - 1, bounds.maxX + 1);
  const outerLeftX = Math.max(0, bounds.minX - 2);
  const outerRightX = Math.min(matrix[0].length - 1, bounds.maxX + 2);

  if (frame === 0) {
    setPixel(matrix, leftX, upperRow, '#');
    setPixel(matrix, rightX, upperRow, '#');
  } else if (frame === 1) {
    setPixel(matrix, leftX, upperRow, '#');
    setPixel(matrix, rightX, upperRow, '#');
    setPixel(matrix, outerLeftX, lowerRow, '#');
    setPixel(matrix, outerRightX, lowerRow, '#');
  } else if (frame === 2) {
    setPixel(matrix, outerLeftX, lowerRow, '#');
    setPixel(matrix, outerRightX, lowerRow, '#');
  } else {
    setPixel(matrix, outerLeftX, upperRow, '#');
    setPixel(matrix, outerRightX, upperRow, '#');
    setPixel(matrix, leftX, lowerRow, '#');
    setPixel(matrix, rightX, lowerRow, '#');
  }

  setPixel(matrix, Math.max(0, bounds.minX - 1 + (frame % 2)), 0, '*');
  return fromMatrix(matrix);
}

function withHappy(base, frame = 0) {
  const padded = padBitmap(base, 1, 1);
  const bounds = findBounds(padded);
  const matrix = toMatrix(padded);
  const leftSparkX = Math.max(0, bounds.minX - 1 + (frame % 2));
  const rightSparkX = Math.min(matrix[0].length - 1, bounds.maxX + 1 - (frame % 2));
  const sparkY = Math.max(0, bounds.minY + (frame % 2));
  const cheerY = Math.min(bounds.maxY, bounds.minY + 2);

  setPixel(matrix, leftSparkX, sparkY, '*');
  setPixel(matrix, rightSparkX, sparkY, '*');
  setPixel(matrix, Math.max(0, bounds.minX - 1), cheerY, '#');
  setPixel(matrix, Math.min(matrix[0].length - 1, bounds.maxX + 1), cheerY, '#');

  return fromMatrix(matrix);
}

function withFailed(base, frame = 0) {
  const padded = padBitmap(base, 1, 1);
  const bounds = findBounds(padded);
  const matrix = toMatrix(padded);
  const leftAlertX = Math.max(0, bounds.minX - 1);
  const rightAlertX = Math.min(matrix[0].length - 1, bounds.maxX + 1);
  const alertY = Math.max(0, bounds.minY + 1 + (frame % 2));
  const slumpY = Math.min(bounds.maxY, bounds.maxY - 1);

  setPixel(matrix, leftAlertX, alertY, '*');
  setPixel(matrix, rightAlertX, alertY, '*');
  if (frame % 2 === 0) {
    setPixel(matrix, Math.max(0, bounds.minX - 1), slumpY, '#');
  } else {
    setPixel(matrix, Math.min(matrix[0].length - 1, bounds.maxX + 1), slumpY, '#');
  }

  return fromMatrix(matrix);
}

export function createBitmapSet(base, variants) {
  return {
    idle: variants?.idle ?? [base],
    sleeping: variants?.sleeping ?? [withSleepBubble(base, 0), withSleepBubble(base, 1), withSleepBubble(base, 2), withSleepBubble(base, 3)],
    processing: variants?.processing ?? [
      withProcessingArms(base, 0),
      withProcessingArms(base, 1),
      withProcessingArms(base, 2),
      withProcessingArms(base, 3),
    ],
    completed: variants?.completed ?? [withHappy(base, 0), withHappy(base, 1), withHappy(base, 2), withHappy(base, 3)],
    failed: variants?.failed ?? [withFailed(base, 0), withFailed(base, 1), withFailed(base, 2), withFailed(base, 3)],
  };
}

export function createBitmapSprite(
  displayName,
  slug,
  base,
  notes,
  variants,
) {
  const eyedBase = ensureTwinEyes(base);
  return {
    slug,
    displayName,
    family: 'tamagotchi',
    source: 'user-reference',
    notes,
    width: eyedBase[0]?.length ?? 0,
    height: eyedBase.length,
    bitmaps: createBitmapSet(eyedBase, variants),
  };
}

export function renderBitmap(bitmapRows, on = '██', off = '  ') {
  return bitmapRows.map((row) =>
    row
      .split('')
      .map((cell) => {
        if (cell === '#') return on;
        if (cell === 'z' || cell === 'Z' || cell === '*') return `${cell} `;
        return off;
      })
      .join(''),
  );
}

const T_BOY = bitmap([
  '.##..##.',
  '.#....#.',
  '.######.',
  '##....##',
  '########',
  '##.##.##',
  '.##..##.',
  '..#..#..',
]);
const T_GIRL = bitmap([
  '..#..#..',
  '.##..##.',
  '.######.',
  '##....##',
  '########',
  '##.##.##',
  '.##..##.',
  '..#..#..',
]);
const ROUND = bitmap([
  '..####..',
  '.######.',
  '##....##',
  '##.##.##',
  '##....##',
  '.######.',
  '..####..',
  '........',
]);
const ROUND_EARS = bitmap([
  '.##..##.',
  '.######.',
  '##....##',
  '##.##.##',
  '##....##',
  '.######.',
  '.##..##.',
  '........',
]);
const ROUND_BUN = bitmap([
  '..#..#..',
  '.######.',
  '##....##',
  '##.##.##',
  '##....##',
  '.######.',
  '..#..#..',
  '........',
]);
const MOHI_FUZZ = bitmap([
  '.#.#.#..',
  '.######.',
  '##....##',
  '##.##.##',
  '##....##',
  '.######.',
  '.#....#.',
  '........',
]);
const ROUND_DOTS = bitmap([
  '...##...',
  '.######.',
  '##.#..##',
  '##....##',
  '##.#..##',
  '.######.',
  '..#..#..',
  '........',
]);
const OBOTCHI_FACE = bitmap([
  '...##...',
  '.######.',
  '##....##',
  '##..#.##',
  '##....##',
  '.######.',
  '..####..',
  '........',
]);
const HIDATCHI_RING = bitmap([
  '..####..',
  '.######.',
  '##.#..##',
  '##....##',
  '##..#.##',
  '.######.',
  '..#..#..',
  '........',
]);
const BEAN = bitmap([
  '...###..',
  '.######.',
  '##....#.',
  '##.##.#.',
  '##....#.',
  '.######.',
  '..#..#..',
  '........',
]);
const BEAN_WING = bitmap([
  '...###..',
  '#######.',
  '##....##',
  '##.##..#',
  '##....##',
  '.######.',
  '........',
  '........',
]);
const BEAN_SEAL = bitmap([
  '...###..',
  '.######.',
  '##....#.',
  '##.##.#.',
  '#######.',
  '.######.',
  '...##...',
  '........',
]);
const SQUARE = bitmap([
  '...##...',
  '.######.',
  '.######.',
  '.##..##.',
  '.##..##.',
  '.######.',
  '..#..#..',
  '........',
]);
const SQUARE_CROWN = bitmap([
  '.#.#.#..',
  '.######.',
  '.#....#.',
  '.##..##.',
  '.##..##.',
  '.######.',
  '.##..##.',
  '........',
]);
const MASK = bitmap([
  '...##...',
  '.######.',
  '########',
  '##.##.##',
  '##....##',
  '########',
  '..#..#..',
  '........',
]);
const TRI_SPIKE = bitmap([
  '...##...',
  '..####..',
  '.######.',
  '###..###',
  '.######.',
  '..####..',
  '...##...',
  '........',
]);
const PIRO_NEEDLE = bitmap([
  '...##...',
  '..####..',
  '.######.',
  '########',
  '.######.',
  '..####..',
  '...##...',
  '..#..#..',
]);
const HINO_FLAME = bitmap([
  '....#...',
  '...###..',
  '..####..',
  '.######.',
  '###..###',
  '.######.',
  '..####..',
  '...##...',
]);
const GHOST = bitmap([
  '...##...',
  '.######.',
  '##....##',
  '##.##.##',
  '##....##',
  '########',
  '#.#..#.#',
  '........',
]);
const BLOB = bitmap([
  '...##...',
  '.######.',
  '##....##',
  '##.##.##',
  '##....##',
  '.######.',
  '.##..##.',
  '........',
]);
const DARK_WIDE = bitmap([
  '.######.',
  '########',
  '########',
  '##.##.##',
  '##.##.##',
  '########',
  '.##..##.',
  '........',
]);
const ROBOT = bitmap([
  '...##...',
  '.######.',
  '##....##',
  '########',
  '##.##.##',
  '##....##',
  '.##..##.',
  '........',
]);
const ORB_LEAF = bitmap([
  '....#...',
  '...###..',
  '.######.',
  '##....##',
  '##.##.##',
  '.######.',
  '..#..#..',
  '........',
]);
const BUNBUN_RABBIT = bitmap([
  '.##..##.',
  '..####..',
  '.######.',
  '##....##',
  '##.##.##',
  '.######.',
  '..#..#..',
  '........',
]);
const TEKE_SEED = bitmap([
  '....#...',
  '...###..',
  '..####..',
  '.##..##.',
  '##....##',
  '.######.',
  '..#..#..',
  '........',
]);
const WIDE_BIRD = bitmap([
  '..####..',
  '.######.',
  '##....##',
  '########',
  '#.##...#',
  '.######.',
  '..####..',
  '........',
]);
const HINA_CHICK = bitmap([
  '...##...',
  '.######.',
  '##....##',
  '####..##',
  '##....##',
  '.######.',
  '...##...',
  '........',
]);
const HIKO_FLAP = bitmap([
  '.##..##.',
  '########',
  '##....##',
  '####..##',
  '#.##...#',
  '.######.',
  '..####..',
  '........',
]);
const HORN_BLOCK = bitmap([
  '.##..##.',
  '.######.',
  '########',
  '##....##',
  '##.##.##',
  '########',
  '.##..##.',
  '........',
]);
const WARUSO_HORNS = bitmap([
  '.#.#.#..',
  '########',
  '########',
  '##....##',
  '##.##.##',
  '########',
  '.##..##.',
  '........',
]);
const TSUNO_TALL = bitmap([
  '.##..##.',
  '.#....#.',
  '########',
  '##....##',
  '##.##.##',
  '########',
  '.##..##.',
  '..#..#..',
]);
const TALL_MASK = bitmap([
  '...##...',
  '.######.',
  '.######.',
  '########',
  '##.##.##',
  '########',
  '########',
  '.##..##.',
]);
const DONUT = bitmap([
  '...##...',
  '.######.',
  '##....##',
  '##.##.##',
  '##.##.##',
  '##....##',
  '.######.',
  '........',
]);
const SEAL_LONG = bitmap([
  '..####..',
  '.######.',
  '##....#.',
  '########',
  '.######.',
  '..####..',
  '...##...',
  '........',
]);
const HASHIZOU_LONG = bitmap([
  '..####..',
  '.######.',
  '##....##',
  '####..##',
  '.######.',
  '..####..',
  '..#..#..',
  '........',
]);
const GHOST_LONG = bitmap([
  '..####..',
  '.######.',
  '##....##',
  '##.##.##',
  '##....##',
  '########',
  '#.#..#.#',
  '........',
]);
const PATA_WIDE = bitmap([
  '.######.',
  '##....##',
  '##.##.##',
  '##....##',
  '########',
  '#.#..#.#',
  '..#..#..',
  '........',
]);
const HOHO_BIRD = bitmap([
  '..####..',
  '.######.',
  '##....##',
  '####..##',
  '##....##',
  '########',
  '#.#..#.#',
  '........',
]);
const CAT_BLOCK = bitmap([
  '.##..##.',
  '.######.',
  '##....##',
  '##.##.##',
  '##....##',
  '.######.',
  '.##..##.',
  '........',
]);
const ALIEN = bitmap([
  '...##...',
  '.######.',
  '########',
  '##.##.##',
  '########',
  '.######.',
  '..####..',
  '........',
]);
const NINJA = bitmap([
  '.##..##.',
  '########',
  '########',
  '##....##',
  '########',
  '.######.',
  '..#..#..',
  '........',
]);
const TINY_GHOST = bitmap([
  '...##...',
  '..####..',
  '.##..##.',
  '.##..##.',
  '.######.',
  '.#.#.#..',
  '........',
  '........',
]);
const DORO_SAD = bitmap([
  '...##...',
  '..####..',
  '.##..##.',
  '.##..##.',
  '.##..##.',
  '.######.',
  '..#..#..',
  '........',
]);
const POD = bitmap([
  '...##...',
  '..####..',
  '.######.',
  '.##..##.',
  '.#....#.',
  '.######.',
  '..####..',
  '........',
]);
const SQUAT = bitmap([
  '..####..',
  '.######.',
  '########',
  '##.##.##',
  '##....##',
  '.######.',
  '.##..##.',
  '........',
]);
const MAMETCHI_GLASSES = bitmap([
  '..#..#..',
  '.######.',
  '##.##.##',
  '##.##.##',
  '##....##',
  '.######.',
  '..#..#..',
  '...##...',
]);
const MIMITCHI_BUNNY = bitmap([
  '.##..##.',
  '.#....#.',
  '.######.',
  '##.##.##',
  '##....##',
  '.######.',
  '.##..##.',
  '........',
]);
const YOUNG_MIMI = bitmap([
  '.#....#.',
  '.##..##.',
  '##....##',
  '##.##.##',
  '##....##',
  '.######.',
  '.##..##.',
  '........',
]);
const CHOMA_TWIN = bitmap([
  '.##..##.',
  '.######.',
  '.#....#.',
  '##.##.##',
  '##....##',
  '.######.',
  '.#....#.',
  '........',
]);
const MIMIYORI_LONGEARS = bitmap([
  '.#....#.',
  '.#....#.',
  '.######.',
  '##.##.##',
  '##....##',
  '.######.',
  '.##..##.',
  '........',
]);
const MEME_FLOWER = bitmap([
  '.#.#.#..',
  '.######.',
  '##....##',
  '##.##.##',
  '##....##',
  '.######.',
  '..####..',
  '...##...',
]);
const DEBA_SPIKE = bitmap([
  '..####..',
  '.######.',
  '##....##',
  '##.##.##',
  '##....##',
  '.######.',
  '.#....#.',
  '..#..#..',
]);
const KURO_DARK = bitmap([
  '..####..',
  '.######.',
  '########',
  '########',
  '##.##.##',
  '########',
  '.##..##.',
  '..#..#..',
]);
const BILL_TOWER = bitmap([
  '...##...',
  '.######.',
  '########',
  '########',
  '##....##',
  '##.##.##',
  '########',
  '.######.',
]);
const BILL_NOSE = bitmap([
  '..####..',
  '.######.',
  '##....#.',
  '##.##.#.',
  '########',
  '.######.',
  '..#..#..',
  '........',
]);
const UFO = bitmap([
  '...##...',
  '.######.',
  '########',
  '##.##.##',
  '.######.',
  '########',
  '.##..##.',
  '........',
]);
const SIMPLE_CAT = bitmap([
  '.##..##.',
  '.######.',
  '##....##',
  '##.##.##',
  '##....##',
  '.######.',
  '.#....#.',
  '........',
]);
const SAMURAI = bitmap([
  '.#....#.',
  '.######.',
  '########',
  '##....##',
  '##.##.##',
  '########',
  '.######.',
  '..#..#..',
]);
const VISOR_BOT = bitmap([
  '...##...',
  '.######.',
  '########',
  '########',
  '##....##',
  '##.##.##',
  '.######.',
  '.##..##.',
]);
const CAMERA_FACE = bitmap([
  '...##...',
  '.######.',
  '########',
  '##....##',
  '########',
  '##.##.##',
  '.######.',
  '..####..',
]);
const SUMO = bitmap([
  '..####..',
  '.######.',
  '########',
  '##.##.##',
  '########',
  '.######.',
  '##....##',
  '........',
]);
const OTOKO_BRUISER = bitmap([
  '.######.',
  '########',
  '##....##',
  '##.##.##',
  '########',
  '.######.',
  '##....##',
  '..#..#..',
]);
const OLD_MAN = bitmap([
  '..####..',
  '.######.',
  '##....##',
  '##.##.##',
  '##....##',
  '.######.',
  '..####..',
  '..#..#..',
]);
const CUBIC_DROID = bitmap([
  '...##...',
  '.######.',
  '.#....#.',
  '.######.',
  '.##..##.',
  '.#....#.',
  '.######.',
  '..#..#..',
]);

export const TAMAGOTCHI_SPRITE_TEMPLATES = [
  createBitmapSprite('Teletchi (boy)', 'teletchi-boy', T_BOY),
  createBitmapSprite('Teletchi (girl)', 'teletchi-girl', T_GIRL),
  createBitmapSprite('Mizutamatchi', 'mizutamatchi', BEAN),
  createBitmapSprite('Mohitamatchi', 'mohitamatchi', MOHI_FUZZ),
  createBitmapSprite('Tamatchi', 'tamatchi', ROUND),
  createBitmapSprite('Kutchitamatchi', 'kutchitamatchi', WIDE_BIRD),
  createBitmapSprite('Obotchi', 'obotchi', OBOTCHI_FACE),
  createBitmapSprite('Young Mametchi', 'young-mametchi', SQUARE_CROWN),
  createBitmapSprite('Nikatchi', 'nikatchi', MASK),
  createBitmapSprite('Hinatchi', 'hinatchi', HINA_CHICK),
  createBitmapSprite('Patapatatchi', 'patapatatchi', PATA_WIDE),
  createBitmapSprite('Young Mimitchi', 'young-mimitchi', YOUNG_MIMI),
  createBitmapSprite('Pirorirotchi', 'pirorirotchi', PIRO_NEEDLE),
  createBitmapSprite('Hinotamatchi', 'hinotamatchi', HINO_FLAME),
  createBitmapSprite('Hikotchi', 'hikotchi', HIKO_FLAP),
  createBitmapSprite('Hashitamatchi', 'hashitamatchi', BEAN_SEAL),
  createBitmapSprite('Mametchi', 'mametchi', MAMETCHI_GLASSES),
  createBitmapSprite('Memetchi', 'memetchi', MEME_FLOWER),
  createBitmapSprite('Kushipatchi', 'kushipatchi', DONUT),
  createBitmapSprite('Leafchi', 'leafchi', CAT_BLOCK),
  createBitmapSprite('Mimitchi', 'mimitchi', MIMITCHI_BUNNY),
  createBitmapSprite('Chomametchi', 'chomametchi', CHOMA_TWIN),
  createBitmapSprite('Tarakotchi', 'tarakotchi', SEAL_LONG),
  createBitmapSprite('Woltchi', 'woltchi', DARK_WIDE),
  createBitmapSprite('Hanatchi', 'hanatchi', TINY_GHOST),
  createBitmapSprite('Debatchi', 'debatchi', DEBA_SPIKE),
  createBitmapSprite('Masktchi', 'masktchi', NINJA),
  createBitmapSprite('Gozarutchi', 'gozarutchi', SAMURAI),
  createBitmapSprite('Bunbuntchi', 'bunbuntchi', BUNBUN_RABBIT),
  createBitmapSprite('Warusotchi', 'warusotchi', WARUSO_HORNS),
  createBitmapSprite('Hidatchi', 'hidatchi', HIDATCHI_RING),
  createBitmapSprite('Mimiyoritchi', 'mimiyoritchi', MIMIYORI_LONGEARS),
  createBitmapSprite('Hashizoutchi', 'hashizoutchi', HASHIZOU_LONG),
  createBitmapSprite('Teketchi', 'teketchi', TEKE_SEED),
  createBitmapSprite('Tsunotchi', 'tsunotchi', TSUNO_TALL),
  createBitmapSprite('Megatchi', 'megatchi', VISOR_BOT),
  createBitmapSprite('Kurokotchi', 'kurokotchi', KURO_DARK),
  createBitmapSprite('Billotchi', 'billotchi', BILL_TOWER),
  createBitmapSprite('Dorotchi', 'dorotchi', DORO_SAD),
  createBitmapSprite('Pyonkotchi', 'pyonkotchi', ROUND_EARS),
  createBitmapSprite('Bill', 'bill', BILL_NOSE),
  createBitmapSprite('Androtchi', 'androtchi', CUBIC_DROID),
  createBitmapSprite('Sekitoritchi', 'sekitoritchi', SUMO),
  createBitmapSprite('Paparatchi', 'paparatchi', CAMERA_FACE),
  createBitmapSprite('Pipotchi', 'pipotchi', POD),
  createBitmapSprite('Nyatchi', 'nyatchi', SIMPLE_CAT),
  createBitmapSprite('Hohotchi', 'hohotchi', HOHO_BIRD),
  createBitmapSprite('Oyajitchi', 'oyajitchi', OLD_MAN),
  createBitmapSprite('Ojitchi', 'ojitchi', BLOB),
  createBitmapSprite('Otokotchi', 'otokotchi', OTOKO_BRUISER),
  createBitmapSprite('Nazotchi', 'nazotchi', UFO, 'mystery/floating variant'),
];

export const TAMAGOTCHI_SPRITE_BY_SLUG = new Map(
  TAMAGOTCHI_SPRITE_TEMPLATES.map((sprite) => [sprite.slug, sprite]),
);

export function getTamagotchiSpriteTemplate(slug) {
  return TAMAGOTCHI_SPRITE_BY_SLUG.get(slug);
}

export function getRandomTamagotchiSpriteTemplate() {
  const index = Math.floor(Math.random() * TAMAGOTCHI_SPRITE_TEMPLATES.length);
  return TAMAGOTCHI_SPRITE_TEMPLATES[index];
}

function hashSeed(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getTamagotchiSpriteTemplateBySeed(seed) {
  const index = hashSeed(seed) % TAMAGOTCHI_SPRITE_TEMPLATES.length;
  return TAMAGOTCHI_SPRITE_TEMPLATES[index];
}
