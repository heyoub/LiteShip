//! Batch boundary evaluation via binary search.
//!
//! Given sorted thresholds and a set of values, produces the index of the
//! matching state for each value. Zero allocation — writes to static buffer.

/// Maximum values the static buffer can hold.
const MAX_VALUES: usize = 4096;

/// Static output buffer for boundary evaluation results.
static mut BOUNDARY_BUF: [u32; MAX_VALUES] = [0; MAX_VALUES];

/// For each value, find the highest threshold index where value >= threshold.
///
/// Thresholds must be sorted ascending. Returns state index 0 if value is
/// below all thresholds, otherwise the index of the highest matching threshold.
///
/// Uses reverse linear scan (matching TypeScript `evaluateBoundary` semantics).
///
/// Returns a pointer to a static u32 buffer of length `values_len`.
///
/// # Safety
/// Single-threaded WASM — static buffer access is safe.
#[no_mangle]
pub extern "C" fn batch_boundary_eval(
    thresholds_ptr: *const f32,
    thresholds_len: u32,
    values_ptr: *const f32,
    values_len: u32,
) -> *const u32 {
    let thresholds_len = thresholds_len as usize;
    let values_len = (values_len as usize).min(MAX_VALUES);

    for vi in 0..values_len {
        let value = unsafe { *values_ptr.add(vi) };
        let mut state_idx: u32 = 0;

        // Reverse scan — matches evaluateBoundary semantics
        for ti in (0..thresholds_len).rev() {
            let threshold = unsafe { *thresholds_ptr.add(ti) };
            if value >= threshold {
                state_idx = ti as u32;
                break;
            }
        }

        unsafe {
            BOUNDARY_BUF[vi] = state_idx;
        }
    }

    unsafe { BOUNDARY_BUF.as_ptr() }
}
