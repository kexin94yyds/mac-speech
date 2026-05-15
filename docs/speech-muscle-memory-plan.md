# iterate-speech Speech Muscle Memory Plan

## Goal

Improve recognition accuracy for mixed Chinese/English speech, proper nouns, and command phrases without immediately replacing the recognition engine.

## Current Findings

1. The primary recognition path is native macOS `Speech.framework` with a fixed `zh-CN` recognizer.
2. The app already has an independent local persistence area at `~/Library/Application Support/iterate-speech/`.
3. The app already persists a manual dictionary in `dictionary.json`, but that data is not meaningfully wired into the main recognition path.
4. The existing `iterate` app already proves a useful pattern:
   - feed contextual hints before recognition starts
   - store phrase-to-output mappings
   - gradually activate stronger auto-substitution through training

## Best-Practice Direction

Do not add a second parallel storage format first.

Upgrade the existing `dictionary.json` into a speech lexicon / muscle-memory store that supports:

1. Manual vocabulary entries
2. Auto-learned speech memory entries
3. Contextual hint generation
4. Post-recognition correction

## Recommended Data Model

Use one unified entry shape:

```json
{
  "id": 123,
  "spokenPhrase": "codex",
  "outputText": "Codex",
  "trainingCount": 0,
  "isEnabled": true,
  "source": "manual"
}
```

Recommended fields:

1. `id`
2. `spokenPhrase`
3. `outputText`
4. `trainingCount`
5. `isEnabled`
6. `source`

Optional later fields:

1. `lastMatchedAt`
2. `createdAt`
3. `updatedAt`

## Backward Compatibility

Existing dictionary entries look like:

```json
{
  "id": 123,
  "word": "codex",
  "replacement": "Codex"
}
```

Best practice is to support a soft migration:

1. On load, accept both old and new shapes.
2. Normalize old entries in memory into the new model.
3. On next save, persist only the new shape.

This avoids breaking existing users and avoids a separate migration tool.

## Recognition Pipeline Integration

### Phase 1: Contextual Hints

Before starting recognition, build a hint list from:

1. Built-in high-value bilingual terms
2. Manual entries from the dictionary
3. High-confidence trained entries
4. Current project/app context

Rules:

1. Deduplicate case-insensitively
2. Prefer shorter high-value lists over dumping the whole database
3. Limit to a reasonable top-N set

### Phase 2: Post-Recognition Correction

After final recognition:

1. Normalize transcript
2. Try exact spoken-phrase match first
3. Then try safe substitution rules
4. Only auto-replace entries that are either:
   - manual
   - or trained past an activation threshold

This prevents over-aggressive early replacements.

### Phase 3: Training Loop

Training should happen only on meaningful confirmation signals.

Recommended signals:

1. The user keeps the recognized result and writes it back
2. The user manually corrects a known phrase into a preferred output
3. The same mapping is confirmed repeatedly

Best practice:

1. Manual entries are active immediately
2. Auto-learned entries start weak
3. Auto substitution activates only after enough confirmations

## Suggested Activation Policy

Use two levels:

1. `manual`
   - active immediately
   - usable for hints and substitution
2. `learned`
   - usable for hints early
   - usable for auto-substitution only after threshold

This gives fast value without creating correction instability.

## UI Strategy

Do not build a brand-new UI first.

Reuse the existing dictionary page and evolve it gradually:

1. Keep the current add/remove flow
2. Rename later only if needed
3. Add `trainingCount`, `enabled`, and `source` display when the backend is ready

## Storage Recommendation

Keep the store independent for `iterate-speech`:

1. storage path stays under `~/Library/Application Support/iterate-speech/`
2. no shared file with the main `iterate` app in the first phase
3. add sync/import only after the standalone path is stable

## Why This Is Better Than Starting Fresh

1. Reuses existing persistence
2. Reuses existing UI
3. Avoids parallel concepts like dictionary vs muscle memory fighting each other
4. Makes rollout incremental and reversible

## Implementation Order

1. Expand the dictionary data model with backward compatibility
2. Wire the store into contextual hint generation
3. Add safe post-recognition substitution
4. Add training counters and activation thresholds
5. Add lightweight UI visibility for source and training state
6. Later wire language selection into the recognizer itself

## File-by-File Plan

### 1. `src-tauri/src/main.rs`

Responsibilities:

1. Upgrade persistence from a thin dictionary to a unified speech lexicon
2. Preserve backward compatibility with existing `dictionary.json`
3. Keep the Tauri command surface stable where possible

Recommended changes:

1. Replace the current `DictEntry` shape with a new struct that can deserialize both:
   - old fields: `word`, `replacement`
   - new fields: `spokenPhrase`, `outputText`, `trainingCount`, `isEnabled`, `source`
2. Add a normalization layer on load:
   - if entry is old-format, convert it in memory to the new shape
   - if `source` is missing, default to `manual`
   - if `trainingCount` is missing for manual entries, treat them as immediately active
3. Keep `load_dictionary` and `save_dictionary` commands initially to avoid broader churn.
4. If needed later, add a dedicated command name like `load_speech_lexicon`, but do not require it in phase 1.

Do not do yet:

1. shared sync with the main `iterate` app
2. cloud persistence

### 2. `src-tauri/src/macos_speech_bridge.m`

Responsibilities:

1. Accept contextual hints from the app layer
2. Feed those hints into the native recognizer before the session starts

Recommended changes:

1. Extend the bridge start path so hints are passed in at session start.
2. Convert the incoming list into `recognitionRequest.contextualStrings`.
3. Keep the list short and deduplicated before it reaches Objective-C.

Best-practice note:

Prefer passing hints as part of the start request over hiding them in separate mutable global state.

Do not do yet:

1. full multilingual session orchestration
2. dynamic mid-session hint updates

### 3. `src/composables/useSpeechOverlay.ts`

Responsibilities:

1. Load the lexicon before recognition starts
2. Build the hint list
3. Apply safe post-recognition correction
4. Gate training behavior conservatively

Recommended changes:

1. Before `start_native_speech`, load the local lexicon and build a combined hints list from:
   - built-in bilingual terms
   - manual dictionary entries
   - high-confidence trained entries
   - current lightweight context if available
2. Send that hint list to the native command.
3. After `native-final`, normalize the transcript and run a correction pass:
   - exact match first
   - safe substitution second
4. Only allow automatic substitution when:
   - entry source is `manual`
   - or learned entry has reached threshold
5. Keep training conservative in phase 1:
   - manual entries: active immediately
   - learned entries: do not auto-create aggressively
   - if training is added, bind it to a strong confirmation event such as successful write-back

Best-practice note:

Do not start with aggressive auto-learning from every partial/final result. That will pollute the memory store fast.

### 4. `src/components/pages/DictionaryPage.vue`

Responsibilities:

1. Stay as the current management UI
2. Gradually evolve from “dictionary” to “speech memory”

Recommended changes:

1. Keep current add/remove flow working.
2. Map current fields cleanly to the new backend model.
3. In a later step, expose:
   - `source`
   - `enabled`
   - `trainingCount`
4. Keep the UI simple in the first pass; correctness matters more than feature density here.

Do not do yet:

1. complex moderation UI
2. review queues
3. separate “manual vs learned” tabs

## Recommended Phase Split

### Phase 1A

1. Upgrade `dictionary.json` shape with compatibility
2. Feed manual entries into contextual hints
3. Support exact manual replacements

Target result:

1. English proper nouns and known command phrases improve immediately
2. Existing manual dictionary becomes actually useful

### Phase 1B

1. Add `trainingCount`
2. Add threshold-gated learned substitution
3. Add basic visibility in UI

Target result:

1. system starts behaving like a true muscle-memory layer
2. but still remains conservative and predictable

### Phase 2

1. Wire language setting into the recognizer locale
2. improve mixed-language handling further
3. consider import/sync with the main `iterate` app

## Non-Goals For Phase 1

1. Replacing the native recognizer
2. Building full cloud sync
3. Building a complex review workflow for every correction
4. Solving long-form multilingual dictation perfectly

## Summary

The best first implementation is:

1. keep `iterate-speech` independent
2. upgrade `dictionary.json` into a unified speech lexicon
3. use it both before recognition as hints and after recognition as a correction layer
4. let manual vocabulary work immediately, and let learned behavior activate gradually
