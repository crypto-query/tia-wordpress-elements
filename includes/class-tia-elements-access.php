<?php
/**
 * One user's access to the indicator data.
 *
 * @package tia-wordpress-elements
 */

defined( 'ABSPATH' ) || exit;

/**
 * The access value the entitlement service returns: granted (full or Trial), denied or unavailable.
 */
final class TIA_Elements_Access {

	/**
	 * Use the named constructors.
	 *
	 * @param 'granted'|'denied'|'unavailable' $state      Whether a source grants, none does, or a source failed.
	 * @param 'full'|'trial'|null              $level      Set when granted.
	 * @param 'tia-pro'|'indicator-suite'|null $source     The granting source; null for an admin.
	 * @param int|null                         $trial_end  UTC epoch; the Trial cut-off.
	 * @param int|null                         $created    UTC epoch the granting subscription started.
	 * @param int|null                         $period_end UTC epoch the paid period of the granting subscription ends.
	 */
	private function __construct(
		public readonly string $state,
		public readonly ?string $level = null,
		public readonly ?string $source = null,
		public readonly ?int $trial_end = null,
		public readonly ?int $created = null,
		public readonly ?int $period_end = null,
	) {}

	/**
	 * The Access Cut-off as a UTC epoch: the trial end, the year-end rule for full access, or null for none.
	 */
	public function cutoff(): ?int {
		if ( 'trial' === $this->level ) {
			return $this->trial_end;
		}
		if ( 'full' === $this->level && null !== $this->created && null !== $this->period_end ) {
			return TIA_Elements_Access_Resolver::year_end_cutoff( $this->created, $this->period_end );
		}
		return null;
	}

	/**
	 * No source grants access.
	 */
	public static function denied(): self {
		return new self( 'denied' );
	}

	/**
	 * No source grants access and one failed, so the answer is unknown.
	 */
	public static function unavailable(): self {
		return new self( 'unavailable' );
	}

	/**
	 * Full access. Without dates (an admin or a manual grant) there is no cut-off.
	 *
	 * @param 'tia-pro'|'indicator-suite'|null $source     The granting source.
	 * @param int|null                         $created    UTC epoch the subscription started.
	 * @param int|null                         $period_end UTC epoch the paid period ends.
	 */
	public static function full( ?string $source = null, ?int $created = null, ?int $period_end = null ): self {
		return new self( 'granted', 'full', $source, null, $created, $period_end );
	}

	/**
	 * Trial access, cut off at the trial end.
	 *
	 * @param string $source    The granting source.
	 * @param int    $trial_end UTC epoch the trial ends.
	 *
	 * @phpstan-param 'tia-pro'|'indicator-suite' $source
	 */
	public static function trial( string $source, int $trial_end ): self {
		return new self( 'granted', 'trial', $source, $trial_end );
	}
}
