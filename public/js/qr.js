/**
 * Minimal QR Code generator — renders to canvas
 * Supports alphanumeric URLs up to ~150 chars (version 1-6, error correction L)
 * No external dependencies.
 */

const QR = (() => {
  // Galois field GF(256) tables
  const EXP = new Uint8Array(256);
  const LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x & 128 ? 0x11d : 0);
  }
  EXP[255] = EXP[0];

  function gfMul(a, b) {
    return a === 0 || b === 0 ? 0 : EXP[(LOG[a] + LOG[b]) % 255];
  }

  function polyMul(a, b) {
    const result = new Uint8Array(a.length + b.length - 1);
    for (let i = 0; i < a.length; i++)
      for (let j = 0; j < b.length; j++)
        result[i + j] ^= gfMul(a[i], b[j]);
    return result;
  }

  function rsGenerator(n) {
    let g = new Uint8Array([1]);
    for (let i = 0; i < n; i++)
      g = polyMul(g, new Uint8Array([1, EXP[i]]));
    return g;
  }

  function rsEncode(data, ecLen) {
    const gen = rsGenerator(ecLen);
    const msg = new Uint8Array(data.length + ecLen);
    msg.set(data);
    for (let i = 0; i < data.length; i++) {
      const coef = msg[i];
      if (coef !== 0)
        for (let j = 0; j < gen.length; j++)
          msg[i + j] ^= gfMul(gen[j], coef);
    }
    return msg.slice(data.length);
  }

  // Version info: [version, size, dataCodewords, ecCodewords, numBlocks]
  // Error correction level L (lowest, max data capacity)
  const VERSIONS = [
    null,
    [1, 21, 19, 7, 1],
    [2, 25, 34, 10, 1],
    [3, 29, 55, 15, 1],
    [4, 33, 80, 20, 1],
    [5, 37, 108, 26, 1],
    [6, 41, 136, 18, 2],
    [7, 45, 156, 20, 2],
    [8, 49, 194, 24, 2],
    [9, 53, 232, 30, 2],
    [10, 57, 274, 18, 4],
  ];

  // Alignment pattern positions per version
  const ALIGN = [
    null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  ];

  function encode(text) {
    const data = encodeUTF8(text);
    const bitLen = 4 + 8 + data.length * 8; // mode(4) + length(8) + data
    let ver = 1;
    while (ver <= 10 && VERSIONS[ver][2] * 8 < bitLen) ver++;
    if (ver > 10) throw new Error('Data too long for QR');

    const [, size, totalData, ecPerBlock, numBlocks] = VERSIONS[ver];
    const dataPerBlock = Math.floor(totalData / numBlocks);

    // Build bit stream: byte mode indicator (0100), length, data
    const bits = [];
    pushBits(bits, 0b0100, 4); // Byte mode
    pushBits(bits, data.length, ver <= 9 ? 8 : 16);
    for (const b of data) pushBits(bits, b, 8);
    // Terminator
    const capacity = totalData * 8;
    const termLen = Math.min(4, capacity - bits.length);
    pushBits(bits, 0, termLen);
    // Pad to byte boundary
    while (bits.length % 8 !== 0) bits.push(0);
    // Pad bytes
    let padByte = 0xec;
    while (bits.length < capacity) {
      pushBits(bits, padByte, 8);
      padByte = padByte === 0xec ? 0x11 : 0xec;
    }

    const codewords = new Uint8Array(bits.length / 8);
    for (let i = 0; i < codewords.length; i++) {
      let val = 0;
      for (let b = 0; b < 8; b++) val = (val << 1) | bits[i * 8 + b];
      codewords[i] = val;
    }

    // RS encode blocks
    const dataBlocks = [];
    const ecBlocks = [];
    let offset = 0;
    for (let b = 0; b < numBlocks; b++) {
      const blockSize = b < numBlocks - (totalData % numBlocks)
        ? dataPerBlock : dataPerBlock + 1;
      const block = codewords.slice(offset, offset + blockSize);
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, ecPerBlock));
      offset += blockSize;
    }

    // Interleave
    const final = [];
    const maxData = Math.max(...dataBlocks.map(b => b.length));
    for (let i = 0; i < maxData; i++)
      for (const block of dataBlocks)
        if (i < block.length) final.push(block[i]);
    for (let i = 0; i < ecPerBlock; i++)
      for (const block of ecBlocks)
        if (i < block.length) final.push(block[i]);

    // Place modules
    const grid = Array.from({ length: size }, () => new Uint8Array(size));
    const reserved = Array.from({ length: size }, () => new Uint8Array(size));

    placeFinder(grid, reserved, 0, 0, size);
    placeFinder(grid, reserved, size - 7, 0, size);
    placeFinder(grid, reserved, 0, size - 7, size);

    // Alignment patterns
    const alignPos = ALIGN[ver];
    for (const r of alignPos)
      for (const c of alignPos) {
        if (reserved[r]?.[c]) continue;
        placeAlign(grid, reserved, r, c, size);
      }

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      if (!reserved[6][i]) { grid[6][i] = (i % 2 === 0) ? 1 : 0; reserved[6][i] = 1; }
      if (!reserved[i][6]) { grid[i][6] = (i % 2 === 0) ? 1 : 0; reserved[i][6] = 1; }
    }

    // Dark module
    grid[size - 8][8] = 1;
    reserved[size - 8][8] = 1;

    // Reserve format info areas
    for (let i = 0; i < 8; i++) {
      reserved[8][i] = 1; reserved[8][size - 1 - i] = 1;
      reserved[i][8] = 1; reserved[size - 1 - i][8] = 1;
    }
    reserved[8][8] = 1;

    // Place data
    let bitIdx = 0;
    const allBits = [];
    for (const byte of final)
      for (let b = 7; b >= 0; b--) allBits.push((byte >> b) & 1);

    let right = size - 1;
    let upward = true;
    while (right >= 0) {
      if (right === 6) right--; // Skip timing column
      const colPair = [right, right - 1];
      const rows = upward
        ? Array.from({ length: size }, (_, i) => size - 1 - i)
        : Array.from({ length: size }, (_, i) => i);
      for (const row of rows) {
        for (const col of colPair) {
          if (col < 0 || reserved[row][col]) continue;
          grid[row][col] = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
        }
      }
      upward = !upward;
      right -= 2;
    }

    // Apply mask (mask 0: (row + col) % 2 === 0) and format info
    const mask = 0;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (!reserved[r][c] && (r + c) % 2 === 0)
          grid[r][c] ^= 1;

    // Format info (L, mask 0)
    const formatBits = getFormatBits(1, mask); // ecLevel 1 = L (QR spec: L=01, M=00, Q=11, H=10)
    placeFormatBits(grid, formatBits, size);

    // Version info
    if (ver >= 7) placeVersionBits(grid, ver, size);

    return { grid, size };
  }

  function placeFinder(grid, res, row, col, size) {
    for (let r = -1; r <= 7; r++)
      for (let c = -1; c <= 7; c++) {
        const rr = row + r, cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inOuter = r === -1 || r === 7 || c === -1 || c === 7;
        const inInner = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const filled = inInner && (r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        grid[rr][cc] = filled ? 1 : 0;
        res[rr][cc] = 1;
      }
  }

  function placeAlign(grid, res, row, col, size) {
    for (let r = -2; r <= 2; r++)
      for (let c = -2; c <= 2; c++) {
        const rr = row + r, cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const filled = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
        grid[rr][cc] = filled ? 1 : 0;
        res[rr][cc] = 1;
      }
  }

  function getFormatBits(ecLevel, mask) {
    let data = (ecLevel << 3) | mask;
    let bits = data << 10;
    for (let i = 4; i >= 0; i--)
      if (bits & (1 << (i + 10)))
        bits ^= 0b10100110111 << i;
    bits = ((data << 10) | bits) ^ 0b101010000010010;
    const result = [];
    for (let i = 14; i >= 0; i--) result.push((bits >> i) & 1);
    return result;
  }

  function placeFormatBits(grid, bits, size) {
    // Around top-left finder
    const positions1 = [
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
      [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
    ];
    for (let i = 0; i < 15; i++) {
      const [r, c] = positions1[i];
      grid[r][c] = bits[i];
    }
    // Around other finders
    for (let i = 0; i < 7; i++)
      grid[size - 1 - i][8] = bits[i];
    for (let i = 7; i < 15; i++)
      grid[8][size - 15 + i] = bits[i];
  }

  function placeVersionBits(grid, ver, size) {
    let data = ver;
    let bits = data << 12;
    for (let i = 5; i >= 0; i--)
      if (bits & (1 << (i + 12)))
        bits ^= 0b1111100100101 << i;
    bits = (data << 12) | bits;
    for (let i = 0; i < 18; i++) {
      const bit = (bits >> i) & 1;
      const r = Math.floor(i / 3), c = size - 11 + (i % 3);
      grid[r][c] = bit;
      grid[c][r] = bit;
    }
  }

  function encodeUTF8(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 128) bytes.push(c);
      else if (c < 2048) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
      else { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
    }
    return bytes;
  }

  function pushBits(arr, val, len) {
    for (let i = len - 1; i >= 0; i--) arr.push((val >> i) & 1);
  }

  function renderCanvas(canvas, text, cellSize = 4, quietZone = 2) {
    const { grid, size } = encode(text);
    const totalSize = size + quietZone * 2;
    canvas.width = totalSize * cellSize;
    canvas.height = totalSize * cellSize;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (grid[r][c])
          ctx.fillRect((c + quietZone) * cellSize, (r + quietZone) * cellSize, cellSize, cellSize);
  }

  return { encode, renderCanvas };
})();
