// gcode.js


const GCODE = (() => {
  const MASS_PER_METER_175_PLA = 2.9825495255018097; // computed from π*(0.175/2 cm)^2 * 100 cm/m * 1.24 g/cm3

  function isGcodeFilename(name = "") {
    const lower = (name || "").toLowerCase().trim();
    return lower.endsWith(".gcode") || lower.endsWith(".gco") || lower.endsWith(".g");
  }

  function parseSecondsFromTimeLike(text) {
    // Supports patterns:
    // ;TIME:12345
    // ;TIME_ELAPSED: 12345
    // "Print time: 2h 3m 4s", "2d 1h 10m", etc.
    let sec = null;

    const mSec = text.match(/;\s*TIME(?:_ELAPSED)?\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (mSec) sec = parseFloat(mSec[1]);

    if (sec == null) {
      let total = 0;
      const d = text.match(/(\d+(?:\.\d+)?)\s*d/i);
      const h = text.match(/(\d+(?:\.\d+)?)\s*h/i);
      const m = text.match(/(\d+(?:\.\d+)?)\s*m(?!m)/i);
      const s = text.match(/(\d+(?:\.\d+)?)\s*s/i);
      if (d || h || m || s) {
        if (d) total += parseFloat(d[1]) * 86400;
        if (h) total += parseFloat(h[1]) * 3600;
        if (m) total += parseFloat(m[1]) * 60;
        if (s) total += parseFloat(s[1]);
        if (total > 0) sec = total;
      }
    }

    if (sec == null) {
      const est = text.match(/estimated\s+printing\s+time\s*\(s\)\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
      if (est) sec = parseFloat(est[1]);
    }

    return sec;
  }

  function parseFilamentGrams(text) {
    // Try to find grams directly
    const grams = text.match(/filament\s*(?:used|weight)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*g\b/i);
    if (grams) return parseFloat(grams[1]);

    // Try volume in mm^3
    const vmm3 = text.match(/(?:filament\s*(?:used|volume)|volume)\s*\[?mm\^?3\]?\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (vmm3) {
      const mm3 = parseFloat(vmm3[1]);
      const DENSITY_G_PER_CM3 = 1.24;
      return (mm3 / 1000) * DENSITY_G_PER_CM3; // mm^3 -> cm^3
    }

    // Try length in meters
    const meters = text.match(/filament\s*(?:used|length)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*m\b/i);
    if (meters) return parseFloat(meters[1]) * MASS_PER_METER_175_PLA;

    // Try length in mm
    const mm = text.match(/filament\s*(?:used|length)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*mm\b/i);
    if (mm) return (parseFloat(mm[1]) / 1000) * MASS_PER_METER_175_PLA;

    return null;
  }

  async function parseFile(file) {
    const text = await file.text();

    const seconds = parseSecondsFromTimeLike(text);
    const hours = seconds != null ? (seconds / 3600) : null;

    const grams = parseFilamentGrams(text);

    return {
      printTimeHours: hours,
      filamentGrams: grams
    };
  }

  return {
    isGcodeFilename,
    parseFile
  };
})();
