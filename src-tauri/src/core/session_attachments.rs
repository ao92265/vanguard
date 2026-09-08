use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

pub const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const RETENTION: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Clone, Default, PartialEq)]
struct Target {
    ssh: Option<String>,
    generation: u64,
}

pub struct Attachment {
    pub path: String,
    session_id: u32,
    directory: String,
    target: Target,
    owner: String,
    created_at: Instant,
    cleanup_requested: AtomicBool,
}

impl Attachment {
    /// The SSH destination this image was staged on, or `None` for this machine.
    ///
    /// Taken from the target snapshot `save` made, so it answers where the file
    /// went, not where the session is pointed now.
    pub fn destination(&self) -> Option<String> {
        self.target.ssh.clone()
    }
}

pub struct SessionAttachmentService {
    targets: Mutex<HashMap<u32, Arc<Mutex<Target>>>>,
    files: Mutex<HashMap<String, Arc<Attachment>>>,
    uploads: tokio::sync::Semaphore,
    cleanups: tokio::sync::Semaphore,
}

impl Default for SessionAttachmentService {
    fn default() -> Self {
        Self {
            targets: Mutex::new(HashMap::new()),
            files: Mutex::new(HashMap::new()),
            uploads: tokio::sync::Semaphore::new(2),
            cleanups: tokio::sync::Semaphore::new(2),
        }
    }
}

impl SessionAttachmentService {
    fn target_state(&self, id: u32) -> Arc<Mutex<Target>> {
        self.targets.lock().unwrap().entry(id).or_default().clone()
    }

    pub fn set_target(&self, id: u32, target: Option<String>) -> Result<(), String> {
        if let Some(ref host) = target {
            if host.is_empty()
                || host.len() > 253
                || host.starts_with('-')
                || !host
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"._-@".contains(&b))
                || host.split('@').count() > 2
                || host.split('@').any(str::is_empty)
            {
                return Err("Use an SSH config alias or user@host, without options".into());
            }
        }
        let state = self.target_state(id);
        let mut previous = state.lock().map_err(|_| "Image target lock failed")?;
        previous.generation += 1;
        previous.ssh = target;
        Ok(())
    }

    pub fn target(&self, id: u32) -> Option<String> {
        self.target_state(id).lock().unwrap().ssh.clone()
    }

    pub async fn save(
        self: &Arc<Self>,
        id: u32,
        data: &[u8],
        media_type: &str,
    ) -> Result<Arc<Attachment>, String> {
        let _permit = self
            .uploads
            .try_acquire()
            .map_err(|_| "Another image is uploading; try again")?;
        if self.files.lock().unwrap().len() >= 128 {
            return Err("Too many retained images; close an old session".into());
        }
        let extension = image_extension(data, media_type)?;
        let target = self.target_state(id).lock().unwrap().clone();
        let name = format!("maestro-image-{}", uuid::Uuid::new_v4());
        let directory = if target.ssh.is_some() {
            format!("/tmp/{name}")
        } else {
            std::env::temp_dir()
                .join(name)
                .to_string_lossy()
                .into_owned()
        };
        let attachment = Arc::new(Attachment {
            session_id: id,
            path: format!("{directory}/image.{extension}"),
            directory,
            target,
            owner: uuid::Uuid::new_v4().to_string(),
            created_at: Instant::now(),
            cleanup_requested: AtomicBool::new(false),
        });
        if attachment.path.chars().any(char::is_control) {
            return Err("Temporary image path contains control characters".into());
        }
        let result = if let Some(host) = &attachment.target.ssh {
            // Only generated paths reach this script. SSH options and host-key policy are fixed.
            let script = upload_script(
                &attachment.directory,
                &attachment.path,
                &attachment.owner,
                data.len(),
            );
            ssh(host, &script, data).await
        } else {
            write_private_image(&attachment, data).await
        };
        if let Err(error) = result {
            if attachment.target.ssh.is_some() {
                self.track(attachment.clone());
                self.remove(&attachment.path).await;
            }
            return Err(error);
        }
        self.track(attachment.clone());
        if self.with_current(id, &attachment, |_| Ok(())).is_err() {
            self.remove(&attachment.path).await;
            return Err("Image destination changed during upload; try again".into());
        }
        Ok(attachment)
    }

    fn track(self: &Arc<Self>, attachment: Arc<Attachment>) {
        self.files
            .lock()
            .unwrap()
            .insert(attachment.path.clone(), attachment.clone());
        let service = Arc::downgrade(self);
        let path = attachment.path.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(60)).await;
                let Some(service) = service.upgrade() else {
                    break;
                };
                let file = service.files.lock().unwrap().get(&path).cloned();
                let Some(file) = file else {
                    break;
                };
                if file.created_at.elapsed() >= RETENTION
                    || file.cleanup_requested.load(Ordering::Relaxed)
                {
                    service.remove(&path).await;
                }
            }
        });
    }

    pub fn with_current<T>(
        &self,
        id: u32,
        attachment: &Attachment,
        deliver: impl FnOnce(&str) -> Result<T, String>,
    ) -> Result<T, String> {
        let state = self.target_state(id);
        let target = state.lock().map_err(|_| "Image target lock failed")?;
        if *target != attachment.target {
            return Err("Image destination changed during upload; try again".into());
        }
        deliver(&attachment.path)
    }

    pub async fn remove(&self, path: &str) {
        let file = self.files.lock().unwrap().get(path).cloned();
        if let Some(file) = file {
            file.cleanup_requested.store(true, Ordering::Relaxed);
            let _permit = self.cleanups.acquire().await;
            if cleanup(&file).await.is_ok() {
                self.files.lock().unwrap().remove(path);
            } else {
                log::warn!("Image cleanup failed; retained for retry while Maestro is running");
            }
        }
    }

    pub async fn close(&self, id: u32) {
        // Increment rather than remove: an in-flight upload must not match the default again.
        let _ = self.set_target(id, None);
        let paths: Vec<String> = self
            .files
            .lock()
            .unwrap()
            .values()
            .filter(|file| file.session_id == id)
            .map(|file| file.path.clone())
            .collect();
        for path in paths {
            self.remove(&path).await;
        }
    }
}

pub fn image_extension(data: &[u8], media_type: &str) -> Result<&'static str, String> {
    if data.is_empty() || data.len() > MAX_IMAGE_BYTES {
        return Err("Image must be between 1 byte and 10 MiB".into());
    }
    match media_type {
        "image/png" if data.len() >= 24 && data.starts_with(b"\x89PNG\r\n\x1a\n") => Ok("png"),
        "image/jpeg" if data.len() >= 4 && data.starts_with(b"\xff\xd8\xff") => Ok("jpg"),
        "image/gif"
            if data.len() >= 10 && (data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a")) =>
        {
            Ok("gif")
        }
        "image/webp"
            if data.len() >= 16 && data.starts_with(b"RIFF") && &data[8..12] == b"WEBP" =>
        {
            Ok("webp")
        }
        _ => Err("Unsupported image content or mismatched image type".into()),
    }
}

async fn write_private_image(attachment: &Attachment, data: &[u8]) -> Result<(), String> {
    let mut builder = std::fs::DirBuilder::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder
        .create(&attachment.directory)
        .map_err(|e| e.to_string())?;
    let mut options = tokio::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let result = async {
        let mut file = options
            .open(&attachment.path)
            .await
            .map_err(|e| e.to_string())?;
        file.write_all(data).await.map_err(|e| e.to_string())?;
        file.flush().await.map_err(|e| e.to_string())
    }
    .await;
    if result.is_err() {
        let _ = cleanup(attachment).await;
    }
    result
}

fn upload_script(directory: &str, file: &str, owner: &str, expected_bytes: usize) -> String {
    format!("umask 077; mkdir '{directory}' || exit 1; trap 'rm -f {file} {directory}/.owner; rmdir {directory}' EXIT HUP INT TERM; printf '%s\\n' '{owner}' > '{directory}/.owner' || exit 1; cat > '{file}' || exit 1; [ \"$(wc -c < '{file}')\" -eq {expected_bytes} ] || exit 1; trap - EXIT HUP INT TERM")
}

fn cleanup_script(directory: &str, file: &str, owner: &str) -> String {
    format!("if [ -d '{directory}' ] && [ ! -L '{directory}' ] && IFS= read -r owner < '{directory}/.owner' && [ \"$owner\" = '{owner}' ]; then rm -f '{file}' '{directory}/.owner' && rmdir '{directory}'; fi")
}

async fn ssh(host: &str, script: &str, data: &[u8]) -> Result<(), String> {
    let mut child = Command::new("ssh")
        .args([
            "-T",
            "-oBatchMode=yes",
            "-oStrictHostKeyChecking=yes",
            "-oConnectTimeout=10",
            "--",
            host,
            script,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Could not start SSH: {e}"))?;
    let transfer = async {
        let mut stdin = child.stdin.take().ok_or("SSH input unavailable")?;
        stdin
            .write_all(data)
            .await
            .map_err(|_| "SSH image upload failed")?;
        drop(stdin);
        let status = child.wait().await.map_err(|_| "SSH image upload failed")?;
        if status.success() {
            Ok(())
        } else {
            Err("SSH image upload failed; check the target and key authentication".into())
        }
    };
    tokio::time::timeout(Duration::from_secs(30), transfer)
        .await
        .map_err(|_| "SSH image upload timed out".to_string())?
}

async fn cleanup(attachment: &Attachment) -> Result<(), String> {
    if let Some(host) = &attachment.target.ssh {
        let script = cleanup_script(&attachment.directory, &attachment.path, &attachment.owner);
        ssh(host, &script, &[]).await
    } else {
        for result in [
            tokio::fs::remove_file(&attachment.path).await,
            tokio::fs::remove_dir(PathBuf::from(&attachment.directory)).await,
        ] {
            if let Err(error) = result {
                if error.kind() != std::io::ErrorKind::NotFound {
                    return Err(error.to_string());
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_ssh_options_and_shell_syntax_as_destinations() {
        let service = SessionAttachmentService::default();
        for target in [
            "-oProxyCommand=touch /tmp/oops",
            "host;id",
            "host\nother",
            "",
            "user@",
        ] {
            assert!(
                service.set_target(1, Some(target.into())).is_err(),
                "accepted {target:?}"
            );
        }
        assert!(service.set_target(1, Some("build-box".into())).is_ok());
        assert!(service
            .set_target(1, Some("alex@linux.example".into()))
            .is_ok());
        assert!(service.set_target(1, None).is_ok());
    }

    #[tokio::test]
    async fn local_image_is_private_and_stale_destinations_cannot_receive_it() {
        let service = Arc::new(SessionAttachmentService::default());
        let bytes = b"\xff\xd8\xff\xd9";
        let image = service.save(1, bytes, "image/jpeg").await.unwrap();
        assert_eq!(tokio::fs::read(&image.path).await.unwrap(), bytes);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&image.path).unwrap().permissions().mode() & 0o777,
                0o600
            );
            assert_eq!(
                std::fs::metadata(&image.directory)
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o700
            );
        }
        service.set_target(1, Some("linux".into())).unwrap();
        let mut delivered = false;
        assert!(service
            .with_current(1, &image, |_| {
                delivered = true;
                Ok(())
            })
            .is_err());
        assert!(!delivered);
        service.remove(&image.path).await;
        assert!(!std::path::Path::new(&image.directory).exists());
    }

    #[test]
    fn rejects_empty_oversized_and_mislabelled_images() {
        assert!(image_extension(&[], "image/png").is_err());
        assert!(image_extension(&vec![0; MAX_IMAGE_BYTES + 1], "image/png").is_err());
        assert!(image_extension(b"<svg></svg>", "image/png").is_err());
        assert!(image_extension(b"\xff\xd8\xff\xd9", "image/png").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn remote_upload_does_not_accept_an_interrupted_empty_transfer() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("image").to_string_lossy().into_owned();
        let file = format!("{directory}/image.jpg");
        let status = std::process::Command::new("sh")
            .args(["-c", &upload_script(&directory, &file, "test-owner", 4)])
            .stdin(Stdio::null())
            .status()
            .unwrap();
        assert!(
            !status.success(),
            "an interrupted upload must not be accepted"
        );
        assert!(!std::path::Path::new(&directory).exists());
    }

    #[tokio::test]
    async fn failed_cleanup_stays_tracked_without_deleting_unrelated_files() {
        let service = Arc::new(SessionAttachmentService::default());
        let image = service
            .save(1, b"\xff\xd8\xff\xd9", "image/jpeg")
            .await
            .unwrap();
        let unrelated = std::path::Path::new(&image.directory).join("notes.txt");
        std::fs::write(&unrelated, "keep").unwrap();
        service.remove(&image.path).await;
        assert!(service.files.lock().unwrap().contains_key(&image.path));
        assert_eq!(std::fs::read_to_string(&unrelated).unwrap(), "keep");
        std::fs::remove_file(unrelated).unwrap();
        service.remove(&image.path).await;
        assert!(!service.files.lock().unwrap().contains_key(&image.path));
        assert!(!std::path::Path::new(&image.directory).exists());
    }

    #[test]
    fn slow_delivery_does_not_lock_other_sessions() {
        let service = Arc::new(SessionAttachmentService::default());
        let image = Attachment {
            path: "/tmp/image.jpg".into(),
            directory: "/tmp".into(),
            target: Target::default(),
            session_id: 1,
            owner: "test-owner".into(),
            created_at: Instant::now(),
            cleanup_requested: AtomicBool::new(false),
        };
        let (entered_tx, entered_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let first = service.clone();
        let writer = std::thread::spawn(move || {
            first.with_current(1, &image, |_| {
                entered_tx.send(()).unwrap();
                release_rx.recv().unwrap();
                Ok(())
            })
        });
        entered_rx.recv().unwrap();
        let (done_tx, done_rx) = std::sync::mpsc::channel();
        let second = service.clone();
        let setter = std::thread::spawn(move || {
            second.set_target(2, Some("linux".into())).unwrap();
            done_tx.send(()).unwrap();
        });
        let other_session_progressed = done_rx.recv_timeout(Duration::from_millis(100));
        release_tx.send(()).unwrap();
        writer.join().unwrap().unwrap();
        setter.join().unwrap();
        assert!(
            other_session_progressed.is_ok(),
            "one PTY blocked a different session"
        );
    }

    #[cfg(unix)]
    #[test]
    fn remote_upload_script_preserves_binary_and_never_clobbers_a_directory() {
        use std::io::Write;
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("image").to_string_lossy().into_owned();
        let file = format!("{directory}/image.jpg");
        let bytes = b"\xff\xd8\xff\x00\n\r\x1b\xd9";
        let script = upload_script(&directory, &file, "test-owner", bytes.len());
        let mut child = std::process::Command::new("sh")
            .args(["-c", &script])
            .stdin(Stdio::piped())
            .spawn()
            .unwrap();
        child.stdin.take().unwrap().write_all(bytes).unwrap();
        assert!(child.wait().unwrap().success());
        assert_eq!(std::fs::read(&file).unwrap(), bytes);
        assert_eq!(
            std::fs::metadata(&file).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert!(!std::process::Command::new("sh")
            .args(["-c", &script])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap()
            .success());
        assert_eq!(std::fs::read(&file).unwrap(), bytes);
        assert!(std::process::Command::new("sh")
            .args(["-c", &cleanup_script(&directory, &file, "wrong-owner")])
            .status()
            .unwrap()
            .success());
        assert_eq!(std::fs::read(&file).unwrap(), bytes);
        assert!(std::process::Command::new("sh")
            .args(["-c", &cleanup_script(&directory, &file, "test-owner")])
            .status()
            .unwrap()
            .success());
        assert!(!std::path::Path::new(&directory).exists());
    }
}
