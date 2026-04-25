//! Spring physics curve sampling.
//!
//! Generates evenly-spaced samples of a spring easing function.
//! Writes to a static output buffer — zero allocation.

use core::f32::consts::PI;

/// Maximum samples the static buffer can hold.
const MAX_SAMPLES: usize = 256;

/// Static output buffer for spring curve samples.
static mut SPRING_BUF: [f32; MAX_SAMPLES] = [0.0; MAX_SAMPLES];

/// Sample a spring easing at `samples` evenly-spaced points in [0, 1].
///
/// Returns a pointer to a static f32 buffer of length `samples + 1`.
/// The caller reads `samples + 1` floats from the returned pointer.
///
/// # Safety
/// Single-threaded WASM — static buffer access is safe.
#[no_mangle]
pub extern "C" fn spring_curve(
    stiffness: f32,
    damping: f32,
    mass: f32,
    samples: u32,
) -> *const f32 {
    let mass = if mass <= 0.0 { 1.0 } else { mass };
    let samples = (samples as usize).min(MAX_SAMPLES - 1);
    let omega = libm::sqrtf(stiffness / mass);
    let zeta = damping / (2.0 * libm::sqrtf(stiffness * mass));

    for i in 0..=samples {
        let t = i as f32 / samples as f32;
        let value = if t <= 0.0 {
            0.0
        } else if t >= 1.0 {
            1.0
        } else if zeta < 1.0 {
            // Underdamped
            let omega_d = omega * libm::sqrtf(1.0 - zeta * zeta);
            1.0 - libm::expf(-zeta * omega * t)
                * (libm::cosf(omega_d * t)
                    + (zeta * omega / omega_d) * libm::sinf(omega_d * t))
        } else if zeta == 1.0 {
            // Critically damped
            1.0 - (1.0 + omega * t) * libm::expf(-omega * t)
        } else {
            // Overdamped
            let s = libm::sqrtf(zeta * zeta - 1.0);
            let r1 = -omega * (zeta + s);
            let r2 = -omega * (zeta - s);
            let c1 = r2 / (r2 - r1);
            let c2 = -r1 / (r2 - r1);
            1.0 - (c1 * libm::expf(r1 * t) + c2 * libm::expf(r2 * t))
        };
        unsafe {
            SPRING_BUF[i] = value;
        }
    }

    unsafe { SPRING_BUF.as_ptr() }
}
