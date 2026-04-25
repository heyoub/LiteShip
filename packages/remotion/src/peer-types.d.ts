/**
 * Ambient module declarations for peer dependencies.
 *
 * React and Remotion are peer deps -- users bring their own.
 * These declarations provide minimal type stubs for compilation.
 */

declare module 'react' {
  export function createContext<T>(defaultValue: T): React.Context<T>;
  export function useContext<T>(context: React.Context<T>): T;
  export function createElement(type: unknown, props: unknown, ...children: unknown[]): unknown;

  namespace React {
    interface Context<T> {
      Provider: unknown;
    }
  }
}

declare module 'remotion' {
  export function useCurrentFrame(): number;
  export function useVideoConfig(): {
    fps: number;
    width: number;
    height: number;
    durationInFrames: number;
  };
}
