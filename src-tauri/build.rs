fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=src/macos_speech_bridge.m");
        cc::Build::new()
            .file("src/macos_speech_bridge.m")
            .flag("-fobjc-arc")
            .compile("macos_speech_bridge");

        println!("cargo:rustc-link-lib=framework=AVFoundation");
        println!("cargo:rustc-link-lib=framework=Speech");
        println!("cargo:rustc-link-lib=framework=Foundation");
    }

    tauri_build::build()
}
