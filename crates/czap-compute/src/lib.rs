//! czap-compute — zero-allocation WASM compute kernels.
//!
//! C-ABI exports for spring physics, boundary evaluation, and blend
//! normalization. No wasm_bindgen. No std. Static output buffers.
//!
//! Target output: 2-8 KB wasm32-unknown-unknown.

#![no_std]

mod spring;
mod boundary;
mod blend;

// Re-export C-ABI functions at crate root for flat WASM exports.
pub use spring::spring_curve;
pub use boundary::batch_boundary_eval;
pub use blend::blend_normalize;

/// Panic handler — required for no_std.
#[cfg(not(test))]
#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}
