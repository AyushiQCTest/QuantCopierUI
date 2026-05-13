#[cfg_attr(mobile, tauri::mobile_entry_point)]
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use std::process::Command;
use sysinfo::{System, ProcessesToUpdate};
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;
const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x00000200;

#[tauri::command]
fn toggle_fullscreen(window: tauri::Window) {
    if let Ok(is_fullscreen) = window.is_fullscreen() {
        window.set_fullscreen(!is_fullscreen).unwrap();
    }
}

#[tauri::command]
fn get_project_dir() -> String {
    std::env::current_dir()
        .unwrap_or_else(|_| ".".into())
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
fn check_telegram_process() -> bool {
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    
    for process in sys.processes().values() {
        if process.name().eq_ignore_ascii_case("QuantCopierTelegram.exe") {
            return true;
        }
    }
    false
}

#[tauri::command]
async fn launch_telegram_detached(app_handle: tauri::AppHandle) -> Result<(), String> {
    let resource_path = app_handle.path().resource_dir().map_err(|e| e.to_string())?;
    
    // Construct path to binaries/QuantCopierTelegram.exe
    let mut exe_path = resource_path.join("binaries").join("QuantCopierTelegram.exe");
    
    // If not found in binaries, check root
    if !exe_path.exists() {
         exe_path = resource_path.join("QuantCopierTelegram.exe");
    }
    
    println!("[tauri] Launching detached: {:?}", exe_path);

    let cmd_name = if exe_path.exists() {
         exe_path.to_string_lossy().to_string()
    } else {
        "binaries/QuantCopierTelegram.exe".to_string()
    };
    
    println!("[tauri] Final command path: {}", cmd_name);

    match Command::new(cmd_name)
        .creation_flags(CREATE_NO_WINDOW | CREATE_BREAKAWAY_FROM_JOB) 
        .spawn() {
            Ok(_) => Ok(()),
            Err(e) => {
                 // Try one more time without "binaries/" prefix if it failed, just in case
                 if let Ok(_) = Command::new("QuantCopierTelegram.exe")
                    .creation_flags(CREATE_NO_WINDOW | CREATE_BREAKAWAY_FROM_JOB)
                    .spawn() {
                        return Ok(());
                    }
                 Err(format!("Failed to launch detached: {}", e))
            }
        }
}

fn spawn_sidecar(app_handle: tauri::AppHandle) -> Result<(), String> {
    println!("[tauri] Attempting to spawn sidecar process...");
    
    // Check if a sidecar process already exists
    if let Some(state) = app_handle.try_state::<Arc<Mutex<Option<CommandChild>>>>() {
        let child_process = state.lock().unwrap();
        if child_process.is_some() {
            println!("[tauri] Sidecar is already running. Skipping spawn.");
            return Ok(());
        }
    }

    // Kill any existing QuantCopierAPI processes before starting new one
    #[cfg(windows)]
    {
        println!("[tauri] Attempting to kill any existing QuantCopierAPI processes...");
        match Command::new("taskkill")
            .args(["/F", "/IM", "QuantCopierAPI.exe"])
            .output() {
                Ok(_) => println!("[tauri] Successfully killed existing processes"),
                Err(e) => println!("[tauri] No existing processes found or error killing them: {}", e),
        };
    }

    // Spawn sidecar
    println!("[tauri] Creating sidecar command...");
    let sidecar_command = match app_handle.shell().sidecar("QuantCopierAPI") {
        Ok(cmd) => cmd,
        Err(e) => {
            let err_msg = format!("[tauri] Failed to create sidecar command: {}", e);
            eprintln!("{}", err_msg);
            return Err(err_msg);
        }
    };
    
    println!("[tauri] Spawning sidecar process...");
    let (mut rx, child) = match sidecar_command.spawn() {
        Ok((rx, child)) => {
            println!("[tauri] Successfully spawned sidecar process");
            (rx, child)
        },
        Err(e) => {
            let err_msg = format!("[tauri] Failed to spawn sidecar process: {}", e);
            eprintln!("{}", err_msg);
            return Err(err_msg);
        }
    };
    
    // Store the child process in the app state
    if let Some(state) = app_handle.try_state::<Arc<Mutex<Option<CommandChild>>>>() {
        *state.lock().unwrap() = Some(child);
        println!("[tauri] Successfully stored child process in app state");
    } else {
        return Err("[tauri] Failed to access app state".to_string());
    }

    // Handle sidecar communication
    tauri::async_runtime::spawn(async move {
        println!("[tauri] Starting sidecar communication handler");
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    println!("[sidecar] stdout: {}", line);
                    if let Err(e) = app_handle.emit("sidecar-stdout", line.to_string()) {
                        eprintln!("[tauri] Failed to emit sidecar stdout event: {}", e);
                    }
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    eprintln!("[sidecar] stderr: {}", line);
                    if let Err(e) = app_handle.emit("sidecar-stderr", line.to_string()) {
                        eprintln!("[tauri] Failed to emit sidecar stderr event: {}", e);
                    }
                }
                CommandEvent::Error(err) => {
                    eprintln!("[sidecar] error: {}", err);
                    if let Err(e) = app_handle.emit("sidecar-error", err.to_string()) {
                        eprintln!("[tauri] Failed to emit sidecar error event: {}", e);
                    }
                }
                CommandEvent::Terminated(status) => {
                    println!("[sidecar] process terminated with status: {:?}", status);
                    if let Err(e) = app_handle.emit("sidecar-terminated", format!("{:?}", status)) {
                        eprintln!("[tauri] Failed to emit sidecar terminated event: {}", e);
                    }
                }
                _ => {}
            }
        }
        println!("[tauri] Sidecar communication handler ended");
    });

    println!("[tauri] Sidecar setup completed successfully");
    Ok(())
}

pub fn run() {
    println!("[tauri] Starting application...");
    
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            println!("[tauri] Setting up application...");
            app.manage(Arc::new(Mutex::new(None::<CommandChild>)));
            let app_handle = app.handle().clone();
            println!("[tauri] Attempting to spawn sidecar...");
            if let Err(e) = spawn_sidecar(app_handle) {
                eprintln!("[tauri] Failed to spawn sidecar: {}", e);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![toggle_fullscreen, get_project_dir, check_telegram_process, launch_telegram_detached])
        .build(tauri::generate_context!())
        .expect("Error while running tauri application")
        .run(|_app_handle, event| match event {
            RunEvent::ExitRequested { .. } => {
                if let Some(child_process) = _app_handle.try_state::<Arc<Mutex<Option<CommandChild>>>>() {
                    if let Ok(mut child) = child_process.lock() {
                        if let Some(process) = child.as_mut() {
                            // Try graceful shutdown first
                            let command = "sidecar shutdown\n";
                            let _ = process.write(command.as_bytes());
                            
                            // Give it a moment to cleanup
                            std::thread::sleep(std::time::Duration::from_millis(500));
                            
                            // Force kill the entire process tree
                            #[cfg(windows)]
                            {
                                let pid = process.pid();
                                let _ = Command::new("taskkill")
                                    .args(["/F", "/T", "/PID", &pid.to_string()])
                                    .output();
                            }
                            
                            println!("[tauri] Sidecar closed.");
                        }
                    }
                }
            }
            _ => {}
        });
}
