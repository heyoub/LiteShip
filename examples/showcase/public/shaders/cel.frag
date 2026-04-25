precision mediump float;

uniform float u_state;      // Discrete boundary state: 0.0 = mobile, 1.0 = tablet, 2.0 = desktop
uniform float u_time;       // Elapsed time in seconds
uniform vec2  u_resolution; // Canvas dimensions in pixels

// ── Cel shading bands ──
// Quantize lighting into discrete steps based on adaptive state.
// Higher states get more bands (finer detail on larger screens).
float celShade(float intensity, float bands) {
    return floor(intensity * bands) / bands;
}

// ── Soft sphere SDF ──
float sphereSDF(vec3 p, float r) {
    return length(p) - r;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

    // Number of cel bands scales with boundary state
    float bands = 3.0 + u_state * 2.0; // mobile: 3, tablet: 5, desktop: 7

    // Rotate light position over time
    float angle = u_time * 0.5;
    vec3 lightDir = normalize(vec3(cos(angle), 0.8, sin(angle)));

    // Simple raymarched sphere
    vec3 ro = vec3(0.0, 0.0, 2.5);
    vec3 rd = normalize(vec3(uv, -1.0));

    float t = 0.0;
    float d = 0.0;
    for (int i = 0; i < 64; i++) {
        vec3 p = ro + rd * t;
        d = sphereSDF(p, 0.8);
        if (d < 0.001) break;
        t += d;
        if (t > 10.0) break;
    }

    // Background gradient
    vec3 bg = mix(
        vec3(0.05, 0.05, 0.15),
        vec3(0.1, 0.08, 0.2),
        uv.y + 0.5
    );

    if (d < 0.001) {
        vec3 hitPos = ro + rd * t;
        vec3 normal = normalize(hitPos); // sphere normal = normalized position

        // Diffuse lighting
        float diff = max(dot(normal, lightDir), 0.0);

        // Quantize into cel bands
        float cel = celShade(diff, bands);

        // State-dependent color palette
        vec3 baseColor;
        if (u_state < 0.5) {
            // Mobile: warm palette
            baseColor = mix(vec3(0.9, 0.3, 0.2), vec3(1.0, 0.7, 0.3), cel);
        } else if (u_state < 1.5) {
            // Tablet: cool palette
            baseColor = mix(vec3(0.2, 0.3, 0.8), vec3(0.3, 0.8, 0.9), cel);
        } else {
            // Desktop: rich palette with more gradient stops
            vec3 c1 = vec3(0.3, 0.1, 0.5);
            vec3 c2 = vec3(0.2, 0.6, 0.9);
            vec3 c3 = vec3(0.1, 0.9, 0.7);
            baseColor = cel < 0.5
                ? mix(c1, c2, cel * 2.0)
                : mix(c2, c3, (cel - 0.5) * 2.0);
        }

        // Rim light for depth
        float rim = 1.0 - max(dot(normal, -rd), 0.0);
        rim = pow(rim, 3.0);
        vec3 rimColor = vec3(0.4, 0.3, 0.8) * rim * 0.5;

        // Edge detection for cel outlines
        float edge = smoothstep(0.3, 0.35, rim);
        vec3 outlineColor = vec3(0.02, 0.02, 0.05);

        vec3 color = mix(baseColor * cel + rimColor, outlineColor, edge * 0.6);
        gl_FragColor = vec4(color, 1.0);
    } else {
        // Background with subtle grid pattern (more visible at higher states)
        float gridScale = 20.0 + u_state * 10.0;
        vec2 grid = abs(fract(uv * gridScale) - 0.5);
        float gridLine = 1.0 - smoothstep(0.0, 0.05, min(grid.x, grid.y));
        vec3 color = bg + vec3(gridLine * 0.03);

        gl_FragColor = vec4(color, 1.0);
    }
}
