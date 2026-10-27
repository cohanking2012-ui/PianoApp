/** Samples analysed per pitch-detection frame (~43 ms at 48 kHz): enough for notes down to ~50 Hz. */
export const FRAME_SIZE = 2048
/** Newest samples used to spot key strikes (~10 ms). */
export const ATTACK_SAMPLES = 512
