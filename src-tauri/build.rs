fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=src/macos_speech_bridge.m");
        println!("cargo:rerun-if-changed=src/macos_accessibility_prompt.m");
        cc::Build::new()
            .file("src/macos_speech_bridge.m")
            .flag("-fobjc-arc")
            .compile("macos_speech_bridge");
        cc::Build::new()
            .file("src/macos_accessibility_prompt.m")
            .flag("-fobjc-arc")
            .compile("macos_accessibility_prompt");

        println!("cargo:rustc-link-lib=framework=AVFoundation");
        println!("cargo:rustc-link-lib=framework=Speech");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=ApplicationServices");
    }

    tauri_build::build()
}
