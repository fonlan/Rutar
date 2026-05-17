// Persisted-config layer for IPC commands. Split into:
// - `profile`: cross-platform normalization + load/save + filter groups +
//   tests; also hosts the cross-platform fa\xC3\xA7ade for Windows-shell
//   integrations.
// - `windows_integration`: Windows-only registry + Shell APIs reached via the
//   `#[cfg(windows)]` branches in `profile`.

mod profile;
#[cfg(windows)]
mod windows_integration;

pub(super) use profile::{
    apply_windows_file_associations_impl, export_filter_rule_groups_impl,
    get_default_windows_file_association_extensions_impl, get_startup_paths_impl,
    get_windows_file_association_status_impl, import_filter_rule_groups_impl,
    is_remember_window_state_enabled_in_config_impl, is_single_instance_mode_enabled_in_config_impl,
    is_windows_context_menu_registered_impl, load_config_impl,
    load_filter_rule_groups_config_impl, load_main_window_state_in_config_impl,
    register_windows_context_menu_impl, remove_windows_file_associations_impl, save_config_impl,
    save_filter_rule_groups_config_impl, save_main_window_state_in_config_impl,
    unregister_windows_context_menu_impl,
};
