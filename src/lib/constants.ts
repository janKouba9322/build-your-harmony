// Note names used across the app (sharps only — flats are display sugar we skip)
export const NOTES: string[] = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

// Krumhansl-Kessler key profiles (1982 probe-tone data). Kept for reference /
// comparison; detectKey now uses the Temperley profiles below, which share the
// same mean between major and minor (removes KK's built-in minor bias) and
// classify better on short, ambiguous melodies.
export const KK_MAJOR = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
export const KK_MINOR = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

// Temperley (1999) profiles, derived from the Kostka-Payne corpus.
// Values are pitch-class weights starting from the tonic.
export const T_MAJOR = [
  0.748, 0.06, 0.488, 0.082, 0.67, 0.46, 0.096, 0.715, 0.104, 0.366, 0.057, 0.4,
];
export const T_MINOR = [
  0.712, 0.084, 0.474, 0.618, 0.049, 0.46, 0.105, 0.747, 0.404, 0.067, 0.133,
  0.33,
];

export const CONFIDENCE_CLARITY = 0.95; // clarity above this counts as a "confident" sample
