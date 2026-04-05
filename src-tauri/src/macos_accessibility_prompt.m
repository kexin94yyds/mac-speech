#import <ApplicationServices/ApplicationServices.h>
#import <Foundation/Foundation.h>

/// Triggers the system accessibility trust prompt (Open System Settings button) when not yet trusted.
/// More reliable than deep-link URLs that break across macOS versions.
void iterate_prompt_accessibility_trusted_dialog(void) {
    NSDictionary *options = @{(__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES};
    AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
}
