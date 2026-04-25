/**
 * @czap/scene type spine -- phantom-kinded TrackId brand.
 *
 * TrackId is parameterized by the kind of track it identifies. This bars
 * cross-kind references at compile time -- e.g. syncTo.beat(videoTrackId)
 * becomes a type error because TrackId<'video'> is not assignable to
 * TrackId<'audio'>.
 *
 * Spec 1 §5.3 promised typed cross-references between track declarations
 * and sync helpers; phantom-kind branding delivers it.
 */

declare const TrackIdBrand: unique symbol;

/** Closed set of track kinds. */
export type TrackKind = 'video' | 'audio' | 'transition' | 'effect';

/**
 * Branded track identifier, keyed by track kind.
 *
 * The phantom parameter `K` is encoded in the brand symbol's value so
 * `TrackId<'video'>` and `TrackId<'audio'>` are distinct nominal types.
 * Cross-kind assignment fails at compile time.
 */
export type TrackId<K extends TrackKind> = string & {
  readonly [TrackIdBrand]: K;
};
