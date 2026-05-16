// Bound helpers for the DashMap-based session caches used by search.rs.
// Kept generic so the same logic applies to every session cache without
// depending on a specific value type.

use dashmap::DashMap;

// Upper bound for any single session DashMap; older entries are pruned on insert.
pub(crate) const MAX_SESSION_CACHE_ENTRIES: usize = 200;

// Removes excess entries when a cache exceeds MAX_SESSION_CACHE_ENTRIES.
// DashMap iteration order is unspecified so this evicts roughly the oldest visible
// bucket entries; combined with the explicit document-close cleanup, the caches
// stay bounded under long sessions or many open documents.
pub(crate) fn enforce_dashmap_bound<K, V, S>(cache: &DashMap<K, V, S>)
where
    K: Eq + std::hash::Hash + Clone,
    S: std::hash::BuildHasher + Clone,
{
    let current_len = cache.len();
    if current_len <= MAX_SESSION_CACHE_ENTRIES {
        return;
    }
    let overflow = current_len - MAX_SESSION_CACHE_ENTRIES;
    let target_drop = overflow + (MAX_SESSION_CACHE_ENTRIES / 20);
    let stale_keys: Vec<K> = cache
        .iter()
        .take(target_drop)
        .map(|entry| entry.key().clone())
        .collect();
    for key in stale_keys {
        cache.remove(&key);
    }
}
