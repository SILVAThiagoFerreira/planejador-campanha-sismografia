// Sombreamento de relevo (hillshade) sobre a grade de elevação, com método de Horn e luz vinda do azimute configurado.
// Gera índices de 0 a 255 para uma paleta: 0 = tom mais escuro (também NoData), 255 = tom mais claro.
// Não inclui valores absolutos de cota no resultado; só o relevo relativo.

/** Índice 1..255 para cada pixel válido; NoData e pixels inválidos ficam em 0 e não entram nas contagens. */
export function hillshadeIndices(data, width, height, cellSize, {azimuthDegrees, altitudeDegrees, zFactor}, nodata) {
  const valid = v => Number.isFinite(v) && (nodata === null || v !== nodata);
  const az = azimuthDegrees * Math.PI / 180, alt = altitudeDegrees * Math.PI / 180;
  // Vetor da luz: x = leste, y = norte, z = cima. Azimute medido no sentido horário a partir do norte.
  const lx = Math.cos(alt) * Math.sin(az), ly = Math.cos(alt) * Math.cos(az), lz = Math.sin(alt);
  const indices = new Uint8Array(width * height);
  let nodataCount = 0, validCount = 0, min = Infinity, max = -Infinity;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const idx = r * width + c;
      if (!valid(data[idx])) { nodataCount++; continue; }
      validCount++;
      const center = data[idx];
      if (center < min) min = center;
      if (center > max) max = center;
      // Vizinhança 3x3 com repetição nas bordas; vizinho inválido recebe o valor do centro.
      const at = (dr, dc) => {
        const rr = Math.min(height - 1, Math.max(0, r + dr)), cc = Math.min(width - 1, Math.max(0, c + dc));
        const v = data[rr * width + cc];
        return valid(v) ? v : center;
      };
      const a = at(-1, -1), b = at(-1, 0), cN = at(-1, 1);
      const d = at(0, -1), f = at(0, 1);
      const g = at(1, -1), h = at(1, 0), i = at(1, 1);
      const dzdx = ((cN + 2 * f + i) - (a + 2 * d + g)) / (8 * cellSize) * zFactor;
      const dzdy = ((a + 2 * b + cN) - (g + 2 * h + i)) / (8 * cellSize) * zFactor;
      const nx = -dzdx, ny = -dzdy, nz = 1;
      const norm = Math.hypot(nx, ny, nz);
      const shade = Math.max(0, (nx * lx + ny * ly + nz * lz) / norm);
      // Índice 0 é reservado ao NoData; os valores válidos ocupam 1..255.
      indices[idx] = 1 + Math.round(shade * 254);
    }
  }
  if (validCount === 0) throw new Error('A grade não tem nenhum pixel com elevação válida.');
  return {indices, validCount, nodataCount, elevationMin: min, elevationMax: max};
}

/**
 * Paleta de 256 cores (RGB). Índice 0 = NoData, na cor do fundo do esquema (`nodata`), para não formar um bloco de outra cor;
 * índices 1..255 vão do tom escuro (`shadeDark`) ao claro (`shadeLight`); gamma > 1 escurece os médios.
 */
export function buildPalette({shadeDark, shadeLight, gamma, nodata}, hexToRgb) {
  const dark = hexToRgb(shadeDark), light = hexToRgb(shadeLight), none = hexToRgb(nodata);
  const palette = new Uint8Array(256 * 3);
  for (let k = 0; k < 3; k++) palette[k] = none[k];
  for (let i = 1; i < 256; i++) {
    const t = ((i - 1) / 254) ** gamma;
    for (let k = 0; k < 3; k++) palette[i * 3 + k] = Math.round(dark[k] + (light[k] - dark[k]) * t);
  }
  return palette;
}
