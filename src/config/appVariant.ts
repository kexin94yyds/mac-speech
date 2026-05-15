export const APP_VARIANT = import.meta.env.VITE_APP_VARIANT === 'lab' ? 'lab' : 'main'

export const IS_LAB_VARIANT = APP_VARIANT === 'lab'

// The lab bundle is reserved for experiments that intentionally diverge from
// the stable write-back model. Main stays on the existing behavior.
export const IOS_STYLE_DRAFT_EXPERIMENT = IS_LAB_VARIANT
