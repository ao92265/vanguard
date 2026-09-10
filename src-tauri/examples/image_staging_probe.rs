//! Runs the production attachment service locally and its staging scripts in
//! an isolated Linux container. No SSH credentials, live PTYs or Telegram sends.
#[cfg(unix)]
use std::io::Write;
#[cfg(unix)]
use std::process::{Command, Stdio};
#[cfg(unix)]
use std::sync::Arc;

#[allow(dead_code)]
mod attachments {
    include!("../src/core/session_attachments.rs");

    pub fn linux_script(directory: &str, bytes: usize) -> String {
        let file = format!("{directory}/image.png");
        let upload = upload_script(directory, &file, "probe-owner", bytes);
        let collision = upload.replace('\'', "'\"'\"'");
        let wrong_owner = cleanup_script(directory, &file, "wrong-owner");
        let cleanup = cleanup_script(directory, &file, "probe-owner");
        format!("set -e; {upload}; [ \"$(stat -c %a '{directory}')\" = 700 ]; [ \"$(stat -c %a '{file}')\" = 600 ]; od -An -v -tx1 '{file}'; if sh -c '{collision}' </dev/null 2>/dev/null; then exit 8; fi; {wrong_owner}; test -f '{file}'; {cleanup}; test ! -e '{directory}'")
    }

    pub fn interrupted_script(directory: &str) -> String {
        upload_script(
            directory,
            &format!("{directory}/image.png"),
            "probe-owner",
            20,
        )
    }
}

#[cfg(unix)]
fn linux(script: &str, bytes: &[u8]) -> std::process::Output {
    let mut process = Command::new("docker")
        .args([
            "run",
            "--rm",
            "--pull=never",
            "--network",
            "none",
            "--read-only",
            "--user",
            "65534:65534",
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,noexec,size=16m,mode=1777",
            "-i",
            "ubuntu:24.04",
            "sh",
            "-c",
            script,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("Docker must be running with ubuntu:24.04 already present");
    process.stdin.take().unwrap().write_all(bytes).unwrap();
    process.wait_with_output().unwrap()
}

#[tokio::main]
#[cfg(unix)]
async fn main() {
    use std::os::unix::fs::PermissionsExt;
    let bytes = include_bytes!("../icons/32x32.png");
    let service = Arc::new(attachments::SessionAttachmentService::default());
    let image = service.save(1, bytes, "image/png").await.unwrap();
    let file = std::path::Path::new(&image.path);
    let directory = file.parent().unwrap().to_path_buf();
    assert_eq!(std::fs::read(file).unwrap(), bytes);
    assert_eq!(
        std::fs::metadata(file).unwrap().permissions().mode() & 0o777,
        0o600
    );
    assert_eq!(
        std::fs::metadata(&directory).unwrap().permissions().mode() & 0o777,
        0o700
    );
    service.close(1).await;
    assert!(
        !directory.exists(),
        "session close must remove local staging"
    );
    println!("PASS: local production service preserves bytes, sets 0700/0600 and cleans up");

    let directory = format!("/tmp/maestro-image-probe-{}", uuid::Uuid::new_v4());
    let output = linux(&attachments::linux_script(&directory, bytes.len()), bytes);
    assert!(
        output.status.success(),
        "Linux staging failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let actual: String = String::from_utf8(output.stdout)
        .unwrap()
        .split_whitespace()
        .collect();
    let expected: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    assert_eq!(actual, expected, "Linux staging changed binary bytes");
    let interrupted = linux(&attachments::interrupted_script(&directory), &[]);
    assert_eq!(
        interrupted.status.code(),
        Some(1),
        "empty transfer must fail"
    );
    println!("PASS: Linux production scripts preserve bytes, set 0700/0600, reject collisions and truncation, enforce ownership and clean up");
    println!("NOT TESTED: SSH transport, real clipboard UI or Telegram photo delivery");
}

#[cfg(not(unix))]
fn main() {
    eprintln!("This staging probe requires a Unix host for POSIX permission checks.");
    std::process::exit(2);
}
