#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#import <Speech/Speech.h>
#import <objc/message.h>

typedef void (*SpeechBridgeCallback)(const char *event_type, const char *text, void *user_data);

@interface IterateSpeechBridge : NSObject

@property (nonatomic, assign) SpeechBridgeCallback callback;
@property (nonatomic, assign) void *userData;
@property (nonatomic, strong) SFSpeechRecognizer *speechRecognizer;
@property (nonatomic, strong) AVAudioEngine *audioEngine;
@property (nonatomic, strong) SFSpeechAudioBufferRecognitionRequest *recognitionRequest;
@property (nonatomic, strong) SFSpeechRecognitionTask *recognitionTask;
@property (nonatomic, assign) BOOL hasInputTap;

+ (instancetype)shared;
- (void)startWithCallback:(SpeechBridgeCallback)callback userData:(void *)userData;
- (void)stop;

@end

@implementation IterateSpeechBridge

+ (instancetype)shared {
    static IterateSpeechBridge *shared = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        shared = [[IterateSpeechBridge alloc] init];
    });
    return shared;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _audioEngine = [[AVAudioEngine alloc] init];
        _speechRecognizer = [[SFSpeechRecognizer alloc] initWithLocale:[[NSLocale alloc] initWithLocaleIdentifier:@"zh-CN"]];
    }
    return self;
}

- (void)emitEvent:(NSString *)eventType text:(NSString *)text {
    if (self.callback == NULL) {
        return;
    }

    const char *eventCString = [eventType UTF8String];
    const char *textCString = text != nil ? [text UTF8String] : "";
    self.callback(eventCString, textCString, self.userData);
}

- (void)resetRecognition:(BOOL)cancelTask {
    if (self.audioEngine.isRunning) {
        [self.audioEngine stop];
    }

    if (self.hasInputTap) {
        [[self.audioEngine inputNode] removeTapOnBus:0];
        self.hasInputTap = NO;
    }

    [self.recognitionRequest endAudio];
    self.recognitionRequest = nil;

    if (cancelTask) {
        [self.recognitionTask cancel];
    }
    self.recognitionTask = nil;

    self.audioEngine = [[AVAudioEngine alloc] init];
}

- (void)beginRecognition {
    [self resetRecognition:YES];

    if (self.speechRecognizer == nil || !self.speechRecognizer.isAvailable) {
        [self emitEvent:@"error" text:@"macOS 语音识别当前不可用"];
        return;
    }

    self.recognitionRequest = [[SFSpeechAudioBufferRecognitionRequest alloc] init];
    self.recognitionRequest.shouldReportPartialResults = YES;
    self.recognitionRequest.taskHint = SFSpeechRecognitionTaskHintDictation;
    NSString *recognitionMode = @"system";
    SEL supportsOnDeviceSelector = NSSelectorFromString(@"supportsOnDeviceRecognition");
    SEL requiresOnDeviceSelector = NSSelectorFromString(@"setRequiresOnDeviceRecognition:");
    if ([self.speechRecognizer respondsToSelector:supportsOnDeviceSelector] &&
        [self.recognitionRequest respondsToSelector:requiresOnDeviceSelector]) {
        BOOL supportsOnDevice =
            ((BOOL (*)(id, SEL))objc_msgSend)(self.speechRecognizer, supportsOnDeviceSelector);
        if (supportsOnDevice) {
            ((void (*)(id, SEL, BOOL))objc_msgSend)(self.recognitionRequest, requiresOnDeviceSelector, YES);
            recognitionMode = @"on-device";
        }
    }

    AVAudioInputNode *inputNode = [self.audioEngine inputNode];
    AVAudioFormat *recordingFormat = [inputNode outputFormatForBus:0];

    __weak typeof(self) weakSelf = self;
    [inputNode installTapOnBus:0
                    bufferSize:256
                        format:recordingFormat
                         block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
        (void)when;
        __strong typeof(weakSelf) strongSelf = weakSelf;
        if (strongSelf == nil || strongSelf.recognitionRequest == nil) {
            return;
        }
        [strongSelf.recognitionRequest appendAudioPCMBuffer:buffer];
    }];
    self.hasInputTap = YES;

    self.recognitionTask =
        [self.speechRecognizer recognitionTaskWithRequest:self.recognitionRequest
                                            resultHandler:^(SFSpeechRecognitionResult *result, NSError *error) {
        __strong typeof(weakSelf) strongSelf = weakSelf;
        if (strongSelf == nil) {
            return;
        }

        if (result != nil) {
            NSString *bestTranscript = result.bestTranscription.formattedString ?: @"";
            [strongSelf emitEvent:(result.isFinal ? @"final" : @"partial") text:bestTranscript];
            if (result.isFinal) {
                [strongSelf resetRecognition:NO];
            }
        }

        if (error != nil) {
            NSString *message = error.localizedDescription ?: @"未知错误";
            [strongSelf emitEvent:@"error" text:message];
            [strongSelf resetRecognition:YES];
        }
    }];

    NSError *startError = nil;
    [self.audioEngine prepare];
    if (![self.audioEngine startAndReturnError:&startError]) {
        NSString *message = startError.localizedDescription ?: @"音频引擎启动失败";
        [self emitEvent:@"error" text:message];
        [self resetRecognition:YES];
        return;
    }

    [self emitEvent:@"started" text:recognitionMode];
}

- (void)startWithCallback:(SpeechBridgeCallback)callback userData:(void *)userData {
    self.callback = callback;
    self.userData = userData;

    [self resetRecognition:YES];

    // macOS 26: ad-hoc signed apps crash if requestAuthorization / requestAccess is called.
    // Check status only; guide user to System Settings if denied.
    SFSpeechRecognizerAuthorizationStatus speechStatus = [SFSpeechRecognizer authorizationStatus];
    if (speechStatus == SFSpeechRecognizerAuthorizationStatusDenied ||
        speechStatus == SFSpeechRecognizerAuthorizationStatusRestricted) {
        [self emitEvent:@"error" text:@"语音识别权限未开启，请在「系统设置 → 隐私与安全性 → 语音识别」中添加本 App"];
        return;
    }

    AVAuthorizationStatus micStatus = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
    if (micStatus == AVAuthorizationStatusDenied || micStatus == AVAuthorizationStatusRestricted) {
        [self emitEvent:@"error" text:@"麦克风权限未开启，请在「系统设置 → 隐私与安全性 → 麦克风」中添加本 App"];
        return;
    }

    [self beginRecognition];
}

- (void)stop {
    [self resetRecognition:YES];
}

@end

void speech_bridge_start(SpeechBridgeCallback callback, void *user_data) {
    dispatch_async(dispatch_get_main_queue(), ^{
        [[IterateSpeechBridge shared] startWithCallback:callback userData:user_data];
    });
}

void speech_bridge_stop(void) {
    void (^stopBlock)(void) = ^{
        [[IterateSpeechBridge shared] stop];
    };
    if ([NSThread isMainThread]) {
        stopBlock();
    } else {
        dispatch_sync(dispatch_get_main_queue(), stopBlock);
    }
}

bool speech_bridge_check_microphone_authorization(void) {
    return [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio] == AVAuthorizationStatusAuthorized;
}

bool speech_bridge_request_microphone_authorization(void) {
    return [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio] == AVAuthorizationStatusAuthorized;
}

bool speech_bridge_check_speech_authorization(void) {
    return [SFSpeechRecognizer authorizationStatus] == SFSpeechRecognizerAuthorizationStatusAuthorized;
}

bool speech_bridge_request_speech_authorization(void) {
    return [SFSpeechRecognizer authorizationStatus] == SFSpeechRecognizerAuthorizationStatusAuthorized;
}
