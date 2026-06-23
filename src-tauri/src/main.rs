// Roxys Admin — desktop shell. The agency's master list is a JSON file the user
// keeps in a Google Drive / OneDrive synced folder; these commands read and write
// that user-chosen path (and dated backups) with plain std::fs, so there is no
// path-scope restriction and no data ever leaves the computer.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::Path;

/// Does a file exist at this absolute path?
#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// Read a UTF-8 text file (the master JSON). Returns the file's contents.
#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Write a UTF-8 text file, creating parent folders if needed.
#[tauri::command]
fn write_text(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Write a dated backup snapshot into the user-chosen backup `folder` (created
/// if needed). `stamp` is a caller-supplied YYYYMMDD-HHMMSS string. Returns the
/// backup path.
#[tauri::command]
fn write_backup(folder: String, contents: String, stamp: String) -> Result<String, String> {
    let dir = Path::new(&folder);
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let dest = dir.join(format!("roxys-master-{}.json", stamp));
    fs::write(&dest, &contents).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

/// Save a generated document into `<folder>/<subfolder>/<filename>` (creating
/// the subfolder if needed). Returns the full path it was written to.
#[tauri::command]
fn save_document(folder: String, subfolder: String, filename: String, contents: String) -> Result<String, String> {
    let dir = Path::new(&folder).join(&subfolder);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join(&filename);
    fs::write(&dest, contents).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            path_exists,
            read_text,
            write_text,
            write_backup,
            save_document
        ])
        .run(tauri::generate_context!())
        .expect("error while running Roxys Admin");
}
