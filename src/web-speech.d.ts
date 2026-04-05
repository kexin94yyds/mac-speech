interface AppSpeechRecognitionAlternative {
  confidence: number;
  transcript: string;
}

interface AppSpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): AppSpeechRecognitionAlternative;
  [index: number]: AppSpeechRecognitionAlternative;
}

interface AppSpeechRecognitionResultList {
  readonly length: number;
  item(index: number): AppSpeechRecognitionResult;
  [index: number]: AppSpeechRecognitionResult;
}

interface AppSpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: AppSpeechRecognitionResultList;
}

interface AppSpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface AppSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: ((this: AppSpeechRecognition, ev: Event) => unknown) | null;
  onerror: ((this: AppSpeechRecognition, ev: AppSpeechRecognitionErrorEvent) => unknown) | null;
  onresult: ((this: AppSpeechRecognition, ev: AppSpeechRecognitionEvent) => unknown) | null;
  onstart: ((this: AppSpeechRecognition, ev: Event) => unknown) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface AppSpeechRecognitionConstructor {
  new (): AppSpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: AppSpeechRecognitionConstructor;
    webkitSpeechRecognition?: AppSpeechRecognitionConstructor;
  }
}

export {}
