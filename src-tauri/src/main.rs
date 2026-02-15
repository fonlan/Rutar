// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    rutar_lib::run()
}

#[cfg(test)]
mod tests {
    #[test]
    fn main_entrypoint_symbol_should_be_linkable() {
        let entry: fn() = super::main;
        let _ = entry as usize;
    }
}
