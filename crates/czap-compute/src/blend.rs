//! Blend weight normalization.
//!
//! Normalizes a weight array in-place so positive weights sum to 1.0.
//! Negative weights are clamped to 0.0.

/// Normalize weights in-place so positive values sum to 1.0.
///
/// - Negative weights are set to 0.0
/// - If total is 0.0, all weights remain 0.0
/// - Operates on the caller's buffer directly (no copy)
///
/// # Safety
/// Single-threaded WASM. Caller must ensure `weights_ptr` is valid for `len` floats.
#[no_mangle]
pub extern "C" fn blend_normalize(weights_ptr: *mut f32, len: u32) {
    let len = len as usize;
    if len == 0 {
        return;
    }

    // Pass 1: clamp negatives, compute sum
    let mut total: f32 = 0.0;

    #[cfg(feature = "simd")]
    {
        // SIMD path — process 4 floats at a time
        // Note: requires wasm32 SIMD proposal support
        let chunks = len / 4;
        let remainder = len % 4;

        for i in 0..chunks {
            let base = i * 4;
            unsafe {
                let mut v0 = *weights_ptr.add(base);
                let mut v1 = *weights_ptr.add(base + 1);
                let mut v2 = *weights_ptr.add(base + 2);
                let mut v3 = *weights_ptr.add(base + 3);

                if v0 < 0.0 { v0 = 0.0; }
                if v1 < 0.0 { v1 = 0.0; }
                if v2 < 0.0 { v2 = 0.0; }
                if v3 < 0.0 { v3 = 0.0; }

                *weights_ptr.add(base) = v0;
                *weights_ptr.add(base + 1) = v1;
                *weights_ptr.add(base + 2) = v2;
                *weights_ptr.add(base + 3) = v3;

                total += v0 + v1 + v2 + v3;
            }
        }

        for i in (chunks * 4)..len {
            unsafe {
                let mut v = *weights_ptr.add(i);
                if v < 0.0 { v = 0.0; }
                *weights_ptr.add(i) = v;
                total += v;
            }
        }
    }

    #[cfg(not(feature = "simd"))]
    {
        for i in 0..len {
            unsafe {
                let mut v = *weights_ptr.add(i);
                if v < 0.0 {
                    v = 0.0;
                    *weights_ptr.add(i) = v;
                }
                total += v;
            }
        }
    }

    // Pass 2: normalize if total > 0
    if total > 0.0 {
        let inv = 1.0 / total;
        for i in 0..len {
            unsafe {
                *weights_ptr.add(i) *= inv;
            }
        }
    }
}
