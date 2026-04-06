#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::ffi::{c_char, c_void, CStr};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{
    Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewWindowBuilder,
    WindowEvent,
};
use tauri_plugin_clipboard_manager::ClipboardExt;

const GLOBAL_SHORTCUT: &str = "Fn";
const TOGGLE_EVENT: &str = "speech://toggle";
const NATIVE_STARTED_EVENT: &str = "speech://native-started";
const NATIVE_PARTIAL_EVENT: &str = "speech://native-partial";
const NATIVE_FINAL_EVENT: &str = "speech://native-final";
const NATIVE_ERROR_EVENT: &str = "speech://native-error";
const OWN_BUNDLE_ID: &str = "xin.iterate.speech";
static LAST_TARGET_APP_BUNDLE_ID: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

#[derive(Debug, Serialize, Deserialize)]
struct OverlayPositionFile {
    x: i32,
    y: i32,
}

fn overlay_position_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("overlay_position.json"))
}

fn read_saved_overlay_position(app: &tauri::AppHandle) -> Option<PhysicalPosition<i32>> {
    let path = overlay_position_path(app)?;
    let data = std::fs::read_to_string(path).ok()?;
    let p: OverlayPositionFile = serde_json::from_str(&data).ok()?;
    Some(PhysicalPosition::new(p.x, p.y))
}

fn install_overlay_position_persistence(overlay: &tauri::WebviewWindow, app: tauri::AppHandle) {
    let app_for_save = app.clone();
    let overlay_clone = overlay.clone();
    let _ = overlay_clone.on_window_event(move |event| {
        let WindowEvent::Moved(pos) = event else {
            return;
        };
        let Some(path) = overlay_position_path(&app_for_save) else {
            return;
        };
        let payload = OverlayPositionFile { x: pos.x, y: pos.y };
        if let Ok(bytes) = serde_json::to_vec(&payload) {
            let _ = std::fs::write(path, bytes);
        }
    });
}

const ANCHOR_WIDTH: f64 = 288.0;
const ANCHOR_HEIGHT: f64 = 118.0;
const ANCHOR_BOTTOM_MARGIN: f64 = 28.0;

#[derive(Clone, Serialize)]
struct TogglePayload {
    shortcut: &'static str,
    /// When true, the frontend must not call `remember_frontmost_app` again: the native Fn path
    /// already captured the target app before the overlay stole focus.
    #[serde(default)]
    skip_target_capture: bool,
}

#[derive(Clone, Serialize)]
struct SpeechBridgePayload {
    text: String,
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn iterate_prompt_accessibility_trusted_dialog();
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn speech_bridge_check_microphone_authorization() -> bool;
    fn speech_bridge_request_microphone_authorization() -> bool;
    fn speech_bridge_check_speech_authorization() -> bool;
    fn speech_bridge_request_speech_authorization() -> bool;
    fn speech_bridge_start(
        callback: extern "C" fn(*const c_char, *const c_char, *mut c_void),
        user_data: *mut c_void,
    );
    fn speech_bridge_stop();
}

#[cfg(target_os = "macos")]
extern "C" fn native_speech_callback(
    event_type: *const c_char,
    text: *const c_char,
    _user_data: *mut c_void,
) {
    let Some(app) = APP_HANDLE.get() else {
        return;
    };

    let event_type = unsafe { CStr::from_ptr(event_type) }
        .to_string_lossy()
        .to_string();
    let text = unsafe { CStr::from_ptr(text) }
        .to_string_lossy()
        .to_string();

    let event_name = match event_type.as_str() {
        "started" => NATIVE_STARTED_EVENT,
        "partial" => NATIVE_PARTIAL_EVENT,
        "final" => NATIVE_FINAL_EVENT,
        "error" => NATIVE_ERROR_EVENT,
        _ => return,
    };

    if event_type == "error" {
        eprintln!("[iterate-speech] native speech error: {text}");
    }

    let _ = app.emit(
        event_name,
        SpeechBridgePayload {
            text,
        },
    );
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{TogglePayload, GLOBAL_SHORTCUT, TOGGLE_EVENT};
    use cocoa::base::{id, nil, BOOL, YES};
    use cocoa::foundation::{NSString, NSUInteger};
    use core_foundation::runloop::CFRunLoop;
    use core_graphics::event::{
        CallbackResult, CGEvent, CGEventFlags, CGEventTap, CGEventTapLocation,
        CGEventTapOptions, CGEventTapPlacement, CGEventType, CGKeyCode, EventField,
    };
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
    use objc::{class, msg_send, sel, sel_impl};
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use std::process::Command;
    use std::thread;
    use std::time::Duration;
    use tauri::{AppHandle, Emitter, Manager};

    const KEY_CODE_V: CGKeyCode = 9;
    const KEY_CODE_FN: CGKeyCode = 63;

    pub fn simulate_paste() -> Result<(), String> {
        let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState)
            .map_err(|_| "failed to create macOS event source")?;

        let key_down = CGEvent::new_keyboard_event(source.clone(), KEY_CODE_V, true)
            .map_err(|_| "failed to create Cmd+V key down event")?;
        key_down.set_flags(CGEventFlags::CGEventFlagCommand);

        let key_up = CGEvent::new_keyboard_event(source, KEY_CODE_V, false)
            .map_err(|_| "failed to create Cmd+V key up event")?;
        key_up.set_flags(CGEventFlags::CGEventFlagCommand);

        // 与 ClipBook / PAT-2026-077 一致：AnnotatedSession 比 HID 更易被前台文本框接收
        key_down.post(CGEventTapLocation::AnnotatedSession);
        key_up.post(CGEventTapLocation::AnnotatedSession);
        thread::sleep(Duration::from_millis(60));

        Ok(())
    }

    pub fn check_accessibility_permission() -> bool {
        #[link(name = "ApplicationServices", kind = "framework")]
        unsafe extern "C" {
            fn AXIsProcessTrusted() -> bool;
        }

        unsafe { AXIsProcessTrusted() }
    }

    pub fn open_accessibility_settings() -> Result<(), String> {
        const CANDIDATES: &[&str] = &[
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
            "x-apple.systempreferences:com.apple.settings.extensions.PrivacySecurity.extension?Privacy_Accessibility",
        ];
        for url in CANDIDATES {
            if Command::new("open")
                .arg(url)
                .status()
                .map(|status| status.success())
                .unwrap_or(false)
            {
                return Ok(());
            }
        }
        Command::new("open")
            .args(["-a", "System Settings"])
            .status()
            .map_err(|error| format!("failed to open System Settings: {error}"))?;
        Ok(())
    }

    pub fn check_input_monitoring_permission() -> bool {
        #[link(name = "ApplicationServices", kind = "framework")]
        unsafe extern "C" {
            fn CGPreflightListenEventAccess() -> bool;
        }

        unsafe { CGPreflightListenEventAccess() }
    }

    pub fn request_input_monitoring_permission() -> Result<(), String> {
        #[link(name = "ApplicationServices", kind = "framework")]
        unsafe extern "C" {
            fn CGRequestListenEventAccess() -> bool;
        }

        let _ = unsafe { CGRequestListenEventAccess() };
        Ok(())
    }

    pub fn frontmost_app_bundle_id() -> Result<String, String> {
        let output = Command::new("osascript")
            .args([
                "-e",
                "tell application \"System Events\" to get bundle identifier of first application process whose frontmost is true",
            ])
            .output()
            .map_err(|error| format!("failed to query frontmost macOS app: {error}"))?;

        if !output.status.success() {
            return Err("osascript returned a non-zero exit code while reading frontmost app".to_string());
        }

        let bundle_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if bundle_id.is_empty() {
            Err("frontmost macOS app bundle identifier is empty".to_string())
        } else {
            Ok(bundle_id)
        }
    }

    pub fn activate_app(bundle_id: &str) -> Result<(), String> {
        unsafe {
            let ns_bundle_id = NSString::alloc(nil).init_str(bundle_id);
            let running_apps: id =
                msg_send![class!(NSRunningApplication), runningApplicationsWithBundleIdentifier: ns_bundle_id];
            let count: NSUInteger = msg_send![running_apps, count];

            if count > 0 {
                let target_app: id = msg_send![running_apps, objectAtIndex: 0];
                // NSApplicationActivateIgnoringOtherApps = 1 << 1 = 2
                let activated: BOOL = msg_send![target_app, activateWithOptions: 2usize];
                if activated == YES {
                    return Ok(());
                }
                eprintln!(
                    "[iterate-speech] native activateWithOptions returned false bundle_id={bundle_id}, fallback to osascript"
                );
            } else {
                eprintln!(
                    "[iterate-speech] NSRunningApplication not found for bundle_id={bundle_id}, fallback to osascript"
                );
            }
        }

        let script = format!("tell application id \"{bundle_id}\" to activate");
        let status = Command::new("osascript")
            .args(["-e", &script])
            .status()
            .map_err(|error| format!("failed to activate macOS app {bundle_id}: {error}"))?;

        if !status.success() {
            return Err(format!(
                "activating macOS app {bundle_id} returned a non-zero exit code"
            ));
        }

        Ok(())
    }

    pub fn wait_frontmost_bundle(target_bundle_id: &str, timeout_ms: u64) -> Result<bool, String> {
        let start = std::time::Instant::now();
        loop {
            if frontmost_app_bundle_id()? == target_bundle_id {
                return Ok(true);
            }
            if start.elapsed() >= Duration::from_millis(timeout_ms) {
                return Ok(false);
            }
            thread::sleep(Duration::from_millis(60));
        }
    }

    pub fn start_fn_listener(app: AppHandle) {
        thread::spawn(move || {
            let fn_down = Arc::new(AtomicBool::new(false));
            let tap_app = app.clone();
            let tap_state = fn_down.clone();

            let result = CGEventTap::with_enabled(
                CGEventTapLocation::HID,
                CGEventTapPlacement::HeadInsertEventTap,
                CGEventTapOptions::ListenOnly,
                vec![CGEventType::FlagsChanged],
                move |_proxy, event_type, event| {
                    if !matches!(event_type, CGEventType::FlagsChanged) {
                        return CallbackResult::Keep;
                    }

                    let keycode =
                        event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE) as CGKeyCode;
                    if keycode != KEY_CODE_FN {
                        return CallbackResult::Keep;
                    }

                    let pressed = event
                        .get_flags()
                        .contains(CGEventFlags::CGEventFlagSecondaryFn);

                    if pressed {
                        if !tap_state.swap(true, Ordering::SeqCst) {
                            eprintln!("[iterate-speech] Fn toggle received");
                            let app_for_toggle = tap_app.clone();

                            if let Err(error) = super::capture_frontmost_target_app() {
                                eprintln!(
                                    "[iterate-speech] capture frontmost before overlay failed: {error}"
                                );
                            }

                            if let Some(window) = tap_app.get_webview_window("overlay") {
                                super::reveal_overlay_anchor(&window);
                            }

                            thread::spawn(move || {
                                thread::sleep(Duration::from_millis(220));
                                let _ = app_for_toggle.emit(
                                    TOGGLE_EVENT,
                                    TogglePayload {
                                        shortcut: GLOBAL_SHORTCUT,
                                        skip_target_capture: true,
                                    },
                                );
                            });
                        }
                    } else {
                        tap_state.store(false, Ordering::SeqCst);
                    }

                    CallbackResult::Keep
                },
                CFRunLoop::run_current,
            );

            if result.is_err() {
                eprintln!("[iterate-speech] failed to install Fn listener");
            }
        });
    }
}

#[tauri::command]
fn accessibility_status() -> bool {
    #[cfg(target_os = "macos")]
    {
        macos::check_accessibility_permission()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
fn input_monitoring_status() -> bool {
    #[cfg(target_os = "macos")]
    {
        macos::check_input_monitoring_permission()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
fn microphone_status() -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        speech_bridge_check_microphone_authorization()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
fn speech_recognition_status() -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        speech_bridge_check_speech_authorization()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
fn request_accessibility_permission() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // Native trust dialog (includes “Open System Settings”) — works when deep links fail on newer macOS.
        unsafe {
            iterate_prompt_accessibility_trusted_dialog();
        }
        let _ = macos::open_accessibility_settings();
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

#[tauri::command]
fn request_microphone_permission() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    unsafe {
        Ok(speech_bridge_request_microphone_authorization())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true)
    }
}

#[tauri::command]
fn request_speech_recognition_permission() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    unsafe {
        Ok(speech_bridge_request_speech_authorization())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true)
    }
}

#[tauri::command]
fn request_input_monitoring_permission() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos::request_input_monitoring_permission()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

#[tauri::command]
fn paste_text(text: String, app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let stored_target = last_target_app_bundle_id()
            .lock()
            .map_err(|_| "failed to lock target app bundle id store".to_string())?
            .clone();

        let previous = app.clipboard().read_text().ok();

        app.clipboard()
            .write_text(&text)
            .map_err(|error| format!("failed to write transcript to clipboard: {error}"))?;

        match stored_target {
            Some(bundle_id) if bundle_id != OWN_BUNDLE_ID => {
                eprintln!(
                    "[iterate-speech] paste_text target_bundle={bundle_id} chars={}",
                    text.chars().count()
                );
                macos::activate_app(&bundle_id)?;
                let switched = macos::wait_frontmost_bundle(&bundle_id, 1200)?;
                if !switched {
                    eprintln!(
                        "[iterate-speech] paste_text activate not frontmost yet, retry target_bundle={bundle_id}"
                    );
                    macos::activate_app(&bundle_id)?;
                    let switched_retry = macos::wait_frontmost_bundle(&bundle_id, 900)?;
                    if !switched_retry {
                        let current = macos::frontmost_app_bundle_id().unwrap_or_else(|_| "<unknown>".to_string());
                        eprintln!(
                            "[iterate-speech] paste_text WARNING frontmost mismatch current={current} expected={bundle_id}"
                        );
                    }
                }
                thread::sleep(Duration::from_millis(180));
            }
            Some(bundle_id) => {
                eprintln!(
                    "[iterate-speech] paste_text skip activate stored is own bundle_id={bundle_id}"
                );
                thread::sleep(Duration::from_millis(120));
            }
            None => {
                eprintln!(
                    "[iterate-speech] paste_text WARNING no stored target; Cmd+V goes to current frontmost (不稳定，建议先在目标输入框按第一次 Fn)"
                );
                thread::sleep(Duration::from_millis(160));
            }
        }

        thread::sleep(Duration::from_millis(90));
        macos::simulate_paste()?;

        if let Some(previous) = previous {
            thread::sleep(Duration::from_millis(120));
            let _ = app.clipboard().write_text(previous);
        }

        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("global paste is only implemented on macOS right now".to_string())
    }
}

fn last_target_app_bundle_id() -> &'static Mutex<Option<String>> {
    LAST_TARGET_APP_BUNDLE_ID.get_or_init(|| Mutex::new(None))
}

/// Records the frontmost app for later `paste_text` activation. Call **before** showing or
/// focusing the overlay so the target is not overwritten by iterate-speech.
fn capture_frontmost_target_app() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let bundle_id = macos::frontmost_app_bundle_id()?;
        if bundle_id == OWN_BUNDLE_ID {
            eprintln!(
                "[iterate-speech] capture_frontmost_target_app skip own bundle_id={bundle_id}"
            );
            return Ok(());
        }

        let mut guard = last_target_app_bundle_id()
            .lock()
            .map_err(|_| "failed to lock target app bundle id store".to_string())?;
        eprintln!("[iterate-speech] capture_frontmost_target_app target={bundle_id}");
        *guard = Some(bundle_id);
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

#[tauri::command]
fn remember_frontmost_app() -> Result<(), String> {
    capture_frontmost_target_app()
}

/// 浮层隐藏、焦点回落后再次采样前台，刷新写回目标（非自家 bundle 才覆盖）。
#[tauri::command]
fn repin_paste_target_from_frontmost() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut bundle_id = macos::frontmost_app_bundle_id()?;
        if bundle_id == OWN_BUNDLE_ID {
            for _ in 0..10 {
                thread::sleep(Duration::from_millis(60));
                bundle_id = macos::frontmost_app_bundle_id()?;
                if bundle_id != OWN_BUNDLE_ID {
                    break;
                }
            }
        }
        if bundle_id == OWN_BUNDLE_ID {
            eprintln!(
                "[iterate-speech] repin_paste_target_from_frontmost skip own bundle_id={bundle_id} (frontmost did not settle)"
            );
            return Ok(());
        }
        let mut guard = last_target_app_bundle_id()
            .lock()
            .map_err(|_| "failed to lock target app bundle id store".to_string())?;
        eprintln!("[iterate-speech] repin_paste_target_from_frontmost target={bundle_id}");
        *guard = Some(bundle_id);
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

#[tauri::command]
fn start_native_speech() -> Result<(), String> {
    eprintln!("[iterate-speech] start_native_speech invoked");
    #[cfg(target_os = "macos")]
    unsafe {
        // Always tear down any in-flight recognition before starting a new session.
        // Otherwise a later Fn press can leave the UI stuck in "starting" with no native-started.
        speech_bridge_stop();
        speech_bridge_start(native_speech_callback, std::ptr::null_mut());
    }
    Ok(())
}

#[tauri::command]
fn stop_native_speech() -> Result<(), String> {
    eprintln!("[iterate-speech] stop_native_speech invoked");
    #[cfg(target_os = "macos")]
    unsafe {
        speech_bridge_stop();
    }
    Ok(())
}

#[tauri::command]
fn debug_log(message: String) {
    eprintln!("[iterate-speech][web] {message}");
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    reveal_main_window(&app)
}

#[tauri::command]
fn reveal_overlay_window(app: tauri::AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("overlay") else {
        return Err("overlay window not found".to_string());
    };

    reveal_overlay_anchor(&window);
    Ok(())
}

fn reveal_overlay_anchor(window: &tauri::WebviewWindow) {
    let window = window.clone();
    let window_for_main_thread = window.clone();
    let _ = window.run_on_main_thread(move || {
        let _ = window_for_main_thread.set_always_on_top(true);
        let _ = window_for_main_thread.set_visible_on_all_workspaces(true);
        let _ = window_for_main_thread.set_skip_taskbar(true);
        let _ = window_for_main_thread.set_size(Size::Logical(LogicalSize::new(
            ANCHOR_WIDTH,
            ANCHOR_HEIGHT,
        )));

        if let Some(app) = APP_HANDLE.get() {
            if let Some(saved) = read_saved_overlay_position(app) {
                let _ = window_for_main_thread.set_position(Position::Physical(saved));
            } else if let Ok(Some(monitor)) = window_for_main_thread.current_monitor() {
                let monitor_size = monitor.size();
                let scale_factor = monitor.scale_factor();
                let x = ((monitor_size.width as f64 - ANCHOR_WIDTH * scale_factor) / 2.0).round() as i32;
                let y = (monitor_size.height as f64
                    - ANCHOR_HEIGHT * scale_factor
                    - ANCHOR_BOTTOM_MARGIN * scale_factor)
                    .round() as i32;
                let _ = window_for_main_thread
                    .set_position(Position::Physical(PhysicalPosition::new(x, y)));
            }
        }

        eprintln!("[iterate-speech] revealing bottom anchor");
        let _ = window_for_main_thread.unminimize();
        let _ = window_for_main_thread.show();
        let _ = window_for_main_thread.set_focus();
    });
}

fn trigger_overlay_toggle(app: &tauri::AppHandle) {
    let _ = capture_frontmost_target_app()
        .map_err(|e| eprintln!("[iterate-speech] capture frontmost (trigger_overlay_toggle): {e}"));
    if let Some(window) = app.get_webview_window("overlay") {
        reveal_overlay_anchor(&window);
    }

    let app_for_toggle = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(220));
        let _ = app_for_toggle.emit(
            TOGGLE_EVENT,
            TogglePayload {
                shortcut: GLOBAL_SHORTCUT,
                skip_target_capture: true,
            },
        );
    });
}

fn ensure_overlay_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    if app.get_webview_window("overlay").is_some() {
        return Ok(());
    }

    let Some(config) = app.config().app.windows.iter().find(|window| window.label == "overlay") else {
        return Ok(());
    };

    WebviewWindowBuilder::from_config(app, config)?.build()?;

    Ok(())
}

fn reveal_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Err("main window not found".to_string());
    };

    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

fn install_main_window_close_guard(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let event_window = window.clone();
        let hide_window = window.clone();
        event_window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = hide_window.hide();
            }
        });
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            eprintln!("[iterate-speech] app setup begin");
            let _ = APP_HANDLE.set(app.handle().clone());
            ensure_overlay_window(&app.handle())?;
            if let Some(overlay) = app.get_webview_window("overlay") {
                install_overlay_position_persistence(&overlay, app.handle().clone());
            }
            install_main_window_close_guard(&app.handle());
            // Creating the overlay webview can leave the main window de-emphasized; force it
            // forward so first launch reliably shows the permission hub.
            let _ = reveal_main_window(&app.handle());
            eprintln!("[iterate-speech] app setup complete");

            #[cfg(target_os = "macos")]
            macos::start_fn_listener(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            accessibility_status,
            input_monitoring_status,
            microphone_status,
            speech_recognition_status,
            request_accessibility_permission,
            request_microphone_permission,
            request_speech_recognition_permission,
            request_input_monitoring_permission,
            remember_frontmost_app,
            repin_paste_target_from_frontmost,
            show_main_window,
            reveal_overlay_window,
            start_native_speech,
            stop_native_speech,
            debug_log,
            paste_text
        ])
        .run(tauri::generate_context!())
        .expect("failed to run iterate-speech");
}
