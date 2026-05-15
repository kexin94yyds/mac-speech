export const APP_VARIANT = import.meta.env.VITE_APP_VARIANT === 'lab' ? 'lab' : 'main'

export const IS_LAB_VARIANT = APP_VARIANT === 'lab'

// Main now uses the staged draft cache so long speech does not collapse to the
// latest partial result. Lab can still diverge for isolated experiments.
export const IOS_STYLE_DRAFT_EXPERIMENT = true
