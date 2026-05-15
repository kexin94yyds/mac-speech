import { ref } from 'vue'

type DraftState = {
  activeSegment: string
  finalizedSegments: string[]
  lastPartialAt: number
}

function normalize(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function joinSegments(segments: string[], activeSegment: string) {
  return [...segments, activeSegment].map(normalize).filter(Boolean).join(' ')
}

export function useIosStyleSpeechDraft(enabled: boolean) {
  const draftTranscript = ref('')
  const committedSegmentCount = ref(0)

  const state: DraftState = {
    activeSegment: '',
    finalizedSegments: [],
    lastPartialAt: 0,
  }

  function updateDraftTranscript() {
    draftTranscript.value = joinSegments(state.finalizedSegments, state.activeSegment)
    committedSegmentCount.value = state.finalizedSegments.length
    return draftTranscript.value
  }

  function reset() {
    state.activeSegment = ''
    state.finalizedSegments = []
    state.lastPartialAt = 0
    draftTranscript.value = ''
    committedSegmentCount.value = 0
  }

  function commitActiveSegment() {
    const normalized = normalize(state.activeSegment)
    if (!normalized) return

    const lastCommitted = state.finalizedSegments[state.finalizedSegments.length - 1]
    if (lastCommitted === normalized) {
      state.activeSegment = ''
      return
    }

    state.finalizedSegments.push(normalized)
    state.activeSegment = ''
  }

  function shouldStartNewSegment(nextPartial: string) {
    const current = normalize(state.activeSegment)
    const next = normalize(nextPartial)
    if (!current || !next) return false

    const now = Date.now()
    const pauseElapsed = now - state.lastPartialAt
    const shortenedAfterPause = pauseElapsed > 1600 && next.length + 3 < current.length
    const samePrefix = current.startsWith(next) || next.startsWith(current)

    return shortenedAfterPause && !samePrefix
  }

  function ingestPartial(partialText: string) {
    if (!enabled) {
      draftTranscript.value = normalize(partialText)
      return draftTranscript.value
    }

    const normalized = normalize(partialText)
    if (!normalized) return updateDraftTranscript()

    if (shouldStartNewSegment(normalized)) {
      commitActiveSegment()
    }

    state.activeSegment = normalized
    state.lastPartialAt = Date.now()
    return updateDraftTranscript()
  }

  function ingestFinal(finalText: string) {
    const normalized = normalize(finalText)
    if (!enabled) {
      draftTranscript.value = normalized
      return draftTranscript.value
    }

    if (!normalized) return updateDraftTranscript()

    const aggregateBeforeFinal = joinSegments(state.finalizedSegments, state.activeSegment)

    if (!aggregateBeforeFinal) {
      state.activeSegment = normalized
      return updateDraftTranscript()
    }

    if (
      aggregateBeforeFinal === normalized ||
      normalize(state.activeSegment) === normalized
    ) {
      state.activeSegment = normalized
      return updateDraftTranscript()
    }

    if (normalized.includes(aggregateBeforeFinal)) {
      state.finalizedSegments = []
      state.activeSegment = normalized
      return updateDraftTranscript()
    }

    commitActiveSegment()
    state.activeSegment = normalized
    return updateDraftTranscript()
  }

  function resolveTranscript(partialText: string, finalText: string) {
    const normalizedFinal = normalize(finalText)
    const normalizedPartial = normalize(partialText)
    if (!enabled) {
      return normalizedFinal || normalizedPartial
    }
    return normalize(draftTranscript.value) || normalizedFinal || normalizedPartial
  }

  return {
    draftTranscript,
    committedSegmentCount,
    reset,
    ingestPartial,
    ingestFinal,
    resolveTranscript,
  }
}
